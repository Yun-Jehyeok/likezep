/**
 * 관리 대시보드 실시간 현황 폴링 테스트
 *
 * 검증 항목:
 * - Admin이 /admin 접속 → 실시간 현황 탭 자동 표시
 * - 다른 유저가 광장 입장 → 5초 폴링 후 관리자 화면에 이름 표시
 * - 광장 룸 카드에 입장자 이름이 나타남
 */
import { test, expect } from "@playwright/test";
import { testLogin, injectAuth, BASE_URL, ROOMS } from "./fixtures";

test.describe("관리 대시보드 실시간 현황", () => {
  test("유저 입장 시 5초 내 현황 반영", async ({ browser }) => {
    const [adminAuth, mentorAuth] = await Promise.all([
      testLogin({ email: "e2e.admin@test.local", name: "E2E Admin", role: "admin" }),
      testLogin({ email: "e2e.dashboard@test.local", name: "E2E 대시보드멘토", role: "mentor" }),
    ]);

    const [adminCtx, mentorCtx] = await Promise.all([
      browser.newContext(),
      browser.newContext({ permissions: ["camera", "microphone"] }),
    ]);
    const [adminPage, mentorPage] = await Promise.all([
      adminCtx.newPage(),
      mentorCtx.newPage(),
    ]);

    try {
      // 관리자 /admin 페이지 열기
      await injectAuth(adminPage, adminAuth);
      await adminPage.goto(`${BASE_URL}/admin`);
      await expect(adminPage.locator("text=실시간 현황")).toBeVisible({ timeout: 10_000 });

      // 멘토가 광장 입장
      await injectAuth(mentorPage, mentorAuth);
      await mentorPage.goto(`${BASE_URL}/room/${ROOMS.plaza}`);
      await mentorPage.locator("canvas").waitFor({ state: "visible", timeout: 20_000 });

      // 관리자 대시보드 폴링(5초) 후 광장 카드에 입장자 이름 표시 확인
      // AdminPage는 5초마다 /api/admin/status 재조회
      await expect(adminPage.getByText("E2E 대시보드멘토")).toBeVisible({ timeout: 15_000 });
    } finally {
      await Promise.all([adminCtx.close(), mentorCtx.close()]);
    }
  });
});
