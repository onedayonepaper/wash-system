const mqtt = require('mqtt');
const { randomUUID } = require('crypto');
const db = require('./database');
const { ready: dbReady } = require('./database');
const { ModbusDriver } = require('./drivers/modbusDriver');

// 설정
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const BAY_IDS = (process.env.BAY_IDS || 'bay1,bay2,bay3').split(',');
const MODBUS_HOST = process.env.MODBUS_HOST || '127.0.0.1';
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT, 10) || 502;
const MODBUS_UNIT_ID = parseInt(process.env.MODBUS_UNIT_ID, 10) || 1;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 1000;
const MODBUS_TIMEOUT_MS = parseInt(process.env.MODBUS_TIMEOUT_MS, 10) || 2000;

// Modbus 레지스터 맵 설정
const REG_BLOCK_SIZE = 10;
const REG = {
  COMMAND: 0,
  COURSE: 1,
  STATUS: 2,
  PROGRESS: 3,
  ERROR: 4,
};

const COMMAND_CODE = {
  NONE: 0,
  START: 1,
  STOP: 2,
};

const COURSE_CODE = {
  BASIC: 1,
  STANDARD: 2,
  PREMIUM: 3,
  DELUXE: 4,
};

const COURSE_NAME = Object.fromEntries(
  Object.entries(COURSE_CODE).map(([key, value]) => [value, key])
);

const STATUS_CODE = {
  IDLE: 0,
  WASHING: 1,
  COMPLETED: 2,
  CANCELED: 3,
  ERROR: 4,
};

const STATUS_NAME = Object.fromEntries(
  Object.entries(STATUS_CODE).map(([key, value]) => [value, key])
);

const STATE = {
  IDLE: 'IDLE',
  STARTING: 'STARTING',
  WASHING: 'WASHING',
  DONE: 'DONE',
  CANCELED: 'CANCELED',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
};

// 각 베이별 상태 관리
const bays = new Map();
BAY_IDS.forEach((bayId) => {
  bays.set(bayId, {
    state: STATE.IDLE,
    progress: 0,
    course: null,
    logId: null,
    errorCode: null,
    sessionId: null,
    requestId: null,
  });
});

let isDbReady = false;
dbReady.then(() => {
  isDbReady = true;
});

// MQTT 클라이언트 연결
const client = mqtt.connect(MQTT_BROKER, {
  clientId: `gateway-multi-${Date.now()}`,
});

