import { setPeer, getPeer, registerStatsInterval } from "./cleanup.js";

const iceCandidateQueue = new Map<string, RTCIceCandidateInit[]>();

const API_URL =
  ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? "http://localhost:2567";

type SendSignal = (type: string, payload: object) => void;
type OnRemoteStream = (peerId: string, stream: MediaStream) => void;

function startStatsCollection(peerId: string, pc: RTCPeerConnection): void {
  const interval = setInterval(async () => {
    try {
      const stats = await pc.getStats();
      let packetsLost = 0, packetsSent = 0, jitter = 0, roundTripTime = 0, availableBitrate = 0;
      let iceType: "host" | "srflx" | "relay" = "host";

      stats.forEach((report) => {
        if (report.type === "outbound-rtp" && (report as any).kind === "audio") {
          packetsLost = (report as any).packetsLost ?? 0;
          packetsSent = (report as any).packetsSent ?? 0;
          jitter = (report as any).jitter ?? 0;
        }
        if (report.type === "remote-inbound-rtp") {
          roundTripTime = ((report as any).roundTripTime ?? 0) * 1000;
        }
        if (report.type === "candidate-pair" && (report as any).state === "succeeded") {
          availableBitrate = (report as any).availableOutgoingBitrate ?? 0;
        }
        if (report.type === "remote-candidate") {
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

      fetch(`${API_URL}/api/internal/webrtc-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId,
          packetsLost,
          packetsSent,
          lossRate,
          jitter: jitter * 1000,
          roundTripTime,
          availableBitrate,
          iceType,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch (e) {
      console.warn("[webrtc-stats] getStats failed:", e);
    }
  }, 10_000);

  registerStatsInterval(peerId, interval);
}

function createPc(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],
  sendSignal: SendSignal,
  onRemoteStream: OnRemoteStream,
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers });

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      sendSignal("webrtc-ice", { to: peerId, candidate: candidate.toJSON() });
    }
  };

  pc.ontrack = (event) => {
    if (event.streams[0]) onRemoteStream(peerId, event.streams[0]);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[ICE ${peerId}] state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
      startStatsCollection(peerId, pc);
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

  setPeer(peerId, pc);
  return pc;
}

async function flushCandidateQueue(peerId: string, pc: RTCPeerConnection): Promise<void> {
  const queued = iceCandidateQueue.get(peerId) ?? [];
  iceCandidateQueue.delete(peerId);
  for (const c of queued) {
    await pc.addIceCandidate(c).catch(console.warn);
  }
}

export async function initPeerAsOfferer(
  peerId: string,
  localStream: MediaStream,
  iceServers: RTCIceServer[],
  sendSignal: SendSignal,
  onRemoteStream: OnRemoteStream,
): Promise<void> {
  const pc = createPc(peerId, localStream, iceServers, sendSignal, onRemoteStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal("webrtc-offer", { to: peerId, sdp: { type: offer.type, sdp: offer.sdp } });
}

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
  await flushCandidateQueue(peerId, pc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal("webrtc-answer", { to: peerId, sdp: { type: answer.type, sdp: answer.sdp } });
}

export async function handleAnswer(
  peerId: string,
  answer: RTCSessionDescriptionInit,
): Promise<void> {
  const pc = getPeer(peerId);
  if (!pc) return;
  await pc.setRemoteDescription(answer);
  await flushCandidateQueue(peerId, pc);
}

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

export async function handleIceCandidate(
  peerId: string,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  const pc = getPeer(peerId);
  if (!pc || pc.remoteDescription === null) {
    const queue = iceCandidateQueue.get(peerId) ?? [];
    queue.push(candidate);
    iceCandidateQueue.set(peerId, queue);
    return;
  }
  await pc.addIceCandidate(candidate).catch(console.warn);
}
