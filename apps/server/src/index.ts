import http from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ProximityRoom } from "./rooms/ProximityRoom.js";

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 256 * 1024 }),
});

gameServer.define("poc-room", ProximityRoom);

const PORT = Number(process.env.PORT ?? 2567);
gameServer.listen(PORT).then(() => {
  console.log(`[server] http://localhost:${PORT}`);
});
