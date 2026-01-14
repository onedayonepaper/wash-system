const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// DB 파일 경로 (gateway와 동일한 파일)
const DB_PATH = path.resolve(__dirname, '..', 'wash_system.db');

// 데이터베이스 연결 (읽기 전용)
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ DB 연결 실패 (읽기 전용):', err.message);
  } else {
    console.log(`✅ DB 연결 성공 (읽기 전용): ${DB_PATH}`);
  }
});

/**
 * 세차 기록을 조회합니다.
 * @param {number} limit - 조회할 최대 개수
 * @returns {Promise<Array<object>>}
 */
const getWashHistory = (limit = 20) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT id, bay_id, course, status, start_time, end_time, error_code, session_id, request_id
      FROM wash_logs
      ORDER BY start_time DESC
      LIMIT ?
    `;
    db.all(query, [limit], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * 베이별 최근 상태를 조회합니다.
 * @param {string[]} bayIds
 * @returns {Promise<Array<object>>}
 */
const getLatestBayStatus = (bayIds = []) => {
  if (!bayIds.length) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    const query = `
      SELECT bay_id, course, status, start_time, end_time, error_code, session_id, request_id
      FROM wash_logs
      WHERE id IN (
        SELECT MAX(id)
        FROM wash_logs
        GROUP BY bay_id
      )
    `;
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const filtered = rows.filter((row) => bayIds.includes(row.bay_id));
        resolve(filtered);
      }
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * 베이 상태 스냅샷을 조회합니다.
 * @returns {Promise<Array<object>>}
 */
const getBaySnapshots = () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT bay_id, session_id, request_id, state, progress, course, error_code, updated_at
      FROM bay_state
    `;
    db.all(query, [], (err, rows) => {
      if (err) {
        if (err.message && err.message.includes('no such table')) {
          resolve([]);
        } else {
          reject(err);
        }
      } else {
        resolve(rows);
      }
    });
  });
};

/**
 * 세차 통계를 조회합니다.
 * @returns {Promise<object>}
 */
const getWashStats = async () => {
  const summaryRow = await dbGet(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('DONE', 'COMPLETED') THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'CANCELED' THEN 1 ELSE 0 END) AS canceled,
      SUM(CASE WHEN status IN ('ERROR', 'OFFLINE') THEN 1 ELSE 0 END) AS error
    FROM wash_logs
  `);

  const avgRow = await dbGet(`
    SELECT AVG((julianday(end_time) - julianday(start_time)) * 86400.0) AS avg_duration
    FROM wash_logs
    WHERE status IN ('DONE', 'COMPLETED') AND end_time IS NOT NULL
  `);

  const perBayRows = await dbAll(`
    SELECT
      bay_id,
      AVG((julianday(end_time) - julianday(start_time)) * 86400.0) AS avg_duration
    FROM wash_logs
    WHERE status IN ('DONE', 'COMPLETED') AND end_time IS NOT NULL
    GROUP BY bay_id
  `);

  const errorRows = await dbAll(`
    SELECT COALESCE(error_code, 'UNKNOWN') AS error_code, COUNT(*) AS count
    FROM wash_logs
    WHERE status IN ('ERROR', 'OFFLINE')
    GROUP BY COALESCE(error_code, 'UNKNOWN')
  `);

  return {
    summary: {
      total: summaryRow?.total || 0,
      completed: summaryRow?.completed || 0,
      canceled: summaryRow?.canceled || 0,
      error: summaryRow?.error || 0,
    },
    avgDurationSec: avgRow?.avg_duration ? Math.round(avgRow.avg_duration) : null,
    perBayAvg: perBayRows.map((row) => ({
      bayId: row.bay_id,
      avgDurationSec: row.avg_duration ? Math.round(row.avg_duration) : null,
    })),
    errorByCode: errorRows.map((row) => ({
      errorCode: row.error_code,
      count: row.count,
    })),
  };
};

module.exports = {
  db,
  getWashHistory,
  getLatestBayStatus,
  getWashStats,
  getBaySnapshots,
};
