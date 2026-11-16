/**
 * Sentry 지연 로더 — SDK를 별도 청크로, 첫 화면이 그려진 뒤에 받는다 (이유는 ./sentry.ts 상단 주석).
 *
 * 로드 시점 (먼저 오는 것)
 * 1. 첫 렌더 뒤 유휴 시간. 첫 화면이 remote(room/learn)면 remote 로드가 끝난 뒤의 유휴 시간
 * 2. 에러 발생 (렌더 에러, 전역 에러) — 즉시
 * 3. 안전장치: 15초
 *
 * SDK가 오기 전에 난 전역 에러는 버퍼에 담았다가 초기화 직후 전송한다.
 * 여러 번 불러도 SDK 다운로드·초기화는 한 번만 일어난다.
 */
type SentryModule = typeof import("./sentry");

let loading: Promise<SentryModule> | null = null;
let sentry: SentryModule | null = null;
/** SDK가 로드되면 실행할 작업 (소급 기록 등) */
const afterLoad: ((m: SentryModule) => void)[] = [];
/** SDK 초기화 전에 발생한 전역 에러 */
const earlyErrors: unknown[] = [];

const now = () => performance.timeOrigin + performance.now();

function onEarlyError(e: ErrorEvent) {
    earlyErrors.push(e.error ?? e.message);
    void loadSentry();
}
function onEarlyRejection(e: PromiseRejectionEvent) {
    earlyErrors.push(e.reason);
    void loadSentry();
}

export function loadSentry(): Promise<SentryModule> {
    loading ??= import("./sentry").then((m) => {
        m.initSentry();
        // 이제부터는 Sentry의 전역 핸들러가 받는다 — 중복 보고를 막으려고 임시 리스너를 뗀다
        window.removeEventListener("error", onEarlyError);
        window.removeEventListener("unhandledrejection", onEarlyRejection);
        for (const err of earlyErrors.splice(0)) m.captureEarlyError(err);
        sentry = m;
        for (const fn of afterLoad.splice(0)) fn(m);
        return m;
    });
    return loading;
}

/** SDK가 이미 있으면 바로, 없으면 로드된 뒤 실행 (로드를 일으키지는 않는다) */
function whenLoaded(fn: (m: SentryModule) => void) {
    if (sentry) fn(sentry);
    else afterLoad.push(fn);
}

// ─── 로드 시점 스케줄링 ───

let pendingRemotes = 0;
let waitingForRemotes = false;
let scheduled = false;

function loadWhenIdle() {
    if (scheduled) return;
    scheduled = true;
    const go = () => void loadSentry();
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 200);
}

/**
 * main.tsx에서 렌더 직전에 한 번 호출한다.
 * 전역 에러 임시 리스너를 달고, 첫 렌더 뒤 유휴 시간에 로드 시점을 판단한다.
 */
export function scheduleSentry(): void {
    window.addEventListener("error", onEarlyError);
    window.addEventListener("unhandledrejection", onEarlyRejection);

    const decide = () => {
        // 첫 렌더에서 remote lazy import가 시작됐으면 그게 끝날 때까지 기다린다
        if (pendingRemotes > 0) waitingForRemotes = true;
        else loadWhenIdle();
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(decide, { timeout: 3000 });
    else setTimeout(decide, 0);

    setTimeout(() => void loadSentry(), 15_000);
}

/**
 * remote(room/learn) 동적 import를 Sentry 스팬으로 기록한다.
 *
 * - SDK가 이미 있으면(예: 로비 → 강의실 이동) 로드 동안 자식 스팬을 열어 둔다. Sentry 트랜잭션은
 *   idle 시간 동안 새 스팬이 없으면 끝나는데 remote 로드는 스팬이 안 생겨, 이게 없으면 remote 로드
 *   (약 2.4초) 중에 트랜잭션이 먼저 끝나 API 요청·LCP가 빠진다.
 * - SDK가 아직 없으면(첫 진입) 시각만 재 두었다가 SDK 로드 후 소급 기록한다. 로드를 일으키지 않는다.
 * - 첫 화면의 remote 로드가 끝나면 그때 SDK 로드를 예약한다 (scheduleSentry 참고).
 *
 * import 결과(성공/실패)는 그대로 돌려준다 — 측정이 로딩 동작을 바꾸지 않는다.
 */
export function trackRemoteLoad<T>(remote: string, load: () => Promise<T>): Promise<T> {
    const startTimeMs = now();
    const endLive = sentry?.startRemoteLoadSpan(remote, startTimeMs);
    pendingRemotes++;
    const result = load();
    const finish = () => {
        pendingRemotes--;
        if (endLive) endLive();
        else {
            const endTimeMs = now();
            whenLoaded((m) => m.recordRemoteLoadSpan(remote, startTimeMs, endTimeMs));
        }
        if (waitingForRemotes && pendingRemotes === 0) loadWhenIdle();
    };
    result.then(finish, finish);
    return result;
}

/** 렌더 에러 보고. SDK가 아직 안 왔으면 즉시 받은 뒤 보낸다. 보고 실패는 화면에 영향을 주지 않는다. */
export function reportRenderError(error: unknown, componentStack?: string): void {
    loadSentry()
        .then((m) => m.captureRenderError(error, componentStack))
        .catch(() => {});
}
