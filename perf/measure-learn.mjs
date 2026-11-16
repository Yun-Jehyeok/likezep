#!/usr/bin/env node
/**
 * 강의실(learn) 성능 측정 — docs/plans/learn-performance.md §1, §5-0
 *
 * Lighthouse 모바일 기본값과 같은 조건으로 실제 감속을 걸고, 진입 상태별 지표를 N회 측정해 중앙값을 낸다.
 *
 * 상태
 *   cold        캐시 없음 + /learn 직접 진입                       → TTFB·FCP·LCP·전송량·폰트 완료 시점
 *   warm        HTTP 캐시 있음 + 새 탭에서 /learn 진입 (재방문)     → 위와 같음
 *   nav-first   로비 로드가 끝난 뒤 강의실 클릭. learn 청크만 미캐시
 *   nav-early   캐시 없음 + 로비 표시 1초 뒤 클릭 (폰트 다운로드와 대역폭을 나눠 쓰는 실제 첫 방문)
 *   nav-cached  learn 청크·폰트가 캐시된 상태에서 로비 → 강의실 클릭
 *   ※ LCP/FCP는 하드 내비게이션에서만 기록된다. nav-* 는 클릭 시점부터 재는 커스텀 지표다.
 *
 * 사용법
 *   node perf/measure-learn.mjs --login                       # 최초 1회: 브라우저에서 로그인 → 세션 저장
 *   node perf/measure-learn.mjs --label baseline              # 전체 상태 × 5회
 *   node perf/measure-learn.mjs --state cold,warm --runs 3 --label after-p1-font
 *
 * 옵션
 *   --base <url>      측정 대상 (기본 https://like-zep.shop)
 *   --runs <n>        상태별 반복 횟수 (기본 5). 상태를 번갈아 돌려 네트워크 변동을 고르게 섞는다
 *   --state <list>    콤마 구분 (기본: 전체)
 *   --label <name>    결과 파일명 접미사
 *   --local-fonts     로컬 설치 폰트 허용. 기본은 차단한다(개발 PC에 Pretendard가 설치돼 있어 폰트 비용이 0으로 보이는 착시 방지)
 *   --headed          브라우저 창 표시 (디버깅용)
 *   --channel <name>  브라우저 채널 (기본 chromium). Google이 로그인을 막으면 --login --channel chrome
 *   --block <list>    추가로 차단할 URL 패턴 (CDP 와일드카드, 콤마 구분). A/B 실험용
 *                     예) --block "*\/assets/sentry-*"  → Sentry SDK를 뺀 상태를 같은 시간대에 비교
 *
 * 결과: perf/results/<YYYYMMDD-HHmm>-<label>.json + .md
 *   - URL의 쿼리스트링(presigned 서명·보안 토큰)은 저장하지 않는다.
 *   - perf/.auth/ 에는 JWT가 들어 있다(앱 origin의 localStorage만 저장, Google 쿠키 제외). 커밋 금지 (.gitignore 등록).
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));

// ─── 측정 조건: Lighthouse 모바일 기본값 (devtools throttling 상수) ───
const NETWORK = {
    offline: false,
    latency: 150 * 3.75, // 562.5ms
    downloadThroughput: (1.6 * 1024 * 0.9 * 1024) / 8, // bytes/s
    uploadThroughput: (750 * 0.9 * 1024) / 8,
};
const CPU_RATE = 4;
const DEVICE = {
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    locale: "ko-KR",
};
// settle 판정에서 제외할 요청 (Google 로그인 SDK의 백그라운드 요청)
const IGNORE_PENDING = /accounts\.google\.com|play\.google\.com|gstatic\.com|googleapis\.com/;
// 측정 트래픽이 프로덕션 Sentry 실사용자 지표(environment=production)에 섞이지 않도록 이벤트 전송만 막는다.
// SDK 청크 다운로드는 막지 않는다 — 실제 사용자와 같은 로드 비용을 재야 한다.
// Playwright route()는 HTTP 캐시를 꺼 버려 warm/nav-cached 측정을 망치므로 CDP 차단을 쓴다.
const DEFAULT_BLOCKED_URLS = ["*ingest*sentry.io*"];
const ALL_STATES = ["cold", "warm", "nav-first", "nav-early", "nav-cached"];

// ─── 인자 ───
const { values: args } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
        base: { type: "string", default: "https://like-zep.shop" },
        runs: { type: "string", default: "5" },
        state: { type: "string", default: ALL_STATES.join(",") },
        label: { type: "string", default: "run" },
        "local-fonts": { type: "boolean", default: false },
        headed: { type: "boolean", default: false },
        channel: { type: "string", default: "chromium" },
        login: { type: "boolean", default: false },
        block: { type: "string", default: "" },
    },
});
const BLOCKED_URLS = [...DEFAULT_BLOCKED_URLS, ...args.block.split(",").map((s) => s.trim()).filter(Boolean)];
const BASE = args.base.replace(/\/$/, "");
const BASE_ORIGIN = new URL(BASE).origin;
const AUTH_FILE = join(HERE, ".auth", `${new URL(BASE).host}.json`);
const RUNS = Number(args.runs);
const STATES = args.state.split(",").map((s) => s.trim()).filter(Boolean);
const LOCAL_FONTS = args["local-fonts"];

for (const s of STATES) if (!ALL_STATES.includes(s)) fail(`알 수 없는 상태: ${s} (가능: ${ALL_STATES.join(", ")})`);
if (!Number.isInteger(RUNS) || RUNS < 1) fail(`--runs 는 1 이상 정수여야 합니다: ${args.runs}`);

class AuthError extends Error {}

function fail(msg) {
    console.error(`\n✖ ${msg}`);
    process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v) => (v == null ? null : Math.round(v));

/** 쿼리스트링 제거 + 같은 origin은 경로만 */
function cleanUrl(url) {
    if (!url) return url;
    try {
        const u = new URL(url);
        return u.origin === BASE_ORIGIN ? u.pathname : u.origin + u.pathname;
    } catch {
        return url;
    }
}

