import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Tab = "status" | "groups" | "logs";

const MOCK_STATUS = [
  { id: "room-plaza", name: "광장", type: "public", occupants: [{ name: "관리자" }, { name: "멘토 김" }, { name: "멘티 이" }] },
  { id: "room-meeting", name: "회의실", type: "public", occupants: [] },
  { id: "room-g1", name: "A그룹 룸", type: "private", occupants: [{ name: "멘티 이" }, { name: "멘티 박" }] },
  { id: "room-g2", name: "B그룹 룸", type: "private", occupants: [{ name: "멘티 최" }] },
];

const MOCK_USERS = [
  { id: "u1", name: "관리자", email: "admin@test.com", role: "admin", groupId: null, lastLoginAt: "2026-07-27 13:00" },
  { id: "u2", name: "멘토 김", email: "mentor@test.com", role: "mentor", groupId: null, lastLoginAt: "2026-07-27 12:30" },
  { id: "u3", name: "멘티 이", email: "mentee1@test.com", role: "mentee", groupId: "g1", lastLoginAt: "2026-07-27 13:10" },
  { id: "u4", name: "미배정 박", email: "new@test.com", role: "mentee", groupId: null, lastLoginAt: "2026-07-27 09:00" },
];

const MOCK_LOGS = [
  { userName: "멘티 이", roomName: "A그룹 룸", event: "join", createdAt: "2026-07-27 13:10" },
  { userName: "관리자", roomName: "광장", event: "join", createdAt: "2026-07-27 13:00" },
  { userName: "멘토 김", roomName: "광장", event: "join", createdAt: "2026-07-27 12:30" },
  { userName: "멘티 박", roomName: "A그룹 룸", event: "leave", createdAt: "2026-07-27 12:00" },
];

const ROLE_LABEL: Record<string, string> = { admin: "관리자", mentor: "멘토", mentee: "멘티" };
const ROLE_STYLE: Record<string, string> = {
  admin: "bg-[#fff0e8] text-[#e05c00]",
  mentor: "bg-[#e8f1ff] text-[#0071ff]",
  mentee: "bg-[#f0f0f0] text-[#767676]",
};

const TAB_LABELS: Record<Tab, string> = {
  status: "실시간 현황",
  groups: "그룹 관리",
  logs: "접속 로그",
};

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("status");
  const [groupInput, setGroupInput] = useState("");

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col">

      {/* 헤더 */}
      <header className="bg-white border-b border-[#e4e4e4] px-6 h-14 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => navigate("/lobby")}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f4f6f9] text-[#767676] hover:text-[#17171b] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="w-px h-4 bg-[#e4e4e4]" />
        <h1 className="text-[15px] font-bold text-[#17171b]">관리 대시보드</h1>
      </header>

      {/* 탭 */}
      <div className="bg-white border-b border-[#e4e4e4] px-6 flex gap-0">
        {(["status", "groups", "logs"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[#0071ff] text-[#0071ff]"
                : "border-transparent text-[#767676] hover:text-[#17171b]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">

        {/* 실시간 현황 */}
        {tab === "status" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_STATUS.map((room) => (
              <div key={room.id} className="bg-white rounded-2xl border border-[#e4e4e4] p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[15px] font-semibold text-[#17171b]">{room.name}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    room.type === "public" ? "bg-[#e8f7ee] text-[#1a7a3f]" : "bg-[#f0ebff] text-[#6b21e8]"
                  }`}>
                    {room.type === "public" ? "공용" : "프라이빗"}
                  </span>
                </div>
                {room.occupants.length === 0 ? (
                  <p className="text-[#b2b2b2] text-sm">비어 있음</p>
                ) : (
                  <ul className="space-y-2">
                    {room.occupants.map((o, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0" />
                        <span className="text-sm text-[#17171b]">{o.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 pt-4 border-t border-[#f4f6f9]">
                  <span className="text-xs text-[#b2b2b2]">{room.occupants.length}명 접속 중</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 그룹 관리 */}
        {tab === "groups" && (
          <div className="space-y-6">
            {/* 그룹 생성 */}
            <div className="bg-white rounded-2xl border border-[#e4e4e4] p-5">
              <h3 className="text-sm font-semibold text-[#17171b] mb-3">새 그룹 생성</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder="그룹 이름 (예: 3기 A그룹)"
                  className="flex-1 h-10 px-3 rounded-xl border border-[#e4e4e4] focus:border-[#0071ff] text-sm text-[#17171b] placeholder:text-[#b2b2b2] outline-none transition-colors"
                />
                <button
                  type="button"
                  disabled={!groupInput.trim()}
                  className="h-10 px-4 rounded-xl bg-[#0071ff] hover:bg-[#0064e6] disabled:bg-[#b2b2b2] text-white text-sm font-medium transition-colors"
                >
                  생성
                </button>
              </div>
            </div>

            {/* 유저 테이블 */}
            <div className="bg-white rounded-2xl border border-[#e4e4e4] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f4f6f9]">
                <h3 className="text-sm font-semibold text-[#17171b]">전체 유저</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f9f9f9]">
                    {["이름", "이메일", "역할", "그룹", "최근 로그인"].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-[#767676] px-5 py-3 first:rounded-tl-none last:rounded-tr-none">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_USERS.map((u, i) => (
                    <tr key={u.id} className={`border-t border-[#f4f6f9] hover:bg-[#fafafa] transition-colors ${i === 0 ? "border-0" : ""}`}>
                      <td className="px-5 py-3.5 text-sm font-medium text-[#17171b]">{u.name}</td>
                      <td className="px-5 py-3.5 text-sm text-[#767676]">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLE[u.role]}`}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#767676]">
                        {u.groupId
                          ? u.groupId
                          : <span className="text-[#e05c00] text-xs font-medium">미배정</span>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#b2b2b2]">{u.lastLoginAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 접속 로그 */}
        {tab === "logs" && (
          <div className="bg-white rounded-2xl border border-[#e4e4e4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f4f6f9]">
              <h3 className="text-sm font-semibold text-[#17171b]">접속 로그</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9f9f9]">
                  {["시간", "이름", "공간", "이벤트"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-[#767676] px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_LOGS.map((log, i) => (
                  <tr key={i} className="border-t border-[#f4f6f9] hover:bg-[#fafafa] transition-colors">
                    <td className="px-5 py-3.5 text-sm text-[#b2b2b2]">{log.createdAt}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-[#17171b]">{log.userName}</td>
                    <td className="px-5 py-3.5 text-sm text-[#767676]">{log.roomName}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        log.event === "join"
                          ? "bg-[#e8f7ee] text-[#1a7a3f]"
                          : "bg-[#f0f0f0] text-[#767676]"
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${log.event === "join" ? "bg-[#22c55e]" : "bg-[#b2b2b2]"}`} />
                        {log.event === "join" ? "입장" : "퇴장"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
