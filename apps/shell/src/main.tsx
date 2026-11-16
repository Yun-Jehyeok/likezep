import { createRoot } from "react-dom/client";
// Pretendard 가변 폰트 dynamic subset (자체 호스팅). index.css의 Tailwind @import로 넣으면
// 상대 url() 경로가 깨질 수 있어 따로 import한다. 생성: scripts/generate-font-css.mjs
import "./fonts/pretendard.css";
import "./index.css";
import { App } from "./App";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { scheduleSentry } from "./monitoring";

// Sentry SDK는 첫 화면이 그려진 뒤에 받는다 (에러가 나면 즉시). 이유는 monitoring.ts·sentry.ts 참고
scheduleSentry();

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <GoogleOAuthProvider clientId={googleClientId}>
            <App />
        </GoogleOAuthProvider>
    </ErrorBoundary>,
);
