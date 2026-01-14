# Wash System - MVP

세차장 자동화 시스템의 전체 파이프라인을 구축하는 프로젝트입니다.

## 아키텍처

```
┌─────────────┐     HTTP/WS      ┌─────────────┐      MQTT       ┌─────────────┐
│   Frontend  │ ◄──────────────► │   Backend   │ ◄─────────────► │   Gateway   │
│  (React)    │                  │  (Node.js)  │                 │  (Mock HW)  │
└─────────────┘                  └──────┬──────┘                 └─────────────┘
                                        │
                                        │ MQTT
                                        ▼
                                ┌───────────────┐
                                │ MessageBroker │
                                │  (Mosquitto)  │
                                └───────────────┘
```

## 폴더 구조

| 폴더 | 역할 | 기술 스택 |
|------|------|----------|
| `frontend/` | 웹앱 UI (세차 시작 버튼, 진행률 표시) | React / Next.js |
| `backend/` | REST API, WebSocket 서버, MQTT 클라이언트 | Node.js (Express/NestJS) |
| `gateway/` | 가상 세차기 시뮬레이터 (Mock Hardware) | Node.js / Python |
| `messageBroker/` | MQTT 브로커 설정 및 Docker 구성 | Mosquitto |

## MQTT 토픽 규격

### 명령 (Server → Gateway)
- Topic: `wash/{bayId}/cmd`
- Payload: `{"bayId":"bay1","action":"START","course":"BASIC","requestId":"uuid","timestampUtc":"2026-01-14T08:00:00.000Z"}`

### 상태 (Gateway → Server)
- Topic: `wash/{bayId}/status`
- Payload: `{"bayId":"bay1","sessionId":"20260114-170001-bay1-001","state":"WASHING","progress":45,"course":"BASIC","errorCode":null,"timestampUtc":"2026-01-14T08:00:00.000Z"}`

## 메시지 계약

REST/MQTT/WS 메시지 계약은 `docs/message-contract.md`에 확정본으로 정리되어 있습니다.

## Modbus TCP (PLC 시뮬레이터)

현재는 실제 PLC 대신 Modbus TCP 시뮬레이터를 사용합니다.

- 시뮬레이터: `test/tcp-plc-simulator`
- 레지스터 맵 문서: `docs/modbus-register-map.md`
- 기본 포트: `502`

Gateway는 Modbus TCP로 PLC 상태를 읽고, MQTT로 Frontend에 전달합니다.

## 시작하기

```bash
# 1. Message Broker 실행
cd messageBroker && docker-compose up -d

# 2. PLC 시뮬레이터 실행 (Modbus TCP)
cd test/tcp-plc-simulator && npm install && npm start

# 3. Backend 서버 실행
cd backend && npm install && npm run dev

# 4. Gateway 실행 (Modbus TCP 클라이언트)
cd gateway && npm install && npm start

# 5. Frontend 실행
cd frontend && npm install && npm run dev
```

## 개발 스크립트

루트에서 한 번에 실행:

```bash
./scripts/start-dev.sh
```

종료:

```bash
./scripts/stop-dev.sh
```

포트 변경:

```bash
BACKEND_PORT=3002 MODBUS_PORT=1502 ./scripts/start-dev.sh
```

## 환경 변수 샘플

루트 `.env.sample` 참고.

## 운영 체크리스트

`docs/ops-checklist.md` 참고.

## 로컬 설치 가이드

`docs/local-install.md` 참고.

## PLC 스펙

`docs/plc-spec.md` 참고.

## 신뢰성 테스트

```bash
./scripts/test-reliability.sh
```

환경변수로 테스트 대기시간/포트를 조정할 수 있습니다.

## MVP 목표

1. ✅ 버튼 클릭 → 서버 API 호출
2. ✅ 서버 → MQTT로 세차 시작 명령 전송
3. ✅ Gateway → 10초간 진행률 업데이트 발행
4. ✅ 서버 → WebSocket으로 실시간 진행률 전달
5. ✅ Frontend → 프로그레스 바 업데이트
