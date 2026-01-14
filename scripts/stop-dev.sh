#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/run"

stop_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if [ -n "$pid" ]; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

stop_pid_file "$RUN_DIR/frontend.pid"
stop_pid_file "$RUN_DIR/backend.pid"
stop_pid_file "$RUN_DIR/gateway.pid"
stop_pid_file "$RUN_DIR/plc-simulator.pid"

(
  cd "$ROOT_DIR/messageBroker"
  docker-compose down
)

echo "🛑 Stopped."
