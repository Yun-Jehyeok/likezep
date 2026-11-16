import { createRoot } from "react-dom/client";
// Pretendard 가변 폰트 dynamic subset (자체 호스팅). 생성: scripts/generate-font-css.mjs
// @font-face 92개(gzip 약 13KB)를 일반 import로 넣으면 렌더 차단 CSS가 커지고, 그 CSS를 다 받을 때까지
// 스크립트 실행이 멈춰 MF remote 로드 체인이 늦어진다(강의실 cold FCP +136ms, 2026-11-16 측정).
// 그래서 URL만 받아 스크립트로 <link>를 붙인다. 스크립트가 넣은 스타일시트는 렌더·스크립트를 막지 않는다.
import pretendardCssUrl from "./fonts/pretendard.css?url";
import "./index.css";
import { App } from "./App";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { scheduleSentry } from "./monitoring";

loadFontStylesheet(pretendardCssUrl);

// Sentry SDK는 첫 화면이 그려진 뒤에 받는다 (에러가 나면 즉시). 이유는 monitoring.ts·sentry.ts 참고
scheduleSentry();

function loadFontStylesheet(href: string) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    // MF remote 청크와 회선을 다투지 않게 낮은 우선순위로 받는다 (요청 사이 빈 구간에 받힌다)
    link.setAttribute("fetchpriority", "low");
    document.head.appendChild(link);
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <GoogleOAuthProvider clientId={googleClientId}>
            <App />
        </GoogleOAuthProvider>
    </ErrorBoundary>,
);
