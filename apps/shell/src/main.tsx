import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { loadSentry } from "./monitoring";

// Sentry SDK는 별도 청크로 받아 렌더와 병렬로 초기화한다 (첫 화면을 막지 않음, sentry.ts 참고)
void loadSentry();

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <GoogleOAuthProvider clientId={googleClientId}>
            <App />
        </GoogleOAuthProvider>
    </ErrorBoundary>,
);
