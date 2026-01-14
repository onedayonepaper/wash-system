# Gateway (Mock Hardware)

실제 세차기 없이 테스트하기 위한 가상 하드웨어 시뮬레이터

## 기술 스택
- Node.js / Python
- MQTT.js / paho-mqtt

## 동작 방식
1. MQTT 브로커에 연결
2. `wash/{bayId}/cmd` 토픽 구독
3. START 명령 수신 시:
   - 10초간 1초마다 progress 10% 증가
   - `wash/{bayId}/status`로 상태 발행
4. 100% 도달 시 COMPLETED 상태 발행

## 시뮬레이션 시나리오
- 정상 세차: 10초 소요, 100% 완료
- 에러 시뮬레이션: 특정 확률로 ERROR 상태 발생
- 비상 정지: STOP 명령 시 즉시 중단
