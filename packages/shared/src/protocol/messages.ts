// Own lightweight types — no DOM lib dependency so this works in both Node and browser
export interface RtcSdp { type: string; sdp: string }
export interface RtcIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

// Client → Server
export interface MovePayload { x: number; y: number }
export interface MediaTogglePayload { mic?: boolean; cam?: boolean }
export interface ChatPayload { content: string }
export interface WebRtcSignalPayload { to: string; sdp?: RtcSdp; candidate?: RtcIceCandidate }
export interface ScreenShareStartPayload { producerId: string }
export interface ScreenShareStopPayload { _?: never }

export type ClientToServerMessages =
  | { type: "move"; payload: MovePayload }
  | { type: "media-toggle"; payload: MediaTogglePayload }
  | { type: "chat"; payload: ChatPayload }
  | { type: "webrtc-offer"; payload: WebRtcSignalPayload }
  | { type: "webrtc-answer"; payload: WebRtcSignalPayload }
  | { type: "webrtc-ice"; payload: WebRtcSignalPayload }
  | { type: "screenshare-start"; payload: ScreenShareStartPayload }
  | { type: "screenshare-stop"; payload: ScreenShareStopPayload };

// Server → Client
export interface ProximityConnectPayload { peerId: string; isOfferer: boolean }
export interface ProximityDisconnectPayload { peerId: string }
export interface ChatBroadcastPayload { id: number; userId: string; userName: string; content: string; createdAt: string }
export interface WebRtcRelayPayload { from: string; sdp?: RtcSdp; candidate?: RtcIceCandidate }
export interface ScreenShareBroadcastPayload { producerId: string; presenterId: string }
export interface ScreenShareStoppedPayload { presenterId: string }

export type ServerToClientMessages =
  | { type: "chat"; payload: ChatBroadcastPayload }
  | { type: "proximity-connect"; payload: ProximityConnectPayload }
  | { type: "proximity-disconnect"; payload: ProximityDisconnectPayload }
  | { type: "webrtc-offer"; payload: WebRtcRelayPayload }
  | { type: "webrtc-answer"; payload: WebRtcRelayPayload }
  | { type: "webrtc-ice"; payload: WebRtcRelayPayload }
  | { type: "screenshare-started"; payload: ScreenShareBroadcastPayload }
  | { type: "screenshare-stopped"; payload: ScreenShareStoppedPayload };
