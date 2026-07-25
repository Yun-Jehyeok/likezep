const SERVER_URL =
  (import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL
    ?.replace("ws://", "http://")
    .replace("wss://", "https://") ?? "http://localhost:2567";

let cached: RTCIceServer[] | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  try {
    const res = await fetch(`${SERVER_URL}/turn-credentials`);
    const data = (await res.json()) as { iceServers: RTCIceServer[] };
    cached = data.iceServers;
    return cached;
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
