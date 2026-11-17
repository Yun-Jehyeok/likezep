/**
 * learn remote 로드 + 미리 받기 (강의실 성능 P3b, docs/plans/learn-performance.md)
 *
 * 로비 → 강의실 첫 이동에서 클릭 뒤에야 learn remote를 4단계(loadRemote → CSS → LearnApp → shared)로
 * 받느라 약 2.4초가 걸렸다(감속 측정). 로비가 한가할 때나 "강의실"에 마우스를 올렸을 때 미리 받아 두면
 * 클릭 시점에는 이미 받은 모듈을 쓴다.
 *
 * - 라우터의 lazy import와 같은 함수(loadLearnApp)를 쓴다 → 같은 모듈이라 한 번만 받고 실행한다
 * - 미리 받기는 trackRemoteLoad(Sentry 스팬)를 거치지 않는다. 그 스팬은 "사용자가 기다린 remote 로드 시간"
 *   지표라, 미리 받기가 끝났으면 클릭 시점의 로드가 0에 가깝게 기록되는 게 맞다
 * - 미리 받으면 learn CSS도 로비 문서에 붙는다(강의실에 한 번 다녀온 뒤와 같은 상태)
 */
export const loadLearnApp = () => import("learn/App");

let learnPreload: Promise<unknown> | null = null;

/** learn remote를 미리 받는다. 여러 번 불러도 한 번만 받는다. 실패는 무시한다(클릭 때 다시 시도·에러 화면) */
export function preloadLearn(): void {
    learnPreload ??= loadLearnApp().catch(() => {
        learnPreload = null;
    });
}

/** 데이터 절약 모드(Save-Data). 켜져 있으면 사용자 동작 없는 미리 받기는 하지 않는다 */
export function isSaveData(): boolean {
    return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

/**
 * 브라우저가 한가할 때 learn을 미리 받도록 예약한다. 반환값은 예약 취소 함수.
 * 데이터 절약 모드(Save-Data)면 예약하지 않는다 — 마우스 올림·포커스 때만 받는다.
 */
export function schedulePreloadLearn(): () => void {
    if (isSaveData()) return () => {};
    if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(preloadLearn, { timeout: 3000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preloadLearn, 500);
    return () => clearTimeout(id);
}
