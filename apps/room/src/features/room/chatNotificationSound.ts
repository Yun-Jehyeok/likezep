/**
 * 채팅 알림음 — Web Audio API로 짧은 2음 벨 소리를 즉시 합성한다.
 *
 * 파일 asset을 배포하지 않기 위해 오실레이터로 생성. 대역폭/캐시 이슈 없음.
 * AudioContext는 브라우저 자동재생 정책상 사용자 제스처(룸 입장 클릭 등)
 * 이후에만 안정적으로 작동하므로 첫 재생 실패는 조용히 무시한다.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

export function playChatNotification() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 2음 벨: A5(880Hz) → D6(1174Hz), triangle 파형으로 더 선명하게
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174, now + 0.1);

    // 볼륨 증가(0.18 → 0.4) + 릴리스 350ms
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // AudioContext 생성/재생 실패는 무음 처리
  }
}
