import { Container, Graphics, Text } from "pixi.js";

const PALETTE = [0xff6b35, 0x22c55e, 0xa855f7, 0xec4899, 0xeab308, 0x06b6d4];

function sessionColor(sessionId: string): number {
  let h = 0;
  for (const c of sessionId) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export class Avatar extends Container {
  targetX: number;
  targetY: number;

  constructor(sessionId: string, name: string, x: number, y: number, isSelf: boolean) {
    super();
    this.targetX = x;
    this.targetY = y;
    this.position.set(x, y);

    const color = isSelf ? 0x0071ff : sessionColor(sessionId);

    // Glow ring for self
    if (isSelf) {
      const ring = new Graphics();
      ring.circle(0, 0, 26).fill({ color: 0x0071ff, alpha: 0.2 });
      this.addChild(ring);
    }

    // Body circle
    const body = new Graphics();
    body.circle(0, 0, 20).fill({ color });
    this.addChild(body);

    // Initial letter
    const letter = new Text({
      text: name[0]?.toUpperCase() ?? "?",
      style: { fontSize: 16, fill: "#ffffff", fontFamily: "Pretendard, sans-serif", fontWeight: "bold" },
    });
    letter.anchor.set(0.5);
    this.addChild(letter);

    // Name label
    const label = new Text({
      text: isSelf ? `${name} (나)` : name,
      style: { fontSize: 11, fill: "#cccccc", fontFamily: "Pretendard, sans-serif" },
    });
    label.anchor.set(0.5, 0);
    label.y = 26;
    this.addChild(label);
  }

  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  interpolate(factor = 0.18) {
    this.x += (this.targetX - this.x) * factor;
    this.y += (this.targetY - this.y) * factor;
  }
}
