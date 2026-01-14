# Message Contract (Wash System)

This document defines the current message contract across REST, WebSocket, and MQTT.

## Version

- Contract: v1
- Last updated: 2026-01-14

All timestamps are UTC ISO 8601 (`timestampUtc`). UI converts to local time.

## REST API (Backend)

Base URL: `http://localhost:3010`

### Health

`GET /api/health`

Response
```json
{ "status": "ok", "mqtt": true }
```

### Bays

`GET /api/bays`

Response
```json
[
  {
    "bayId": "bay1",
    "name": "Bay #1",
    "state": "IDLE",
    "progress": 0,
    "course": "BASIC",
    "errorCode": null,
    "sessionId": null,
    "requestId": null
  }
]
```

### Start Wash

`POST /api/wash/start`

Request
```json
{ "bayId": "bay1", "course": "BASIC", "requestId": "uuid-1234" }
```

Response
```json
{ "success": true, "bayId": "bay1", "course": "BASIC", "requestId": "uuid-1234" }
```

If the same `requestId` is retried while the bay is already `STARTING`/`WASHING`,
the server returns `200` with `idempotent: true`. A different `requestId` returns
`409 Conflict`.

### Stop Wash

`POST /api/wash/stop`

Request
```json
{ "bayId": "bay1" }
```

Response
```json
{ "success": true, "bayId": "bay1", "requestId": "uuid-5678" }
```

### Status (Single)

`GET /api/wash/status/:bayId`

Response
```json
{
  "bayId": "bay1",
  "state": "WASHING",
  "progress": 45,
  "course": "BASIC",
  "errorCode": null,
  "sessionId": "20260114-170001-bay1-001",
  "timestampUtc": "2026-01-14T08:00:00.000Z"
}
```

### Status (All)

`GET /api/wash/status`

Response
```json
{
  "bay1": {
    "bayId": "bay1",
    "state": "IDLE",
    "progress": 0,
    "course": null,
    "errorCode": null,
    "sessionId": null,
    "timestampUtc": "2026-01-14T08:00:00.000Z"
  }
}
```

### History

`GET /api/wash/history?limit=20`

Response
```json
[
  {
    "id": 1,
    "bayId": "bay1",
    "course": "BASIC",
    "state": "DONE",
    "startTime": "2026-01-14T07:00:00.000Z",
    "endTime": "2026-01-14T07:00:10.000Z",
    "errorCode": null,
    "sessionId": "20260114-170001-bay1-001",
    "requestId": "uuid-1234"
  }
]
```

### Stats

`GET /api/wash/stats`

Response
```json
{
  "summary": {
    "total": 12,
    "completed": 9,
    "canceled": 0,
    "error": 3
  },
  "avgDurationSec": 10,
  "perBayAvg": [
    { "bayId": "bay1", "avgDurationSec": 10 }
  ],
  "errorByCode": [
    { "errorCode": "PLC_OFFLINE", "count": 3 }
  ]
}
```

## WebSocket (Backend -> Frontend)

Event: `wash:status`

Payload
```json
{
  "bayId": "bay1",
  "sessionId": "20260114-170001-bay1-001",
  "requestId": "uuid-1234",
  "state": "WASHING",
  "progress": 45,
  "course": "BASIC",
  "errorCode": null,
  "timestampUtc": "2026-01-14T08:00:00.000Z"
}
```

## MQTT Topics

### Command (Backend -> Gateway)

Topic: `wash/{bayId}/cmd`

Payload
```json
{
  "bayId": "bay1",
  "action": "START",
  "course": "BASIC",
  "requestId": "uuid-1234",
  "timestampUtc": "2026-01-14T08:00:00.000Z"
}
```

### Status (Gateway -> Backend)

Topic: `wash/{bayId}/status`

Payload
```json
{
  "bayId": "bay1",
  "sessionId": "20260114-170001-bay1-001",
  "requestId": "uuid-1234",
  "state": "WASHING",
  "progress": 45,
  "course": "BASIC",
  "errorCode": null,
  "timestampUtc": "2026-01-14T08:00:00.000Z"
}
```

## State Enum

- `IDLE`
- `STARTING`
- `WASHING`
- `DONE`
- `CANCELED`
- `ERROR`
- `OFFLINE`

## Error Codes

- `PLC_OFFLINE`
