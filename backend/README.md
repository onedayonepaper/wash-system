# Backend

세차장 시스템의 중앙 서버

## 기술 스택
- Node.js
- Express / NestJS
- Socket.io (WebSocket)
- MQTT.js (MQTT Client)

## 주요 기능
- REST API: 세차 시작/중지 명령 처리
- WebSocket: Frontend에 실시간 상태 전달
- MQTT Client: Gateway와 메시지 송수신

## API 엔드포인트
- `POST /api/wash/start` - 세차 시작
- `POST /api/wash/stop` - 세차 중지
- `GET /api/wash/status/:bayId` - 현재 상태 조회

## MQTT 연동
- Publish: `wash/{bayId}/cmd` - 명령 전송
- Subscribe: `wash/{bayId}/status` - 상태 수신
