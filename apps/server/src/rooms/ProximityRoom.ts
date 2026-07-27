import { Room, Client } from "@colyseus/core";
import jwt from "jsonwebtoken";
import { Player, ProximityRoomState } from "./schema/RoomState.js";
import { computeProximityChanges } from "./logic/proximity.js";
import { config } from "../config.js";
import { findRoomById } from "../db/roomRepository.js";
import { logAccess } from "../db/accessLogRepository.js";
import { saveMessage } from "../db/chatRepository.js";
import type { AuthPayload } from "../api/middleware/auth.js";
import type {
  MovePayload,
  MediaTogglePayload,
  WebRtcSignalPayload,
} from "@mentoring/shared";

const CONNECT_THRESHOLD = 150;
const DISCONNECT_THRESHOLD = 180;

export class ProximityRoom extends Room<ProximityRoomState> {
  private connectedPairs = new Set<string>();
  private currentShare: { producerId: string; presenterId: string } | null = null;
  private dbRoomId = "";
  private userNames = new Map<string, string>(); // sessionId → display name

  onCreate(options: { roomId?: string }) {
    this.dbRoomId = options.roomId ?? "";
    this.maxClients = 20;
    this.setState(new ProximityRoomState());
    this.setMetadata({ roomId: this.dbRoomId });
    this.setSimulationInterval(this.tick.bind(this), 100);

    this.onMessage("move", (client: Client, payload: MovePayload) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = payload.x;
      player.y = payload.y;
    });

    this.onMessage("media-toggle", (client: Client, payload: MediaTogglePayload) => {
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

    this.onMessage("chat", (client: Client, payload: { text?: string }) => {
      const text = payload.text?.trim();
      if (!text || text.length > 500) return;
      const auth = client.auth as AuthPayload | undefined;
      const name = this.userNames.get(client.sessionId) ?? "Unknown";
      this.broadcast("chat", {
        userId: auth?.userId ?? client.sessionId,
        name,
        text,
        timestamp: new Date().toISOString(),
      });
      if (auth?.userId && this.dbRoomId) {
        saveMessage(auth.userId, this.dbRoomId, text).catch(console.error);
      }
    });

    this.onMessage("screenshare-start", (client: Client, payload: { producerId: string }) => {
      this.currentShare = { producerId: payload.producerId, presenterId: client.sessionId };
      this.broadcast("screenshare-started", this.currentShare, { except: client });
    });

    this.onMessage("screenshare-stop", (client: Client) => {
      this.currentShare = null;
      this.broadcast("screenshare-stopped", { presenterId: client.sessionId }, { except: client });
    });
  }

  async onAuth(_client: Client, options: { token?: string; roomId?: string }) {
    const { token, roomId } = options;
    if (!token) throw new Error("Token required");

    const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;

    if (roomId) {
      const room = await findRoomById(roomId);
      if (!room) throw new Error("Room not found");
      if (room.type === "private" && payload.role === "mentee" && payload.groupId !== room.groupId) {
        throw new Error("Access denied");
      }
    }

    return payload;
  }

  onJoin(client: Client, options: { name?: string }) {
    const auth = client.auth as AuthPayload | undefined;
    const displayName = options.name ?? auth?.userId ?? "Anonymous";
    this.userNames.set(client.sessionId, displayName);
    const player = new Player();
    player.id = client.sessionId;
    player.name = displayName;
    player.x = 400 + (Math.random() * 100 - 50);
    player.y = 300 + (Math.random() * 100 - 50);
    this.state.players.set(client.sessionId, player);

    if (this.currentShare) {
      client.send("screenshare-started", this.currentShare);
    }

    if (auth?.userId && this.dbRoomId) {
      logAccess(auth.userId, this.dbRoomId, "join").catch(console.error);
    }
  }

  onLeave(client: Client) {
    const auth = client.auth as AuthPayload | undefined;
    this.userNames.delete(client.sessionId);
    if (auth?.userId && this.dbRoomId) {
      logAccess(auth.userId, this.dbRoomId, "leave").catch(console.error);
    }

    if (this.currentShare?.presenterId === client.sessionId) {
      this.currentShare = null;
      this.broadcast("screenshare-stopped", { presenterId: client.sessionId });
    }

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
