#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/run"
MODBUS_PORT="${MODBUS_PORT:-502}"
BACKEND_PORT="${BACKEND_PORT:-3010}"

mkdir -p "$RUN_DIR"

if [ "$MODBUS_PORT" -lt 1024 ] && [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "⚠️  Port $MODBUS_PORT is privileged. Use sudo or set MODBUS_PORT=1502."
fi

(
  cd "$ROOT_DIR/messageBroker"
  docker-compose up -d
)

(
  cd "$ROOT_DIR/test/tcp-plc-simulator"
  nohup env MODBUS_PORT="$MODBUS_PORT" npm start > "$RUN_DIR/plc-simulator.log" 2>&1 &
  echo $! > "$RUN_DIR/plc-simulator.pid"
)

(
  cd "$ROOT_DIR/gateway"
  nohup env MODBUS_PORT="$MODBUS_PORT" npm start > "$RUN_DIR/gateway.log" 2>&1 &
  echo $! > "$RUN_DIR/gateway.pid"
)

(
  cd "$ROOT_DIR/backend"
  nohup env PORT="$BACKEND_PORT" npm start > "$RUN_DIR/backend.log" 2>&1 &
  echo $! > "$RUN_DIR/backend.pid"
)

(
  cd "$ROOT_DIR/frontend"
  nohup env VITE_BACKEND_URL="http://localhost:$BACKEND_PORT" npm run dev > "$RUN_DIR/frontend.log" 2>&1 &
  echo $! > "$RUN_DIR/frontend.pid"
)

echo "✅ Started. Logs: $RUN_DIR"
