/**
 * ProximityRoom — 멘토링 플랫폼의 핵심 Colyseus 룸
 *
 * Colyseus Room 라이프사이클 흐름:
 *   onCreate → (클라이언트 접속 시) onAuth → onJoin → [틱 반복] → onLeave → onDispose
 *
 * 이 룸이 담당하는 역할:
 * 1. 플레이어 위치 상태를 모든 클라이언트에게 동기화 (Colyseus Schema)
 * 2. 100ms 마다 근접 감지 → WebRTC 연결/해제 신호 전송
 * 3. WebRTC 시그널링 메시지를 피어 간에 중계 (서버는 내용을 해석하지 않음)
 * 4. 채팅 메시지를 DB에 저장하고 브로드캐스트
 * 5. 화면공유 시작/종료를 다른 클라이언트에 알림
 */
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

// 히스테리시스 밴드: 150px 안에 들어오면 연결, 180px 밖으로 나가면 해제
const CONNECT_THRESHOLD = 150;
const DISCONNECT_THRESHOLD = 180;

export class ProximityRoom extends Room<ProximityRoomState> {
  /**
   * "a:b" 형식 (a < b)으로 현재 WebRTC가 연결된 피어 쌍을 추적.
   * 틱마다 computeProximityChanges()에 전달해 변경사항을 계산한다.
   */
  private connectedPairs = new Set<string>();

  /**
   * 현재 진행 중인 화면공유 목록.
   * 새 플레이어가 입장할 때 이미 공유 중인 스트림을 알려주기 위해 유지한다.
   */
  private currentShares = new Map<string, { producerId: string; presenterName: string }>();

  private dbRoomId = "";
  /** sessionId → 표시 이름 매핑 (채팅/화면공유 이름 표시용) */
  private userNames = new Map<string, string>();
  /** 틱 딜레이 측정용: 이전 틱의 타임스탬프 */
  private lastTickTime: number | null = null;

