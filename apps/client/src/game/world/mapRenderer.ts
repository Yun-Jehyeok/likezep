import { Container, Graphics, Text } from "pixi.js";

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1200;

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
    this.drawBackground();
    this.drawGrid();
    this.drawBoundary();
    this.drawZones();
  }

  private drawBackground() {
    const bg = new Graphics();
    bg.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).fill({ color: 0x12121a });
    this.addChild(bg);
  }

  private drawGrid() {
    const g = new Graphics();
    const CELL = 80;
    for (let x = 0; x <= MAP_WIDTH; x += CELL) g.moveTo(x, 0).lineTo(x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += CELL) g.moveTo(0, y).lineTo(MAP_WIDTH, y);
    g.stroke({ color: 0xffffff, alpha: 0.04, width: 1 });
    this.addChild(g);
  }

  private drawBoundary() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).stroke({ color: 0xffffff, alpha: 0.12, width: 2 });
    this.addChild(g);
  }

  private drawZones() {
    for (const zone of ZONES) {
      const g = new Graphics();
      g.rect(zone.x, zone.y, zone.w, zone.h)
        .fill({ color: zone.color, alpha: 0.07 })
        .stroke({ color: zone.color, alpha: 0.25, width: 1 });
      this.addChild(g);

      const label = new Text({
        text: zone.label,
        style: { fontSize: 12, fill: "#ffffff", fontFamily: "Pretendard, sans-serif" },
      });
      label.alpha = 0.4;
      label.x = zone.x + zone.w / 2 - label.width / 2;
      label.y = zone.y + zone.h / 2 - label.height / 2;
      this.addChild(label);
    }
  }
}
