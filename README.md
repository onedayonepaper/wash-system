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
- Payload: `{"action": "START", "course": "BASIC"}`

### 상태 (Gateway → Server)
- Topic: `wash/{bayId}/status`
- Payload: `{"status": "WASHING", "progress": 45}`

## 시작하기

```bash
# 1. Message Broker 실행
cd messageBroker && docker-compose up -d

# 2. Backend 서버 실행
cd backend && npm install && npm run dev

# 3. Gateway 시뮬레이터 실행
cd gateway && npm install && npm start

# 4. Frontend 실행
cd frontend && npm install && npm run dev
```

## MVP 목표

1. ✅ 버튼 클릭 → 서버 API 호출
2. ✅ 서버 → MQTT로 세차 시작 명령 전송
3. ✅ Gateway → 10초간 진행률 업데이트 발행
4. ✅ 서버 → WebSocket으로 실시간 진행률 전달
5. ✅ Frontend → 프로그레스 바 업데이트
