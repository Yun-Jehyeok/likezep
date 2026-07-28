import http from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ProximityRoom } from "./rooms/ProximityRoom.js";
import { generateTurnCredentials } from "./turn/credentials.js";
import { mediasoupRouter } from "./mediasoup/index.js";
import { getWorker } from "./mediasoup/worker.js";
import { authRouter } from "./api/auth.js";
import { roomsRouter } from "./api/rooms.js";
import { adminRouter } from "./api/admin.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/admin", adminRouter);
app.use("/ms", mediasoupRouter);

app.get("/turn-credentials", (_req, res) => {
  const { TURN_SECRET: secret, TURN_HOST: host, TURN_PORT: port, TURN_TTL: ttl } = config;

  if (!secret || !host) {
    return res.json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }

  const turn = generateTurnCredentials(host, port, secret, ttl);
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      turn,
    ],
  });
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 256 * 1024 }),
});

gameServer.define("mentoring-room", ProximityRoom).filterBy(["dbRoomId"]);

gameServer.listen(config.PORT).then(async () => {
  console.log(`[server] http://localhost:${config.PORT}`);
  await getWorker();
});
