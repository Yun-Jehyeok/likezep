import { setPeer, getPeer } from "./cleanup.js";

// Buffer candidates that arrive before setRemoteDescription
const iceCandidateQueue = new Map<string, RTCIceCandidateInit[]>();


type SendSignal = (type: string, payload: object) => void;
type OnRemoteStream = (peerId: string, stream: MediaStream) => void;

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
      pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (report.type === "candidate-pair") {
            const pair = report as RTCIceCandidatePairStats;
            if (pair.state === "succeeded") {
              console.log(`[ICE ${peerId}] selected pair:`, pair);
            }
          }
          if (report.type === "remote-candidate") {
            const candidateType = (report as { candidateType?: string }).candidateType;
            console.log(`[ICE ${peerId}] remote candidate type: ${candidateType}`);
            // host | srflx | relay — relay이면 TURN 경유
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
