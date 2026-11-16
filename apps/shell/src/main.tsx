import { createRoot } from "react-dom/client";
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
