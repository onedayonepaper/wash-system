const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');
const { randomUUID } = require('crypto');

// 설정
const PORT = process.env.PORT || 3002;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const BAY_IDS = (process.env.BAY_IDS || 'bay1,bay2,bay3').split(',');

// Express 앱
const app = express();
app.use(cors());
app.use(express.json());

// HTTP 서버 & WebSocket
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Bay 상태 저장소
const bayStatus = new Map();
const pendingStartRequests = new Map();

const normalizeState = (value) => {
  switch (value) {
    case 'COMPLETED':
      return 'DONE';
    case 'OFFLINE':
      return 'OFFLINE';
    case 'DONE':
    case 'STARTING':
    case 'WASHING':
    case 'IDLE':
    case 'CANCELED':
    case 'ERROR':
      return value;
    default:
      return 'IDLE';
  }
};

const normalizeStatusPayload = (topicBayId, payload) => {
  const bayId = payload.bayId || topicBayId;
  const state = normalizeState(payload.state || payload.status);
  return {
    bayId,
    sessionId: payload.sessionId || payload.session_id || null,
    requestId: payload.requestId || payload.request_id || null,
    state,
    progress: payload.progress || 0,
    course: payload.course || null,
    errorCode: payload.errorCode || payload.error_code || null,
    timestampUtc: payload.timestampUtc || payload.timestamp || new Date().toISOString(),
  };
};

const isInProgressState = (state) => ['STARTING', 'WASHING'].includes(state);
const isTerminalState = (state) =>
  ['DONE', 'CANCELED', 'ERROR', 'OFFLINE', 'IDLE'].includes(state);

// ═══════════════════════════════════════════
// MQTT 클라이언트 (Gateway 통신)
// ═══════════════════════════════════════════
const mqttClient = mqtt.connect(MQTT_BROKER, {
  clientId: `backend-server-${Date.now()}`,
});

mqttClient.on('connect', () => {
  console.log(`✅ MQTT 브로커 연결됨: ${MQTT_BROKER}`);

  // 모든 bay의 상태 토픽 구독
  mqttClient.subscribe('wash/+/status', (err) => {
    if (err) {
      console.error('❌ MQTT 구독 실패:', err);
    } else {
      console.log('📡 구독: wash/+/status');
    }
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const bayId = topic.split('/')[1]; // wash/bay1/status → bay1

    const normalized = normalizeStatusPayload(bayId, payload);
    console.log(`📥 [${bayId}] 상태:`, normalized.state, `${normalized.progress}%`);

    // 상태 저장
    bayStatus.set(bayId, normalized);
    if (isTerminalState(normalized.state)) {
      pendingStartRequests.delete(bayId);
    }

    // WebSocket으로 Frontend에 브로드캐스트
    io.emit('wash:status', normalized);
  } catch (err) {
    console.error('❌ MQTT 메시지 파싱 실패:', err.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT 에러:', err.message);
});

// ═══════════════════════════════════════════
// REST API
// ═══════════════════════════════════════════

const { getWashHistory, getLatestBayStatus, getWashStats, getBaySnapshots } = require('./database');

// 재시작 시 최근 상태 복구
const initBayStatusFromDb = async () => {
  try {
    const snapshots = await getBaySnapshots();
    if (snapshots.length) {
      snapshots.forEach((row) => {
        bayStatus.set(row.bay_id, {
          bayId: row.bay_id,
          sessionId: row.session_id || null,
          requestId: row.request_id || null,
          state: normalizeState(row.state),
          progress: row.progress || 0,
          course: row.course || null,
          errorCode: row.error_code || null,
          timestampUtc: row.updated_at || new Date().toISOString(),
        });
      });
      console.log('✅ DB에서 상태 스냅샷 복구 완료');
      return;
    }

    const latest = await getLatestBayStatus(BAY_IDS);
    latest.forEach((row) => {
      let progress = 0;
      const state = normalizeState(row.status);
      if (state === 'DONE') {
        progress = 100;
      }
      bayStatus.set(row.bay_id, {
        bayId: row.bay_id,
        sessionId: row.session_id || null,
        requestId: row.request_id || null,
        state,
        progress,
        course: row.course,
        errorCode: row.error_code || null,
        timestampUtc: row.end_time || row.start_time || new Date().toISOString(),
      });
    });
    if (latest.length) {
      console.log('✅ DB에서 최근 상태 복구 완료');
    }
  } catch (err) {
    console.error('❌ DB 상태 복구 실패:', err.message);
  }
};

initBayStatusFromDb();

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mqtt: mqttClient.connected });
});

// 세차 기록 조회
app.get('/api/wash/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const history = await getWashHistory(limit);
    const mapped = history.map((row) => ({
      id: row.id,
      bayId: row.bay_id,
      course: row.course,
      state: normalizeState(row.status),
      startTime: row.start_time,
      endTime: row.end_time,
      errorCode: row.error_code || null,
      sessionId: row.session_id || null,
      requestId: row.request_id || null,
    }));
    res.json(mapped);
  } catch (err) {
    console.error('❌ 세차 기록 조회 실패:', err);
    res.status(500).json({ success: false, message: '기록 조회 중 오류가 발생했습니다.' });
  }
});

