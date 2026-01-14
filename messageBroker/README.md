# Message Broker

MQTT 브로커 설정 (Mosquitto)

## 기술 스택
- Eclipse Mosquitto
- Docker

## 설정
- Port: 1883 (MQTT)
- Port: 9001 (WebSocket, 선택사항)

## Docker로 실행
```bash
docker-compose up -d
```

## 로컬 테스트
```bash
# 구독 (터미널 1)
mosquitto_sub -h localhost -t "wash/#" -v

# 발행 (터미널 2)
mosquitto_pub -h localhost -t "wash/bay1/cmd" -m '{"action":"START"}'
```
