# Modbus TCP PLC Simulator

세차기 PLC를 모사하는 Modbus TCP 시뮬레이터입니다.

## 실행

```bash
npm install
npm start
```

기본 포트는 502입니다. 권한 문제가 있으면 다음과 같이 포트를 변경할 수 있습니다.

```bash
MODBUS_PORT=1502 npm start
```

## 환경 변수

- `MODBUS_HOST` (기본값: `0.0.0.0`)
- `MODBUS_PORT` (기본값: `502`)
- `BAY_IDS` (기본값: `bay1,bay2,bay3`)
- `WASH_DURATION_SEC` (기본값: `10`)
- `IDLE_DELAY_MS` (기본값: `3000`)

## 레지스터 맵

자세한 레지스터 맵은 `docs/modbus-register-map.md`를 참고하세요.
