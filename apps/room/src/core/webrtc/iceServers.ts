/**
 * ICE 서버 설정 가져오기
 *
 * ICE(Interactive Connectivity Establishment)는 WebRTC가 두 피어 간의
 * 최적 연결 경로를 찾는 프로세스다. 이를 위해 두 종류의 서버가 필요하다:
 *
 * STUN (Session Traversal Utilities for NAT):
 *   - 클라이언트가 자신의 공인 IP/포트를 알아내는 데 사용
 *   - NAT 뒤에 있어도 P2P가 가능하면 STUN만으로 충분
 *
 * TURN (Traversal Using Relays around NAT):
 *   - STUN으로 P2P 연결이 안 될 때(엄격한 방화벽 등) 미디어를 중계
 *   - 서버 대역폭을 소비하므로 STUN 실패 시 폴백으로만 사용됨
 *
 * 서버에서 HMAC 기반 시간제 자격증명을 발급받아 사용한다.
 * 세션당 한 번만 가져와도 되므로 모듈 레벨에서 캐싱한다.
 */

const SERVER_URL =
  (import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL
    ?.replace("ws://", "http://")
    .replace("wss://", "https://") ?? "http://localhost:2567";

// 같은 세션에서 여러 번 피어 연결이 생겨도 자격증명을 한 번만 받아온다
let cached: RTCIceServer[] | null = null;

/**
 * TURN/STUN 서버 목록을 반환한다.
 * 서버 요청이 실패하면 구글 공개 STUN 서버를 폴백으로 사용한다.
 * (구글 STUN은 TURN이 없으므로 NAT 환경에 따라 연결 실패 가능)
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  try {
    const res = await fetch(`${SERVER_URL}/turn-credentials`);
    const data = (await res.json()) as { iceServers: RTCIceServer[] };
    cached = data.iceServers;
    return cached;
  } catch {
    // TURN 서버 설정이 없거나 요청 실패 시 구글 STUN으로 폴백
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
