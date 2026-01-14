#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-3010}"
MODBUS_PORT="${MODBUS_PORT:-502}"
WAIT_SHORT="${WAIT_SHORT:-2}"
WAIT_LONG="${WAIT_LONG:-5}"
RUN_DIR="${ROOT_DIR}/run"

mkdir -p "${RUN_DIR}"

status() {
  curl -s "http://127.0.0.1:${BACKEND_PORT}/api/wash/status/$1"
}

start_wash() {
  local bay_id="$1"
  local req_id="$2"
  curl -s -X POST "http://127.0.0.1:${BACKEND_PORT}/api/wash/start" \
    -H 'Content-Type: application/json' \
    -d "{\"bayId\":\"${bay_id}\",\"course\":\"BASIC\",\"requestId\":\"${req_id}\"}"
}

log() {
  printf "\n==> %s\n" "$1"
}

log "Scenario 1: PLC stop -> OFFLINE"
PLC_PID="$(lsof -tiTCP:${MODBUS_PORT} -sTCP:LISTEN || true)"
if [ -n "${PLC_PID}" ]; then
  kill "${PLC_PID}" || true
fi
sleep "${WAIT_LONG}"
status "bay1"

log "Scenario 2: PLC start -> reconnect"
(
  cd "${ROOT_DIR}/test/tcp-plc-simulator"
  nohup env MODBUS_PORT="${MODBUS_PORT}" npm start > "${RUN_DIR}/plc-simulator.log" 2>&1 &
  echo $! > "${RUN_DIR}/plc-simulator.pid"
)
sleep "${WAIT_LONG}"
status "bay1"

log "Scenario 3: RUNNING then PLC stop"
start_wash "bay1" "reliability-run-1"
sleep "${WAIT_SHORT}"
PLC_PID="$(lsof -tiTCP:${MODBUS_PORT} -sTCP:LISTEN || true)"
if [ -n "${PLC_PID}" ]; then
  kill "${PLC_PID}" || true
fi
sleep "${WAIT_LONG}"
status "bay1"

log "Scenario 4: MQTT restart"
(
  cd "${ROOT_DIR}/messageBroker"
  docker-compose restart
)
sleep "${WAIT_LONG}"
status "bay1"

log "Scenario 5: Backend restart"
BACKEND_PIDS="$(lsof -c node | rg "${ROOT_DIR}/backend" | awk '{print $2}' | sort -u || true)"
if [ -n "${BACKEND_PIDS}" ]; then
  kill ${BACKEND_PIDS} || true
fi
(
  cd "${ROOT_DIR}/backend"
  nohup env PORT="${BACKEND_PORT}" npm start > "${RUN_DIR}/backend.log" 2>&1 &
  echo $! > "${RUN_DIR}/backend.pid"
)
sleep "${WAIT_LONG}"
status "bay1"

log "Done"
