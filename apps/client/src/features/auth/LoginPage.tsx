import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { useAuthStore } from "../../app/store.js";
import { api } from "../../core/api/client.js";

// TODO: Phase 1 완료 후 제거
const MOCK_USERS = [
  { id: "u1", name: "관리자", email: "admin@test.com", role: "admin" as const, groupId: null },
  { id: "u2", name: "멘토 김", email: "mentor@test.com", role: "mentor" as const, groupId: null },
  { id: "u3", name: "멘티 이", email: "mentee@test.com", role: "mentee" as const, groupId: "g1" },
  { id: "u4", name: "미배정 박", email: "new@test.com", role: "mentee" as const, groupId: null },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  mentor: "멘토",
  mentee: "멘티",
};

interface AuthResponse {
  token: string;
  user: { id: string; name: string; email: string; role: "admin" | "mentor" | "mentee"; groupId: string | null };
}

export function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAuthSuccess(user: AuthResponse["user"], token: string) {
    setAuth(user, token);
    if (user.role === "mentee" && !user.groupId) {
      navigate("/waiting");
    } else {
      navigate("/lobby");
    }
  }

  const googleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async ({ code }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.post<AuthResponse>("/api/auth/google", { code });
        handleAuthSuccess(res.user, res.token);
      } catch (err) {
        setError("Google 로그인에 실패했습니다. 다시 시도해 주세요.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    onError: () => setError("Google 로그인이 취소됐습니다."),
  });

  function mockLogin(user: typeof MOCK_USERS[0]) {
    handleAuthSuccess(user, "mock-token");
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

        {/* 로고 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#0071ff] flex items-center justify-center mb-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 5h14M4 11h14M4 17h8" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#17171b] tracking-tight">멘토링 플랫폼</h1>
          <p className="text-sm text-[#767676] mt-1">온라인 멘토링 공간에 오신 것을 환영합니다</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] overflow-hidden">

          {/* Google 로그인 */}
          <div className="px-8 pt-8 pb-6">
            {error && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-[#fff1f0] border border-[#ffd6d3] text-[#e03131] text-sm">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={() => googleLogin()}
              disabled={loading}
              className="w-full h-12 flex items-center justify-center gap-3 rounded-xl border border-[#e4e4e4] bg-white text-[#17171b] text-[15px] font-medium hover:bg-[#f9f9f9] active:bg-[#f2f2f2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-[#e4e4e4] border-t-[#0071ff] rounded-full animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Google로 계속하기
            </button>
          </div>

          {/* 구분선 */}
          <div className="flex items-center gap-3 px-8 mb-6">
            <div className="flex-1 h-px bg-[#e4e4e4]" />
            <span className="text-xs text-[#b2b2b2] font-medium">개발용 빠른 로그인</span>
            <div className="flex-1 h-px bg-[#e4e4e4]" />
          </div>

          {/* 개발용 빠른 로그인 */}
          <div className="px-8 pb-8 flex flex-col gap-2">
            {MOCK_USERS.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => mockLogin(u)}
                className="w-full h-11 flex items-center justify-between px-4 rounded-xl bg-[#f4f6f9] hover:bg-[#e8f1ff] active:bg-[#d6e8ff] transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#e4e4e4] group-hover:bg-[#c5d8f8] flex items-center justify-center transition-colors">
                    <span className="text-xs font-semibold text-[#767676] group-hover:text-[#0071ff]">
                      {u.name[0]}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#17171b]">{u.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <RoleBadge role={u.role} />
                  {u.role === "mentee" && !u.groupId && (
                    <span className="text-[11px] text-[#b2b2b2]">미배정</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-[#b2b2b2] mt-6">
          로그인하면 이용약관 및 개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-[#fff0e8] text-[#e05c00]",
    mentor: "bg-[#e8f1ff] text-[#0071ff]",
    mentee: "bg-[#f0f0f0] text-[#767676]",
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${styles[role] ?? styles.mentee}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}
