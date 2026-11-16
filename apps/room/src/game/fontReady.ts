/**
 * 캔버스 텍스트를 웹폰트가 준비된 뒤 다시 그리게 한다
 *
 * Pretendard는 unicode-range로 나뉜 조각(dynamic subset, shell이 자체 호스팅)으로 받는다.
 * 브라우저는 화면에 쓰인 글자가 든 조각만 받는데, 캔버스에 그리는 글자는 DOM에 없을 수 있다
 * (예: 아바타 이름). 그 조각이 아직 없으면 캔버스는 대체 폰트로 그리고 끝난다.
 * DOM 텍스트와 달리 폰트가 도착해도 다시 그려지지 않고, PixiJS는 한 번 그린 글자를 텍스처로 캐시한다.
 *
 * 그래서 이 텍스트에 필요한 조각을 document.fonts.load로 직접 받은 뒤
 * 스타일을 갱신(style.update → styleKey 변경)해 텍스처를 다시 만들게 한다.
 */
import { CanvasTextMetrics, type Text } from "pixi.js";

export function redrawWhenFontReady(text: Text): void {
  if (typeof document === "undefined" || !document.fonts) return;

  const { fontStyle, fontWeight, fontSize, fontFamily } = text.style;
  const size = typeof fontSize === "number" ? `${fontSize}px` : fontSize;
  const family = Array.isArray(fontFamily) ? fontFamily.join(", ") : fontFamily;
  const font = `${fontStyle} ${fontWeight} ${size} ${family}`;
  // document.fonts.check()로 "이미 받았는지"를 먼저 거르지 않는다. Chrome에서 unicode-range 조각이
  // 전부 unloaded인데도 true를 돌려줘 다시 그리기를 건너뛰었다(2026-11-16 확인).
  // 이미 받은 조각이면 load()가 바로 끝나고 다시 그리는 비용은 텍스트 하나 분량이다.
  document.fonts
    .load(font, text.text)
    .then((faces) => {
      if (faces.length === 0 || text.destroyed) return;
      // 대체 폰트로 잰 줄 높이(ascent/descent) 캐시도 버린다
      CanvasTextMetrics.clearMetrics();
      text.style.update();
    })
    .catch(() => {
      // 폰트를 못 받으면 대체 폰트 그대로 둔다
    });
}
