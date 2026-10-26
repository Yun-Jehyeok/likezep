/**
 * 2D 맵 렌더러 — PixiJS Graphics로 구역을 그린다
 *
 * PixiJS에서 Graphics는 선/도형을 그리는 API다.
 * fill()은 채우기, stroke()는 테두리를 설정한다.
 * 여러 Graphics 객체를 Container에 addChild()해 씬 그래프를 구성한다.
 *
 * 맵 좌표계: 좌상단(0,0), 우하단(MAP_WIDTH, MAP_HEIGHT)
 */
import { Container, Graphics, Text } from "pixi.js";

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;

/** 맵 위에 표시할 구역 정의. 색상과 레이블로 구역을 시각적으로 구분한다. */
const ZONES = [
  { x: MAP_WIDTH / 2 - 160, y: MAP_HEIGHT / 2 - 120, w: 320, h: 240, color: 0x0071ff, label: "중앙 광장" },
  { x: 80,  y: 80,  w: 200, h: 160, color: 0x22c55e, label: "휴식 공간" },
  { x: MAP_WIDTH - 280, y: 80,  w: 200, h: 160, color: 0xa855f7, label: "스터디룸" },
  { x: 80,  y: MAP_HEIGHT - 240, w: 200, h: 160, color: 0xeab308, label: "자료실" },
  { x: MAP_WIDTH - 280, y: MAP_HEIGHT - 240, w: 200, h: 160, color: 0xec4899, label: "상담실" },
];

export class MapRenderer extends Container {
  constructor() {
    super();
    // 렌더링 순서: 배경 → 격자 → 경계선 → 구역 (뒤에 addChild할수록 위에 그려짐)
    this.drawBackground();
    this.drawGrid();
    this.drawBoundary();
    this.drawZones();
  }

  /** 전체 배경을 어두운 색으로 채운다 */
  private drawBackground() {
    const bg = new Graphics();
    bg.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).fill({ color: 0x12121a });
    this.addChild(bg);
  }

  /** 80px 격자를 매우 연한 선으로 그려 공간감을 준다 (alpha: 0.04 = 거의 안 보임) */
  private drawGrid() {
    const g = new Graphics();
    const CELL = 80;
    for (let x = 0; x <= MAP_WIDTH; x += CELL) g.moveTo(x, 0).lineTo(x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += CELL) g.moveTo(0, y).lineTo(MAP_WIDTH, y);
    g.stroke({ color: 0xffffff, alpha: 0.04, width: 1 });
    this.addChild(g);
  }

  /** 맵 전체 경계선 */
  private drawBoundary() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).stroke({ color: 0xffffff, alpha: 0.12, width: 2 });
    this.addChild(g);
  }

  /** 각 구역을 반투명 색상 사각형과 레이블로 표시 */
  private drawZones() {
    for (const zone of ZONES) {
      const g = new Graphics();
      g.rect(zone.x, zone.y, zone.w, zone.h)
        .fill({ color: zone.color, alpha: 0.07 })   // 매우 연한 채우기
        .stroke({ color: zone.color, alpha: 0.25, width: 1 });  // 구역 테두리
      this.addChild(g);

      // 구역 중앙에 레이블 배치
      const label = new Text({
        text: zone.label,
        style: { fontSize: 12, fill: "#ffffff", fontFamily: "Pretendard, sans-serif" },
      });
      label.alpha = 0.4;
      label.x = zone.x + zone.w / 2 - label.width / 2;   // 수평 중앙
      label.y = zone.y + zone.h / 2 - label.height / 2;  // 수직 중앙
      this.addChild(label);
    }
  }
}
