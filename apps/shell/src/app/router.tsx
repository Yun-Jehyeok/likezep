import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@mentoring/ui";
import { LoginPage } from "../features/auth/LoginPage";
import { WaitingPage } from "../features/auth/WaitingPage";
import { LobbyPage } from "../features/lobby/LobbyPage";
import { AdminPage } from "../features/admin/AdminPage";
import { trackRemoteLoad } from "../monitoring";
import { LearnSkeleton } from "./Skeleton";
import { loadLearnApp } from "./remotes";

// remote 로드를 Sentry 스팬으로 감싼다 (트랜잭션 유지 + remote 로드 시간 측정, monitoring.ts 참고)
// learn은 로비에서 미리 받을 수 있어 같은 로더를 공유한다 (remotes.ts)
const RoomApp = lazy(() => trackRemoteLoad("room", () => import("room/App")));
const LearnApp = lazy(() => trackRemoteLoad("learn", loadLearnApp));

function RequireAuth({ children }: { children: React.ReactNode }) {
    const hydrated = useAuthStore((s) => s._hasHydrated);
    const user = useAuthStore((s) => s.user);
    if (!hydrated) return null;
    if (!user) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
    const hydrated = useAuthStore((s) => s._hasHydrated);
    const user = useAuthStore((s) => s.user);
    if (!hydrated) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role !== "admin") return <Navigate to="/lobby" replace />;
    return <>{children}</>;
}

// 미배정 멘티가 로비/룸에 직접 접근하는 경우 차단
function RequireAssigned({ children }: { children: React.ReactNode }) {
    const hydrated = useAuthStore((s) => s._hasHydrated);
    const user = useAuthStore((s) => s.user);
    if (!hydrated) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === "mentee" && !user.groupId) return <Navigate to="/waiting" replace />;
    return <>{children}</>;
}

function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/waiting"
                    element={
                        <RequireAuth>
                            <WaitingPage />
                        </RequireAuth>
                    }
                />
                <Route
                    path="/lobby"
                    element={
                        <RequireAssigned>
                            <LobbyPage />
                        </RequireAssigned>
                    }
                />
                <Route
                    path="/room/*"
                    element={
                        <Suspense>
                            <RequireAssigned>
                                <RoomApp />
                            </RequireAssigned>
                        </Suspense>
                    }
                />
                <Route
                    path="/learn/*"
                    element={
                        // remote를 받는 동안 빈 화면 대신 강의실 뼈대 (P2, 첫 방문 기준 약 2.5초)
                        <Suspense fallback={<LearnSkeleton />}>
                            <RequireAssigned>
                                <LearnApp />
                            </RequireAssigned>
                        </Suspense>
                    }
                />
                <Route
                    path="/admin"
                    element={
                        <RequireAdmin>
                            <AdminPage />
                        </RequireAdmin>
                    }
                />

                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
