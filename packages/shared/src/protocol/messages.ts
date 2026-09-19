/**
 * 클라이언트 ↔ 서버 간 메시지 타입 정의
 *
 * 이 파일은 packages/shared에 존재하므로 클라이언트(React)와 서버(Node.js) 양쪽에서 동일한 타입을 import한다.
 * 한쪽에서만 타입을 바꾸면 컴파일 에러가 나므로 프로토콜 불일치를 방지한다.
 *
 * DOM 타입(RTCSessionDescription 등)에 의존하지 않도록 직접 인터페이스를 선언한다.
 * 이렇게 해야 Node.js 환경(서버)에서도 타입 오류 없이 import할 수 있다.
 */

// RTCSessionDescription / RTCIceCandidate의 경량 대체 타입 — DOM lib 의존성 없음
export interface RtcSdp { type: string; sdp: string }
export interface RtcIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

// ──────────────────────────────────────────────────────────────
// Client → Server 메시지 페이로드 타입
// ──────────────────────────────────────────────────────────────

/** 플레이어 위치 이동 (WASD/방향키를 누를 때마다 전송) */
export interface MovePayload { x: number; y: number }

/** 마이크/카메라 on/off 상태 변경 */
export interface MediaTogglePayload { mic?: boolean; cam?: boolean }

/** 채팅 메시지 전송 */
export interface ChatPayload { content: string }

/**
 * WebRTC 시그널링 메시지 (Offer/Answer/ICE 세 가지 메시지에 공통으로 사용)
 * 서버는 시그널링 데이터를 해석하지 않고, to 필드를 보고 해당 피어에게 그대로 중계(relay)한다.
 */
export interface WebRtcSignalPayload { to: string; sdp?: RtcSdp; candidate?: RtcIceCandidate }

/** 화면공유 시작 — mediasoup producer ID를 서버에 알려서 다른 유저가 consume할 수 있게 한다 */
export interface ScreenShareStartPayload { producerId: string }

/** 화면공유 종료 — payload가 없지만 타입 안전성을 위해 빈 객체 타입을 정의 */
export interface ScreenShareStopPayload { _?: never }

/**
 * 클라이언트가 서버로 보낼 수 있는 모든 메시지의 유니온 타입.
 * Colyseus의 room.send(type, payload) 호출 시 타입 검사에 사용된다.
 */
export type ClientToServerMessages =
  | { type: "move"; payload: MovePayload }
  | { type: "media-toggle"; payload: MediaTogglePayload }
  | { type: "chat"; payload: ChatPayload }
  | { type: "webrtc-offer"; payload: WebRtcSignalPayload }
  | { type: "webrtc-answer"; payload: WebRtcSignalPayload }
  | { type: "webrtc-ice"; payload: WebRtcSignalPayload }
  | { type: "screenshare-start"; payload: ScreenShareStartPayload }
  | { type: "screenshare-stop"; payload: ScreenShareStopPayload };

// ──────────────────────────────────────────────────────────────
// Server → Client 메시지 페이로드 타입
// ──────────────────────────────────────────────────────────────

/**
 * 근접 화상통화 연결 시작 알림.
 * isOfferer=true인 쪽이 WebRTC Offer를 먼저 보내야 한다.
 * 두 클라이언트 중 누가 offerer인지 서버가 결정해 알려준다 (역할 충돌 방지).
 */
export interface ProximityConnectPayload { peerId: string; isOfferer: boolean }

/** 근접 화상통화 연결 종료 알림 (거리가 멀어졌거나 상대방이 퇴장) */
export interface ProximityDisconnectPayload { peerId: string }

/** 채팅 메시지 브로드캐스트 — 서버가 저장 후 모든 클라이언트에게 전달 */
export interface ChatBroadcastPayload { id: number; userId: string; userName: string; content: string; createdAt: string }

/**
 * WebRTC 시그널링 중계 메시지.
 * 서버는 from 필드를 붙여서 to → from 방향으로 그대로 전달한다.
 */
export interface WebRtcRelayPayload { from: string; sdp?: RtcSdp; candidate?: RtcIceCandidate }

/** 화면공유 시작 알림 — presenterId를 기준으로 consume 요청을 보낼 수 있다 */
export interface ScreenShareBroadcastPayload { producerId: string; presenterId: string; presenterName: string }

/** 화면공유 종료 알림 */
export interface ScreenShareStoppedPayload { presenterId: string }

/**
 * 서버가 클라이언트로 보낼 수 있는 모든 메시지의 유니온 타입.
 * room.onMessage<T>(...) 의 제네릭 인자로 활용된다.
 */
export type ServerToClientMessages =
  | { type: "chat"; payload: ChatBroadcastPayload }
  | { type: "proximity-connect"; payload: ProximityConnectPayload }
  | { type: "proximity-disconnect"; payload: ProximityDisconnectPayload }
  | { type: "webrtc-offer"; payload: WebRtcRelayPayload }
  | { type: "webrtc-answer"; payload: WebRtcRelayPayload }
  | { type: "webrtc-ice"; payload: WebRtcRelayPayload }
  | { type: "screenshare-started"; payload: ScreenShareBroadcastPayload }
  | { type: "screenshare-stopped"; payload: ScreenShareStoppedPayload };
