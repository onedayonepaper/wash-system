const mqtt = require('mqtt');

// 설정
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const BAY_ID = process.env.BAY_ID || 'bay1';
const WASH_DURATION_SEC = 10; // 세차 소요 시간 (초)

// MQTT 토픽
const TOPICS = {
  CMD: `wash/${BAY_ID}/cmd`,
  STATUS: `wash/${BAY_ID}/status`,
};

// 세차기 상태
const STATUS = {
  IDLE: 'IDLE',
  WASHING: 'WASHING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

// 현재 상태
let currentState = {
  status: STATUS.IDLE,
  progress: 0,
  course: null,
};

let washInterval = null;

// MQTT 클라이언트 연결
const client = mqtt.connect(MQTT_BROKER, {
  clientId: `gateway-${BAY_ID}-${Date.now()}`,
});

client.on('connect', () => {
  console.log(`✅ [Gateway ${BAY_ID}] MQTT 브로커 연결됨: ${MQTT_BROKER}`);
  console.log(`📡 구독 토픽: ${TOPICS.CMD}`);
  console.log(`📤 발행 토픽: ${TOPICS.STATUS}`);
  console.log('---');

  // 명령 토픽 구독
  client.subscribe(TOPICS.CMD, (err) => {
    if (err) {
      console.error('❌ 구독 실패:', err);
    } else {
      console.log('🎧 명령 대기 중...\n');
      publishStatus(); // 초기 상태 발행
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`📥 명령 수신:`, payload);

    handleCommand(payload);
  } catch (err) {
    console.error('❌ 메시지 파싱 실패:', err.message);
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT 에러:', err.message);
});

// 명령 처리
function handleCommand(payload) {
  const { action, course } = payload;

  switch (action) {
    case 'START':
      startWash(course || 'BASIC');
      break;
    case 'STOP':
      stopWash();
      break;
    default:
      console.log(`⚠️ 알 수 없는 명령: ${action}`);
  }
}

// 세차 시작
function startWash(course) {
  if (currentState.status === STATUS.WASHING) {
    console.log('⚠️ 이미 세차 중입니다.');
    return;
  }

  console.log(`\n🚿 세차 시작! 코스: ${course}`);

  currentState = {
    status: STATUS.WASHING,
    progress: 0,
    course: course,
  };

  publishStatus();

  // 1초마다 진행률 업데이트
  const progressStep = 100 / WASH_DURATION_SEC;

  washInterval = setInterval(() => {
    currentState.progress = Math.min(100, currentState.progress + progressStep);

    console.log(`  ▶ 진행률: ${currentState.progress.toFixed(0)}%`);
    publishStatus();

    // 완료 처리
    if (currentState.progress >= 100) {
      completeWash();
    }
  }, 1000);
}

// 세차 완료
function completeWash() {
  clearInterval(washInterval);
  washInterval = null;

  currentState.status = STATUS.COMPLETED;
  currentState.progress = 100;

  console.log('✅ 세차 완료!\n');
  publishStatus();

  // 3초 후 IDLE 상태로 복귀
  setTimeout(() => {
    currentState = {
      status: STATUS.IDLE,
      progress: 0,
      course: null,
    };
    console.log('🔄 대기 상태로 복귀\n');
    publishStatus();
  }, 3000);
}

// 세차 중지
function stopWash() {
  if (washInterval) {
    clearInterval(washInterval);
    washInterval = null;
  }

  currentState = {
    status: STATUS.IDLE,
    progress: 0,
    course: null,
  };

  console.log('🛑 세차 중지됨\n');
  publishStatus();
}

// 상태 발행
function publishStatus() {
  const payload = JSON.stringify({
    bayId: BAY_ID,
    status: currentState.status,
    progress: Math.round(currentState.progress),
    course: currentState.course,
    timestamp: new Date().toISOString(),
  });

  client.publish(TOPICS.STATUS, payload);
}

// 종료 처리
process.on('SIGINT', () => {
  console.log('\n👋 Gateway 종료 중...');
  if (washInterval) clearInterval(washInterval);
  client.end();
  process.exit(0);
});

console.log(`
╔════════════════════════════════════════╗
║     🚗 Mock Car Wash Gateway 🚗        ║
║                                        ║
║  가상 세차기 시뮬레이터                   ║
╚════════════════════════════════════════╝
`);
