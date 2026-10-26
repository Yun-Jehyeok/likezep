/**
 * WebRTC P2P 연결 관리 모듈
 *
 * WebRTC 핸드셰이크 전체 흐름 (Offer/Answer 모델):
 * ──────────────────────────────────────────────────
 * Offerer(A)                  서버(시그널링 중계)         Answerer(B)
 *    │                              │                         │
 *    │── proximity-connect ─────────►│─── proximity-connect ──►│
 *    │   (isOfferer:true)           │   (isOfferer:false)      │
 *    │                              │                         │
 *    │ createOffer()                │                         │
 *    │── webrtc-offer ─────────────►│─── webrtc-offer ────────►│
 *    │                              │                         │ setRemoteDescription(offer)
 *    │                              │                         │ createAnswer()
 *    │◄── webrtc-answer ────────────│◄── webrtc-answer ────────│
 *    │ setRemoteDescription(answer) │                         │
 *    │                              │                         │
 *    │◄══ webrtc-ice ═══════════════│══════ webrtc-ice ════════│ (양방향 동시 교환)
 *    │                              │                         │
 *    └──────────────── P2P 연결 완료 ─────────────────────────┘
 *
 * ICE Candidate 큐잉:
 * offer/answer 교환 전에 ICE candidate가 도착하면 remoteDescription이 없어
 * addIceCandidate()가 실패한다. 이를 방지하기 위해 큐에 쌓아뒀다가
 * setRemoteDescription() 직후 flushCandidateQueue()로 한꺼번에 적용한다.
 */
import { setPeer, getPeer, registerStatsInterval } from "./cleanup.js";

/** remoteDescription 설정 전 도착한 ICE candidate를 임시 보관하는 큐 */
const iceCandidateQueue = new Map<string, RTCIceCandidateInit[]>();

const API_URL =
  ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:2567";

type SendSignal = (type: string, payload: object) => void;
type OnRemoteStream = (peerId: string, stream: MediaStream) => void;

/**
 * 연결이 완료된 후 10초마다 WebRTC 품질 지표를 수집해 서버로 전송한다.
 * 패킷 손실률 5% 초과 또는 RTT 300ms 초과 시 Sentry 경고를 발생시킨다.
 */
