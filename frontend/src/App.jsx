import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3002';

// 세차 코스 정의
const COURSES = [
  { id: 'BASIC', name: '기본 세차', price: 5000, duration: '10초' },
  { id: 'STANDARD', name: '일반 세차', price: 8000, duration: '10초' },
  { id: 'PREMIUM', name: '프리미엄', price: 12000, duration: '10초' },
  { id: 'DELUXE', name: '디럭스', price: 15000, duration: '10초' },
];

// 상태별 색상
const STATUS_COLORS = {
  IDLE: '#6b7280',
  WASHING: '#3b82f6',
  COMPLETED: '#22c55e',
  ERROR: '#ef4444',
};

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('BASIC');
  const [washStatus, setWashStatus] = useState({
    status: 'IDLE',
    progress: 0,
    course: null,
  });
  const [loading, setLoading] = useState(false);

  // WebSocket 연결
  useEffect(() => {
    const newSocket = io(BACKEND_URL);

    newSocket.on('connect', () => {
      console.log('✅ WebSocket 연결됨');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket 연결 해제');
      setConnected(false);
    });

    newSocket.on('wash:status', (data) => {
      console.log('📥 상태 업데이트:', data);
      if (data.bayId === 'bay1') {
        setWashStatus(data);
        if (data.status === 'COMPLETED' || data.status === 'IDLE') {
          setLoading(false);
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // 세차 시작
  const handleStart = async () => {
    if (washStatus.status === 'WASHING') return;

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/wash/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bayId: 'bay1', course: selectedCourse }),
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || '세차 시작 실패');
        setLoading(false);
      }
    } catch (error) {
      console.error('세차 시작 에러:', error);
      alert('서버 연결 실패');
      setLoading(false);
    }
  };

  // 세차 중지
  const handleStop = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/wash/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bayId: 'bay1' }),
      });
    } catch (error) {
      console.error('세차 중지 에러:', error);
    }
  };

  const isWashing = washStatus.status === 'WASHING';
  const statusColor = STATUS_COLORS[washStatus.status] || STATUS_COLORS.IDLE;

  return (
    <div className="container">
      {/* 헤더 */}
      <header className="header">
        <h1>🚗 세차장 시스템</h1>
        <div className={`connection-status ${connected ? 'connected' : ''}`}>
          {connected ? '● 연결됨' : '○ 연결 안됨'}
        </div>
      </header>

      {/* 상태 표시 */}
      <section className="status-section">
        <div className="status-badge" style={{ backgroundColor: statusColor }}>
          {washStatus.status}
        </div>
        {washStatus.course && (
          <p className="current-course">코스: {washStatus.course}</p>
        )}
      </section>

      {/* 프로그레스 바 */}
      <section className="progress-section">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${washStatus.progress}%`,
              backgroundColor: statusColor,
            }}
          />
        </div>
        <p className="progress-text">{washStatus.progress}%</p>
      </section>

      {/* 코스 선택 */}
      <section className="course-section">
        <h2>세차 코스 선택</h2>
        <div className="course-grid">
          {COURSES.map((course) => (
            <button
              key={course.id}
              className={`course-card ${selectedCourse === course.id ? 'selected' : ''}`}
              onClick={() => setSelectedCourse(course.id)}
              disabled={isWashing}
            >
              <span className="course-name">{course.name}</span>
              <span className="course-price">{course.price.toLocaleString()}원</span>
            </button>
          ))}
        </div>
      </section>

      {/* 액션 버튼 */}
      <section className="action-section">
        {!isWashing ? (
          <button
            className="btn-start"
            onClick={handleStart}
            disabled={loading || !connected}
          >
            {loading ? '시작 중...' : '🚿 세차 시작'}
          </button>
        ) : (
          <button className="btn-stop" onClick={handleStop}>
            🛑 세차 중지
          </button>
        )}
      </section>

      {/* Bay 정보 */}
      <footer className="footer">
        <p>Bay #1 | MVP Demo</p>
      </footer>
    </div>
  );
}

export default App;
