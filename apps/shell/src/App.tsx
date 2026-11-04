import { useEffect } from "react";
import { useAuthStore, createApiClient } from "@mentoring/ui";
import AppRouter from "./app/router";

const api = createApiClient(import.meta.env.VITE_API_URL);

function getTokenExp(token: string): number | null {
    try {
        return (JSON.parse(atob(token.split(".")[1])) as { exp?: number }).exp ?? null;
    } catch {
        return null;
    }
}

export function App() {
    useEffect(() => {
        const { token, setToken, clearAuth } = useAuthStore.getState();
        if (!token) return;
        const exp = getTokenExp(token);
        if (!exp) return;

        const nowSec = Date.now() / 1000;
        if (nowSec >= exp) {
            clearAuth();
            return;
        }

        // 만료 1일 이내이면 갱신 (sliding session)
        if (exp - nowSec < 86400) {
            api.post<{ token: string }>("/api/auth/refresh", {})
                .then((r) => setToken(r.token))
                .catch(() => {});
        }
    }, []);

    return <AppRouter />;
}
