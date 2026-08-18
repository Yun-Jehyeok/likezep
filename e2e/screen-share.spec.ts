/**
 * 화면공유 — 멘토 1명이 공유 시작 후 5명이 오버레이 수신하는지 확인
 *
 * 검증 항목:
 * - 6개 브라우저 컨텍스트 동시 입장
 * - 공유자가 "화면 공유" 버튼 클릭 → mediasoup produce 성공
 * - 나머지 5개 컨텍스트에 ScreenShareOverlay("화면 공유 중") 표시
 *
 * --use-fake-ui-for-media-stream 플래그로 getDisplayMedia() 자동 승인
 */
import { test, expect } from "@playwright/test";
import { testLogin, injectAuth, BASE_URL, ROOMS } from "./fixtures";

test.describe("화면공유 6명 동시 시청", () => {
  test("공유자 1명 + 시청자 5명 오버레이 수신", async ({ browser }) => {
    const emails = Array.from({ length: 6 }, (_, i) =>
      `e2e.share${i + 1}@test.local`
    );
    const auths = await Promise.all(
      emails.map((email, i) =>
        testLogin({ email, name: `E2E 공유${i + 1}`, role: "mentor" })
      )
    );

    const contexts = await Promise.all(
      auths.map(() => browser.newContext({ permissions: ["camera", "microphone"] }))
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    try {
      // 인증 주입 및 룸 이동
      await Promise.all(auths.map((auth, i) => injectAuth(pages[i], auth)));
      await Promise.all(
        pages.map((page) => page.goto(`${BASE_URL}/room/${ROOMS.plaza}`))
      );

      // 전원 캔버스 렌더링 대기
      await Promise.all(
        pages.map((page) =>
          page.locator("canvas").waitFor({ state: "visible", timeout: 25_000 })
        )
      );

      // 6명 입장 확인 (첫 번째 페이지 기준)
      await expect(pages[0].locator("text=6명 접속 중")).toBeVisible({ timeout: 20_000 });

      // 공유자(pages[0])가 화면 공유 시작
      // ControlButton의 label이 "화면 공유"인 버튼 클릭
      await pages[0].getByRole("button", { name: "화면 공유" }).click();

      // 공유자 UI가 "공유 중단"으로 전환되는지 확인 (mediasoup produce 성공 기준)
      await expect(
        pages[0].getByRole("button", { name: "공유 중단" })
      ).toBeVisible({ timeout: 20_000 });

      // 나머지 5개 페이지에 ScreenShareOverlay 표시 확인
      // ScreenShareOverlay 내부 텍스트: "{presenterName} 화면 공유 중"
      await Promise.all(
        pages.slice(1).map((page) =>
          expect(page.getByText(/화면 공유 중/)).toBeVisible({ timeout: 30_000 })
        )
      );
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
    }
  });
});
