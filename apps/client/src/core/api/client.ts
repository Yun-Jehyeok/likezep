const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:2567";

function getToken(): string | null {
  // Zustand store는 모듈 밖에서 직접 접근 가능
  // store import 시 순환 의존성 방지를 위해 localStorage 경유
  return sessionStorage.getItem("auth_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message ?? "Request failed"), {
      status: res.status,
      code: body?.error?.code,
    });
  }

  return res.json() as Promise<T>;
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  get: <T>(path: string) =>
    request<T>(path, { method: "GET" }),
};
