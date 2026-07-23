// Single entry point for all WebRTC peer cleanup (CLAUDE.md absolute rule)
const peers = new Map<string, RTCPeerConnection>();

export function setPeer(peerId: string, pc: RTCPeerConnection): void {
  peers.set(peerId, pc);
}

export function getPeer(peerId: string): RTCPeerConnection | undefined {
  return peers.get(peerId);
}

export function cleanupPeer(peerId: string): void {
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
