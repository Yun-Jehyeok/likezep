import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../core/api/client.js";

interface RoomOption {
  id: string;
  name: string;
  type: string;
  occupants: number;
}

interface Props {
  currentRoomId: string;
}

export function RoomSwitcher({ currentRoomId }: Props) {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    api.get<RoomOption[]>("/api/rooms").then(setRooms).catch(console.error);
  }, [open]);

  const others = rooms.filter((r) => r.id !== currentRoomId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 px-3 text-sm font-medium text-[#767676] border border-[#e4e4e4] rounded-lg hover:border-[#0071ff] hover:text-[#0071ff] transition-colors"
      >
        방 전환
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-[#e4e4e4] py-1 z-50">
            {others.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-[#b2b2b2]">다른 룸이 없습니다</p>
            ) : (
              others.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate(`/room/${room.id}`, { state: { roomName: room.name } });
                  }}
                  className="w-full px-4 py-2.5 text-sm text-left text-[#17171b] hover:bg-[#f4f6f9] flex items-center gap-2 transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${room.occupants > 0 ? "bg-[#22c55e]" : "bg-[#b2b2b2]"}`} />
                  <span className="flex-1 truncate">{room.name}</span>
                  <span className="text-xs text-[#b2b2b2] shrink-0">{room.occupants}명</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