// ─── 로그인 (세션 저장) ───
async function login() {
    const browser = await chromium.launch({ headless: false, channel: args.channel });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    console.log("브라우저 창에서 Google 로그인을 완료하세요. (최대 5분 대기)");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 300_000 });
    await page.waitForFunction(() => {
        try {
            return !!JSON.parse(localStorage.getItem("auth_store") ?? "{}").state?.token;
        } catch {
            return false;
        }
    });
    // 앱 origin의 localStorage(JWT)만 저장한다. Google 계정 쿠키 등은 디스크에 남기지 않는다.
    const state = await ctx.storageState();
    mkdirSync(dirname(AUTH_FILE), { recursive: true });
    writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: state.origins.filter((o) => o.origin === BASE_ORIGIN) }, null, 2));
    await browser.close();
    console.log(`✔ 세션 저장: ${AUTH_FILE}`);
}

/** 저장된 세션의 JWT 만료 확인 */
function checkAuthFile() {
    if (!existsSync(AUTH_FILE)) fail(`세션 파일이 없습니다. 먼저 실행: node perf/measure-learn.mjs --login${args.base !== "https://like-zep.shop" ? ` --base ${BASE}` : ""}`);
    const state = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
    const ls = state.origins?.find((o) => o.origin === BASE_ORIGIN)?.localStorage ?? [];
    const store = ls.find((i) => i.name === "auth_store");
    const token = store && JSON.parse(store.value).state?.token;
    const role = store && JSON.parse(store.value).state?.user?.role;
    if (!token) fail("세션 파일에 토큰이 없습니다. --login 을 다시 실행하세요.");
    const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp;
    const leftH = (exp * 1000 - Date.now()) / 3_600_000;
    if (leftH <= 0) fail("세션이 만료됐습니다. --login 을 다시 실행하세요.");
    return { role, leftH };
}

// ─── 페이지 계측 ───

