# Local Install Guide (Offline Delivery)

This guide covers local, non-cloud deployment on a single machine.

## 1) Prerequisites

- Node.js LTS
- SQLite3 CLI (optional for inspection)
- MQTT broker (choose one):
  - Docker + Mosquitto image, or
  - Native Mosquitto install
- Modbus TCP access on port `502` (or use `1502` and update env)

## 2) Ports

- Backend: `3010`
- Frontend: `5173`
- MQTT: `1883`
- Modbus TCP: `502` (privileged)

If `502` is blocked, use `1502` and set:
```
MODBUS_PORT=1502
```

## 3) Environment Variables

Use `.env.sample` as the baseline.

## 4) Broker Setup

### Option A: Docker
```
cd messageBroker
docker-compose up -d
```

### Option B: Native Mosquitto
Install Mosquitto and run:
```
mosquitto -p 1883
```

## 5) Start Services (Manual)

```
cd test/tcp-plc-simulator && npm install && npm start
cd gateway && npm install && npm start
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

Or use the script:
```
./scripts/start-dev.sh
```

## 6) Auto-Start (Optional)

### Linux (systemd) skeleton
Create `/etc/systemd/system/wash-backend.service`:
```
[Unit]
Description=Wash Backend
After=network.target

[Service]
WorkingDirectory=/path/to/wash-system/backend
Environment=PORT=3010
ExecStart=/usr/bin/node index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Repeat for gateway, frontend, and PLC simulator as needed.

### macOS (launchd) skeleton
Create `~/Library/LaunchAgents/com.wash.backend.plist`:
```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.wash.backend</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/wash-system/backend/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/wash-system/backend</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>3010</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

### Windows (Task Scheduler / NSSM) skeleton

Option A: Task Scheduler
- Create a task to run `node` with `backend/index.js` on logon.
- Set "Run whether user is logged on or not".

Option B: NSSM
```
nssm install WashBackend "C:\\Program Files\\nodejs\\node.exe" "C:\\path\\to\\wash-system\\backend\\index.js"
nssm set WashBackend AppDirectory "C:\\path\\to\\wash-system\\backend"
nssm set WashBackend AppEnvironmentExtra "PORT=3010"
nssm start WashBackend
```

Repeat for gateway, frontend, and PLC simulator.

## 7) Health Checks

- Backend: `GET /api/health`
- MQTT: port `1883` listening
- Modbus: port `502` listening

## 8) Logs

Logs are in `run/` when started via `./scripts/start-dev.sh`.
