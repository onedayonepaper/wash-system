import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3010';
const HISTORY_LIMIT = 20;

// 세차 코스 정의
const COURSES = [
  { id: 'BASIC', name: '기본', price: 5000 },
  { id: 'STANDARD', name: '일반', price: 8000 },
  { id: 'PREMIUM', name: '프리미엄', price: 12000 },
  { id: 'DELUXE', name: '디럭스', price: 15000 },
];

// 상태별 색상
const STATE_COLORS = {
  IDLE: '#6b7280',
  STARTING: '#facc15',
  WASHING: '#3b82f6',
  DONE: '#22c55e',
  CANCELED: '#f97316',
  ERROR: '#ef4444',
  OFFLINE: '#0f172a',
};

// 상태별 한글 이름
const STATE_NAMES = {
  IDLE: '대기중',
  STARTING: '준비중',
  WASHING: '세차중',
  DONE: '완료',
  CANCELED: '취소됨',
  ERROR: '오류',
  OFFLINE: '오프라인',
};

// 개별 베이 카드 컴포넌트
function BayCard({ bay, onStart, onStop, connected }) {
  const [selectedCourse, setSelectedCourse] = useState('BASIC');
  const [loading, setLoading] = useState(false);
  const [showIds, setShowIds] = useState(false);

  const isActive = bay.state === 'WASHING' || bay.state === 'STARTING';
  const statusColor = STATE_COLORS[bay.state] || STATE_COLORS.IDLE;
  const isError = ['ERROR', 'OFFLINE'].includes(bay.state);

  const handleStart = async () => {
    if (isActive) return;
    setLoading(true);
    try {
      await onStart(bay.bayId, selectedCourse);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    await onStop(bay.bayId);
  };

  return (
    <div className={`bay-card ${isActive ? 'washing' : ''}`}>
      {/* 베이 헤더 */}
      <div className="bay-header">
        <h2>🚗 {bay.name}</h2>
        <span className="bay-status-badge" style={{ backgroundColor: statusColor }}>
          {STATE_NAMES[bay.state] || '알 수 없음'}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="bay-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${bay.progress}%`,
              backgroundColor: statusColor,
            }}
          />
        </div>
        <span className="progress-text">{bay.progress}%</span>
      </div>

      {/* 현재 코스 표시 */}
      {bay.course && !isError && (
        <p className="bay-current-course">진행 중: {bay.course}</p>
      )}

      {/* 에러 표시 */}
      {isError && (
        <div className="bay-error">
          <span className="bay-error-title">
            {bay.state === 'OFFLINE' ? '통신 끊김 · 안전정지' : '오류 감지'}
          </span>
          <span className="bay-error-code">{bay.errorCode || 'UNKNOWN'}</span>
        </div>
      )}

      {(bay.sessionId || bay.requestId) && (
        <div className="bay-session">
          <button
            className="bay-session-toggle"
            onClick={() => setShowIds((prev) => !prev)}
          >
            {showIds ? '세션/요청 숨기기' : '세션/요청 보기'}
          </button>
          {showIds && (
            <div className="bay-session-details">
              {bay.sessionId && (
                <div className="bay-session-row">
                  <span className="bay-session-label">Session</span>
                  <span className="bay-session-value">{bay.sessionId}</span>
                </div>
              )}
              {bay.requestId && (
                <div className="bay-session-row">
                  <span className="bay-session-label">Request</span>
                  <span className="bay-session-value">{bay.requestId}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 코스 선택 (세차 중이 아닐 때만) */}
      {!isActive && (
        <div className="bay-course-select">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            disabled={!connected}
          >
            {COURSES.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} ({course.price.toLocaleString()}원)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="bay-actions">
        {!isActive ? (
          <button
            className="btn-start"
            onClick={handleStart}
            disabled={loading || !connected}
          >
            {loading ? '시작 중...' : '세차 시작'}
          </button>
        ) : (
          <button className="btn-stop" onClick={handleStop}>
            중지
          </button>
        )}
      </div>
    </div>
  );
}

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [bays, setBays] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastHistoryUpdated, setLastHistoryUpdated] = useState(null);
  const historyRefreshTimer = useRef(null);
  const [washStats, setWashStats] = useState({
    summary: { total: 0, completed: 0, canceled: 0, error: 0 },
    avgDurationSec: null,
    perBayAvg: [],
    errorByCode: [],
  });

  // 베이 목록 및 기록 가져오기
  const fetchBays = async () => {
    try {
      const baysResponse = await fetch(`${BACKEND_URL}/api/bays`);
      const baysData = await baysResponse.json();
      setBays(baysData);
    } catch (error) {
      console.error('베이 목록 조회 실패:', error);
    }
  };

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      // 세차 기록
      const historyResponse = await fetch(
        `${BACKEND_URL}/api/wash/history?limit=${HISTORY_LIMIT}`
      );
      const historyData = await historyResponse.json();
      setHistory(historyData);
      setLastHistoryUpdated(new Date());
    } catch (error) {
      console.error('세차 기록 조회 실패:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/wash/stats`);
      const data = await response.json();
      setWashStats(data);
    } catch (error) {
      console.error('세차 통계 조회 실패:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchBays(), fetchHistory(), fetchStats()]);
  }, [fetchHistory, fetchStats]);

  const refreshHistoryAndStats = useCallback(async () => {
    await Promise.all([fetchHistory(), fetchStats()]);
  }, [fetchHistory, fetchStats]);

  useEffect(() => {
    fetchData();
    return () => {
      if (historyRefreshTimer.current) {
        clearTimeout(historyRefreshTimer.current);
      }
    };
  }, [fetchData]);

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
      setBays((prevBays) => {
        const current = prevBays.find((bay) => bay.bayId === data.bayId);
        const stateChanged = current && current.state !== data.state;
        if (stateChanged && ['WASHING', 'DONE', 'CANCELED', 'ERROR', 'OFFLINE'].includes(data.state)) {
          if (!historyRefreshTimer.current) {
            historyRefreshTimer.current = setTimeout(() => {
              historyRefreshTimer.current = null;
              refreshHistoryAndStats();
            }, 500);
          }
        }

        return prevBays.map((bay) =>
          bay.bayId === data.bayId
            ? {
                ...bay,
                state: data.state,
                progress: data.progress,
                course: data.course,
                errorCode: data.errorCode,
                sessionId: data.sessionId,
                requestId: data.requestId,
              }
            : bay
        );
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [fetchHistory, refreshHistoryAndStats]);

  // 세차 시작
  const handleStart = async (bayId, course) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/wash/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bayId, course }),
      });
      const data = await response.json();
      if (!data.success) {
        alert(data.message || '세차 시작 실패');
      }
    } catch (error) {
      console.error('세차 시작 에러:', error);
      alert('서버 연결 실패');
    }
  };

  // 세차 중지
  const handleStop = async (bayId) => {
    try {
      await fetch(`${BACKEND_URL}/api/wash/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bayId }),
      });
    } catch (error) {
      console.error('세차 중지 에러:', error);
    }
  };

  // 통계 계산
  const stats = {
    total: bays.length,
    idle: bays.filter((b) => b.state === 'IDLE').length,
    washing: bays.filter((b) => b.state === 'WASHING' || b.state === 'STARTING').length,
    completed: bays.filter((b) => b.state === 'DONE').length,
  };

  return (
    <div className="container">
      {/* 헤더 */}
      <header className="header">
        <h1>🚗 세차장 관리 시스템</h1>
        <div className={`connection-status ${connected ? 'connected' : ''}`}>
          {connected ? '● 연결됨' : '○ 연결 안됨'}
        </div>
      </header>

      {/* 대시보드 통계 */}
      <section className="dashboard-stats">
        <div className="stat-item">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">전체</span>
        </div>
        <div className="stat-item idle">
          <span className="stat-value">{stats.idle}</span>
          <span className="stat-label">대기</span>
        </div>
        <div className="stat-item washing">
          <span className="stat-value">{stats.washing}</span>
          <span className="stat-label">세차중</span>
        </div>
        <div className="stat-item completed">
          <span className="stat-value">{stats.completed}</span>
          <span className="stat-label">완료</span>
        </div>
      </section>

      {/* 베이 그리드 */}
      <section className="bays-grid">
        {bays.map((bay) => (
          <BayCard
            key={bay.bayId}
            bay={bay}
            onStart={handleStart}
            onStop={handleStop}
            connected={connected}
          />
        ))}
      </section>

      {/* 세차 기록 */}
      <HistoryLog
        history={history}
        onRefresh={refreshHistoryAndStats}
        loading={loadingHistory}
        lastUpdated={lastHistoryUpdated}
        stats={washStats}
      />

      {/* 푸터 */}
      <footer className="footer">
        <p>Multi-Bay Car Wash System | MVP v2</p>
      </footer>
    </div>
  );
}

// 세차 기록 컴포넌트
function HistoryLog({ history, onRefresh, loading, lastUpdated, stats }) {
  const [stateFilter, setStateFilter] = useState('ALL');
  const [bayFilter, setBayFilter] = useState('ALL');
  const [errorOnly, setErrorOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');

  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatUpdated = (date) => {
    if (!date) return '아직 없음';
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const summary = stats?.summary || { total: 0, completed: 0, canceled: 0, error: 0 };
  const perBayAvg = stats?.perBayAvg || [];
  const errorByCode = stats?.errorByCode || [];
  const bayOptions = Array.from(new Set(history.map((log) => log.bayId))).sort();
  const stateOptions = ['ALL', ...Object.keys(STATE_NAMES)];
  const filteredHistory = history
    .filter((log) => (stateFilter === 'ALL' ? true : log.state === stateFilter))
    .filter((log) => (bayFilter === 'ALL' ? true : log.bayId === bayFilter))
    .filter((log) =>
      errorOnly ? ['ERROR', 'OFFLINE'].includes(log.state) : true
    )
    .filter((log) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (log.bayId || '').toLowerCase().includes(term) ||
        (log.course || '').toLowerCase().includes(term) ||
        (log.sessionId || '').toLowerCase().includes(term) ||
        (log.requestId || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.startTime || 0).getTime();
      const timeB = new Date(b.startTime || 0).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextState = params.get('state');
    const nextBay = params.get('bay');
    const nextError = params.get('error');
    const nextQuery = params.get('q');
    const nextSort = params.get('sort');
    if (nextState) setStateFilter(nextState);
    if (nextBay) setBayFilter(nextBay);
    if (nextError === '1') setErrorOnly(true);
    if (nextQuery) setSearchTerm(nextQuery);
    if (nextSort) setSortOrder(nextSort);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (stateFilter !== 'ALL') params.set('state', stateFilter);
    if (bayFilter !== 'ALL') params.set('bay', bayFilter);
    if (errorOnly) params.set('error', '1');
    if (searchTerm) params.set('q', searchTerm);
    if (sortOrder !== 'desc') params.set('sort', sortOrder);
    const query = params.toString();
    const nextUrl = query ? `?${query}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [stateFilter, bayFilter, errorOnly, searchTerm, sortOrder]);

  return (
    <section className="history-log">
      <div className="history-header">
        <div>
          <h2>세차 기록</h2>
          <p className="history-subtitle">
            최근 {HISTORY_LIMIT}건 · 표시 {filteredHistory.length}건 · 마지막 갱신{' '}
            {formatUpdated(lastUpdated)}
          </p>
        </div>
        <button className="history-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? '갱신 중...' : '🔄 새로고침'}
        </button>
      </div>
      <div className="history-filters">
        <div className="history-filter-group">
          <label>상태</label>
          <select
            className="history-filter-select"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state === 'ALL' ? '전체' : STATE_NAMES[state]}
              </option>
            ))}
          </select>
        </div>
        <div className="history-filter-group">
          <label>베이</label>
          <select
            className="history-filter-select"
            value={bayFilter}
            onChange={(e) => setBayFilter(e.target.value)}
          >
            <option value="ALL">전체</option>
            {bayOptions.map((bayId) => (
              <option key={bayId} value={bayId}>
                {bayId}
              </option>
            ))}
          </select>
        </div>
        <div className="history-filter-group">
          <label>검색</label>
          <input
            className="history-filter-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="세션/요청 ID, 코스"
          />
        </div>
        <div className="history-filter-group">
          <label>정렬</label>
          <select
            className="history-filter-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="desc">최신순</option>
            <option value="asc">오래된순</option>
          </select>
        </div>
        <button
          className={`history-filter-toggle ${errorOnly ? 'active' : ''}`}
          onClick={() => setErrorOnly((prev) => !prev)}
        >
          오류만
        </button>
      </div>
      <div className="history-summary">
        <div className="history-summary-item">
          <span className="history-summary-value">{summary.total}</span>
          <span className="history-summary-label">전체</span>
        </div>
        <div className="history-summary-item completed">
          <span className="history-summary-value">{summary.completed}</span>
          <span className="history-summary-label">완료</span>
        </div>
        <div className="history-summary-item canceled">
          <span className="history-summary-value">{summary.canceled}</span>
          <span className="history-summary-label">취소</span>
        </div>
        <div className="history-summary-item error">
          <span className="history-summary-value">{summary.error}</span>
          <span className="history-summary-label">오류</span>
        </div>
        <div className="history-summary-item duration">
          <span className="history-summary-value">
            {formatDuration(stats?.avgDurationSec)}
          </span>
          <span className="history-summary-label">평균 소요</span>
        </div>
      </div>
      <div className="history-bay-avg">
        <div className="history-bay-avg-header">
          <h3>베이별 평균 소요시간</h3>
          <span>완료 기준</span>
        </div>
        <div className="history-bay-avg-grid">
          {perBayAvg.length === 0 && (
            <div className="history-empty">완료 기록이 없습니다.</div>
          )}
          {perBayAvg.map((bay) => (
            <div key={bay.bayId} className="history-bay-avg-card">
              <span className="history-bay-avg-label">{bay.bayId}</span>
              <span className="history-bay-avg-value">
                {formatDuration(bay.avgDurationSec)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="history-error-stats">
        <div className="history-error-header">
          <h3>에러 통계</h3>
          <span>에러 코드 기준</span>
        </div>
        <div className="history-error-grid">
          {errorByCode.length === 0 && (
            <div className="history-empty">에러 기록이 없습니다.</div>
          )}
          {errorByCode.map((error) => (
            <div key={error.errorCode} className="history-error-card">
              <span className="history-error-code">{error.errorCode}</span>
              <span className="history-error-count">{error.count}건</span>
            </div>
          ))}
        </div>
      </div>
      <div className="history-grid">
        {filteredHistory.map((log) => (
          <article key={log.id} className="history-card">
            <div className="history-card-header">
              <div>
                <span className="history-card-id">#{log.id}</span>
                <h3>{log.bayId}</h3>
              </div>
              <span
                className="history-status-badge"
                style={{ backgroundColor: STATE_COLORS[log.state] || '#ccc' }}
              >
                {STATE_NAMES[log.state] || log.state}
              </span>
            </div>
            <div className="history-card-body">
              <div className="history-card-row">
                <span className="history-label">코스</span>
                <span className="history-value">{log.course || '-'}</span>
              </div>
              {(log.sessionId || log.requestId) && (
                <div className="history-card-meta">
                  {log.sessionId && (
                    <span>
                      Session <strong>{log.sessionId}</strong>
                    </span>
                  )}
                  {log.requestId && (
                    <span>
                      Request <strong>{log.requestId}</strong>
                    </span>
                  )}
                </div>
              )}
              {['ERROR', 'OFFLINE'].includes(log.state) && (
                <div className="history-card-row">
                  <span className="history-label">에러 코드</span>
                  <span className="history-value">
                    {log.errorCode || 'UNKNOWN'}
                  </span>
                </div>
              )}
              <div className="history-card-row">
                <span className="history-label">시작</span>
                <span className="history-value">{formatTime(log.startTime)}</span>
              </div>
              <div className="history-card-row">
                <span className="history-label">종료</span>
                <span className="history-value">{formatTime(log.endTime)}</span>
              </div>
            </div>
          </article>
        ))}
        {filteredHistory.length === 0 && (
          <div className="history-empty">
            아직 기록이 없습니다. 세차를 시작해 보세요.
          </div>
        )}
      </div>
    </section>
  );
}

export default App;
