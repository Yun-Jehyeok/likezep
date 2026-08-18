import type { Page } from "@playwright/test";

export const BASE_URL = process.env.BASE_URL ?? "https://like-zep.shop";

// seed.ts에서 고정 ID로 생성한 공용 룸
export const ROOMS = {
  plaza:   "00000000-0000-0000-0000-000000000001",
  meeting: "00000000-0000-0000-0000-000000000002",
};

export interface AuthData {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    groupId: string | null;
  };
}

/**
 * E2E 전용 로그인 — /api/internal/test-login 엔드포인트 호출
 * 서버에 E2E_ENABLED=true 가 설정되어 있어야 함
 */
export async function testLogin(params: {
  email: string;
  name: string;
  role?: "admin" | "mentor" | "mentee";
  groupId?: string | null;
}): Promise<AuthData> {
  const res = await fetch(`${BASE_URL}/api/internal/test-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`test-login failed (${res.status}): ${text}\n→ EC2 서버에 E2E_ENABLED=true 설정 후 pm2 restart 필요`);
  }
  return res.json() as Promise<AuthData>;
}

/**
 * 페이지가 로드되기 전에 sessionStorage에 인증 정보 주입
 * page.goto() 전에 반드시 호출해야 함
 */
export async function injectAuth(page: Page, auth: AuthData) {
  await page.addInitScript(
    ({ token, user }) => {
      sessionStorage.setItem("auth_token", token);
      sessionStorage.setItem(
        "auth_store",
        JSON.stringify({ state: { user, token }, version: 0 })
      );
    },
    { token: auth.token, user: auth.user }
  );
}