client.on('connect', () => {
  console.log(`✅ MQTT 브로커 연결됨: ${MQTT_BROKER}`);
  console.log(`🚗 관리 중인 베이: ${BAY_IDS.join(', ')}`);
  console.log('---');

  client.subscribe('wash/+/cmd', (err) => {
    if (err) {
      console.error('❌ 구독 실패:', err);
    } else {
      console.log('📡 구독: wash/+/cmd');
      console.log('🎧 명령 대기 중...\n');
    }
  });

  dbReady.then(() => {
    BAY_IDS.forEach((bayId) => publishStatus(bayId));
    if (STATUS_HEARTBEAT_MS > 0 && !statusHeartbeatTimer) {
      statusHeartbeatTimer = setInterval(() => {
        BAY_IDS.forEach((bayId) => publishStatus(bayId));
      }, STATUS_HEARTBEAT_MS);
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const bayId = payload.bayId || topic.split('/')[1];

    if (!bays.has(bayId)) {
      console.log(`⚠️ [${bayId}] 관리되지 않는 베이`);
      return;
    }

    console.log(`📥 [${bayId}] 명령 수신:`, payload);

    handleCommand(bayId, payload);
  } catch (err) {
    console.error('❌ 메시지 파싱 실패:', err.message);
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT 에러:', err.message);
});

// Modbus 드라이버
const modbusDriver = new ModbusDriver({
  host: MODBUS_HOST,
  port: MODBUS_PORT,
  unitId: MODBUS_UNIT_ID,
  timeoutMs: MODBUS_TIMEOUT_MS,
});
let modbusConnected = false;
let pollTimer = null;
let plcOnline = false;
let plcOfflineTimer = null;
const PLC_OFFLINE_BROADCAST_MS =
  parseInt(process.env.PLC_OFFLINE_BROADCAST_MS, 10) || 3000;
let reconnectDelayMs = 2000;
const MAX_RECONNECT_DELAY_MS = 10000;
const STATUS_HEARTBEAT_MS =
  parseInt(process.env.STATUS_HEARTBEAT_MS, 10) || 5000;
let statusHeartbeatTimer = null;

function getBaseAddress(bayId) {
  const index = BAY_IDS.indexOf(bayId);
  if (index < 0) {
    throw new Error(`관리되지 않는 베이: ${bayId}`);
  }
  return index * REG_BLOCK_SIZE;
}

let sessionSequence = 0;
function generateSessionId(bayId) {
  sessionSequence = (sessionSequence + 1) % 1000;
  const compact = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `${compact}-${bayId}-${String(sessionSequence).padStart(3, '0')}`;
}

function getTimestampUtc() {
  return new Date().toISOString();
}

function mapPlcState(plcStatus) {
  switch (plcStatus) {
    case 'IDLE':
      return STATE.IDLE;
    case 'WASHING':
      return STATE.WASHING;
    case 'COMPLETED':
      return STATE.DONE;
    case 'CANCELED':
      return STATE.CANCELED;
    case 'ERROR':
      return STATE.ERROR;
    default:
      return STATE.ERROR;
  }
}

async function connectModbus() {
  try {
    await modbusDriver.connect();
    modbusConnected = true;
    setPlcOnline();
    reconnectDelayMs = 2000;
    console.log(`✅ Modbus TCP 연결됨: ${MODBUS_HOST}:${MODBUS_PORT} (Unit ${MODBUS_UNIT_ID})`);
    startPolling();
  } catch (err) {
    modbusConnected = false;
    setPlcOffline();
    console.error(`❌ Modbus 연결 실패: ${err.message}`);
    setTimeout(connectModbus, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }
}

function startPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(pollPlcStatus, POLL_INTERVAL_MS);
}

async function pollPlcStatus() {
  if (!modbusConnected) {
    return;
  }

  for (const bayId of BAY_IDS) {
    try {
      const base = getBaseAddress(bayId);
      const data = await modbusDriver.readStatus(base, REG.ERROR + 1);

      const courseCode = data[REG.COURSE];
      const statusCode = data[REG.STATUS];
      const progress = data[REG.PROGRESS];

      const course = COURSE_NAME[courseCode] || null;
      const plcStatus = STATUS_NAME[statusCode] || 'UNKNOWN';
      const state = mapPlcState(plcStatus);

      await handleStatusUpdate(bayId, {
        state,
        progress: Math.max(0, Math.min(100, progress)),
        course,
        errorCode: null,
      });
    } catch (err) {
      console.error(`❌ Modbus 상태 조회 실패 [${bayId}]: ${err.message}`);
      modbusConnected = false;
      setPlcOffline();
      modbusDriver.close().catch(() => {});
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setTimeout(connectModbus, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
      break;
    }
  }
}

async function handleCommand(bayId, payload) {
  const { action, course } = payload;
  const bay = bays.get(bayId);
  const requestId = payload.requestId || randomUUID();

  if (!modbusConnected) {
    console.error('❌ Modbus 미연결 상태입니다.');
    return;
  }

  if (action === 'START' && [STATE.WASHING, STATE.STARTING].includes(bay.state)) {
    console.log(`⚠️ [${bayId}] 이미 세차 중입니다.`);
    return;
  }

  try {
    const base = getBaseAddress(bayId);
    if (action === 'START') {
      const courseCode = COURSE_CODE[course] || COURSE_CODE.BASIC;
      await modbusDriver.writeRegister(base + REG.COURSE, courseCode);
      await modbusDriver.writeRegister(base + REG.COMMAND, COMMAND_CODE.START);
      bay.requestId = requestId;
      bay.sessionId = bay.sessionId || generateSessionId(bayId);
      bay.state = STATE.STARTING;
      bay.errorCode = null;
      bay.course = course || 'BASIC';
      publishStatus(bayId);
      console.log(`📤 [${bayId}] Modbus START 전송 (코스: ${course || 'BASIC'})`);
    } else if (action === 'STOP') {
      await modbusDriver.writeRegister(base + REG.COMMAND, COMMAND_CODE.STOP);
      console.log(`📤 [${bayId}] Modbus STOP 전송`);
    } else {
      console.log(`⚠️ [${bayId}] 알 수 없는 명령: ${action}`);
    }
  } catch (err) {
    console.error(`❌ Modbus 명령 전송 실패 [${bayId}]: ${err.message}`);
  }
}

async function handleStatusUpdate(bayId, next) {
  const bay = bays.get(bayId);
  if (!bay) {
    return;
  }

  const stateChanged = bay.state !== next.state;
  const progressChanged = bay.progress !== next.progress;
  const courseChanged = bay.course !== next.course;

  if (stateChanged) {
    if (next.state === STATE.WASHING) {
      bay.sessionId = bay.sessionId || generateSessionId(bayId);
      const logId = await createWashLog(bayId, next.course, bay.sessionId, bay.requestId);
      bay.logId = logId;
    } else if (
      [STATE.WASHING, STATE.STARTING].includes(bay.state) &&
      [STATE.DONE, STATE.CANCELED, STATE.ERROR, STATE.OFFLINE].includes(next.state)
    ) {
      await updateWashLog(bay.logId, next.state, next.errorCode);
    }

    if (next.state === STATE.IDLE) {
      bay.logId = null;
      bay.sessionId = null;
      bay.requestId = null;
    }
  }

  bay.state = next.state;
  bay.progress = next.progress;
  bay.course = next.course;
  bay.errorCode = next.errorCode || null;

  if (stateChanged || progressChanged || courseChanged) {
    publishStatus(bayId);
  }
}

function createWashLog(bayId, course, sessionId, requestId) {
  const startTime = getTimestampUtc();
  const query = `
    INSERT INTO wash_logs (bay_id, course, status, start_time, error_code, session_id, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  return new Promise((resolve) => {
    db.run(
      query,
      [bayId, course || 'BASIC', STATE.WASHING, startTime, null, sessionId, requestId],
      function (err) {
        if (err) {
          console.error('❌ DB 로그 생성 실패:', err);
          resolve(null);
        } else {
          console.log(`📝 [${bayId}] DB 로그 생성 (ID: ${this.lastID})`);
          resolve(this.lastID);
        }
      }
    );
  });
}

function createErrorLog(bayId, course, errorCode, sessionId, requestId, state = STATE.ERROR) {
  const timestamp = getTimestampUtc();
  const query = `
    INSERT INTO wash_logs (bay_id, course, status, start_time, end_time, error_code, session_id, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [bayId, course || null, state, timestamp, timestamp, errorCode, sessionId, requestId],
    function (err) {
      if (err) {
        console.error('❌ DB 에러 로그 생성 실패:', err);
      } else {
        console.log(`📝 [${bayId}] DB 에러 로그 생성 (ID: ${this.lastID})`);
      }
    }
  );
}

function updateWashLog(logId, state, errorCode = null) {
  if (!logId) {
    return Promise.resolve();
  }

  const endTime = getTimestampUtc();
  const query = `
    UPDATE wash_logs
    SET status = ?, end_time = ?, error_code = ?
    WHERE id = ?
  `;

  return new Promise((resolve) => {
    db.run(query, [state, endTime, errorCode, logId], (err) => {
      if (err) {
        console.error('❌ DB 로그 업데이트 실패:', err);
      } else {
        console.log(`📝 DB 로그 업데이트 (ID: ${logId})`);
      }
      resolve();
    });
  });
}

function publishStatus(bayId) {
  const bay = bays.get(bayId);
  const topic = `wash/${bayId}/status`;
  const timestampUtc = getTimestampUtc();

  const payload = JSON.stringify({
    bayId: bayId,
    sessionId: bay.sessionId,
    requestId: bay.requestId,
    state: bay.state,
    progress: Math.round(bay.progress),
    course: bay.course,
    errorCode: bay.errorCode,
    timestampUtc,
  });

  client.publish(topic, payload);
  if (isDbReady) {
    persistBayState(bayId, timestampUtc);
  }
}

function persistBayState(bayId, timestampUtc) {
  const bay = bays.get(bayId);
  if (!bay) {
    return;
  }
  const query = `
    INSERT INTO bay_state (bay_id, session_id, request_id, state, progress, course, error_code, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bay_id) DO UPDATE SET
      session_id = excluded.session_id,
      request_id = excluded.request_id,
      state = excluded.state,
      progress = excluded.progress,
      course = excluded.course,
      error_code = excluded.error_code,
      updated_at = excluded.updated_at
  `;
  db.run(query, [
    bayId,
    bay.sessionId,
    bay.requestId,
    bay.state,
    Math.round(bay.progress),
    bay.course,
    bay.errorCode,
    timestampUtc,
  ]);
}

function publishPlcOffline() {
  BAY_IDS.forEach((bayId) => {
    const bay = bays.get(bayId);
    if (!bay) {
      return;
    }
    const wasOffline = bay.state === STATE.OFFLINE && bay.errorCode === 'PLC_OFFLINE';
    if (!wasOffline) {
      if (bay.logId) {
        updateWashLog(bay.logId, STATE.OFFLINE, 'PLC_OFFLINE');
        bay.logId = null;
      } else {
        createErrorLog(bayId, bay.course, 'PLC_OFFLINE', bay.sessionId, bay.requestId, STATE.OFFLINE);
      }
    }
    bay.state = STATE.OFFLINE;
    bay.progress = 0;
    bay.course = bay.course || null;
    bay.errorCode = 'PLC_OFFLINE';
    publishStatus(bayId);
  });
}

function clearPlcOfflineStatus() {
  BAY_IDS.forEach((bayId) => {
    const bay = bays.get(bayId);
    if (!bay) {
      return;
    }
    if (bay.errorCode === 'PLC_OFFLINE') {
      bay.errorCode = null;
    }
  });
}

function setPlcOffline() {
  plcOnline = false;
  if (!plcOfflineTimer) {
    publishPlcOffline();
    plcOfflineTimer = setInterval(() => {
      publishPlcOffline();
    }, PLC_OFFLINE_BROADCAST_MS);
  }
}

function setPlcOnline() {
  plcOnline = true;
  if (plcOfflineTimer) {
    clearInterval(plcOfflineTimer);
    plcOfflineTimer = null;
  }
  clearPlcOfflineStatus();
}

process.on('SIGINT', () => {
  console.log('\n👋 Gateway 종료 중...');
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  if (statusHeartbeatTimer) {
    clearInterval(statusHeartbeatTimer);
  }
  client.end();
  if (modbusConnected) {
    modbusDriver
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

connectModbus();

console.log(`
╔════════════════════════════════════════╗
║   🚗 Multi-Bay Car Wash Gateway 🚗     ║
║                                        ║
║  Modbus TCP 기반 세차기 시뮬레이터 연동  ║
╚════════════════════════════════════════╝
`);
