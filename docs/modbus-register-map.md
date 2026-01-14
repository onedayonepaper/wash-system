# Modbus TCP 레지스터 맵 (Wash System)

이 문서는 세차장 PLC 시뮬레이터와 Gateway가 사용하는 Modbus TCP 레지스터 맵을 정의합니다.

## 연결 정보

- 프로토콜: Modbus TCP
- 포트: `502`
- Unit ID: `1`

## 베이별 주소 규칙

베이마다 10개의 Holding Register 블록을 사용합니다.

- `bay1`: 40001 ~ 40010 (offset 0 ~ 9)
- `bay2`: 40011 ~ 40020 (offset 10 ~ 19)
- `bay3`: 40021 ~ 40030 (offset 20 ~ 29)

## 레지스터 정의 (Holding Register)

| 오프셋 | 주소 | 이름 | 접근 | 값 |
| --- | --- | --- | --- | --- |
| 0 | 40001 | COMMAND | Write | 0: NONE, 1: START, 2: STOP |
| 1 | 40002 | COURSE | Write | 1: BASIC, 2: STANDARD, 3: PREMIUM, 4: DELUXE |
| 2 | 40003 | STATUS | Read | 0: IDLE, 1: WASHING, 2: COMPLETED, 3: CANCELED, 4: ERROR |
| 3 | 40004 | PROGRESS | Read | 0 ~ 100 |
| 4 | 40005 | ERROR | Read | 0: NONE (확장 예정) |

## 동작 규약

- `COMMAND`에 START(1) 또는 STOP(2)을 쓰면 시뮬레이터가 명령을 처리한 후 0으로 초기화합니다.
- `COURSE`는 START 전에 설정해야 하며, 시뮬레이터는 해당 값을 유지합니다.
- 세차 완료 시 `STATUS`는 COMPLETED(2)로 전환되고, 약 3초 후 IDLE(0)로 복귀합니다.

## Gateway 상태 매핑

Gateway는 PLC STATUS를 아래 state로 변환해 MQTT/WS로 브로드캐스트합니다.

- IDLE -> `IDLE`
- WASHING -> `WASHING`
- COMPLETED -> `DONE`
- CANCELED -> `CANCELED`
- ERROR -> `ERROR`

`STARTING`과 `OFFLINE`은 PLC 레지스터에 없으며 Gateway가 내부적으로 생성합니다.
