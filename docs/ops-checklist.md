# Ops Checklist

## Startup

- Broker: `docker-compose up -d` in `messageBroker`
- PLC simulator: `npm start` in `test/tcp-plc-simulator` (or real PLC)
- Gateway: `npm start` in `gateway`
- Backend: `npm start` in `backend` (PORT set)
- Frontend: `npm run dev` in `frontend` (VITE_BACKEND_URL set)

## Health Checks

- Backend: `GET /api/health`
- MQTT: broker port `1883` listening
- Modbus: port `502` listening
- Frontend: `http://localhost:5173`

## Recovery Scenarios

- PLC off -> `OFFLINE` + `PLC_OFFLINE` errorCode
- PLC on -> auto reconnect -> `IDLE`
- MQTT broker restart -> auto reconnect + status heartbeat
- Backend restart -> status snapshot + heartbeat resync

## Data Integrity

- `wash_logs` contains session/request IDs
- `bay_state` snapshot updated on every status publish

## Scripts

- Start: `./scripts/start-dev.sh`
- Stop: `./scripts/stop-dev.sh`
- Reliability: `./scripts/test-reliability.sh`