// 세차 통계 조회
app.get('/api/wash/stats', async (req, res) => {
  try {
    const stats = await getWashStats();
    res.json(stats);
  } catch (err) {
    console.error('❌ 세차 통계 조회 실패:', err);
    res.status(500).json({ success: false, message: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// 베이 목록 조회
app.get('/api/bays', (req, res) => {
  const bays = BAY_IDS.map((bayId) => {
    const status = bayStatus.get(bayId);
    return {
      bayId,
      name: `Bay ${bayId.replace('bay', '#')}`,
      state: status?.state || 'IDLE',
      progress: status?.progress || 0,
      course: status?.course || null,
      errorCode: status?.errorCode || null,
      sessionId: status?.sessionId || null,
      requestId: status?.requestId || null,
    };
  });
  res.json(bays);
});

// 세차 시작
app.post('/api/wash/start', (req, res) => {
  const { bayId = 'bay1', course = 'BASIC', requestId: incomingRequestId } = req.body;

  const currentStatus = bayStatus.get(bayId);
  const requestId = incomingRequestId || randomUUID();
  if (currentStatus && isInProgressState(currentStatus.state)) {
    const pendingId = pendingStartRequests.get(bayId);
    if (pendingId === requestId) {
      return res.json({
        success: true,
        bayId,
        course: currentStatus.course || course,
        requestId,
        idempotent: true,
      });
    }
    return res.status(409).json({
      success: false,
      message: '이미 세차가 진행 중입니다.',
      requestId,
    });
  }

  pendingStartRequests.set(bayId, requestId);
  const command = {
    bayId,
    action: 'START',
    course,
    requestId,
    timestampUtc: new Date().toISOString(),
  };
  const topic = `wash/${bayId}/cmd`;

  mqttClient.publish(topic, JSON.stringify(command), (err) => {
    if (err) {
      console.error('❌ 명령 전송 실패:', err);
      return res.status(500).json({ success: false, message: '명령 전송 실패' });
    }

    console.log(`📤 [${bayId}] 세차 시작 명령 전송: ${course}`);
    res.json({ success: true, bayId, course, requestId });
  });
});

// 세차 중지
app.post('/api/wash/stop', (req, res) => {
  const { bayId = 'bay1' } = req.body;

  const requestId = randomUUID();
  const command = {
    bayId,
    action: 'STOP',
    requestId,
    timestampUtc: new Date().toISOString(),
  };
  const topic = `wash/${bayId}/cmd`;

  mqttClient.publish(topic, JSON.stringify(command), (err) => {
    if (err) {
      console.error('❌ 명령 전송 실패:', err);
      return res.status(500).json({ success: false, message: '명령 전송 실패' });
    }

    console.log(`📤 [${bayId}] 세차 중지 명령 전송`);
    res.json({ success: true, bayId, requestId });
  });
});

// 현재 상태 조회
app.get('/api/wash/status/:bayId', (req, res) => {
  const { bayId } = req.params;
  const status = bayStatus.get(bayId);

  if (!status) {
    return res.json({
      bayId,
      state: 'UNKNOWN',
      progress: 0,
      message: '상태 정보 없음',
      timestampUtc: new Date().toISOString(),
    });
  }

  res.json(status);
});

// 모든 bay 상태 조회
app.get('/api/wash/status', (req, res) => {
  const allStatus = Object.fromEntries(bayStatus);
  res.json(allStatus);
});

// ═══════════════════════════════════════════
// WebSocket
// ═══════════════════════════════════════════
io.on('connection', (socket) => {
  console.log(`🔌 클라이언트 연결: ${socket.id}`);

  // 연결 시 현재 모든 bay 상태 전송
  bayStatus.forEach((status, bayId) => {
    socket.emit('wash:status', status);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 클라이언트 연결 해제: ${socket.id}`);
  });
});

// ═══════════════════════════════════════════
// 서버 시작
// ═══════════════════════════════════════════
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║      🚗 Car Wash Backend Server 🚗     ║
╚════════════════════════════════════════╝

🌐 REST API: http://localhost:${PORT}
🔌 WebSocket: ws://localhost:${PORT}
📡 MQTT Broker: ${MQTT_BROKER}

API 엔드포인트:
  GET  /api/bays        - 베이 목록 조회
  POST /api/wash/start  - 세차 시작
  POST /api/wash/stop   - 세차 중지
  GET  /api/wash/status - 모든 상태 조회
  GET  /api/wash/status/:bayId - 특정 bay 상태

🚗 관리 베이: ${BAY_IDS.join(', ')}
`);
});

// 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 서버 종료 중...');
  mqttClient.end();
  server.close();
  process.exit(0);
});
