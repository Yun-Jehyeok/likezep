/**
 * 공부시간 리스트 패널 — 채팅 패널 상단에 임베드.
 * 서버가 Colyseus state로 유저별 timer 상태를 sync하고, 클라는 running일 때
 * accumulatedSec + (now - startedAt)을 매초 재계산해 live로 표시한다.
 */
import { useEffect, useState } from "react";

export interface PlayerTimer {
  name: string;
  status: string;        // "running" | "paused" | "stopped"
  acc: number;           // accumulatedSec
  startedAt: number;     // epoch ms (running일 때만 유효)
}

interface Props {
  timers: Record<string, PlayerTimer>;
  mySessionId: string | null;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

function formatHMS(totalSec: number): string {
  const safe = Math.max(0, Number.isFinite(totalSec) ? totalSec : 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function currentSeconds(t: PlayerTimer): number {
  if (t.status === "running" && t.startedAt > 0) {
    return t.acc + Math.floor((Date.now() - t.startedAt) / 1000);
  }
  return t.acc;
}

export function StudyTimerPanel({ timers, mySessionId, onStart, onPause, onStop }: Props) {
  // 매초 리렌더: running 타이머의 live 표시를 위해.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const entries = Object.entries(timers).sort((a, b) => {
    // 자기 자신 최상단, 그 외는 running > paused > stopped 순, 동급은 누적 시간 내림차순
    if (a[0] === mySessionId) return -1;
    if (b[0] === mySessionId) return 1;
    const rank = (s: string) => (s === "running" ? 0 : s === "paused" ? 1 : 2);
    const diff = rank(a[1].status) - rank(b[1].status);
    if (diff !== 0) return diff;
    return currentSeconds(b[1]) - currentSeconds(a[1]);
  });

  const myTimer = mySessionId ? timers[mySessionId] : undefined;

  return (
    <div className="border-b border-[#e4e4e4] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-[#17171b]">공부시간</span>
        <span className="text-[10px] text-[#b2b2b2]">매일 자정(KST) 초기화</span>
      </div>
      <ul className="space-y-1 max-h-40 overflow-y-auto">
        {entries.length === 0 ? (
          <li className="text-[#b2b2b2] text-xs text-center py-2">참여자가 없어요</li>
        ) : (
          entries.map(([sid, t]) => {
            const isMe = sid === mySessionId;
            const dot = t.status === "running" ? "bg-[#22c55e]" : t.status === "paused" ? "bg-[#f59e0b]" : "bg-[#d4d4d4]";
            return (
              <li
                key={sid}
                className={`flex items-center justify-between gap-2 text-xs px-1.5 py-1 rounded-md ${isMe ? "bg-[#f4f6f9] font-medium text-[#17171b]" : "text-[#5a5a5a]"}`}
              >
                <div className="flex items-center gap-1.5 truncate min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <span className="truncate">{t.name}{isMe && " (나)"}</span>
                </div>
                <span className="tabular-nums shrink-0">{formatHMS(currentSeconds(t))}</span>
              </li>
            );
          })
        )}
      </ul>
      {myTimer && (
        <div className="flex gap-1.5 mt-2.5">
          {myTimer.status !== "running" ? (
            <button
              type="button"
              onClick={onStart}
              className="flex-1 h-7 bg-[#0071ff] hover:bg-[#0064e6] text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              {myTimer.status === "paused" ? "재개" : "시작"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="flex-1 h-7 bg-[#fef3c7] hover:bg-[#fde68a] text-[#92400e] rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              일시정지
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            disabled={myTimer.status === "stopped" && myTimer.acc === 0}
            className="flex-1 h-7 bg-[#fff1f0] hover:bg-[#ffe3e2] disabled:bg-[#f4f6f9] disabled:text-[#b2b2b2] disabled:cursor-not-allowed text-[#e03131] rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            정지
          </button>
        </div>
      )}
    </div>
  );
}
