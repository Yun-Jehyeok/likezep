import type { Router, WebRtcTransport } from "mediasoup/node/lib/types.js";

export async function createWebRtcTransport(router: Router): Promise<WebRtcTransport> {
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP ?? "127.0.0.1";
  return router.createWebRtcTransport({
    listenIps: [{ ip: "0.0.0.0", announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });
}
