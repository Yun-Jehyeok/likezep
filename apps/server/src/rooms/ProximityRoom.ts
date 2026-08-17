import * as Sentry from "@sentry/node";
import { Room, Client } from "@colyseus/core";
import jwt from "jsonwebtoken";
import { Player, ProximityRoomState } from "./schema/RoomState.js";
import { computeProximityChanges } from "./logic/proximity.js";
import { config } from "../config.js";
import { findRoomById } from "../db/roomRepository.js";
import { findUserById } from "../db/userRepository.js";
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
  private currentShares = new Map<string, { producerId: string; presenterName: string }>();
  private dbRoomId = "";
  private userNames = new Map<string, string>(); // sessionId → display name
  private lastTickTime: number | null = null;

  onCreate(options: { dbRoomId?: string }) {
    this.dbRoomId = options.dbRoomId ?? "";
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
      const presenterName = this.userNames.get(client.sessionId) ?? "Unknown";
      this.currentShares.set(client.sessionId, { producerId: payload.producerId, presenterName });
      this.broadcast("screenshare-started", {
        producerId: payload.producerId,
        presenterId: client.sessionId,
        presenterName,
      }, { except: client });
    });

    this.onMessage("screenshare-stop", (client: Client) => {
      this.currentShares.delete(client.sessionId);
      this.broadcast("screenshare-stopped", { presenterId: client.sessionId }, { except: client });
    });
  }

  async onAuth(_client: Client, options: { token?: string; dbRoomId?: string }) {
    const { token, dbRoomId } = options;
    if (!token) throw new Error("Token required");

    const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;

    if (dbRoomId) {
      const [room, user] = await Promise.all([
        findRoomById(dbRoomId),
        findUserById(payload.userId),
      ]);
      if (!room) throw new Error("Room not found");
      // DB의 최신 groupId 기준으로 체크 (JWT는 배정 후 갱신 안 됨)
      if (room.type === "private" && user?.role === "mentee" && user.groupId !== room.groupId) {
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

    for (const [presenterId, share] of this.currentShares) {
      client.send("screenshare-started", { ...share, presenterId });
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

    if (this.currentShares.has(client.sessionId)) {
      this.currentShares.delete(client.sessionId);
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

  onError(code: number, message?: string) {
    Sentry.captureException(new Error(`ProximityRoom error ${code}: ${message ?? ""}`), {
      extra: { roomId: this.dbRoomId, players: this.state.players.size },
    });
  }

  private tick() {
    const now = Date.now();
    if (this.lastTickTime !== null) {
      const actual = now - this.lastTickTime;
      if (actual > 150) {
        console.warn(JSON.stringify({
          type: "tick-delay",
          roomId: this.dbRoomId,
          expected: 100,
          actual,
          players: this.state.players.size,
        }));
        if (actual > 200) {
          Sentry.captureMessage(
            `tick delay ${actual}ms in room ${this.dbRoomId} (${this.state.players.size} players)`,
            "warning",
          );
        }
      }
    }
    this.lastTickTime = now;

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
