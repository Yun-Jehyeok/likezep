/**
 * shell이 먼저 시작해 둔 API 요청을 꺼내 쓴다 (강의실 성능 P3c).
 * 계약은 apps/shell/src/app/prefetch.ts 참고: window.__likezepPrefetch[API 경로] = { at, promise }
 *
 * - 한 번 꺼내면 지운다 (카테고리를 바꿨다 돌아오는 등 다음 요청은 새로 받는다)
 * - 너무 오래된 요청은 쓰지 않는다
 * - shell이 없거나(standalone dev) 예전 버전이면 항목이 없어 null → 호출하는 쪽이 직접 요청한다
 */
interface PrefetchEntry {
    at: number;
    promise: Promise<unknown>;
}

declare global {
    interface Window {
        __likezepPrefetch?: Record<string, PrefetchEntry>;
    }
}

const MAX_AGE_MS = 30_000;

export function takePrefetched<T>(path: string): Promise<T> | null {
    const store = window.__likezepPrefetch;
    const entry = store?.[path];
    if (!entry) return null;
    delete store![path];
    if (Date.now() - entry.at > MAX_AGE_MS) return null;
    return entry.promise as Promise<T>;
}
