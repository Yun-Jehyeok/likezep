import { Room, Client } from "@colyseus/core";
import { Player, ProximityRoomState } from "./schema/RoomState.js";
import { computeProximityChanges } from "./logic/proximity.js";
import type {
  MovePayload,
  MediaTogglePayload,
  WebRtcSignalPayload,
} from "@mentoring/shared";

const CONNECT_THRESHOLD = 150;
const DISCONNECT_THRESHOLD = 180;

export class ProximityRoom extends Room<ProximityRoomState> {
  private connectedPairs = new Set<string>(); // "a:b" where a < b

  onCreate() {
    this.maxClients = 20;
    this.setState(new ProximityRoomState());
    this.setSimulationInterval(this.tick.bind(this), 100);

    this.onMessage("move", (client: Client, payload: MovePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = payload.x;
      player.y = payload.y;
    });

    this.onMessage("media-toggle", (client: Client, payload: MediaTogglePayload) => {
      // PoC 1: 미디어 상태는 state에 없으므로 무시
      void client;
      void payload;
    });

    this.onMessage("webrtc-offer", (client: Client, payload: WebRtcSignalPayload) => {
      this.clients.getById(payload.to)?.send("webrtc-offer", {
        from: client.sessionId,
        sdp: payload.sdp,
      });
    });

    this.onMessage("webrtc-answer", (client: Client, payload: WebRtcSignalPayload) => {
      this.clients.getById(payload.to)?.send("webrtc-answer", {
        from: client.sessionId,
        sdp: payload.sdp,
      });
    });

    this.onMessage("webrtc-ice", (client: Client, payload: WebRtcSignalPayload) => {
      this.clients.getById(payload.to)?.send("webrtc-ice", {
        from: client.sessionId,
        candidate: payload.candidate,
      });
    });

    this.onMessage("screenshare-start", (client: Client, payload: { producerId: string }) => {
      this.broadcast("screenshare-started", {
        producerId: payload.producerId,
        presenterId: client.sessionId,
      }, { except: client });
    });

    this.onMessage("screenshare-stop", (client: Client) => {
      this.broadcast("screenshare-stopped", {
        presenterId: client.sessionId,
      }, { except: client });
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.id = client.sessionId;
    player.name = options.name ?? "Anonymous";
    player.x = 400 + (Math.random() * 100 - 50);
    player.y = 300 + (Math.random() * 100 - 50);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    const id = client.sessionId;
    const toRemove: string[] = [];

    for (const key of this.connectedPairs) {
      const colonIdx = key.indexOf(":");
      const a = key.slice(0, colonIdx);
      const b = key.slice(colonIdx + 1);
      if (a === id || b === id) {
        toRemove.push(key);
        const peerId = a === id ? b : a;
        this.clients.getById(peerId)?.send("proximity-disconnect", { peerId: id });
      }
    }

    for (const key of toRemove) this.connectedPairs.delete(key);
    this.state.players.delete(id);
  }

  private tick() {
    if (this.state.players.size < 2) return;

    const positions = new Map<string, { x: number; y: number }>();
    this.state.players.forEach((player, id) => {
      positions.set(id, { x: player.x, y: player.y });
    });

    const { toConnect, toDisconnect } = computeProximityChanges({
      players: positions,
      connectedPairs: this.connectedPairs,
      connectThreshold: CONNECT_THRESHOLD,
      disconnectThreshold: DISCONNECT_THRESHOLD,
    });

    for (const pair of toConnect) {
      this.connectedPairs.add(`${pair.a}:${pair.b}`);
      // pair.a < pair.b 이므로 a가 offerer
      this.clients.getById(pair.a)?.send("proximity-connect", { peerId: pair.b, isOfferer: true });
      this.clients.getById(pair.b)?.send("proximity-connect", { peerId: pair.a, isOfferer: false });
    }

    for (const pair of toDisconnect) {
      this.connectedPairs.delete(`${pair.a}:${pair.b}`);
      this.clients.getById(pair.a)?.send("proximity-disconnect", { peerId: pair.b });
      this.clients.getById(pair.b)?.send("proximity-disconnect", { peerId: pair.a });
    }
  }
}
