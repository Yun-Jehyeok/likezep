// Single entry point for all WebRTC peer cleanup (CLAUDE.md absolute rule)
const peers = new Map<string, RTCPeerConnection>();
const statsIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function setPeer(peerId: string, pc: RTCPeerConnection): void {
  peers.set(peerId, pc);
}

export function getPeer(peerId: string): RTCPeerConnection | undefined {
  return peers.get(peerId);
}

export function registerStatsInterval(peerId: string, interval: ReturnType<typeof setInterval>): void {
  statsIntervals.set(peerId, interval);
}

export function cleanupPeer(peerId: string): void {
  const interval = statsIntervals.get(peerId);
  if (interval) {
    clearInterval(interval);
    statsIntervals.delete(peerId);
  }
  const pc = peers.get(peerId);
  if (!pc) return;
  pc.close();
  peers.delete(peerId);
}

export function cleanupAllPeers(): void {
  for (const peerId of [...peers.keys()]) cleanupPeer(peerId);
}

export function activePeerIds(): string[] {
  return [...peers.keys()];
}
