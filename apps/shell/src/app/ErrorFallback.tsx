/** 렌더 에러 시 흰 화면 대신 보여주는 안내 화면 (ErrorBoundary에서 사용) */
export function ErrorFallback() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
            <div className="w-full max-w-100 bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] px-8 py-10 flex flex-col items-center text-center gap-4">
                <h1 className="text-lg font-bold text-text-primary">화면을 불러오지 못했어요</h1>
                <p className="text-sm text-text-secondary">잠시 후 새로고침해 주세요. 문제가 계속되면 관리자에게 알려주세요.</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="h-11 px-5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover cursor-pointer transition-colors"
                >
                    새로고침
                </button>
            </div>
        </div>
    );
}
