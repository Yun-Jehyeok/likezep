import type { Router, RtpCodecCapability } from "mediasoup/node/lib/types.js";
import { getWorker } from "./worker.js";

const MEDIA_CODECS = [
  { kind: "video" as const, mimeType: "video/VP8", clockRate: 90000, parameters: {} },
  { kind: "audio" as const, mimeType: "audio/opus", clockRate: 48000, channels: 2, parameters: {} },
] as RtpCodecCapability[];

const routers = new Map<string, Router>();

export async function getOrCreateRouter(roomId: string): Promise<Router> {
  if (routers.has(roomId)) return routers.get(roomId)!;
  const worker = await getWorker();
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
  routers.set(roomId, router);
  return router;
}

export function deleteRouter(roomId: string) {
  const router = routers.get(roomId);
  if (router && !router.closed) router.close();
  routers.delete(roomId);
}
