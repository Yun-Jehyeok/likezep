// Colyseus message types — both client and server import from here only
export type {
  ClientToServerMessages,
  ServerToClientMessages,
  MovePayload,
  MediaTogglePayload,
  ChatPayload,
  WebRtcSignalPayload,
  ProximityConnectPayload,
  ProximityDisconnectPayload,
  ChatBroadcastPayload,
  WebRtcRelayPayload,
  RtcSdp,
  RtcIceCandidate,
  ScreenShareStartPayload,
  ScreenShareStopPayload,
  ScreenShareBroadcastPayload,
  ScreenShareStoppedPayload,
} from "./messages.js";
