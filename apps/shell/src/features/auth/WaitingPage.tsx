import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createApiClient, useAuthStore } from "@mentoring/ui";

const api = createApiClient(import.meta.env.VITE_API_URL);

export function WaitingPage() {
    const { user, updateUser, clearAuth } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        const poll = setInterval(async () => {
            try {
                const me = await api.get<{
                    id: string;
                    name: string;
                    role: string;
                    groupId: string | null;
                }>("/api/me");
                if (me.groupId) {
                    updateUser({ groupId: me.groupId });
                    navigate("/lobby", { replace: true });
                }
            } catch {
                // 폴링 실패는 조용히 무시
            }
        }, 3000);
        return () => clearInterval(poll);
    }, [navigate, updateUser]);

    function handleLogout() {
        clearAuth();
        navigate("/login");
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
            <div className="w-full max-w-100">
                <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] px-8 py-10 flex flex-col items-center text-center gap-6">
                    {/* 아이콘 */}
                    <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center">
                        <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <circle
                                cx="12"
                                cy="12"
                                r="9"
                                stroke="#0071ff"
                                strokeWidth="1.8"
                            />
                            <path
                                d="M12 7v5l3 3"
                                stroke="#0071ff"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>

                    {/* 텍스트 */}
                    <div className="flex flex-col gap-2">
                        <h2 className="text-[18px] font-bold text-text-primary">
                            {user?.name}님, 환영합니다!
                        </h2>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            관리자가 그룹을 배정하면
                            <br />
                            입장할 수 있어요.
                        </p>
                    </div>

                    {/* 배정 확인 중 인디케이터 */}
                    <div className="flex items-center gap-2 text-sm text-text-disabled">
                        <span className="w-3.5 h-3.5 border-2 border-border border-t-[#0071ff] rounded-full animate-spin shrink-0" />
                        배정 확인 중...
                    </div>

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full h-11 rounded-xl text-text-secondary text-sm font-medium hover:bg-background transition-colors cursor-pointer"
                    >
                        로그아웃
                    </button>
                </div>

                <p className="text-center text-[11px] text-text-disabled mt-6">
                    배정이 완료되면 로비 화면으로 자동 이동합니다
                </p>
            </div>
        </div>
    );
}
