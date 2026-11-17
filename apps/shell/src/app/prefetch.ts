import { createApiClient } from "@mentoring/ui";

/**
 * API 선행 요청 (강의실 성능 P3c, docs/plans/learn-performance.md)
 *
 * 강의실 목록 API는 learn remote를 다 받은 뒤 CourseListPage가 마운트돼야 요청됐다
 * (감속 cold 약 6.7초, 로비에서 이동 시 클릭 약 2.5초 뒤). shell이 /learn에 들어서는 순간 먼저 요청해 두고,
 * learn이 같은 요청을 꺼내 쓴다. remote 로딩과 데이터 요청이 병렬이 된다.
 *
 * 계약 (learn: apps/learn/src/prefetch.ts)
 * - window.__likezepPrefetch[API 경로] = { at: 요청 시각(ms), promise: 응답 JSON }
 * - learn은 한 번 꺼내면 지운다. 없거나 오래됐거나 실패했으면 직접 요청한다
 * - @mentoring/ui(shared)에 넣지 않은 이유: shell·learn 배포 순서가 어긋나도 깨지지 않게 (없으면 그냥 직접 요청)
 *
 * /learn 하드 내비게이션(첫 진입·재방문)은 index.html <head> 인라인 스크립트가 HTML 단계에서 같은 항목을 먼저 등록한다
 * (§5.1 ①). 그 경우 아래 prefetchApi는 DEDUPE_MS 안이라 건너뛰고, 썸네일도 인라인 스크립트가 받는다.
 * 여기는 로비 → 강의실 같은 SPA 이동을 맡는다. 요청 모양·썸네일 어림을 바꾸면 인라인 스크립트도 같이 고칠 것.
 */
export interface PrefetchEntry {
    at: number;
    promise: Promise<unknown>;
}

declare global {
    interface Window {
        __likezepPrefetch?: Record<string, PrefetchEntry>;
    }
}

const api = createApiClient(import.meta.env.VITE_API_URL);

/** 같은 경로를 이 시간 안에 다시 부르면 새로 요청하지 않는다 */
const DEDUPE_MS = 10_000;

/**
 * @param onData 응답이 오면 바로 실행할 후속 작업 (예: 첫 화면 썸네일 미리 받기). 실패하면 실행하지 않는다
 */
export function prefetchApi(path: string, onData?: (data: unknown) => void): void {
    if (!localStorage.getItem("auth_token")) return;
    const store = (window.__likezepPrefetch ??= {});
    const prev = store[path];
    if (prev && Date.now() - prev.at < DEDUPE_MS) return;
    const promise = api.get<unknown>(path);
    promise.catch(() => {}); // 꺼내 쓰지 않고 실패해도 unhandled rejection이 남지 않게
    if (onData) promise.then(onData, () => {});
    store[path] = { at: Date.now(), promise };
}

/** 강의 목록 화면(/learn)에 들어갈 때 쓰는 API — learn CourseListPage의 기본(전체 카테고리) 요청과 같아야 한다 */
export const LEARN_LIST_API = "/api/courses";

/**
 * 강의 목록 응답이 오면 첫 화면에 보일 썸네일을 바로 받기 시작한다 (P3c 후속).
 *
 * cold에서 API는 약 4.9초에 끝나는데, 썸네일은 learn remote가 그려진 뒤(약 6.8초)에야 요청돼 LCP가 그만큼 늦었다.
 * learn은 같은 응답(같은 presigned URL)으로 <img>를 그리므로, 여기서 받아 둔 이미지를 그대로 쓴다
 * (같은 문서·같은 URL·같은 CORS 모드 → 메모리 캐시).
 *
 * 몇 장 받을지: learn CourseListPage 레이아웃(grid-cols-1 / sm:2 / lg:3)으로 뷰포트에 들어올 카드 수를 어림한다.
 * 실측(2026-11-16): 첫 줄 위치 1280px 폭 234px / 412px 폭 276px(칩이 여러 줄), 줄 간격 311px.
 * 화면 밖 썸네일까지 받으면 첫 화면 썸네일과 회선을 나눠 쓴다.
 * ⚠ CourseListPage 레이아웃을 바꾸면 아래 상수와 index.html 인라인 스크립트의 같은 어림을 함께 맞춘다.
 */
const CARD_ROW_HEIGHT = 311;
const FIRST_ROW_TOP = 240;
/** GC로 요청이 끊기지 않게 잠시 붙잡아 둔다 */
const preloading: HTMLImageElement[] = [];

function firstScreenCardCount(): number {
    const w = window.innerWidth;
    const cols = w >= 1024 ? 3 : w >= 640 ? 2 : 1;
    const rows = Math.max(1, Math.ceil((window.innerHeight - FIRST_ROW_TOP) / CARD_ROW_HEIGHT));
    return cols * rows;
}

export function preloadListThumbnails(data: unknown): void {
    if (!Array.isArray(data)) return;
    const urls = data
        .slice(0, firstScreenCardCount())
        .map((c) => (c as { thumbnail?: unknown })?.thumbnail)
        .filter((u): u is string => typeof u === "string" && u.length > 0);
    for (const url of new Set(urls)) {
        const img = new Image();
        img.setAttribute("fetchpriority", "high");
        img.decoding = "async";
        img.src = url;
        preloading.push(img);
    }
    setTimeout(() => preloading.splice(0), 30_000);
}
