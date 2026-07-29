import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { WaitingPage } from "../features/auth/WaitingPage.js";
import { LobbyPage } from "../features/lobby/LobbyPage.js";
import { RoomPage } from "../features/room/RoomPage.js";
import { AdminPage } from "../features/admin/AdminPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/lobby" replace />;
  return <>{children}</>;
}

// 미배정 멘티가 로비/룸에 직접 접근하는 경우 차단
function RequireAssigned({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "mentee" && !user.groupId) return <Navigate to="/waiting" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/waiting" element={<RequireAuth><WaitingPage /></RequireAuth>} />
        <Route path="/lobby" element={<RequireAssigned><LobbyPage /></RequireAssigned>} />
        <Route path="/room/:roomId" element={<RequireAssigned><RoomPage /></RequireAssigned>} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