  /**
   * 룸이 생성될 때 한 번 호출. 메시지 핸들러 등록과 상태 초기화를 담당한다.
   * options는 클라이언트가 joinOrCreate() 호출 시 전달한 값이다.
   */
  onCreate(options: { dbRoomId?: string }) {
    this.dbRoomId = options.dbRoomId ?? "";
    this.maxClients = 20;
    this.setState(new ProximityRoomState());
    this.setMetadata({ roomId: this.dbRoomId });

    // 100ms(10Hz) 마다 tick()을 호출해 근접 감지를 실행한다
    this.setSimulationInterval(this.tick.bind(this), 100);

    // ── 메시지 핸들러 등록 ──────────────────────────────────────────

    // 클라이언트가 WASD/방향키를 누를 때마다 위치를 보내고, 서버는 상태에 반영한다.
    // Colyseus Schema의 변경 감지가 자동으로 다른 클라이언트에게 delta patch를 보낸다.
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

    // WebRTC 시그널링 중계: 서버는 SDP 내용을 해석하지 않고 to → from 방향으로 전달만 한다.
    // 이 패턴을 "Signaling Relay"라고 부른다. P2P 연결 전 협상(핸드셰이크)에 필요하다.
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

    // ICE Candidate: WebRTC 연결 경로(네트워크 후보) 교환. offer/answer와 병렬로 교환된다.
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

      // 모든 클라이언트에게 브로드캐스트 (보낸 클라이언트 포함)
      this.broadcast("chat", {
        userId: auth?.userId ?? client.sessionId,
        name,
        text,
        timestamp: new Date().toISOString(),
      });

      // DB에 비동기 저장 — 실패해도 브로드캐스트는 이미 완료됐으므로 무시
      if (auth?.userId && this.dbRoomId) {
        saveMessage(auth.userId, this.dbRoomId, text).catch(console.error);
      }
    });

    this.onMessage("screenshare-start", (client: Client, payload: { producerId: string }) => {
      const presenterName = this.userNames.get(client.sessionId) ?? "Unknown";
      this.currentShares.set(client.sessionId, { producerId: payload.producerId, presenterName });
      // 보낸 클라이언트(발표자)를 제외한 나머지에게 알림 ({ except: client })
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

  /**
   * 클라이언트가 접속 시도할 때 JWT를 검증하고 권한을 확인한다.
   * 반환값이 client.auth에 저장되어 이후 핸들러에서 사용할 수 있다.
   * 예외를 throw하면 접속이 거부된다.
   */
  async onAuth(_client: Client, options: { token?: string; dbRoomId?: string }) {
    const { token, dbRoomId } = options;
    if (!token) throw new Error("Token required");

    // JWT 서명 검증 — 위조된 토큰은 여기서 예외 발생
    const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;

    if (dbRoomId) {
      // DB의 최신 groupId 기준으로 체크 (JWT는 배정 후 갱신 안 됨)
      const [room, user] = await Promise.all([
        findRoomById(dbRoomId),
        findUserById(payload.userId),
      ]);
      if (!room) throw new Error("Room not found");
      // private 룸은 같은 그룹의 멘티만 입장 가능
      if (room.type === "private" && user?.role === "mentee" && user.groupId !== room.groupId) {
        throw new Error("Access denied");
      }
    }

    return payload;
  }

  /**
   * 인증 통과 후 클라이언트가 룸에 입장할 때 호출.
   * 새 Player를 상태에 추가하면 다른 클라이언트의 onAdd 콜백이 자동으로 호출된다.
   */
  onJoin(client: Client, options: { name?: string }) {
    const auth = client.auth as AuthPayload | undefined;
    const displayName = options.name ?? auth?.userId ?? "Anonymous";
    this.userNames.set(client.sessionId, displayName);

    const player = new Player();
    player.id = client.sessionId;
    player.name = displayName;
    // 맵 중앙(400, 300) 근처 랜덤 위치에서 스폰 (겹침 방지)
    player.x = 400 + (Math.random() * 100 - 50);
    player.y = 300 + (Math.random() * 100 - 50);
    this.state.players.set(client.sessionId, player);

    // 입장 시 이미 진행 중인 화면공유가 있으면 즉시 알림
    for (const [presenterId, share] of this.currentShares) {
      client.send("screenshare-started", { ...share, presenterId });
    }

    if (auth?.userId && this.dbRoomId) {
      logAccess(auth.userId, this.dbRoomId, "join").catch(console.error);
    }
  }

  /**
   * 클라이언트가 퇴장할 때 호출.
   * 1) 해당 플레이어와 연결된 모든 WebRTC 쌍을 정리
   * 2) 화면공유 중이었다면 종료 알림 브로드캐스트
   * 3) 상태에서 플레이어 제거 (다른 클라이언트의 onRemove 콜백 트리거)
   */
  onLeave(client: Client) {
    const auth = client.auth as AuthPayload | undefined;
    this.userNames.delete(client.sessionId);
    if (auth?.userId && this.dbRoomId) {
      logAccess(auth.userId, this.dbRoomId, "leave").catch(console.error);
    }

    // 화면공유 중이었다면 다른 클라이언트에게 종료 알림
    if (this.currentShares.has(client.sessionId)) {
      this.currentShares.delete(client.sessionId);
      this.broadcast("screenshare-stopped", { presenterId: client.sessionId });
    }

    // 이 클라이언트와 연결된 모든 WebRTC 쌍을 connectedPairs에서 제거하고
    // 상대 피어에게 proximity-disconnect를 보낸다
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

  /**
   * 100ms마다 실행되는 게임 루프 핵심 함수.
   *
   * 흐름:
   * 1. 틱 딜레이 측정 (150ms 초과 시 경고 로그, 200ms 초과 시 Sentry 알림)
   * 2. 플레이어가 2명 미만이면 검사 불필요 → 조기 반환
   * 3. 현재 모든 플레이어 위치를 Map으로 수집
   * 4. computeProximityChanges()로 이번 틱에 connect/disconnect할 쌍 계산
   * 5. toConnect 쌍: connectedPairs에 추가, 양쪽에 proximity-connect 전송
   *    - 한쪽(isOfferer:true)이 WebRTC offer를 먼저 보내도록 역할을 지정한다
   * 6. toDisconnect 쌍: connectedPairs에서 제거, 양쪽에 proximity-disconnect 전송
   */
  private tick() {
    const now = Date.now();

    // 틱 성능 모니터링: 목표 100ms보다 50ms 이상 늦으면 경고
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

    // Schema의 MapSchema를 일반 Map으로 변환해 proximity 함수에 전달
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
      // pair.a가 Offer를 보내는 역할(isOfferer:true), pair.b는 Answer 역할
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
