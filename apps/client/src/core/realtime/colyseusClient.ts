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

export async function joinPocRoom(playerName: string, callbacks: RoomCallbacks): Promise<Room> {
  const client = new Client(WS_URL);
  const room = await client.joinOrCreate("poc-room", { name: playerName });

  const $ = getStateCallbacks(room);

  // State callbacks — fire for existing players immediately (immediate=true)
  ($(room.state as any).players as any).onAdd((player: any, sessionId: string) => {
    callbacks.onPlayerJoin(sessionId, {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
    });

    // Track individual position changes
    ($(player) as any).onChange(() => {
      callbacks.onPlayerMove(sessionId, player.x, player.y);
    });
  }, true);

  ($(room.state as any).players as any).onRemove((_player: any, sessionId: string) => {
    callbacks.onPlayerLeave(sessionId);
  });

  // Proximity events
  room.onMessage<ProximityConnectPayload>("proximity-connect", ({ peerId, isOfferer }) => {
    callbacks.onProximityConnect(peerId, isOfferer);
  });

  room.onMessage<ProximityDisconnectPayload>("proximity-disconnect", ({ peerId }) => {
    callbacks.onProximityDisconnect(peerId);
  });

  // WebRTC signaling relay
  room.onMessage<WebRtcRelayPayload>("webrtc-offer", ({ from, sdp }) => {
    if (sdp) callbacks.onWebRtcOffer(from, sdp as RTCSessionDescriptionInit);
  });

  room.onMessage<WebRtcRelayPayload>("webrtc-answer", ({ from, sdp }) => {
    if (sdp) callbacks.onWebRtcAnswer(from, sdp as RTCSessionDescriptionInit);
  });

  room.onMessage<WebRtcRelayPayload>("webrtc-ice", ({ from, candidate }) => {
    if (candidate) callbacks.onWebRtcIce(from, candidate as RTCIceCandidateInit);
  });

  return room;
}
