/**
 * 2D 맵 렌더러 — 구역별 벽, 출입구, 인테리어를 PixiJS Graphics로 그린다
 *
 * 구조:
 * - WALL_RECTS: 충돌 판정에 사용하는 벽 세그먼트 배열 (GameApp에서 import)
 * - MapRenderer: PixiJS Container 서브클래스. 배경 → 바닥 → 인테리어 → 벽 순으로 그린다.
 *
 * 구역 배치:
 *   중앙 광장 (center) — 사방 출입구
 *   휴식 공간 (top-left)  — 오른쪽 벽 출입구
 *   스터디룸  (top-right)  — 왼쪽 벽 출입구
 *   자료실    (bot-left)   — 오른쪽 벽 출입구
 *   상담실    (bot-right)  — 왼쪽 벽 출입구
 */
import { Container, Graphics, Text } from "pixi.js";

export const MAP_WIDTH  = 1600;
export const MAP_HEIGHT = 1200;

const WALL_T = 14;  // 벽 두께 (px)
const ENTRY_W = 72; // 출입구 너비 (px)

export interface WallRect { x: number; y: number; w: number; h: number; }

// ── 구역 위치/색상 정의 ──────────────────────────────────────────────────────
const PLAZA   = { x: 580,  y: 430, w: 440, h: 340, color: 0x0071ff, label: "중앙 광장" };
const REST    = { x:  40,  y:  40, w: 300, h: 240, color: 0x22c55e, label: "휴식 공간" };
const STUDY   = { x: 1260, y:  40, w: 300, h: 240, color: 0xa855f7, label: "스터디룸"  };
const LIBRARY = { x:  40,  y: 920, w: 300, h: 240, color: 0xeab308, label: "자료실"    };
const COUNSEL = { x: 1260, y: 920, w: 300, h: 240, color: 0xec4899, label: "상담실"    };

type ZoneDef = typeof PLAZA;

// ── 벽 세그먼트 생성 ─────────────────────────────────────────────────────────

/**
 * 한쪽 벽에 출입구(gaps)를 뚫어 세그먼트 배열을 반환한다.
 * gaps: 출입구 중앙의 축 좌표 (top/bottom이면 x, left/right이면 y)
 */
function wallSegments(
  side: "top" | "bottom" | "left" | "right",
  zx: number, zy: number, zw: number, zh: number,
  gaps: number[],
): WallRect[] {
  const result: WallRect[] = [];
  const isH   = side === "top" || side === "bottom";
  const wallY = side === "top" ? zy : zy + zh - WALL_T;
  const wallX = side === "left" ? zx : zx + zw - WALL_T;
  const len    = isH ? zw : zh;
  const origin = isH ? zx : zy;

  let cur = origin;
  for (const gc of [...gaps].sort((a, b) => a - b)) {
    const gs = gc - ENTRY_W / 2;
    const ge = gc + ENTRY_W / 2;
    if (gs > cur)
      result.push(isH
        ? { x: cur, y: wallY, w: gs - cur, h: WALL_T }
        : { x: wallX, y: cur, w: WALL_T, h: gs - cur });
    cur = ge;
  }
  if (cur < origin + len)
    result.push(isH
      ? { x: cur, y: wallY, w: origin + len - cur, h: WALL_T }
      : { x: wallX, y: cur, w: WALL_T, h: origin + len - cur });
  return result;
}