function startStatsCollection(peerId: string, pc: RTCPeerConnection): void {
  const interval = setInterval(async () => {
    try {
      const stats = await pc.getStats();
      let packetsLost = 0, packetsSent = 0, jitter = 0, roundTripTime = 0, availableBitrate = 0;
      let iceType: "host" | "srflx" | "relay" = "host";

      // RTCStatsReport는 여러 종류의 report를 포함한다. 필요한 타입만 필터링한다.
      stats.forEach((report) => {
        if (report.type === "outbound-rtp" && (report as any).kind === "audio") {
          packetsLost = (report as any).packetsLost ?? 0;
          packetsSent = (report as any).packetsSent ?? 0;
          jitter = (report as any).jitter ?? 0;  // 초 단위 → 아래서 ms로 변환
        }
        if (report.type === "remote-inbound-rtp") {
          roundTripTime = ((report as any).roundTripTime ?? 0) * 1000;  // 초 → ms
        }
        if (report.type === "candidate-pair" && (report as any).state === "succeeded") {
          availableBitrate = (report as any).availableOutgoingBitrate ?? 0;
        }
        if (report.type === "remote-candidate") {
          // ICE 연결 타입: host(LAN), srflx(STUN으로 NAT 통과), relay(TURN 중계)
          const ct = (report as any).candidateType;
          if (ct === "relay") iceType = "relay";
          else if (ct === "srflx") iceType = "srflx";
        }
      });

      const lossRate = packetsSent > 0 ? packetsLost / packetsSent : 0;

      if (lossRate > 0.05) {
        import("@sentry/react").then(({ captureMessage }) => {
          captureMessage(`WebRTC high packet loss: ${(lossRate * 100).toFixed(1)}% (peer: ${peerId})`, "warning");
        }).catch(() => {});
      }
      if (roundTripTime > 300) {
        import("@sentry/react").then(({ captureMessage }) => {
          captureMessage(`WebRTC high RTT: ${roundTripTime.toFixed(0)}ms (peer: ${peerId})`, "warning");
        }).catch(() => {});
      }

      // 서버에 지표 전송 (실패해도 무시 — 모니터링 데이터는 best-effort)
      fetch(`${API_URL}/api/internal/webrtc-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId, packetsLost, packetsSent, lossRate,
          jitter: jitter * 1000, roundTripTime, availableBitrate, iceType,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch (e) {
      console.warn("[webrtc-stats] getStats failed:", e);
    }
  }, 10_000);

  // cleanup.ts에 인터벌을 등록해야 cleanupPeer() 시 함께 정리된다
  registerStatsInterval(peerId, interval);
}

/**
 * RTCPeerConnection을 생성하고 기본 이벤트 핸들러를 설정한다.
 * Offerer/Answerer 양쪽에서 공통으로 사용하는 팩토리 함수다.
 *
 * 주요 이벤트:
 * - onicecandidate: 로컬 ICE candidate가 수집될 때마다 상대방에게 전송
 * - ontrack: 상대방의 미디어 스트림이 도착하면 UI에 표시
 * - oniceconnectionstatechange: 연결 완료 시 통계 수집 시작
 */
function createPc(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],
  sendSignal: SendSignal,
  onRemoteStream: OnRemoteStream,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers });

  // 내 미디어 트랙을 피어 연결에 추가 (상대방이 ontrack으로 수신하게 됨)
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  // 브라우저가 로컬 ICE candidate를 발견할 때마다 상대방에게 전달
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      sendSignal("webrtc-ice", { to: peerId, candidate: candidate.toJSON() });
    }
  };

  // 상대방의 미디어 스트림이 도착하면 VideoTile에 표시
  pc.ontrack = (event) => {
    if (event.streams[0]) onRemoteStream(peerId, event.streams[0]);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[ICE ${peerId}] state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
      startStatsCollection(peerId, pc);
      // 연결에 사용된 경로(host/srflx/relay)를 로그로 남긴다
      pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (report.type === "remote-candidate") {
            const candidateType = (report as { candidateType?: string }).candidateType;
            console.log(`[ICE ${peerId}] remote candidate type: ${candidateType}`);
          }
        });
      }).catch(console.warn);
    }
  };

  // cleanup.ts 레지스트리에 등록해야 cleanupPeer()로 정리 가능
  setPeer(peerId, pc);
  return pc;
}

/**
 * remoteDescription 설정 전에 큐에 쌓인 ICE candidate를 모두 적용한다.
 * setRemoteDescription() 호출 직후에 반드시 실행해야 한다.
 */
async function flushCandidateQueue(peerId: string, pc: RTCPeerConnection): Promise<void> {
  const queued = iceCandidateQueue.get(peerId) ?? [];
  iceCandidateQueue.delete(peerId);
  for (const c of queued) {
    await pc.addIceCandidate(c).catch(console.warn);
  }
}

/**
 * Offerer 역할: RTCPeerConnection을 만들고 Offer SDP를 생성해 상대에게 전송.
 * 서버로부터 proximity-connect(isOfferer:true)를 받은 클라이언트가 호출한다.
 */
export async function initPeerAsOfferer(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],
  sendSignal: SendSignal,
  onRemoteStream: OnRemoteStream,
): Promise<void> {
  const pc = createPc(peerId, localStream, iceServers, sendSignal, onRemoteStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);  // setLocalDescription이 ICE candidate 수집을 시작시킨다
  sendSignal("webrtc-offer", { to: peerId, sdp: { type: offer.type, sdp: offer.sdp } });
}

/**
 * Answerer 역할: Offer를 받아 RTCPeerConnection을 만들고 Answer SDP를 전송.
 * onWebRtcOffer 콜백에서 호출된다.
 */
export async function initPeerAsAnswerer(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],
  offer: RTCSessionDescriptionInit,
  sendSignal: SendSignal,
  onRemoteStream: OnRemoteStream,
): Promise<void> {
  const pc = createPc(peerId, localStream, iceServers, sendSignal, onRemoteStream);
  await pc.setRemoteDescription(offer);
  // remoteDescription 설정 직후에 큐에 쌓인 ICE candidate 처리
  await flushCandidateQueue(peerId, pc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal("webrtc-answer", { to: peerId, sdp: { type: answer.type, sdp: answer.sdp } });
}

/**
 * Offerer가 Answer를 수신해 remoteDescription을 설정한다.
 * 이 시점에 비로소 양쪽 모두 remoteDescription이 완성되고 ICE 협상이 시작된다.
 */
export async function handleAnswer(
  peerId: string,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  const pc = getPeer(peerId);
  if (!pc) return;
  await pc.setRemoteDescription(answer);
  await flushCandidateQueue(peerId, pc);
}

/**
 * 카메라를 나중에 켤 때, 이미 연결된 피어에 비디오 트랙을 추가하고
 * 재협상(Renegotiation)을 위한 새 Offer를 생성해 반환한다.
 * signalingState가 "stable"일 때만 가능하다.
 */
export async function addTrackToPeer(
  peerId: string,
  track: MediaStreamTrack,
  stream: MediaStream,
): Promise<{ type: string; sdp: string } | null> {
  const pc = getPeer(peerId);
  if (!pc || pc.signalingState !== "stable") return null;
  pc.addTrack(track, stream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return { type: offer.type, sdp: offer.sdp! };
}

/**
 * 상대방의 ICE candidate를 로컬 RTCPeerConnection에 추가한다.
 * remoteDescription이 아직 설정되지 않았다면 큐에 보관했다가 나중에 처리한다.
 */
export async function handleIceCandidate(
  peerId: string,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  const pc = getPeer(peerId);
  if (!pc || pc.remoteDescription === null) {
    // offer/answer 교환이 완료되기 전에 ICE candidate가 도착한 경우 → 큐에 보관
    const queue = iceCandidateQueue.get(peerId) ?? [];
    queue.push(candidate);
    iceCandidateQueue.set(peerId, queue);
    return;
  }
  await pc.addIceCandidate(candidate).catch(console.warn);
}
