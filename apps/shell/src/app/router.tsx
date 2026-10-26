import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@mentoring/ui";
import { LoginPage } from "../features/auth/LoginPage";
import { WaitingPage } from "../features/auth/WaitingPage";
import { LobbyPage } from "../features/lobby/LobbyPage";
import { AdminPage } from "../features/admin/AdminPage";

const RoomApp = lazy(() => import("room/App"));
const LearnApp = lazy(() => import("learn/App"));

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
                        <Suspense>
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
