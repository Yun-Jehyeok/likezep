import express, { type Router as ExpressRouterType } from "express";
import type { WebRtcTransport, Producer, RtpCapabilities, RtpParameters, DtlsParameters } from "mediasoup/node/lib/types.js";
import { getOrCreateRouter } from "./router.js";
import { createWebRtcTransport } from "./transport.js";

export const mediasoupRouter: ExpressRouterType = express.Router();

const transports = new Map<string, WebRtcTransport>();
const producers = new Map<string, Producer>();

mediasoupRouter.get("/rtp-capabilities/:roomId", async (req, res) => {
  try {
    const msRouter = await getOrCreateRouter(req.params.roomId);
    res.json({ rtpCapabilities: msRouter.rtpCapabilities });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

mediasoupRouter.post("/transport/create", async (req, res) => {
  try {
    const { roomId } = req.body as { roomId: string };
    const msRouter = await getOrCreateRouter(roomId);
    const transport = await createWebRtcTransport(msRouter);
    transports.set(transport.id, transport);
    res.json({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

mediasoupRouter.post("/transport/connect", async (req, res) => {
  try {
    const { transportId, dtlsParameters } = req.body as { transportId: string; dtlsParameters: DtlsParameters };
    const transport = transports.get(transportId);
    if (!transport) return res.status(404).json({ error: "transport not found" });
    await transport.connect({ dtlsParameters });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

mediasoupRouter.post("/produce", async (req, res) => {
  try {
    const { transportId, kind, rtpParameters } = req.body as {
      transportId: string;
      kind: "audio" | "video";
      rtpParameters: RtpParameters;
    };
    const transport = transports.get(transportId);
    if (!transport) return res.status(404).json({ error: "transport not found" });
    const producer = await transport.produce({ kind, rtpParameters });
    producers.set(producer.id, producer);
    producer.on("transportclose", () => producers.delete(producer.id));
    res.json({ id: producer.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

mediasoupRouter.post("/consume", async (req, res) => {
  try {
    const { roomId, transportId, producerId, rtpCapabilities } = req.body as {
      roomId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: RtpCapabilities;
    };
    const msRouter = await getOrCreateRouter(roomId);
    const transport = transports.get(transportId);
    const producer = producers.get(producerId);
    if (!transport) return res.status(404).json({ error: "transport not found" });
    if (!producer) return res.status(404).json({ error: "producer not found" });
    if (!msRouter.canConsume({ producerId, rtpCapabilities })) {
      return res.status(400).json({ error: "cannot consume" });
    }
    const consumer = await transport.consume({ producerId, rtpCapabilities, paused: false });
    if (consumer.kind === "video") {
      consumer.requestKeyFrame().catch(() => {});
    }
    res.json({
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