function buildWalls(): WallRect[] {
  const w: WallRect[] = [];
  const add = (...r: WallRect[]) => w.push(...r);

  // 중앙 광장 — 사방 출입구 (각 벽 중앙)
  const { x: px, y: py, w: pw, h: ph } = PLAZA;
  add(...wallSegments("top",    px, py, pw, ph, [px + pw / 2]));
  add(...wallSegments("bottom", px, py, pw, ph, [px + pw / 2]));
  add(...wallSegments("left",   px, py, pw, ph, [py + ph / 2]));
  add(...wallSegments("right",  px, py, pw, ph, [py + ph / 2]));

  // 휴식 공간 — 오른쪽 벽 출입구
  const { x: rx, y: ry, w: rw, h: rh } = REST;
  add(...wallSegments("top",    rx, ry, rw, rh, []));
  add(...wallSegments("bottom", rx, ry, rw, rh, []));
  add(...wallSegments("left",   rx, ry, rw, rh, []));
  add(...wallSegments("right",  rx, ry, rw, rh, [ry + rh / 2]));

  // 스터디룸 — 왼쪽 벽 출입구
  const { x: sx, y: sy, w: sw, h: sh } = STUDY;
  add(...wallSegments("top",    sx, sy, sw, sh, []));
  add(...wallSegments("bottom", sx, sy, sw, sh, []));
  add(...wallSegments("left",   sx, sy, sw, sh, [sy + sh / 2]));
  add(...wallSegments("right",  sx, sy, sw, sh, []));

  // 자료실 — 오른쪽 벽 출입구
  const { x: lx, y: ly, w: lw, h: lh } = LIBRARY;
  add(...wallSegments("top",    lx, ly, lw, lh, []));
  add(...wallSegments("bottom", lx, ly, lw, lh, []));
  add(...wallSegments("left",   lx, ly, lw, lh, []));
  add(...wallSegments("right",  lx, ly, lw, lh, [ly + lh / 2]));

  // 상담실 — 왼쪽 벽 출입구
  const { x: cx, y: cy, w: cw, h: ch } = COUNSEL;
  add(...wallSegments("top",    cx, cy, cw, ch, []));
  add(...wallSegments("bottom", cx, cy, cw, ch, []));
  add(...wallSegments("left",   cx, cy, cw, ch, [cy + ch / 2]));
  add(...wallSegments("right",  cx, cy, cw, ch, []));

  return w;
}

/** GameApp의 충돌 판정에 사용하는 벽 세그먼트 배열 */
export const WALL_RECTS: WallRect[] = buildWalls();

// ── 렌더러 ───────────────────────────────────────────────────────────────────

export class MapRenderer extends Container {
  constructor() {
    super();
    this.drawBackground();
    this.drawGrid();
    this.drawOutdoor();
    this.drawZoneFloor(PLAZA,   (z) => this.plazaDecorations(z));
    this.drawZoneFloor(REST,    (z) => this.restDecorations(z));
    this.drawZoneFloor(STUDY,   (z) => this.studyDecorations(z));
    this.drawZoneFloor(LIBRARY, (z) => this.libraryDecorations(z));
    this.drawZoneFloor(COUNSEL, (z) => this.counselDecorations(z));
    this.drawAllWalls();
    this.drawZoneLabels();
    this.drawBoundary();
  }

