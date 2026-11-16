import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportRenderError } from "../monitoring";
import { ErrorFallback } from "./ErrorFallback";

/**
 * 렌더 중 예외(remote 로드 실패 포함)를 잡아 흰 화면 대신 안내 화면을 보여주고 Sentry로 보낸다.
 * Sentry.ErrorBoundary를 쓰면 SDK를 정적으로 import해야 해서 직접 만든다 (monitoring.ts 참고).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        reportRenderError(error, info.componentStack ?? undefined);
    }

    render() {
        return this.state.hasError ? <ErrorFallback /> : this.props.children;
    }
}
