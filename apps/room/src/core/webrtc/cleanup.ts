/**
 * WebRTC 피어 연결 생명주기 관리 모듈 (싱글턴 레지스트리)
 *
 * CLAUDE.md 절대 규칙: 모든 WebRTC 연결 해제는 이 파일의 함수를 통해서만 한다.
 * 이렇게 중앙집중식으로 관리하는 이유:
 * - pc.close() 누락으로 인한 리소스 누수(leak) 방지
 * - 통계 수집 인터벌도 함께 정리해야 하므로 함께 추적
 * - 여러 컴포넌트에서 같은 피어 객체를 참조해야 할 때 공유 레지스트리가 필요
 *
 * peers Map: peerId(sessionId) → RTCPeerConnection
 * statsIntervals Map: peerId → setInterval 핸들 (10초마다 getStats 호출)
 */

// 모듈 레벨 변수 = 사실상 싱글턴. import하는 모든 곳이 같은 Map을 공유한다.
const peers = new Map<string, RTCPeerConnection>();
const statsIntervals = new Map<string, ReturnType<typeof setInterval>>();

/** 새 RTCPeerConnection을 레지스트리에 등록 */
export function setPeer(peerId: string, pc: RTCPeerConnection): void {
  peers.set(peerId, pc);
}

/** 등록된 RTCPeerConnection 조회 (없으면 undefined) */
export function getPeer(peerId: string): RTCPeerConnection | undefined {
  return peers.get(peerId);
}

/** getStats 폴링 인터벌을 등록해둬야 cleanupPeer 시 함께 제거할 수 있다 */
export function registerStatsInterval(peerId: string, interval: ReturnType<typeof setInterval>): void {
  statsIntervals.set(peerId, interval);
}

/**
 * 특정 피어와의 연결을 완전히 정리한다.
 * 1. 통계 수집 인터벌 중지
 * 2. RTCPeerConnection 닫기 (ICE 연결 종료, 미디어 스트림 해제)
 * 3. 레지스트리에서 제거
 */
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

/** 룸에서 나갈 때 모든 피어 연결을 한번에 정리 */
export function cleanupAllPeers(): void {
  for (const peerId of [...peers.keys()]) cleanupPeer(peerId);
}

/** 현재 활성 피어 ID 목록 반환 (카메라 켤 때 renegotiation 대상 목록에 사용) */
export function activePeerIds(): string[] {
  return [...peers.keys()];
}