  private drawBackground() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).fill({ color: 0x0e0e18 });
    this.addChild(g);
  }

  private drawGrid() {
    const g = new Graphics();
    const CELL = 80;
    for (let x = 0; x <= MAP_WIDTH; x += CELL) g.moveTo(x, 0).lineTo(x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += CELL) g.moveTo(0, y).lineTo(MAP_WIDTH, y);
    g.stroke({ color: 0xffffff, alpha: 0.025, width: 1 });
    this.addChild(g);
  }

  private drawBoundary() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).stroke({ color: 0xffffff, alpha: 0.1, width: 2 });
    this.addChild(g);
  }

  /** 실외 공간 — 광장으로 향하는 통로와 나무들 */
  private drawOutdoor() {
    const g = new Graphics();

    // 광장 각 출입구로 이어지는 돌바닥 통로
    const pathColor = 0x1a1a2e;
    const { x: px, y: py, w: pw, h: ph } = PLAZA;
    // 위쪽 통로
    g.rect(px + pw / 2 - 20, py - 160, 40, 160).fill({ color: pathColor });
    // 아래쪽 통로
    g.rect(px + pw / 2 - 20, py + ph, 40, 160).fill({ color: pathColor });
    // 왼쪽 통로
    g.rect(px - 160, py + ph / 2 - 20, 160, 40).fill({ color: pathColor });
    // 오른쪽 통로
    g.rect(px + pw, py + ph / 2 - 20, 160, 40).fill({ color: pathColor });

    this.addChild(g);

    // 실외 나무
    const treePositions = [
      { x: 480, y: 180 }, { x: 320, y: 360 },
      { x: 1120, y: 180 }, { x: 1280, y: 360 },
      { x: 480, y: 820 }, { x: 320, y: 640 },
      { x: 1120, y: 820 }, { x: 1280, y: 640 },
      { x: 760, y: 160 }, { x: 840, y: 160 },
      { x: 760, y: 1040 }, { x: 840, y: 1040 },
      { x: 160, y: 580 }, { x: 160, y: 480 },
      { x: 1440, y: 580 }, { x: 1440, y: 480 },
    ];
    const tg = new Graphics();
    for (const t of treePositions) {
      tg.circle(t.x, t.y, 22).fill({ color: 0x14532d, alpha: 0.75 });
      tg.circle(t.x, t.y, 15).fill({ color: 0x166534, alpha: 0.9 });
      tg.circle(t.x, t.y,  8).fill({ color: 0x15803d });
    }
    this.addChild(tg);
  }

  /** 구역 내부 바닥(타일 패턴)을 그리고 콜백으로 인테리어를 추가한다 */
  private drawZoneFloor(zone: ZoneDef, decorate: (z: ZoneDef) => void) {
    const { x, y, w, h, color } = zone;
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;

    const floor = new Graphics();
    // 기본 바닥색
    floor.rect(ix, iy, iw, ih).fill({ color: 0x0a0a14 });
    // 40px 타일 패턴
    for (let tx = ix; tx < ix + iw; tx += 40)
      for (let ty = iy; ty < iy + ih; ty += 40)
        floor.rect(tx + 1, ty + 1, 38, 38);
    floor.fill({ color, alpha: 0.04 });
    this.addChild(floor);

    decorate(zone);
  }

  // ── 구역별 인테리어 ──────────────────────────────────────────────────────

  /** 중앙 광장 — 분수, 벤치, 광장 타일 */
  private plazaDecorations({ x, y, w, h, color }: ZoneDef) {
    const cx = x + w / 2, cy = y + h / 2;
    const g = new Graphics();

    // 중앙 광장 강조 타일
    g.rect(cx - 90, cy - 70, 180, 140).fill({ color, alpha: 0.07 });

    // 분수 — 바깥 풀
    g.circle(cx, cy, 52).fill({ color: 0x071628 });
    g.circle(cx, cy, 52).stroke({ color, alpha: 0.45, width: 3 });
    // 분수 — 안쪽 받침
    g.circle(cx, cy, 34).fill({ color: 0x0d1f3c });
    g.circle(cx, cy, 34).stroke({ color, alpha: 0.5, width: 2 });
    // 분수 — 중앙 꼭지
    g.circle(cx, cy, 11).fill({ color, alpha: 0.75 });
    g.circle(cx, cy,  6).fill({ color: 0xffffff, alpha: 0.65 });

    // 광장 가장자리 장식선
    const ix = x + WALL_T + 10, iy = y + WALL_T + 10;
    g.rect(ix, iy, w - WALL_T * 2 - 20, h - WALL_T * 2 - 20)
      .stroke({ color, alpha: 0.1, width: 1 });

    // 벤치 4개 (분수 주변)
    const benches: Array<[number, number, number, number]> = [
      [cx - 108, cy - 12, 44, 14],
      [cx +  64, cy - 12, 44, 14],
      [cx -  22, cy - 76, 44, 14],
      [cx -  22, cy +  62, 44, 14],
    ];
    for (const [bx, by, bw, bh] of benches) {
      g.roundRect(bx, by, bw, bh, 3).fill({ color: 0x5c3d1e });
      g.roundRect(bx + 1, by - 4, bw - 2, 5, 2).fill({ color: 0x7c5c2e });
    }

    // 광장 모서리 가로등
    const lamps: Array<[number, number]> = [
      [x + WALL_T + 20, y + WALL_T + 20],
      [x + w - WALL_T - 20, y + WALL_T + 20],
      [x + WALL_T + 20, y + h - WALL_T - 20],
      [x + w - WALL_T - 20, y + h - WALL_T - 20],
    ];
    for (const [lx, ly] of lamps) {
      g.circle(lx, ly, 10).fill({ color, alpha: 0.18 });
      g.circle(lx, ly,  5).fill({ color, alpha: 0.55 });
      g.circle(lx, ly,  2).fill({ color: 0xffffff, alpha: 0.8 });
    }

    this.addChild(g);
  }

  /** 휴식 공간 — 나무, 벤치, 작은 연못 */
  private restDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const g = new Graphics();

    // 잔디 바닥
    g.rect(ix + 8, iy + 8, iw - 16, ih - 16).fill({ color: 0x0a1a0a, alpha: 0.45 });

    // 나무 3그루
    const trees: Array<[number, number]> = [
      [ix + 48,       iy + 55      ],
      [ix + iw - 65,  iy + 45      ],
      [ix + iw / 2 - 10, iy + ih - 72],
    ];
    for (const [tx, ty] of trees) {
      g.circle(tx, ty, 28).fill({ color: 0x14532d, alpha: 0.8 });
      g.circle(tx, ty, 20).fill({ color: 0x166534, alpha: 0.9 });
      g.circle(tx, ty, 10).fill({ color: 0x15803d });
      g.rect(tx - 4, ty + 16, 8, 18).fill({ color: 0x5c3d1e });
    }

    // 벤치
    const bcx = ix + iw / 2;
    g.roundRect(bcx - 32, iy + ih / 2 - 7, 64, 14, 3).fill({ color: 0x5c3d1e });
    g.roundRect(bcx - 30, iy + ih / 2 - 12, 60, 6, 2).fill({ color: 0x7c5c2e });

    // 작은 연못
    const pond = { x: ix + 54, y: iy + ih - 60 };
    g.circle(pond.x, pond.y, 26).fill({ color: 0x071628 });
    g.circle(pond.x, pond.y, 26).stroke({ color: 0x0ea5e9, alpha: 0.4, width: 2 });
    g.circle(pond.x, pond.y, 11).fill({ color: 0x0369a1, alpha: 0.5 });

    // 꽃밭 (우상단)
    const flowerColors = [0xf43f5e, 0xf59e0b, 0xa78bfa];
    for (let i = 0; i < 6; i++) {
      const fx = ix + iw - 55 + (i % 3) * 16;
      const fy = iy + ih - 50 + Math.floor(i / 3) * 16;
      g.circle(fx, fy, 5).fill({ color: flowerColors[i % 3], alpha: 0.75 });
    }

    this.addChild(g);
  }

  /** 스터디룸 — 책장, 모니터 책상, 강사석 */
  private studyDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const g = new Graphics();

    // 상단 벽 책장
    for (let bx = ix + 6; bx + 20 < ix + iw - 6; bx += 23) {
      g.roundRect(bx, iy + 5, 20, 36, 2).fill({ color: 0x2d1b69 });
      g.roundRect(bx + 2, iy + 7, 16, 32, 1).fill({ color, alpha: 0.3 });
    }

    // 학생 책상 2행 × 3열
    const deskRows = [iy + 58, iy + 118];
    const deskCols = [ix + 24, ix + iw / 2 - 25, ix + iw - 76];
    for (const dy of deskRows) {
      for (const dx of deskCols) {
        // 책상 본체
        g.roundRect(dx, dy, 50, 32, 3).fill({ color: 0x1e1b4b });
        g.roundRect(dx + 2, dy + 2, 46, 28, 2).stroke({ color, alpha: 0.2, width: 1 });
        // 모니터
        g.roundRect(dx + 10, dy + 4, 30, 18, 2).fill({ color: 0x0d0d1a });
        g.roundRect(dx + 11, dy + 5, 28, 16, 1).fill({ color, alpha: 0.18 });
        // 의자
        g.roundRect(dx + 11, dy + 36, 26, 20, 4).fill({ color: 0x312e81 });
      }
    }

    // 강사 책상 (하단 중앙)
    const tdx = ix + iw / 2 - 54;
    const tdy = iy + ih - 54;
    g.roundRect(tdx, tdy, 108, 38, 4).fill({ color: 0x1e1b4b });
    g.roundRect(tdx, tdy, 108, 5, 2).fill({ color, alpha: 0.5 });
    g.roundRect(tdx + 30, tdy + 8, 48, 22, 2).fill({ color: 0x0d0d1a }); // 모니터

    this.addChild(g);
  }

  /** 자료실 — 사방 책장, 중앙 열람 테이블, 스탠드 조명 */
  private libraryDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const g = new Graphics();

    // 상단 책장
    for (let bx = ix + 4; bx + 20 < ix + iw - 4; bx += 23) {
      g.roundRect(bx, iy + 4, 20, 40, 2).fill({ color: 0x451a03 });
      g.roundRect(bx + 2, iy + 6, 16, 36, 1).fill({ color, alpha: 0.35 });
    }
    // 왼쪽 책장 (출입구 반대편)
    for (let by = iy + 50; by + 20 < iy + ih - 6; by += 23) {
      g.roundRect(ix + 4, by, 36, 20, 2).fill({ color: 0x451a03 });
      g.roundRect(ix + 6, by + 2, 32, 16, 1).fill({ color, alpha: 0.35 });
    }

    // 중앙 열람 테이블
    const tcx = ix + iw / 2 - 54, tcy = iy + ih / 2 - 28;
    g.roundRect(tcx, tcy, 108, 56, 4).fill({ color: 0x451a03 });
    g.roundRect(tcx, tcy, 108, 56, 4).stroke({ color, alpha: 0.3, width: 1 });
    // 의자 2개 (좌우)
    g.roundRect(tcx - 24, tcy + 8, 20, 40, 4).fill({ color: 0x78350f });
    g.roundRect(tcx + 112, tcy + 8, 20, 40, 4).fill({ color: 0x78350f });

    // 스탠드 조명
    const lx = ix + iw - 32, ly = iy + ih - 36;
    g.circle(lx, ly, 16).fill({ color, alpha: 0.18 });
    g.circle(lx, ly,  9).fill({ color, alpha: 0.5 });
    g.circle(lx, ly,  3).fill({ color: 0xffffff, alpha: 0.75 });
    g.rect(lx - 2, ly + 9, 4, 20).fill({ color: 0x78350f });

    this.addChild(g);
  }

  /** 상담실 — 소파, 커피 테이블, 안락의자, 화분, 러그 */
  private counselDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const cx = ix + iw / 2, cy = iy + ih / 2;
    const g = new Graphics();

    // 러그 (바닥 중앙)
    g.ellipse(cx, cy, 76, 54).fill({ color, alpha: 0.1 });
    g.ellipse(cx, cy, 76, 54).stroke({ color, alpha: 0.18, width: 1 });

    // 소파 (상단)
    const sx = cx - 64, sy = iy + 18;
    g.roundRect(sx, sy, 128, 42, 8).fill({ color: 0x500724 });
    g.roundRect(sx, sy, 128, 13, 6).fill({ color: 0x881337, alpha: 0.8 });
    // 쿠션 2개
    g.roundRect(sx + 6, sy + 15, 52, 24, 4).fill({ color: 0x881337, alpha: 0.5 });
    g.roundRect(sx + 70, sy + 15, 52, 24, 4).fill({ color: 0x881337, alpha: 0.5 });

    // 커피 테이블
    g.roundRect(cx - 32, cy - 22, 64, 44, 6).fill({ color: 0x3f0f20 });
    g.roundRect(cx - 32, cy - 22, 64, 44, 6).stroke({ color, alpha: 0.25, width: 1 });

    // 안락의자 2개 (좌우)
    g.roundRect(ix + 12, cy - 26, 50, 50, 8).fill({ color: 0x500724 });
    g.roundRect(ix + iw - 62, cy - 26, 50, 50, 8).fill({ color: 0x500724 });

    // 화분 2개 (하단 모서리)
    for (const px of [ix + 24, ix + iw - 24]) {
      const py = iy + ih - 36;
      g.circle(px, py, 20).fill({ color: 0x14532d, alpha: 0.8 });
      g.circle(px, py, 13).fill({ color: 0x166534, alpha: 0.9 });
      g.circle(px, py,  6).fill({ color: 0x15803d });
    }

    this.addChild(g);
  }

  // ── 벽 렌더링 ────────────────────────────────────────────────────────────

  /** WALL_RECTS와 동일한 위치에 벽을 그린다 (충돌 판정과 1:1 대응) */
  private drawAllWalls() {
    const g = new Graphics();
    for (const wall of WALL_RECTS) {
      g.rect(wall.x, wall.y, wall.w, wall.h).fill({ color: 0x1a1a2e });
    }
    this.addChild(g);

    // 벽 하이라이트 (수평 벽 상단, 수직 벽 좌측에 얇은 밝은 선)
    const hl = new Graphics();
    for (const wall of WALL_RECTS) {
      if (wall.w >= wall.h) {
        // 수평 벽
        hl.rect(wall.x, wall.y, wall.w, 2);
      } else {
        // 수직 벽
        hl.rect(wall.x, wall.y, 2, wall.h);
      }
    }
    hl.fill({ color: 0x3a3a5c, alpha: 0.9 });
    this.addChild(hl);
  }

  /** 각 구역 레이블을 내부 상단에 배치 */
  private drawZoneLabels() {
    for (const zone of [PLAZA, REST, STUDY, LIBRARY, COUNSEL]) {
      const label = new Text({
        text: zone.label,
        style: {
          fontSize: 11,
          fill: "#ffffff",
          fontFamily: "Pretendard, sans-serif",
          fontWeight: "600",
        },
      });
      label.alpha = 0.45;
      label.x = zone.x + zone.w / 2 - label.width / 2;
      label.y = zone.y + WALL_T + 5;
      this.addChild(label);
    }
  }
}
