import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../app/store.js";
import { api } from "../../core/api/client.js";

interface RoomCard {
  id: string;
  name: string;
  type: "public" | "private";
  groupId: string | null;
  occupants: number;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  mentor: "멘토",
  mentee: "멘티",
};

const ROLE_STYLE: Record<string, string> = {
  admin: "bg-[#fff0e8] text-[#e05c00]",
  mentor: "bg-[#e8f1ff] text-[#0071ff]",
  mentee: "bg-[#f0f0f0] text-[#767676]",
};

export function LobbyPage() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function fetchRooms() {
      return api.get<RoomCard[]>("/api/rooms")
        .then(setRooms)
        .catch(() => setError("룸 목록을 불러오지 못했습니다."));
    }

    fetchRooms().finally(() => setLoading(false));
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex flex-col">

      {/* 상단 헤더 */}
      <header className="bg-white border-b border-[#e4e4e4] px-6 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0071ff] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
              <path d="M4 5h14M4 11h14M4 17h8" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-[15px] font-bold text-[#17171b]">멘토링 플랫폼</span>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === "admin" && (
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="text-sm text-[#0071ff] font-medium hover:text-[#0064e6] transition-colors"
            >
              관리 대시보드
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#17171b] font-medium">{user?.name}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ROLE_STYLE[user?.role ?? "mentee"]}`}>
              {ROLE_LABEL[user?.role ?? "mentee"]}
            </span>
          </div>
          <div className="w-px h-4 bg-[#e4e4e4]" />
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-[#767676] hover:text-[#17171b] transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#17171b]">입장 가능한 공간</h2>
          <p className="text-sm text-[#767676] mt-1">공간을 선택하면 바로 입장합니다</p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <span className="w-6 h-6 border-2 border-[#e4e4e4] border-t-[#0071ff] rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl bg-[#fff1f0] border border-[#ffd6d3] text-[#e03131] text-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <RoomCardItem
                key={room.id}
                room={room}
                onClick={() => navigate(`/room/${room.id}`, { state: { roomName: room.name } })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RoomCardItem({ room, onClick }: { room: RoomCard; onClick: () => void }) {
  const isEmpty = room.occupants === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl border border-[#e4e4e4] hover:border-[#0071ff] hover:shadow-[0_4px_20px_rgba(0,113,255,0.12)] p-5 text-left transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#f4f6f9] group-hover:bg-[#e8f1ff] transition-colors">
          {room.type === "public" ? <PublicIcon /> : <PrivateIcon />}
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
          room.type === "public" ? "bg-[#e8f7ee] text-[#1a7a3f]" : "bg-[#f0ebff] text-[#6b21e8]"
        }`}>
          {room.type === "public" ? "공용" : "프라이빗"}
        </span>
      </div>

      <p className="text-[16px] font-semibold text-[#17171b] group-hover:text-[#0071ff] transition-colors mb-1">
        {room.name}
      </p>

      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isEmpty ? "bg-[#b2b2b2]" : "bg-[#22c55e]"}`} />
        <span className={`text-sm ${isEmpty ? "text-[#b2b2b2]" : "text-[#767676]"}`}>
          {isEmpty ? "비어 있음" : `${room.occupants}명 접속 중`}
        </span>
      </div>
    </button>
  );
}

function PublicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="#767676"/>
    </svg>
  );
}

function PrivateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="#767676"/>
    </svg>
  );
}
