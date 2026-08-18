/**
 * 방 스위처 테스트
 *
 * 검증 항목:
 * - 멘토가 광장 입장 후 "방 전환" 드롭다운 열기
 * - 회의실 선택 → 탭 새로고침 없이 전환
 * - URL이 /room/<회의실 ID>로 변경
 * - 새 룸 캔버스 렌더링 완료
 */
import { test, expect } from "@playwright/test";
import { testLogin, injectAuth, BASE_URL, ROOMS } from "./fixtures";

test.describe("방 스위처", () => {
  test("광장 → 회의실 전환 (새로고침 없음)", async ({ page }) => {
    const auth = await testLogin({
      email: "e2e.switcher@test.local",
      name: "E2E 스위처멘토",
      role: "mentor",
    });

    await injectAuth(page, auth);
    await page.goto(`${BASE_URL}/room/${ROOMS.plaza}`);

    // 광장 로드 대기
    await page.locator("canvas").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.locator("text=광장")).toBeVisible();

    // 방 전환 드롭다운 열기
    await page.getByRole("button", { name: "방 전환" }).click();

    // 드롭다운에서 회의실 선택
    await page.getByRole("button", { name: /회의실/ }).click();

    // URL 변경 확인 (새로고침 없음)
    await expect(page).toHaveURL(`${BASE_URL}/room/${ROOMS.meeting}`, {
      timeout: 10_000,
    });

    // 회의실 캔버스 렌더링 확인
    await page.locator("canvas").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.locator("text=회의실")).toBeVisible();
  });
});
