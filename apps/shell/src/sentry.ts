/**
 * 클라이언트 Sentry 초기화 — MF host(shell)에서 한 번만 한다.
 *
 * ⚠️ 이 파일은 직접 import하지 말고 `./monitoring`의 loadSentry()로만 불러온다.
 * SDK가 gzip 약 52KB라 정적으로 넣으면 모든 화면의 첫 로드 경로가 그만큼 무거워진다.
 * 동적 import로 별도 청크를 만들어 첫 렌더를 막지 않게 한다. LCP/FCP 등은 브라우저가
 * buffered로 보관하므로 초기화가 조금 늦어도 pageload 지표는 그대로 수집된다.
 *
 * shell/room/learn은 같은 window에서 돌기 때문에 여기서 만든 클라이언트를 remote도 함께 쓴다.
 * @sentry/* 는 SDK 버전별 전역 저장소(globalThis.__SENTRY__[버전])를 쓰므로, room이 따로 번들한
 * 같은 버전의 @sentry/react(peerManager의 WebRTC 품질 경고)도 이 클라이언트로 전송된다.
 * → room/learn의 @sentry/react 버전은 shell과 같게 유지할 것.
 *
 * - 에러: 전부 수집 (전역 핸들러 + main.tsx의 ErrorBoundary)
 * - 트레이싱: 강의실(/learn) pageload·navigation만 100% 샘플. 강의실 성능 개선 전후의
 *   실사용자 지표(LCP/FCP 등 web vitals, 로비 → 강의실 SPA 이동 시간)를 모으는 목적이다.
 *   나머지 화면은 스팬 한도를 아끼려고 샘플하지 않는다.
 */
import * as Sentry from "@sentry/react";

/** `/learn/12` → `/learn/:courseId`처럼 경로를 라우트 단위로 묶는다 (트랜잭션 그룹핑용) */
export function routeName(pathname: string): string {
    const path = pathname.replace(/\/+$/, "") || "/";
    if (/^\/learn\/[^/]+$/.test(path)) return "/learn/:courseId";
    if (/^\/room\/[^/]+$/.test(path)) return "/room/:roomId";
    return path;
}

/** 트레이싱을 샘플할 라우트인지 — 지금은 강의실만 */
export function isTracedRoute(name: string): boolean {
    return name === "/learn" || name.startsWith("/learn/");
}

// 리소스 스팬(스크립트·CSS·이미지 등 파일 하나당 스팬 1개)은 강의실 첫 진입만으로 40개 넘게 생겨
// 스팬 한도를 빠르게 쓴다. 요청 waterfall은 perf/measure-learn.mjs로 따로 재므로 여기서는 뺀다.
// web vitals, API 요청(http.client), long task 스팬은 그대로 남는다.
const IGNORED_RESOURCE_SPANS = [
    "resource.script",
    "resource.link",
    "resource.css",
    "resource.img",
    "resource.other",
    "resource.video",
    "resource.audio",
    "resource.iframe",
    "resource.beacon",
];

export function initSentry(): void {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return; // 로컬 개발 등 DSN이 없으면 끈다

    Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE,
        integrations: [
            Sentry.browserTracingIntegration({
                // React Router 전용 통합 대신 History API 기반 기본 통합을 쓴다.
                // remote(room/learn) 안쪽 Routes까지 이름을 맞추려면 경로를 직접 정규화하는 편이 단순하다.
                beforeStartSpan: (options) => ({
                    ...options,
                    name: routeName(options.name),
                    attributes: {
                        ...options.attributes,
                        [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: "route",
                    },
                }),
                ignoreResourceSpans: IGNORED_RESOURCE_SPANS,
            }),
        ],
        tracesSampler: ({ name }) => (isTracedRoute(name) ? 1 : 0),
        // API(api.like-zep.shop)·S3는 다른 origin이다. sentry-trace/baggage 헤더를 붙이면
        // CORS 허용 헤더 조건이 바뀌므로 어디에도 붙이지 않는다 (서버 트레이싱도 꺼져 있음).
        tracePropagationTargets: [],
    });
}

/**
 * MF remote 로드 구간 스팬을 연다. 활성 pageload/navigation 스팬의 자식이 되어, 로드가 끝날 때까지
 * 트랜잭션이 idle(1초)로 끝나지 않게 붙잡는다. 반환한 함수를 호출하면 스팬이 끝난다.
 * @param startTimeMs 실제 로드 시작 시각(epoch ms) — SDK가 늦게 와도 시작 시점을 맞추기 위함
 */
export function startRemoteLoadSpan(remote: string, startTimeMs: number): () => void {
    const span = Sentry.startInactiveSpan({
        name: `remote ${remote}`,
        op: "mf.remote.load",
        startTime: startTimeMs / 1000,
    });
    return () => span.end();
}

/** ErrorBoundary가 잡은 렌더 에러 전송 (React 컴포넌트 스택 포함) */
export function captureRenderError(error: unknown, componentStack?: string): void {
    Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined);
}