/** 페이지 로드 전에 주입: LCP·long task 수집 */
function initScript() {
    const describe = (el) => {
        if (!el) return null;
        const text = el.textContent?.trim();
        return el.tagName.toLowerCase() + (text ? ` "${text.slice(0, 20)}"` : "");
    };
    window.__perf = { lcp: [], longTasks: [] };
    try {
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__perf.lcp.push({ t: e.startTime, size: e.size, el: describe(e.element), url: e.url || null });
        }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* 미지원 */ }
    try {
        new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]);
        }).observe({ type: "longtask", buffered: true });
    } catch { /* 미지원 */ }
}

/** CDP로 감속·로컬 폰트 차단을 걸고 요청을 추적한다. 시각은 epoch ms로 환산한다. */
async function instrument(page, { throttle }) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: BLOCKED_URLS });
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await cdp.send("CSS.setLocalFontsEnabled", { enabled: LOCAL_FONTS });
    const reqs = new Map();
    cdp.on("Network.requestWillBeSent", (e) => {
        if (!/^https?:/.test(e.request.url)) return;
        reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, offset: e.wallTime - e.timestamp, startTs: e.timestamp });
    });
    cdp.on("Network.requestServedFromCache", (e) => {
        const r = reqs.get(e.requestId);
        if (r) r.fromCache = true;
    });
    cdp.on("Network.responseReceived", (e) => {
        const r = reqs.get(e.requestId);
        if (!r) return;
        r.status = e.response.status;
        if (e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache) r.fromCache = true;
    });
    cdp.on("Network.loadingFinished", (e) => {
        const r = reqs.get(e.requestId);
        if (r) Object.assign(r, { endTs: e.timestamp, bytes: e.encodedDataLength });
    });
    cdp.on("Network.loadingFailed", (e) => {
        const r = reqs.get(e.requestId);
        if (r) Object.assign(r, { endTs: e.timestamp, failed: e.errorText });
    });

    const tracker = {
        cdp,
        async throttle(on) {
            await cdp.send("Network.emulateNetworkConditions", on ? NETWORK : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: on ? CPU_RATE : 1 });
        },
        pendingCount() {
            let n = 0;
            for (const r of reqs.values()) if (r.endTs === undefined && !IGNORE_PENDING.test(r.url)) n++;
            return n;
        },
        list() {
            return [...reqs.values()].map((r) => ({
                url: r.url,
                method: r.method,
                type: r.type,
                status: r.status ?? null,
                fromCache: !!r.fromCache,
                failed: r.failed ?? null,
                bytes: r.bytes ?? 0,
                start: (r.startTs + r.offset) * 1000,
                end: r.endTs === undefined ? null : (r.endTs + r.offset) * 1000,
            }));
        },
    };
    await tracker.throttle(throttle);
    return tracker;
}

/** 진행 중인 요청이 quietMs 동안 0이면 settle. 로비의 5초 polling 사이 공백에서 판정된다. */
async function waitSettled(tracker, { quietMs = 1500, timeoutMs = 60_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let quietSince = null;
    while (Date.now() < deadline) {
        if (tracker.pendingCount() === 0) {
            quietSince ??= Date.now();
            if (Date.now() - quietSince >= quietMs) return true;
        } else quietSince = null;
        await sleep(250);
    }
    return false;
}

async function goto(page, path, opts = {}) {
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000, ...opts });
    if (new URL(page.url()).pathname.startsWith("/login")) throw new AuthError("로그인 페이지로 이동됨 — 세션 만료. --login 을 다시 실행하세요.");
}

function summarizeRequests(reqs) {
    const fonts = reqs.filter((r) => /\.woff2?$/.test(new URL(r.url).pathname));
    const fontNet = fonts.filter((r) => !r.fromCache && r.end != null);
    const api = reqs.find((r) => r.method === "GET" && new URL(r.url).pathname === "/api/courses");
    return {
        transferKB: reqs.reduce((a, r) => a + r.bytes, 0) / 1024,
        fontKB: fonts.reduce((a, r) => a + r.bytes, 0) / 1024,
        fontsDone: fontNet.length ? Math.max(...fontNet.map((r) => r.end)) : null,
        apiStart: api?.start ?? null,
        apiEnd: api?.end ?? null,
        requests: reqs.length,
        cachedRequests: reqs.filter((r) => r.fromCache).length,
    };
}

