const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// DB 파일 경로: 프로젝트 루트에 wash_system.db 이름으로 생성
const DB_PATH = path.resolve(__dirname, '..', 'wash_system.db');

// 데이터베이스 연결 (없으면 파일 생성)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ DB 연결 실패:', err.message);
  } else {
    console.log(`✅ DB 연결 성공: ${DB_PATH}`);
  }
});

// 테이블 생성 (없으면)
const createTable = (callback) => {
  const query = `
    CREATE TABLE IF NOT EXISTS wash_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bay_id TEXT NOT NULL,
      course TEXT,
      status TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_code TEXT,
      session_id TEXT,
      request_id TEXT
    )
  `;
  db.run(query, (err) => {
    if (err) {
      console.error('❌ "wash_logs" 테이블 생성 실패:', err);
    } else {
      console.log('✅ "wash_logs" 테이블 준비 완료');
    }
    if (callback) callback();
  });
};

const createStateTable = (callback) => {
  const query = `
    CREATE TABLE IF NOT EXISTS bay_state (
      bay_id TEXT PRIMARY KEY,
      session_id TEXT,
      request_id TEXT,
      state TEXT NOT NULL,
      progress INTEGER NOT NULL,
      course TEXT,
      error_code TEXT,
      updated_at DATETIME NOT NULL
    )
  `;
  db.run(query, (err) => {
    if (err) {
      console.error('❌ "bay_state" 테이블 생성 실패:', err);
    } else {
      console.log('✅ "bay_state" 테이블 준비 완료');
    }
    if (callback) callback();
  });
};

const ensureStateColumns = () => {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(bay_state)`, (err, rows) => {
      if (err) {
        console.error('❌ bay_state 테이블 정보 조회 실패:', err);
        resolve();
        return;
      }
      const columns = rows.map((row) => row.name);
      if (columns.includes('request_id')) {
        resolve();
        return;
      }
      db.run(`ALTER TABLE bay_state ADD COLUMN request_id TEXT`, (alterErr) => {
        if (alterErr) {
          console.error('❌ "request_id" 컬럼 추가 실패:', alterErr);
        } else {
          console.log('✅ "request_id" 컬럼 추가 완료');
        }
        resolve();
      });
    });
  });
};

const ensureColumns = () => {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(wash_logs)`, (err, rows) => {
      if (err) {
        console.error('❌ 테이블 정보 조회 실패:', err);
        resolve();
        return;
      }
      const columns = rows.map((row) => row.name);
      const pending = [];
      const addColumn = (name, type) => {
        if (columns.includes(name)) {
          return;
        }
        pending.push(
          new Promise((done) => {
            db.run(`ALTER TABLE wash_logs ADD COLUMN ${name} ${type}`, (alterErr) => {
              if (alterErr) {
                console.error(`❌ "${name}" 컬럼 추가 실패:`, alterErr);
              } else {
                console.log(`✅ "${name}" 컬럼 추가 완료`);
              }
              done();
            });
          })
        );
      };

      addColumn('error_code', 'TEXT');
      addColumn('session_id', 'TEXT');
      addColumn('request_id', 'TEXT');

      Promise.all(pending).then(() => resolve());
    });
  });
};

const ready = new Promise((resolve) => {
  db.serialize(() => {
    createTable(() => {
      createStateTable(() => {
        ensureColumns().then(() => ensureStateColumns().then(resolve));
      });
    });
  });
});

module.exports = db;
module.exports.ready = ready;
