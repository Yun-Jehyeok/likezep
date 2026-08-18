/**
 * 근접 화상 — 3명 P2P Mesh 연결 테스트
 *
 * 검증 항목:
 * - 3개 브라우저 컨텍스트가 같은 룸에 동시 입장 가능
 * - 스폰 위치(400±50, 300±50)가 CONNECT_THRESHOLD(150px) 이내이므로
 *   아바타 이동 없이도 proximity-connect 이벤트가 자동 트리거됨
 * - WebRTC 협상 완료 후 각 페이지에 상대방 VideoTile(2개)이 렌더링됨
 */
import { test, expect } from "@playwright/test";
import { testLogin, injectAuth, BASE_URL, ROOMS } from "./fixtures";

test.describe("근접 화상 3명 P2P", () => {
  test("3명 입장 시 VideoTile 2개씩 자동 생성", async ({ browser }) => {
    const [auth1, auth2, auth3] = await Promise.all([
      testLogin({ email: "e2e.user1@test.local", name: "E2E 유저1", role: "mentor" }),
      testLogin({ email: "e2e.user2@test.local", name: "E2E 유저2", role: "mentor" }),
      testLogin({ email: "e2e.user3@test.local", name: "E2E 유저3", role: "mentor" }),
    ]);

    const [ctx1, ctx2, ctx3] = await Promise.all([
      browser.newContext({ permissions: ["camera", "microphone"] }),
      browser.newContext({ permissions: ["camera", "microphone"] }),
      browser.newContext({ permissions: ["camera", "microphone"] }),
    ]);
    const [page1, page2, page3] = await Promise.all([
      ctx1.newPage(),
      ctx2.newPage(),
      ctx3.newPage(),
    ]);

    try {
      // 인증 주입은 goto() 전에
      await Promise.all([
        injectAuth(page1, auth1),
        injectAuth(page2, auth2),
        injectAuth(page3, auth3),
      ]);

      await Promise.all([
        page1.goto(`${BASE_URL}/room/${ROOMS.plaza}`),
        page2.goto(`${BASE_URL}/room/${ROOMS.plaza}`),
        page3.goto(`${BASE_URL}/room/${ROOMS.plaza}`),
      ]);

      // 게임 캔버스 렌더링 대기 (PixiJS 초기화 완료 기준)
      await Promise.all([
        page1.locator("canvas").waitFor({ state: "visible", timeout: 20_000 }),
        page2.locator("canvas").waitFor({ state: "visible", timeout: 20_000 }),
        page3.locator("canvas").waitFor({ state: "visible", timeout: 20_000 }),
      ]);

      // 3명 모두 입장 확인
      await expect(page1.locator("text=3명 접속 중")).toBeVisible({ timeout: 15_000 });

      // VideoTile: div.w-28.h-20 (VideoTile은 div, ScreenShareTile은 button이라 구분됨)
      // 스폰 위치 최대 거리 ≈ 141px < threshold 150px → 이동 없이도 자동 연결
      await expect(page1.locator("div.w-28.h-20")).toHaveCount(2, { timeout: 40_000 });
      await expect(page2.locator("div.w-28.h-20")).toHaveCount(2, { timeout: 40_000 });
      await expect(page3.locator("div.w-28.h-20")).toHaveCount(2, { timeout: 40_000 });
    } finally {
      await Promise.all([ctx1.close(), ctx2.close(), ctx3.close()]);
    }
  });
});
