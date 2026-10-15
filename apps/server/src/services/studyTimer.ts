/**
 * 공부시간 타이머 — 유저별 running/paused/stopped 상태를 서버 메모리에 유지.
 * KST 자정 기준 lazy 리셋: 조회 시점의 KST 날짜가 저장된 날짜와 다르면 0으로 돌림.
 *
 * 저장은 메모리만. 서버 재시작 시 소실 — "하루치 공부시간"이 날아가는 최악 케이스만 발생.
 * DB 저장은 요구사항 밖(사용자 결정, 2026-10-15).
 */

export type TimerStatus = "running" | "paused" | "stopped";

export interface TimerState {
  status: TimerStatus;
  accumulatedSec: number;
  startedAt: number; // epoch ms. running일 때만 유효, 그 외는 0
  dayKey: string;    // KST YYYY-MM-DD
}

function kstDayKey(now = Date.now()): string {
  // KST = UTC+9. ms에 9시간 더해 UTC 포맷으로 변환해도 날짜 부분은 KST와 동일.
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

function fresh(): TimerState {
  return { status: "stopped", accumulatedSec: 0, startedAt: 0, dayKey: kstDayKey() };
}

const timers = new Map<string, TimerState>();

/** 조회 + lazy 자정 리셋. 하루가 바뀌면 자동으로 fresh 반환. */
export function getTimer(userId: string): TimerState {
  const today = kstDayKey();
  const existing = timers.get(userId);
  if (!existing || existing.dayKey !== today) {
    const t = fresh();
    timers.set(userId, t);
    return t;
  }
  return existing;
}

export function startTimer(userId: string): TimerState {
  const t = getTimer(userId);
  if (t.status !== "running") {
    t.status = "running";
    t.startedAt = Date.now();
  }
  return t;
}

export function pauseTimer(userId: string): TimerState {
  const t = getTimer(userId);
  if (t.status === "running") {
    t.accumulatedSec += Math.floor((Date.now() - t.startedAt) / 1000);
    t.startedAt = 0;
    t.status = "paused";
  }
  return t;
}

/** 완전 리셋 (사용자 결정: '정지' = 0초로). */
export function stopTimer(userId: string): TimerState {
  const t = getTimer(userId);
  t.status = "stopped";
  t.accumulatedSec = 0;
  t.startedAt = 0;
  return t;
}
