/**
 * Colyseus 클라이언트 래퍼
 *
 * Colyseus의 두 가지 실시간 데이터 전달 방식:
 *
 * 1. State Sync (Schema delta patch): 서버 state가 바뀌면 자동으로 클라이언트에 반영
 *    → getStateCallbacks(room)으로 onChange/onAdd/onRemove 콜백을 등록해 수신한다
 *    → 플레이어 위치처럼 "지속적으로 유지되는 상태"에 적합
 *
 * 2. Message: 서버가 특정 클라이언트(들)에게 일회성 이벤트를 보낼 때
 *    → room.onMessage<T>(type, callback)으로 수신한다
 *    → proximity-connect, webrtc-offer 등 "한 번 발생하는 이벤트"에 적합
 *
 * 이 모듈은 Colyseus API를 직접 노출하지 않고 RoomCallbacks 인터페이스로 추상화한다.
 * 덕분에 RoomPage는 Colyseus를 직접 몰라도 된다.
 */
import { Client, getStateCallbacks } from "colyseus.js";
import type { Room } from "colyseus.js";
import type {
  ProximityConnectPayload,
  ProximityDisconnectPayload,
  WebRtcRelayPayload,
} from "@mentoring/shared";

const WS_URL = (import.meta as any).env?.VITE_SERVER_URL ?? "ws://localhost:2567";

export interface PlayerInfo {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** RoomPage가 구현해야 할 이벤트 콜백 인터페이스 */
export interface RoomCallbacks {
  onPlayerJoin(sessionId: string, player: PlayerInfo): void;
  onPlayerLeave(sessionId: string): void;
  onPlayerMove(sessionId: string, x: number, y: number): void;
  onProximityConnect(peerId: string, isOfferer: boolean): void;
  onProximityDisconnect(peerId: string): void;
  onWebRtcOffer(from: string, sdp: RTCSessionDescriptionInit): void;
  onWebRtcAnswer(from: string, sdp: RTCSessionDescriptionInit): void;
  onWebRtcIce(from: string, candidate: RTCIceCandidateInit): void;
}

/**
 * 룸의 상태 변경과 메시지를 수신해 callbacks로 전달한다.
 * getStateCallbacks()는 Colyseus v0.16+의 새 API로, state 변경을 구독하는 방식이다.
 */
function attachCallbacks(room: Room, callbacks: RoomCallbacks) {
  const $ = getStateCallbacks(room);

  // players MapSchema의 onAdd: 새 플레이어가 state에 추가될 때 호출
  // 두 번째 인자 true = 이미 존재하는 플레이어도 즉시 onAdd로 받는다 (입장 시 스냅샷)
  ($(room.state as any).players as any).onAdd((player: any, sessionId: string) => {
    callbacks.onPlayerJoin(sessionId, {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
    });
    // 개별 Player의 필드(x, y)가 바뀔 때마다 onPlayerMove 호출
    ($(player) as any).onChange(() => {
      callbacks.onPlayerMove(sessionId, player.x, player.y);
    });
  }, true);

  // players MapSchema의 onRemove: 플레이어가 퇴장해 state에서 제거될 때 호출
  ($(room.state as any).players as any).onRemove((_player: any, sessionId: string) => {
    callbacks.onPlayerLeave(sessionId);
  });

  // 일회성 메시지 구독 (WebRTC 시그널링, 근접 감지)
  room.onMessage<ProximityConnectPayload>("proximity-connect", ({ peerId, isOfferer }) => {
    callbacks.onProximityConnect(peerId, isOfferer);
  });
  room.onMessage<ProximityDisconnectPayload>("proximity-disconnect", ({ peerId }) => {
    callbacks.onProximityDisconnect(peerId);
  });
  room.onMessage<WebRtcRelayPayload>("webrtc-offer", ({ from, sdp }) => {
    if (sdp) callbacks.onWebRtcOffer(from, sdp as RTCSessionDescriptionInit);
  });
  room.onMessage<WebRtcRelayPayload>("webrtc-answer", ({ from, sdp }) => {
    if (sdp) callbacks.onWebRtcAnswer(from, sdp as RTCSessionDescriptionInit);
  });
  room.onMessage<WebRtcRelayPayload>("webrtc-ice", ({ from, candidate }) => {
    if (candidate) callbacks.onWebRtcIce(from, candidate as RTCIceCandidateInit);
  });
}

/**
 * "mentoring-room"에 입장한다.
 * joinOrCreate: 같은 dbRoomId로 필터링된 룸이 있으면 입장, 없으면 새로 생성한다.
 * 반환된 Room 객체는 RoomPage에서 room.send() 호출 및 room.leave()에 사용한다.
 */
export async function joinRoom(
  dbRoomId: string,
  token: string,
  playerName: string,
  callbacks: RoomCallbacks,
): Promise<Room> {
  const client = new Client(WS_URL);
  const room = await client.joinOrCreate("mentoring-room", {
    dbRoomId,
    token,     // 서버의 onAuth에서 JWT 검증에 사용
    name: playerName,
  });
  attachCallbacks(room, callbacks);
  return room;
}

/** @deprecated PoC 전용. MVP는 joinRoom 사용. */
export async function joinPocRoom(playerName: string, callbacks: RoomCallbacks): Promise<Room> {
  const client = new Client(WS_URL);
  const room = await client.joinOrCreate("poc-room", { name: playerName });
  attachCallbacks(room, callbacks);
  return room;
}
