const ModbusRTU = require('modbus-serial');

const MODBUS_HOST = process.env.MODBUS_HOST || '0.0.0.0';
const MODBUS_PORT = parseInt(process.env.MODBUS_PORT, 10) || 502;
const BAY_IDS = (process.env.BAY_IDS || 'bay1,bay2,bay3').split(',');
const WASH_DURATION_SEC = parseInt(process.env.WASH_DURATION_SEC, 10) || 10;
const IDLE_DELAY_MS = parseInt(process.env.IDLE_DELAY_MS, 10) || 3000;

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

const STATUS_CODE = {
  IDLE: 0,
  WASHING: 1,
  COMPLETED: 2,
  CANCELED: 3,
  ERROR: 4,
};

const bays = new Map();
const holdingRegisters = new Array(BAY_IDS.length * REG_BLOCK_SIZE).fill(0);

BAY_IDS.forEach((bayId) => {
  bays.set(bayId, {
    status: STATUS_CODE.IDLE,
    progress: 0,
    course: 0,
    washInterval: null,
    idleTimeout: null,
  });
  syncRegisters(bayId);
});

function getBaseAddress(bayId) {
  const index = BAY_IDS.indexOf(bayId);
  if (index < 0) {
    throw new Error(`관리되지 않는 베이: ${bayId}`);
  }
  return index * REG_BLOCK_SIZE;
}

function syncRegisters(bayId) {
  const bay = bays.get(bayId);
  const base = getBaseAddress(bayId);
  holdingRegisters[base + REG.STATUS] = bay.status;
  holdingRegisters[base + REG.PROGRESS] = Math.round(bay.progress);
  holdingRegisters[base + REG.COURSE] = bay.course;
}

function scheduleIdleReset(bayId) {
  const bay = bays.get(bayId);
  if (bay.idleTimeout) {
    clearTimeout(bay.idleTimeout);
  }
  bay.idleTimeout = setTimeout(() => {
    bay.status = STATUS_CODE.IDLE;
    bay.progress = 0;
    bay.course = 0;
    syncRegisters(bayId);
    console.log(`🔄 [${bayId}] 대기 상태로 복귀`);
  }, IDLE_DELAY_MS);
}

function startWash(bayId) {
  const bay = bays.get(bayId);
  if (bay.status === STATUS_CODE.WASHING) {
    return;
  }

  if (!bay.course) {
    bay.course = COURSE_CODE.BASIC;
  }

  if (bay.washInterval) {
    clearInterval(bay.washInterval);
  }
  if (bay.idleTimeout) {
    clearTimeout(bay.idleTimeout);
  }

  bay.status = STATUS_CODE.WASHING;
  bay.progress = 0;
  syncRegisters(bayId);
  console.log(`🚿 [${bayId}] 세차 시작`);

  const progressStep = 100 / WASH_DURATION_SEC;
  bay.washInterval = setInterval(() => {
    bay.progress = Math.min(100, bay.progress + progressStep);
    syncRegisters(bayId);

    if (bay.progress >= 100) {
      completeWash(bayId);
    }
  }, 1000);
}

function completeWash(bayId) {
  const bay = bays.get(bayId);
  if (bay.washInterval) {
    clearInterval(bay.washInterval);
    bay.washInterval = null;
  }

  bay.status = STATUS_CODE.COMPLETED;
  bay.progress = 100;
  syncRegisters(bayId);
  console.log(`✅ [${bayId}] 세차 완료`);
  scheduleIdleReset(bayId);
}

function stopWash(bayId) {
  const bay = bays.get(bayId);
  if (bay.washInterval) {
    clearInterval(bay.washInterval);
    bay.washInterval = null;
  }

  bay.status = STATUS_CODE.CANCELED;
  bay.progress = 0;
  syncRegisters(bayId);
  console.log(`🛑 [${bayId}] 세차 중지`);
  scheduleIdleReset(bayId);
}

function handleCommandRegister(address, value) {
  const bayIndex = Math.floor(address / REG_BLOCK_SIZE);
  const offset = address % REG_BLOCK_SIZE;
  const bayId = BAY_IDS[bayIndex];
  if (!bayId || offset !== REG.COMMAND) {
    return;
  }

  if (value === COMMAND_CODE.START) {
    startWash(bayId);
  } else if (value === COMMAND_CODE.STOP) {
    stopWash(bayId);
  }

  holdingRegisters[address] = COMMAND_CODE.NONE;
}

const vector = {
  getHoldingRegister: (address) => holdingRegisters[address] || 0,
  setRegister: (address, value) => {
    holdingRegisters[address] = value;

    const bayIndex = Math.floor(address / REG_BLOCK_SIZE);
    const offset = address % REG_BLOCK_SIZE;
    const bayId = BAY_IDS[bayIndex];
    const bay = bays.get(bayId);

    if (bay && offset === REG.COURSE) {
      bay.course = value;
      syncRegisters(bayId);
    }

    if (offset === REG.COMMAND) {
      handleCommandRegister(address, value);
    }
  },
  setRegisters: (address, values) => {
    values.forEach((value, index) => {
      vector.setRegister(address + index, value);
    });
  },
};

const server = new ModbusRTU.ServerTCP(vector, {
  host: MODBUS_HOST,
  port: MODBUS_PORT,
  debug: false,
  unitID: 1,
});

server.on('socketError', (err) => {
  console.error('❌ Modbus 소켓 에러:', err);
});

console.log(`
╔════════════════════════════════════════╗
║    🧪 Modbus TCP PLC Simulator 🧪      ║
╚════════════════════════════════════════╝
`);
console.log(`📡 Listening on ${MODBUS_HOST}:${MODBUS_PORT}`);
console.log(`🚗 Bays: ${BAY_IDS.join(', ')}`);