/** 하드 내비게이션(cold/warm) 지표 수집. 요청 시각은 navigation 시작 기준으로 환산한다. */
async function collectLoad(page, tracker) {
    const p = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
        return {
            timeOrigin: performance.timeOrigin,
            ttfb: nav?.responseStart ?? null,
            fcp: fcp?.startTime ?? null,
            lcp: window.__perf.lcp.at(-1) ?? null,
            longTaskTotal: window.__perf.longTasks.reduce((a, [, d]) => a + d, 0),
            cardCount: document.querySelectorAll("main button h3").length,
        };
    });
    const reqs = tracker.list().map((r) => ({ ...r, start: r.start - p.timeOrigin, end: r.end == null ? null : r.end - p.timeOrigin }));
    return {
        ttfb: p.ttfb,
        fcp: p.fcp,
        lcp: p.lcp?.t ?? null,
        lcpElement: p.lcp?.el ?? null,
        lcpUrl: cleanUrl(p.lcp?.url) || null,
        longTaskTotal: p.longTaskTotal,
        cardCount: p.cardCount,
        ...summarizeRequests(reqs),
        waterfall: waterfall(reqs),
    };
}

/** 로비 "강의실" 클릭 → 마일스톤까지의 시간. ⚠ DOM 의존: LobbyPage·CourseListPage 마크업이 바뀌면 함께 수정한다. */
function navProbe() {
    const root = document.getElementById("root");
    const target = [...document.querySelectorAll("header *")].find((el) => el.children.length === 0 && el.textContent?.trim() === "강의실");
    if (!target) throw new Error("로비 헤더에서 '강의실' 진입 요소를 찾지 못함");
    const m = {};
    const t0 = performance.now();
    target.click();
    return new Promise((resolve) => {
        const tick = () => {
            const t = performance.now() - t0;
            const empty = !root.textContent.trim();
            if (empty && m.blankStart === undefined) m.blankStart = t;
            if (!empty && m.blankStart !== undefined && m.blankEnd === undefined) m.blankEnd = t;
            // 헤더: 강의실 페이지 제목이 보이는 시점 (스켈레톤에 포함돼도 인정 — 사용자가 화면 틀을 보는 시점)
            if (m.header === undefined && location.pathname.startsWith("/learn") && document.querySelector("main h1")?.textContent?.trim() === "강의실") m.header = t;
            // 카드: 실제 강의 카드 제목이 렌더된 시점
            if (m.cards === undefined && document.querySelectorAll("main button h3").length > 0) m.cards = t;
            // 첫 화면 썸네일: 뷰포트 안의 이미지가 모두 디코딩된 시점 (화면 밖 lazy 이미지는 제외)
            const imgs = [...document.querySelectorAll("main img")].filter((i) => i.getBoundingClientRect().top < innerHeight);
            if (m.thumbs === undefined && imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)) m.thumbs = t;
            if (m.thumbs !== undefined || t > 60_000) {
                resolve({ ...m, clickEpoch: performance.timeOrigin + t0, timedOut: m.thumbs === undefined, cardCount: document.querySelectorAll("main button h3").length });
            } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function measureNav(page, tracker) {
    const m = await page.evaluate(navProbe);
    await waitSettled(tracker, { timeoutMs: 30_000 });
    const reqs = tracker
        .list()
        .filter((r) => r.start >= m.clickEpoch)
        .map((r) => ({ ...r, start: r.start - m.clickEpoch, end: r.end == null ? null : r.end - m.clickEpoch }));
    const s = summarizeRequests(reqs);
    return {
        blank: m.blankStart === undefined ? 0 : (m.blankEnd ?? m.thumbs) - m.blankStart,
        header: m.header ?? null,
        cards: m.cards ?? null,
        thumbs: m.thumbs ?? null,
        timedOut: m.timedOut,
        cardCount: m.cardCount,
        apiStart: s.apiStart,
        transferKB: s.transferKB,
        requests: s.requests,
        cachedRequests: s.cachedRequests,
        waterfall: waterfall(reqs),
    };
}

function waterfall(reqs) {
    return reqs
        .filter((r) => !IGNORE_PENDING.test(r.url))
        .sort((a, b) => a.start - b.start)
        .map((r) => `${String(round(r.start)).padStart(6)} → ${String(r.end == null ? "-" : round(r.end)).padStart(6)}ms ${String(round(r.bytes / 1024)).padStart(4)}KB ${r.fromCache ? "(cache) " : ""}${r.method} ${cleanUrl(r.url)}`);
}

// ─── 상태별 시나리오 ───
const newContext = (browser) => browser.newContext({ ...DEVICE, storageState: AUTH_FILE });

/** 캐시만 채우는 사전 방문 (감속 없음, 로컬 폰트 설정은 동일하게 적용해야 폰트가 캐시된다) */
async function prime(ctx, path) {
    const page = await ctx.newPage();
    const tr = await instrument(page, { throttle: false });
    await goto(page, path);
    await waitSettled(tr);
    await page.close();
}

const SCENARIOS = {
    async cold(browser) {
        const ctx = await newContext(browser);
        try {
            const page = await ctx.newPage();
            await page.addInitScript(initScript);
            const tr = await instrument(page, { throttle: true });
            await tr.cdp.send("Network.clearBrowserCache");
            await goto(page, "/learn");
            const settled = await waitSettled(tr);
            return { settled, ...(await collectLoad(page, tr)) };
        } finally {
            await ctx.close();
        }
    },
    async warm(browser) {
        const ctx = await newContext(browser);
        try {
            await prime(ctx, "/learn");
            const page = await ctx.newPage();
            await page.addInitScript(initScript);
            const tr = await instrument(page, { throttle: true });
            await goto(page, "/learn");
            const settled = await waitSettled(tr);
            return { settled, ...(await collectLoad(page, tr)) };
        } finally {
            await ctx.close();
        }
    },
    async "nav-first"(browser) {
        const ctx = await newContext(browser);
        try {
            const page = await ctx.newPage();
            const tr = await instrument(page, { throttle: false });
            await goto(page, "/lobby");
            await waitSettled(tr);
            await tr.throttle(true);
            return await measureNav(page, tr);
        } finally {
            await ctx.close();
        }
    },
    async "nav-early"(browser) {
        const ctx = await newContext(browser);
        try {
            const page = await ctx.newPage();
            const tr = await instrument(page, { throttle: true });
            await goto(page, "/lobby", { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => [...document.querySelectorAll("header *")].some((el) => el.children.length === 0 && el.textContent?.trim() === "강의실"), null, { timeout: 60_000 });
            await sleep(1000);
            return await measureNav(page, tr);
        } finally {
            await ctx.close();
        }
    },
    async "nav-cached"(browser) {
        const ctx = await newContext(browser);
        try {
            await prime(ctx, "/learn");
            const page = await ctx.newPage();
            const tr = await instrument(page, { throttle: false });
            await goto(page, "/lobby");
            await waitSettled(tr);
            await tr.throttle(true);
            return await measureNav(page, tr);
        } finally {
            await ctx.close();
        }
    },
};

// ─── 집계·출력 ───
const LOAD_METRICS = [
    ["ttfb", "TTFB", "ms"],
    ["fcp", "FCP", "ms"],
    ["lcp", "LCP", "ms"],
    ["apiStart", "/api/courses 요청 시작", "ms"],
    ["fontsDone", "폰트 다운로드 완료", "ms"],
    ["transferKB", "총 전송량", "KB"],
    ["fontKB", "폰트 전송량", "KB"],
    ["requests", "요청 수", ""],
    ["longTaskTotal", "Long task 합계", "ms"],
];
const NAV_METRICS = [
    ["blank", "빈 화면 지속", "ms"],
    ["header", "클릭 → 헤더", "ms"],
    ["cards", "클릭 → 카드", "ms"],
    ["thumbs", "클릭 → 첫 화면 썸네일", "ms"],
    ["apiStart", "클릭 → API 요청 시작", "ms"],
    ["transferKB", "클릭 후 전송량", "KB"],
    ["requests", "클릭 후 요청 수", ""],
];
const metricsOf = (state) => (state.startsWith("nav") ? NAV_METRICS : LOAD_METRICS);

function stats(values) {
    const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    return { median: round(median), min: round(v[0]), max: round(v.at(-1)), n: v.length };
}

const fmt = (n) => (n == null ? "-" : n.toLocaleString("en-US"));
/** 터미널 정렬용: 한글 등 전각 문자는 폭 2로 계산 */
const padDisplay = (s, width) => s + " ".repeat(Math.max(0, width - [...s].reduce((w, c) => w + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)));

function summarize(results) {
    const summary = {};
    for (const state of STATES) {
        const ok = results.filter((r) => r.state === state && !r.error);
        summary[state] = { runs: ok.length, failed: results.filter((r) => r.state === state && r.error).length, metrics: {} };
        for (const [key] of metricsOf(state)) summary[state].metrics[key] = stats(ok.map((r) => r[key]));
        if (!state.startsWith("nav")) {
            const els = ok.map((r) => r.lcpElement).filter(Boolean);
            summary[state].lcpElement = els.sort((a, b) => els.filter((x) => x === b).length - els.filter((x) => x === a).length)[0] ?? null;
        }
    }
    return summary;
}

function printSummary(summary) {
    for (const state of STATES) {
        const s = summary[state];
        console.log(`\n■ ${state}  (성공 ${s.runs}회${s.failed ? `, 실패 ${s.failed}회` : ""})${s.lcpElement ? `  LCP 요소: ${s.lcpElement}` : ""}`);
        for (const [key, label, unit] of metricsOf(state)) {
            const m = s.metrics[key];
            if (!m) continue;
            console.log(`  ${padDisplay(label, 26)} ${fmt(m.median).padStart(8)} ${unit.padEnd(2)}  (${fmt(m.min)}–${fmt(m.max)})`);
        }
    }
}

function markdown(meta, summary) {
    const lines = [
        `# 강의실 성능 측정 — ${meta.label}`,
        "",
        `- 일시: ${meta.startedAt}`,
        `- 대상: ${meta.base}`,
        `- 조건: latency ${NETWORK.latency}ms, down ${(NETWORK.downloadThroughput * 8 / 1024).toFixed(0)}Kbps, CPU ${CPU_RATE}x, ${DEVICE.viewport.width}×${DEVICE.viewport.height} @${DEVICE.deviceScaleFactor}x, 로컬 폰트 ${LOCAL_FONTS ? "허용" : "차단"}`,
        `- 반복: 상태별 ${meta.runs}회, 중앙값 (최소–최대)`,
        `- 브라우저: ${meta.browser}`,
        `- 측정 PC CPU 사용률(측정 기간 평균, 측정 브라우저 포함): ${meta.hostCpuBusyPct ?? "-"}%`,
        ...(meta.blockedUrls?.length ? [`- 차단 URL: ${meta.blockedUrls.join(", ")}`] : []),
        "",
    ];
    for (const state of STATES) {
        const s = summary[state];
        lines.push(`## ${state} (성공 ${s.runs}회${s.failed ? `, 실패 ${s.failed}회` : ""})`, "");
        if (s.lcpElement) lines.push(`LCP 요소: \`${s.lcpElement}\``, "");
        lines.push("| 지표 | 중앙값 | 범위 |", "|---|---|---|");
        for (const [key, label, unit] of metricsOf(state)) {
            const m = s.metrics[key];
            if (m) lines.push(`| ${label} | ${fmt(m.median)} ${unit} | ${fmt(m.min)}–${fmt(m.max)} |`);
        }
        lines.push("");
    }
    return lines.join("\n");
}

/**
 * 측정 PC의 CPU 사용률(%) — 측정 기간 동안 전체 코어 평균. 측정 브라우저 자신의 사용분도 포함된다.
 * CPU 감속(4x)은 PC 성능에 비례해 걸리므로, 다른 무거운 작업이 돌면 long task·FCP가 흔들린다.
 * 2026-11-16 밤 baseline과 낮 측정을 비교했다가 환경 차이를 개선/회귀로 착각할 뻔했다 → 결과에 남긴다.
 */
function cpuSnapshot() {
    return cpus().reduce((a, c) => {
        const t = c.times;
        a.busy += t.user + t.nice + t.sys + t.irq;
        a.total += t.user + t.nice + t.sys + t.irq + t.idle;
        return a;
    }, { busy: 0, total: 0 });
}
function cpuBusyPct(from, to) {
    const total = to.total - from.total;
    return total > 0 ? Math.round(((to.busy - from.busy) / total) * 1000) / 10 : null;
}

function stamp(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// ─── 실행 ───
async function main() {
    if (args.login) return login();

    const { role, leftH } = checkAuthFile();
    console.log(`세션: ${role ?? "?"} 계정, 만료까지 ${leftH.toFixed(1)}시간`);
    if (role !== "admin") console.warn("⚠ admin 계정이 아닙니다. 테스트 강의(관리자 전용)가 보이지 않아 카드·썸네일 지표가 비어 있을 수 있습니다.");

    const startedAt = new Date();
    const browser = await chromium.launch({ headless: !args.headed, channel: args.channel });
    const meta = {
        label: args.label,
        base: BASE,
        startedAt: startedAt.toISOString(),
        runs: RUNS,
        states: STATES,
        localFonts: LOCAL_FONTS,
        blockedUrls: BLOCKED_URLS,
        network: NETWORK,
        cpuRate: CPU_RATE,
        device: { ...DEVICE, userAgent: undefined },
        browser: `${args.channel} ${browser.version()}`,
    };
    console.log(`측정: ${STATES.join(", ")} × ${RUNS}회 (${meta.browser}, 로컬 폰트 ${LOCAL_FONTS ? "허용" : "차단"})`);

    const results = [];
    const cpuStart = cpuSnapshot();
    try {
        // 상태를 번갈아 돌린다 — 시간대별 네트워크 변동이 특정 상태에 몰리지 않게
        for (let run = 1; run <= RUNS; run++) {
            for (const state of STATES) {
                const t = Date.now();
                try {
                    const r = await SCENARIOS[state](browser);
                    results.push({ state, run, ...r });
                    const brief = state.startsWith("nav")
                        ? `헤더 ${fmt(round(r.header))} / 카드 ${fmt(round(r.cards))} / 썸네일 ${fmt(round(r.thumbs))}ms, 빈 화면 ${fmt(round(r.blank))}ms`
                        : `FCP ${fmt(round(r.fcp))} / LCP ${fmt(round(r.lcp))}ms, ${fmt(round(r.transferKB))}KB${r.settled ? "" : " (settle 타임아웃)"}`;
                    console.log(`[${state} ${run}/${RUNS}] ${brief}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
                } catch (e) {
                    if (e instanceof AuthError) throw e;
                    results.push({ state, run, error: String(e?.message ?? e) });
                    console.log(`[${state} ${run}/${RUNS}] ✖ ${e?.message ?? e}`);
                }
            }
        }
    } finally {
        await browser.close();
    }
    meta.hostCpuBusyPct = cpuBusyPct(cpuStart, cpuSnapshot());

    const summary = summarize(results);
    printSummary(summary);
    console.log(`\n측정 PC CPU 사용률(측정 기간 평균, 측정 브라우저 포함): ${meta.hostCpuBusyPct}%`);

    const resultsDir = join(HERE, "results");
    mkdirSync(resultsDir, { recursive: true });
    const name = `${stamp(startedAt)}-${args.label}`;
    const rounded = results.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? round(v) : v])));
    writeFileSync(join(resultsDir, `${name}.json`), JSON.stringify({ meta, summary, runs: rounded }, null, 2));
    writeFileSync(join(resultsDir, `${name}.md`), markdown(meta, summary));
    console.log(`\n✔ 결과 저장: perf/results/${name}.json, .md`);
}

main().catch((e) => fail(e?.message ?? String(e)));
