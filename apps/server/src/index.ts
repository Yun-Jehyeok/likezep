import http from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ProximityRoom } from "./rooms/ProximityRoom.js";
import { generateTurnCredentials } from "./turn/credentials.js";

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/turn-credentials", (_req, res) => {
  const secret = process.env.TURN_SECRET;
  const host = process.env.TURN_HOST;
  const port = Number(process.env.TURN_PORT ?? 3478);
  const ttl = Number(process.env.TURN_TTL ?? 86400);

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

gameServer.define("poc-room", ProximityRoom);

const PORT = Number(process.env.PORT ?? 2567);
gameServer.listen(PORT).then(() => {
  console.log(`[server] http://localhost:${PORT}`);
});
