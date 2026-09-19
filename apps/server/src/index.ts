/**
 * 서버 엔트리포인트
 *
 * Express(HTTP API) + Colyseus(WebSocket 게임서버)를 단일 포트에서 실행한다.
 * 둘 다 같은 http.Server 인스턴스를 공유하므로 포트를 하나만 열면 된다.
 *
 * 아키텍처:
 *   클라이언트 → HTTP  → Express 라우터 (REST API, TURN credentials)
 *   클라이언트 → WS    → Colyseus (실시간 게임 상태, 채팅, WebRTC 시그널링)
 *   클라이언트 → HTTP  → mediasoup 라우터 (화면공유 SFU)
 */
import * as Sentry from "@sentry/node";
import http from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import basicAuth from "express-basic-auth";
import { ProximityRoom } from "./rooms/ProximityRoom.js";
import { generateTurnCredentials } from "./turn/credentials.js";
import { mediasoupRouter } from "./mediasoup/index.js";
import { getWorker } from "./mediasoup/worker.js";
import { authRouter } from "./api/auth.js";
import { roomsRouter } from "./api/rooms.js";
import { adminRouter } from "./api/admin.js";
import { internalRouter } from "./api/internal.js";
import { config } from "./config.js";

// Sentry 초기화 — DSN이 없으면 비활성화 (로컬 개발 환경에서 에러 전송 안 함)
Sentry.init({
  dsn: config.SENTRY_DSN,
  enabled: !!config.SENTRY_DSN,
  environment: config.NODE_ENV,
  release: config.SENTRY_RELEASE,
  tracesSampleRate: 0,  // 트랜잭션 트레이싱은 사용하지 않음 (에러만 수집)
});

const app = express();
app.use(express.json());

// CORS 허용 — 개발 편의를 위해 전체 오픈. 프로덕션에서는 origin을 제한해야 한다.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});
// OPTIONS preflight 요청에 204로 즉시 응답
app.options("*", (_req, res) => res.sendStatus(204));

// 헬스체크 엔드포인트 — 로드밸런서/모니터링이 서버 상태를 확인할 때 사용
app.get("/health", (_req, res) => res.json({ ok: true }));

// REST API 라우터 마운트
app.use("/api/auth", authRouter);    // 로그인, 유저 정보
app.use("/api/rooms", roomsRouter);  // 룸 목록, 채팅 히스토리
app.use("/api/admin", adminRouter);  // 관리자 전용 (그룹 관리, 통계)
app.use("/api/internal", internalRouter);  // 서버 내부용 (WebRTC 통계 수집)
app.use("/ms", mediasoupRouter);     // mediasoup SFU (화면공유 transport/produce/consume)

/**
 * TURN 서버 자격증명 발급 엔드포인트.
 * TURN(Traversal Using Relays around NAT)은 방화벽/NAT 뒤의 피어들이
 * P2P 연결을 맺지 못할 때 미디어를 중계해주는 서버다.
 * HMAC 기반 시간제 자격증명(TTL)을 발급해 무단 사용을 방지한다.
 */
app.get("/turn-credentials", (_req, res) => {
  const { TURN_SECRET: secret, TURN_HOST: host, TURN_PORT: port, TURN_TTL: ttl } = config;

  // TURN 설정이 없으면 구글 STUN만 반환 (로컬 개발 환경)
  if (!secret || !host) {
    return res.json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }

  const turn = generateTurnCredentials(host, port, secret, ttl);
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },  // STUN: 공인 IP 확인용
      turn,                                        // TURN: 릴레이 (STUN 실패 시 폴백)
    ],
  });
});

// Colyseus 모니터 대시보드 — Basic Auth로 보호 (/colyseus 경로)
app.use(
  "/colyseus",
  basicAuth({ users: { admin: config.MONITOR_PASSWORD }, challenge: true }),
  monitor()
);

// Sentry Express 에러 핸들러 (라우터 등록 후에 위치해야 함)
Sentry.setupExpressErrorHandler(app);

// Express와 Colyseus가 동일한 http.Server를 공유
const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: 256 * 1024,  // WebSocket 메시지 최대 크기 256KB
  }),
});

/**
 * "mentoring-room" 이름으로 ProximityRoom을 등록.
 * filterBy(["dbRoomId"]): 같은 dbRoomId를 가진 클라이언트는 같은 룸 인스턴스에 입장한다.
 * 다른 dbRoomId면 별도 룸 인스턴스가 생성되어 완전히 격리된다.
 */
gameServer.define("mentoring-room", ProximityRoom).filterBy(["dbRoomId"]);

gameServer.listen(config.PORT).then(async () => {
  console.log(`[server] http://localhost:${config.PORT}`);
  // mediasoup Worker를 미리 초기화해둬야 첫 화면공유 요청 시 지연이 없다
  await getWorker();
});
