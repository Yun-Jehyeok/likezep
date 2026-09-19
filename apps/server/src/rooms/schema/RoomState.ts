/**
 * Colyseus 공유 상태(State) 스키마 정의
 *
 * Colyseus는 Schema 클래스를 사용해 서버 상태를 정의하고,
 * 변경된 필드만 바이너리 직렬화(delta patch)하여 클라이언트에 전송한다.
 * 전체 상태를 매 틱 보내는 것보다 훨씬 효율적이다.
 *
 * defineTypes()로 각 필드의 wire type을 명시해야 Colyseus가 직렬화 방법을 안다.
 */
import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

/**
 * 플레이어 1명의 상태. Schema를 상속해야 Colyseus가 변경을 감지하고 동기화한다.
 * x, y 좌표가 바뀔 때마다 클라이언트의 onPlayerMove 콜백이 호출된다.
 */
export class Player extends Schema {
  id: string = "";
  name: string = "";
  x: number = 400;  // 맵 중앙 근처에서 시작
  y: number = 300;
}
// "number"는 float64, "string"은 UTF-8로 인코딩된다
defineTypes(Player, { id: "string", name: "string", x: "number", y: "number" });

/**
 * 룸 전체 상태. MapSchema는 키-값 맵을 동기화하며,
 * 항목이 추가/삭제될 때 클라이언트의 onAdd/onRemove 콜백이 트리거된다.
 * sessionId(string) → Player 매핑으로 모든 플레이어 위치를 추적한다.
 */
export class ProximityRoomState extends Schema {
  players = new MapSchema<Player>();
}
defineTypes(ProximityRoomState, { players: { map: Player } });
