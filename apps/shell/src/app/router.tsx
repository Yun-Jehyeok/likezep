import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "@mentoring/ui";
import { LoginPage } from "../features/auth/LoginPage";
import { WaitingPage } from "../features/auth/WaitingPage";
import { LobbyPage } from "../features/lobby/LobbyPage";
import { AdminPage } from "../features/admin/AdminPage";
import { trackRemoteLoad } from "../monitoring";
import { LearnSkeleton } from "./Skeleton";
import { loadLearnApp } from "./remotes";
import { LEARN_LIST_API, prefetchApi } from "./prefetch";

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

/**
 * 강의 목록(/learn)에 들어서는 순간 목록 API를 먼저 요청한다 (P3c, prefetch.ts).
 * - Suspense 밖에 둔다: React 18은 Suspense 안 형제가 대기 중이면 그 서브트리를 커밋하지 않아,
 *   안에 두면 learn remote가 다 올 때까지 효과가 실행되지 않는다
 * - useLayoutEffect: 모든 layout effect가 passive effect(useEffect)보다 먼저 실행되므로,
 *   learn이 이미 받아져 있어 CourseListPage가 같은 커밋에 마운트돼도 그 useEffect보다 먼저 등록된다
 */
function LearnDataPrefetch() {
    const { pathname } = useLocation();
    useLayoutEffect(() => {
        if (/^\/learn\/?$/.test(pathname)) prefetchApi(LEARN_LIST_API);
    }, [pathname]);
    return null;
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
                        <>
                            <LearnDataPrefetch />
                            {/* remote를 받는 동안 빈 화면 대신 강의실 뼈대 (P2, 첫 방문 기준 약 2.5초) */}
                            <Suspense fallback={<LearnSkeleton />}>
                                <RequireAssigned>
                                    <LearnApp />
                                </RequireAssigned>
                            </Suspense>
                        </>
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
