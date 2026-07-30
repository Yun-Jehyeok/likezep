import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../core/api/client.js";

type Tab = "status" | "groups" | "logs";

interface RoomStatus {
  id: string;
  name: string;
  type: "public" | "private";
  occupants: { name: string }[];
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "mentor" | "mentee";
  groupId: string | null;
  groupName: string | null;
  lastLoginAt: string | null;
}

interface Group {
  id: string;
  name: string;
}

interface Log {
  userName: string;
  roomName: string;
  event: string;
  createdAt: string;
}

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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("status");
  const [groupInput, setGroupInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  const [statusList, setStatusList] = useState<RoomStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatusList(await api.get<RoomStatus[]>("/api/admin/status"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedUsers, fetchedGroups] = await Promise.all([
        api.get<User[]>("/api/admin/users"),
        api.get<Group[]>("/api/admin/groups"),
      ]);
      setUsers(fetchedUsers);
      setGroups(fetchedGroups);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await api.get<Log[]>("/api/admin/logs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "status") fetchStatus();
    else if (tab === "groups") fetchGroups();
    else if (tab === "logs") fetchLogs();
  }, [tab, fetchStatus, fetchGroups, fetchLogs]);

  // 실시간 현황은 5초마다 갱신
  useEffect(() => {
    if (tab !== "status") return;
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [tab, fetchStatus]);

  async function handleCreateGroup() {
    if (!groupInput.trim()) return;
    setCreating(true);
    try {
      const { group } = await api.post<{ group: Group; room: { id: string; name: string } }>(
        "/api/admin/groups",
        { name: groupInput.trim() }
      );
      setGroups((prev) => [...prev, group]);
      setGroupInput("");
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameGroup(groupId: string) {
    if (!editingGroupName.trim()) return;
    const updated = await api.patch<Group>(`/api/admin/groups/${groupId}`, { name: editingGroupName.trim() });
    setGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
    setUsers((prev) => prev.map((u) => (u.groupId === groupId ? { ...u, groupName: updated.name } : u)));
    setEditingGroupId(null);
  }

  async function handleDeleteGroup(groupId: string, groupName: string) {
    if (!window.confirm(`"${groupName}" 그룹을 삭제하면 소속 유저가 미배정 상태가 됩니다. 계속할까요?`)) return;
    await api.delete(`/api/admin/groups/${groupId}`);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setUsers((prev) => prev.map((u) => (u.groupId === groupId ? { ...u, groupId: null, groupName: null } : u)));
  }

  async function handleUserChange(userId: string, field: "role" | "groupId", value: string) {
    const body = field === "groupId" ? { groupId: value || null } : { role: value };
    const updated = await api.patch<{ id: string; role: string; groupId: string | null }>(
      `/api/admin/users/${userId}`,
      body
    );
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              role: updated.role as User["role"],
              groupId: updated.groupId,
              groupName: groups.find((g) => g.id === updated.groupId)?.name ?? null,
            }
          : u
      )
    );
  }

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
          loading && statusList.length === 0 ? (
            <p className="text-sm text-[#b2b2b2]">불러오는 중...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {statusList.map((room) => (
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
          )
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
                  onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                  placeholder="그룹 이름 (예: 3기 A그룹)"
                  className="flex-1 h-10 px-3 rounded-xl border border-[#e4e4e4] focus:border-[#0071ff] text-sm text-[#17171b] placeholder:text-[#b2b2b2] outline-none transition-colors"
                />
                <button
                  type="button"
                  disabled={!groupInput.trim() || creating}
                  onClick={handleCreateGroup}
                  className="h-10 px-4 rounded-xl bg-[#0071ff] hover:bg-[#0064e6] disabled:bg-[#b2b2b2] text-white text-sm font-medium transition-colors"
                >
                  {creating ? "생성 중..." : "생성"}
                </button>
              </div>
            </div>

            {/* 그룹 목록 */}
            <div className="bg-white rounded-2xl border border-[#e4e4e4] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f4f6f9]">
                <h3 className="text-sm font-semibold text-[#17171b]">그룹 목록</h3>
              </div>
              {groups.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[#b2b2b2]">생성된 그룹 없음</p>
              ) : (
                <ul className="divide-y divide-[#f4f6f9]">
                  {groups.map((g) => (
                    <li key={g.id} className="px-5 py-3 flex items-center gap-3">
                      {editingGroupId === g.id ? (
                        <>
                          <input
                            autoFocus
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameGroup(g.id);
                              if (e.key === "Escape") setEditingGroupId(null);
                            }}
                            className="flex-1 h-8 px-2 rounded-lg border border-[#0071ff] text-sm text-[#17171b] outline-none"
                          />
                          <button type="button" onClick={() => handleRenameGroup(g.id)} className="text-xs text-[#0071ff] font-medium">저장</button>
                          <button type="button" onClick={() => setEditingGroupId(null)} className="text-xs text-[#767676]">취소</button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-[#17171b]">{g.name}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name); }}
                            className="text-xs text-[#767676] hover:text-[#17171b] transition-colors"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(g.id, g.name)}
                            className="text-xs text-[#e05c00] hover:text-red-600 transition-colors"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 유저 테이블 */}
            <div className="bg-white rounded-2xl border border-[#e4e4e4] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f4f6f9]">
                <h3 className="text-sm font-semibold text-[#17171b]">전체 유저</h3>
              </div>
              {loading && users.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[#b2b2b2]">불러오는 중...</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f9f9f9]">
                      {["이름", "이메일", "역할", "그룹", "최근 로그인"].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-[#767676] px-5 py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u.id} className={`border-t border-[#f4f6f9] hover:bg-[#fafafa] transition-colors ${i === 0 ? "border-0" : ""}`}>
                        <td className="px-5 py-3 text-sm font-medium text-[#17171b]">{u.name}</td>
                        <td className="px-5 py-3 text-sm text-[#767676]">{u.email}</td>
                        <td className="px-5 py-3">
                          <select
                            value={u.role}
                            onChange={(e) => handleUserChange(u.id, "role", e.target.value)}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer outline-none ${ROLE_STYLE[u.role]}`}
                          >
                            <option value="admin">{ROLE_LABEL.admin}</option>
                            <option value="mentor">{ROLE_LABEL.mentor}</option>
                            <option value="mentee">{ROLE_LABEL.mentee}</option>
                          </select>
                        </td>
                        <td className="px-5 py-3">
                          <select
                            value={u.groupId ?? ""}
                            onChange={(e) => handleUserChange(u.id, "groupId", e.target.value)}
                            className="text-sm text-[#17171b] border border-[#e4e4e4] rounded-lg px-2 py-1 outline-none focus:border-[#0071ff] bg-white cursor-pointer"
                          >
                            <option value="">미배정</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3 text-sm text-[#b2b2b2]">{formatDate(u.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 접속 로그 */}
        {tab === "logs" && (
          <div className="bg-white rounded-2xl border border-[#e4e4e4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f4f6f9]">
              <h3 className="text-sm font-semibold text-[#17171b]">접속 로그</h3>
            </div>
            {loading && logs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[#b2b2b2]">불러오는 중...</p>
            ) : (
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
                  {logs.map((log, i) => (
                    <tr key={i} className="border-t border-[#f4f6f9] hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3.5 text-sm text-[#b2b2b2]">{formatDate(log.createdAt)}</td>
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
            )}
          </div>
        )}
      </main>
    </div>
  );
}
