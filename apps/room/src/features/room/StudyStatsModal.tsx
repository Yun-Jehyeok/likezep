import { useEffect, useRef, useState } from "react";
import { createApiClient } from "@mentoring/ui";

interface UserInfo { id: string; name: string }
interface LogEntry { userId: string; date: string; totalSeconds: number }
interface StatsResponse { users: UserInfo[]; logs: LogEntry[] }

const CERT_SECONDS = 4 * 3600; // 4시간

function formatHM(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function getDatesForMonth(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
}

type View = "summary" | "detail";
type Period = "daily" | "weekly" | "monthly";

interface Props {
  roomId: string;
  onClose: () => void;
}

export function StudyStatsModal({ roomId, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("summary");
  const [period, setPeriod] = useState<Period>("daily");

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    const api = createApiClient(import.meta.env.VITE_API_URL);
    setLoading(true);
    api.get<StatsResponse>(`/api/rooms/${roomId}/study-stats?days=90`)
      .then((res) => setData(res))
      .catch(() => setError("통계를 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, [roomId]);

  // 오버레이 클릭으로 닫기
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (loading || !data) {
    return (
      <div ref={overlayRef} onClick={handleOverlayClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 min-w-[320px] flex items-center justify-center">
          {error ? <span className="text-red-500 text-sm">{error}</span> : <span className="text-sm text-[#8a8a8a]">불러오는 중...</span>}
        </div>
      </div>
    );
  }

  const logMap = new Map<string, number>();
  for (const l of data.logs) {
    logMap.set(`${l.userId}:${l.date}`, l.totalSeconds);
  }

  // ── 요약 계산 ──────────────────────────────────────────────────
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const todayStr = kstNow.toISOString().slice(0, 10);

  // 이번 주 월요일
  const dayOfWeek = kstNow.getUTCDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(kstNow);
  weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // 이번 달 첫날
  const monthStartStr = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const summary = data.users.map((u) => {
    let daily = 0, weekly = 0, monthly = 0;
    for (const l of data.logs) {
      if (l.userId !== u.id) continue;
      if (l.date === todayStr) daily += l.totalSeconds;
      if (l.date >= weekStartStr && l.date <= todayStr) weekly += l.totalSeconds;
      if (l.date >= monthStartStr && l.date <= todayStr) monthly += l.totalSeconds;
    }
    return { ...u, daily, weekly, monthly };
  });

  const sortedSummary = [...summary].sort((a, b) => {
    const key = period === "daily" ? "daily" : period === "weekly" ? "weekly" : "monthly";
    return b[key] - a[key];
  });

  // ── 월별 상세 ──────────────────────────────────────────────────
  const detailDates = getDatesForMonth(selectedYear, selectedMonth);
  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedYear((y) => y - 1); setSelectedMonth(12); }
    else setSelectedMonth((m) => m - 1);
  };
  const nextMonth = () => {
    const nextY = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const nextM = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const futureCheck = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
    if (futureCheck > todayStr.slice(0, 7) + "-01") return;
    setSelectedYear(nextY);
    setSelectedMonth(nextM);
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-base font-bold text-[#17171b]">공부 시간</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#f4f6f9] rounded-lg p-0.5 text-xs">
              <button type="button" onClick={() => setView("summary")}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${view === "summary" ? "bg-white text-[#17171b] font-semibold shadow-sm" : "text-[#8a8a8a]"}`}>
                요약
              </button>
              <button type="button" onClick={() => setView("detail")}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${view === "detail" ? "bg-white text-[#17171b] font-semibold shadow-sm" : "text-[#8a8a8a]"}`}>
                날짜별
              </button>
            </div>
            <button type="button" onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f4f4f4] text-[#8a8a8a] transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {view === "summary" ? (
            <>
              {/* 기간 탭 */}
              <div className="flex gap-2 mb-4">
                {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${period === p ? "bg-[#0071ff] text-white border-[#0071ff]" : "border-[#e4e4e4] text-[#5a5a5a] hover:border-[#0071ff]"}`}>
                    {p === "daily" ? "오늘" : p === "weekly" ? "이번 주" : "이번 달"}
                  </button>
                ))}
              </div>

              <ul className="space-y-2">
                {sortedSummary.map((u, idx) => {
                  const sec = period === "daily" ? u.daily : period === "weekly" ? u.weekly : u.monthly;
                  const certified = period === "daily" ? u.daily >= CERT_SECONDS : false;
                  return (
                    <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#f9f9f9]">
                      <span className="w-5 text-xs font-bold text-[#b2b2b2] text-center">{idx + 1}</span>
                      <span className="flex-1 text-sm text-[#17171b] truncate">{u.name}</span>
                      {certified && (
                        <span className="text-[10px] font-bold text-white bg-[#0071ff] rounded px-1.5 py-0.5 leading-none shrink-0">인증</span>
                      )}
                      <span className="text-sm font-semibold text-[#17171b] tabular-nums">{sec > 0 ? formatHM(sec) : "-"}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              {/* 월 선택 */}
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={prevMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f4f4f4] text-[#5a5a5a] cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-[#17171b]">{selectedYear}년 {selectedMonth}월</span>
                <button type="button" onClick={nextMonth}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f4f4f4] text-[#5a5a5a] cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 날짜별 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-2 text-[#8a8a8a] font-medium sticky left-0 bg-white min-w-[80px]">날짜</th>
                      {data.users.map((u) => (
                        <th key={u.id} className="py-2 px-2 text-[#8a8a8a] font-medium text-center min-w-[72px] truncate max-w-[80px]" title={u.name}>
                          {u.name.length > 5 ? u.name.slice(0, 5) + "…" : u.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailDates.map((date) => {
                      const isFuture = date > todayStr;
                      return (
                        <tr key={date} className={`border-t border-[#f0f0f0] ${isFuture ? "opacity-30" : ""}`}>
                          <td className="py-1.5 px-2 text-[#5a5a5a] sticky left-0 bg-white">{date.slice(5)}</td>
                          {data.users.map((u) => {
                            const sec = logMap.get(`${u.id}:${date}`) ?? 0;
                            const cert = sec >= CERT_SECONDS;
                            return (
                              <td key={u.id} className="py-1.5 px-2 text-center">
                                {sec > 0 ? (
                                  <span className={`inline-flex items-center gap-1 ${cert ? "font-semibold text-[#0071ff]" : "text-[#5a5a5a]"}`}>
                                    {cert && <span className="text-[9px] font-bold text-white bg-[#0071ff] rounded px-1 py-0.5 leading-none">인증</span>}
                                    {formatHM(sec)}
                                  </span>
                                ) : (
                                  <span className="text-[#d4d4d4]">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
