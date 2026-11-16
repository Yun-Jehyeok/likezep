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

export function prefetchApi(path: string): void {
    if (!localStorage.getItem("auth_token")) return;
    const store = (window.__likezepPrefetch ??= {});
    const prev = store[path];
    if (prev && Date.now() - prev.at < DEDUPE_MS) return;
    const promise = api.get<unknown>(path);
    promise.catch(() => {}); // 꺼내 쓰지 않고 실패해도 unhandled rejection이 남지 않게
    store[path] = { at: Date.now(), promise };
}

/** 강의 목록 화면(/learn)에 들어갈 때 쓰는 API — learn CourseListPage의 기본(전체 카테고리) 요청과 같아야 한다 */
export const LEARN_LIST_API = "/api/courses";
