/**
 * Sentry 지연 로더 — SDK를 별도 청크로 받아 첫 렌더를 막지 않는다 (이유는 ./sentry.ts 상단 주석).
 * 여러 번 불러도 SDK 다운로드·초기화는 한 번만 일어난다.
 */
type SentryModule = typeof import("./sentry");

let loading: Promise<SentryModule> | null = null;

export function loadSentry(): Promise<SentryModule> {
    loading ??= import("./sentry").then((m) => {
        m.initSentry();
        return m;
    });
    return loading;
}

/**
 * remote(room/learn) 동적 import를 Sentry 스팬으로 감싼다.
 *
 * 왜: Sentry의 pageload/navigation 트랜잭션은 1초간 새 스팬이 없으면 끝난다. MF remote 로드는
 * 동적 import라 스팬이 생기지 않아서, 로비 → 강의실 이동(remote 로드 약 2.4초) 중에 트랜잭션이
 * 먼저 끝나 버리고 API 요청·LCP가 트랜잭션 밖으로 빠진다. 로드 동안 자식 스팬을 열어 두면
 * 트랜잭션이 유지되고, 이 스팬 길이가 곧 "remote 로드 시간" 실사용자 지표가 된다.
 *
 * import 결과(성공/실패)는 그대로 돌려준다 — 측정이 로딩 동작을 바꾸지 않는다.
 */
export function trackRemoteLoad<T>(remote: string, load: () => Promise<T>): Promise<T> {
    const startTimeMs = performance.timeOrigin + performance.now();
    const result = load();
    const endSpan = loadSentry()
        .then((m) => m.startRemoteLoadSpan(remote, startTimeMs))
        .catch(() => undefined);
    const finish = () => void endSpan.then((end) => end?.());
    result.then(finish, finish);
    return result;
}

/** 렌더 에러 보고. SDK가 아직 안 왔으면 받은 뒤 보낸다. 보고 실패는 화면에 영향을 주지 않는다. */
export function reportRenderError(error: unknown, componentStack?: string): void {
    loadSentry()
        .then((m) => m.captureRenderError(error, componentStack))
        .catch(() => {});
}
