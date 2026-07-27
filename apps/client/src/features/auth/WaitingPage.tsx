import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../app/store.js";

export function WaitingPage() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] px-8 py-10 flex flex-col items-center text-center gap-6">

          {/* 아이콘 */}
          <div className="w-16 h-16 rounded-full bg-[#e8f1ff] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#0071ff" strokeWidth="1.8"/>
              <path d="M12 7v5l3 3" stroke="#0071ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* 텍스트 */}
          <div className="flex flex-col gap-2">
            <h2 className="text-[18px] font-bold text-[#17171b]">
              {user?.name}님, 환영합니다!
            </h2>
            <p className="text-sm text-[#767676] leading-relaxed">
              관리자가 그룹을 배정하면<br />입장할 수 있어요.
            </p>
          </div>

          {/* 배정 확인 버튼 */}
          <div className="w-full flex flex-col gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-12 rounded-xl bg-[#0071ff] hover:bg-[#0064e6] active:bg-[#0058cc] text-white text-[15px] font-semibold transition-colors"
            >
              배정 확인
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-11 rounded-xl text-[#767676] text-sm font-medium hover:bg-[#f4f6f9] transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-[#b2b2b2] mt-6">
          배정이 완료되면 로비 화면으로 자동 이동합니다
        </p>
      </div>
    </div>
  );
}
