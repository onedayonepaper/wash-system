const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const cors = require('cors');

// 설정
const PORT = process.env.PORT || 3002;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

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

    console.log(`📥 [${bayId}] 상태:`, payload.status, `${payload.progress}%`);

    // 상태 저장
    bayStatus.set(bayId, payload);

    // WebSocket으로 Frontend에 브로드캐스트
    io.emit('wash:status', payload);
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

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mqtt: mqttClient.connected });
});

// 세차 시작
app.post('/api/wash/start', (req, res) => {
  const { bayId = 'bay1', course = 'BASIC' } = req.body;

  const currentStatus = bayStatus.get(bayId);
  if (currentStatus?.status === 'WASHING') {
    return res.status(400).json({
      success: false,
      message: '이미 세차가 진행 중입니다.',
    });
  }

  const command = { action: 'START', course };
  const topic = `wash/${bayId}/cmd`;

  mqttClient.publish(topic, JSON.stringify(command), (err) => {
    if (err) {
      console.error('❌ 명령 전송 실패:', err);
      return res.status(500).json({ success: false, message: '명령 전송 실패' });
    }

    console.log(`📤 [${bayId}] 세차 시작 명령 전송: ${course}`);
    res.json({ success: true, bayId, course });
  });
});

// 세차 중지
app.post('/api/wash/stop', (req, res) => {
  const { bayId = 'bay1' } = req.body;

  const command = { action: 'STOP' };
  const topic = `wash/${bayId}/cmd`;

  mqttClient.publish(topic, JSON.stringify(command), (err) => {
    if (err) {
      console.error('❌ 명령 전송 실패:', err);
      return res.status(500).json({ success: false, message: '명령 전송 실패' });
    }

    console.log(`📤 [${bayId}] 세차 중지 명령 전송`);
    res.json({ success: true, bayId });
  });
});

// 현재 상태 조회
app.get('/api/wash/status/:bayId', (req, res) => {
  const { bayId } = req.params;
  const status = bayStatus.get(bayId);

  if (!status) {
    return res.json({
      bayId,
      status: 'UNKNOWN',
      progress: 0,
      message: '상태 정보 없음',
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
  POST /api/wash/start  - 세차 시작
  POST /api/wash/stop   - 세차 중지
  GET  /api/wash/status - 모든 상태 조회
  GET  /api/wash/status/:bayId - 특정 bay 상태
`);
});

// 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 서버 종료 중...');
  mqttClient.end();
  server.close();
  process.exit(0);
});
