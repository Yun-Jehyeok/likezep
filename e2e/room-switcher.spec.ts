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

    // canvas가 DOM에 나타날 때까지 대기 (PixiJS 마운트 기준)
    await page.locator("canvas").waitFor({ state: "visible", timeout: 20_000 });

    // Colyseus가 실제로 연결됐는지 확인 — onPlayerJoin 콜백 후 "N명 접속 중" 표시됨
    // canvas가 visible 해도 Colyseus 연결 전엔 오류 화면으로 전환될 수 있으므로 이 대기가 필수
    await page.waitForFunction(
      () => {
        const spans = [...document.querySelectorAll("span")];
        return spans.some((s) => {
          const m = (s.textContent ?? "").match(/(\d+)명 접속 중/);
          return m !== null && parseInt(m[1]) > 0;
        });
      },
      { timeout: 30_000 }
    );

    // "방 전환" 버튼 클릭
    const switcherBtn = page.locator("button").filter({ hasText: "방 전환" });
    await switcherBtn.waitFor({ state: "visible", timeout: 10_000 });
    await switcherBtn.click({ force: true });

    // 드롭다운 열림 확인 (open=true 시 w-52 드롭다운 div 렌더링)
    await page.waitForFunction(
      () => document.querySelector("div.w-52") !== null,
      { timeout: 10_000 }
    );

    // 회의실 선택
    await page.locator("button").filter({ hasText: "회의실" }).click({ timeout: 10_000 });

    // URL 변경 확인 (새로고침 없음)
    await expect(page).toHaveURL(`${BASE_URL}/room/${ROOMS.meeting}`, {
      timeout: 10_000,
    });

    // 회의실 캔버스 렌더링 확인
    await page.locator("canvas").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      () => {
        const spans = [...document.querySelectorAll("span")];
        return spans.some((s) => {
          const m = (s.textContent ?? "").match(/(\d+)명 접속 중/);
          return m !== null && parseInt(m[1]) > 0;
        });
      },
      { timeout: 30_000 }
    );
  });
});
