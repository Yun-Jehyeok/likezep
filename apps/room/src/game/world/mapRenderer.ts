/**
 * 2D 맵 렌더러 — 구역별 벽, 출입구, 인테리어를 PixiJS로 그린다
 *
 * 구조:
 * - WALL_RECTS: 충돌 판정에 사용하는 벽 세그먼트 배열 (GameApp에서 import)
 * - MapRenderer: PixiJS Container 서브클래스. 배경→바닥→인테리어→벽 순으로 그린다.
 *   인테리어는 Graphics(기하 도형) + Sprite(타일셋 이미지) 혼합 방식.
 *
 * 타일셋: roguelikeIndoor_transparent.png (Kenney, CC0)
 *   - 타일 크기: 16×16 px, 1px 간격 → step = 17px
 *   - 그리드: 27 cols × 18 rows
 *
 * 구역 배치:
 *   중앙 광장 (center) — 사방 출입구
 *   휴식 공간 (top-left)  — 오른쪽 벽 출입구
 *   스터디룸  (top-right)  — 왼쪽 벽 출입구
 *   자료실    (bot-left)   — 오른쪽 벽 출입구
 *   상담실    (bot-right)  — 왼쪽 벽 출입구
 */
import { Container, Graphics, Text, Sprite, Texture, Rectangle } from "pixi.js";

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

// ── 타일셋 좌표 (col, row) — 0-indexed ──────────────────────────────────────
// roguelikeIndoor 27×18 그리드 기준. 필요 시 조정.
const T = {
  // ── 의자 (단일 타일, 갈색 목재) ──
  chairS: [0,  0],  // 아래 방향
  chairN: [1,  0],  // 위 방향
  chairW: [2,  0],  // 왼쪽 방향
  chairE: [3,  0],  // 오른쪽 방향

  // ── 테이블/책상 (2타일 가로) ──
  tableL: [4,  0],
  tableR: [5,  0],

  // ── 소파 (3타일 가로) ──
  sofaL:  [0,  4],
  sofaM:  [1,  4],
  sofaR:  [2,  4],

  // ── 러그 (3×2 타일) ──
  rugTL:  [0,  6],  rugTM:  [1,  6],  rugTR:  [2,  6],
  rugBL:  [0,  7],  rugBM:  [1,  7],  rugBR:  [2,  7],

  // ── 책장 (1타일 × 2타일 높이) ──
  shelfT: [0,  9],
  shelfB: [0, 10],

  // ── 녹색 큰 책장 (2타일 가로) ──
  bigShelfL: [3,  9],
  bigShelfR: [4,  9],

  // ── 화분/식물 ──
  plantLg: [24, 0],
  plantSm: [25, 0],

  // ── 나무 (실외) ──
  treeT:   [22, 0],
  treeB:   [22, 1],

  // ── 가로등/조명 ──
  lamp:    [26, 0],
} as const;

// ── 벽 세그먼트 생성 ─────────────────────────────────────────────────────────

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

  const { x: px, y: py, w: pw, h: ph } = PLAZA;
  add(...wallSegments("top",    px, py, pw, ph, [px + pw / 2]));
  add(...wallSegments("bottom", px, py, pw, ph, [px + pw / 2]));
  add(...wallSegments("left",   px, py, pw, ph, [py + ph / 2]));
  add(...wallSegments("right",  px, py, pw, ph, [py + ph / 2]));

  const { x: rx, y: ry, w: rw, h: rh } = REST;
  add(...wallSegments("top",    rx, ry, rw, rh, []));
  add(...wallSegments("bottom", rx, ry, rw, rh, []));
  add(...wallSegments("left",   rx, ry, rw, rh, []));
  add(...wallSegments("right",  rx, ry, rw, rh, [ry + rh / 2]));

  const { x: sx, y: sy, w: sw, h: sh } = STUDY;
  add(...wallSegments("top",    sx, sy, sw, sh, []));
  add(...wallSegments("bottom", sx, sy, sw, sh, []));
  add(...wallSegments("left",   sx, sy, sw, sh, [sy + sh / 2]));
  add(...wallSegments("right",  sx, sy, sw, sh, []));

  const { x: lx, y: ly, w: lw, h: lh } = LIBRARY;
  add(...wallSegments("top",    lx, ly, lw, lh, []));
  add(...wallSegments("bottom", lx, ly, lw, lh, []));
  add(...wallSegments("left",   lx, ly, lw, lh, []));
  add(...wallSegments("right",  lx, ly, lw, lh, [ly + lh / 2]));

  const { x: cx, y: cy, w: cw, h: ch } = COUNSEL;
  add(...wallSegments("top",    cx, cy, cw, ch, []));
  add(...wallSegments("bottom", cx, cy, cw, ch, []));
  add(...wallSegments("left",   cx, cy, cw, ch, [cy + ch / 2]));
  add(...wallSegments("right",  cx, cy, cw, ch, []));

  return w;
}

export const WALL_RECTS: WallRect[] = buildWalls();

// ── 렌더러 ───────────────────────────────────────────────────────────────────

export class MapRenderer extends Container {
  private ts: Texture | null;

  constructor(tileset?: Texture) {
    super();
    this.ts = tileset ?? null;

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

  // ── 타일셋 헬퍼 ─────────────────────────────────────────────────────────

  /** 타일셋의 (col, row) 타일을 주어진 scale 배율로 반환 */
  private spr([col, row]: readonly [number, number], scale = 3): Sprite {
    if (this.ts) {
      const tex = new Texture({
        source: this.ts.source,
        frame: new Rectangle(col * 17, row * 17, 16, 16),
      });
      const s = new Sprite(tex);
      s.scale.set(scale);
      return s;
    }
    return new Sprite(Texture.EMPTY);
  }

  /** 타일 스프라이트를 월드 좌표 (wx, wy)에 배치하고 씬에 추가 */
  private place(wx: number, wy: number, tile: readonly [number, number], scale = 3): Sprite {
    const s = this.spr(tile, scale);
    s.x = wx;
    s.y = wy;
    this.addChild(s);
    return s;
  }

  // ── 배경/공통 ────────────────────────────────────────────────────────────

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

  private drawOutdoor() {
    const g = new Graphics();
    const pathColor = 0x1a1a2e;
    const { x: px, y: py, w: pw, h: ph } = PLAZA;
    g.rect(px + pw / 2 - 20, py - 160, 40, 160).fill({ color: pathColor });
    g.rect(px + pw / 2 - 20, py + ph,  40, 160).fill({ color: pathColor });
    g.rect(px - 160, py + ph / 2 - 20, 160, 40).fill({ color: pathColor });
    g.rect(px + pw,  py + ph / 2 - 20, 160, 40).fill({ color: pathColor });
    this.addChild(g);

    // 실외 나무 (Graphics 원 — 타일셋 나무는 1×2타일이라 실외용으론 Graphics가 더 적합)
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

  private drawZoneFloor(zone: ZoneDef, decorate: (z: ZoneDef) => void) {
    const { x, y, w, h, color } = zone;
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;

    const floor = new Graphics();
    floor.rect(ix, iy, iw, ih).fill({ color: 0x0a0a14 });
    for (let tx = ix; tx < ix + iw; tx += 40)
      for (let ty = iy; ty < iy + ih; ty += 40)
        floor.rect(tx + 1, ty + 1, 38, 38);
    floor.fill({ color, alpha: 0.04 });
    this.addChild(floor);

    decorate(zone);
  }

  // ── 구역별 인테리어 ──────────────────────────────────────────────────────

  /** 중앙 광장 — 분수, 벤치, 가로등 */
  private plazaDecorations({ x, y, w, h, color }: ZoneDef) {
    const cx = x + w / 2, cy = y + h / 2;
    const g = new Graphics();

    g.rect(cx - 90, cy - 70, 180, 140).fill({ color, alpha: 0.07 });

    // 분수
    g.circle(cx, cy, 52).fill({ color: 0x071628 });
    g.circle(cx, cy, 52).stroke({ color, alpha: 0.45, width: 3 });
    g.circle(cx, cy, 34).fill({ color: 0x0d1f3c });
    g.circle(cx, cy, 34).stroke({ color, alpha: 0.5, width: 2 });
    g.circle(cx, cy, 11).fill({ color, alpha: 0.75 });
    g.circle(cx, cy,  6).fill({ color: 0xffffff, alpha: 0.65 });

    const ix = x + WALL_T + 10, iy = y + WALL_T + 10;
    g.rect(ix, iy, w - WALL_T * 2 - 20, h - WALL_T * 2 - 20)
      .stroke({ color, alpha: 0.1, width: 1 });
    this.addChild(g);

    // 벤치 — 타일셋 의자 스프라이트 (분수 사방)
    const S = 3;  // scale
    const TS = 16 * S;  // 타일 1개의 화면 크기 (48px)
    this.place(cx - 108,       cy - TS / 2, T.chairE, S);
    this.place(cx +  64,       cy - TS / 2, T.chairW, S);
    this.place(cx - TS / 2,    cy - 92,     T.chairS, S);
    this.place(cx - TS / 2,    cy +  44,    T.chairN, S);

    // 모서리 가로등 — 조명 타일
    const corners: Array<[number, number]> = [
      [x + WALL_T + 4,     y + WALL_T + 4    ],
      [x + w - WALL_T - 4 - TS, y + WALL_T + 4    ],
      [x + WALL_T + 4,     y + h - WALL_T - 4 - TS],
      [x + w - WALL_T - 4 - TS, y + h - WALL_T - 4 - TS],
    ];
    for (const [lx, ly] of corners) this.place(lx, ly, T.lamp, S);
  }

  /** 휴식 공간 — 화분, 벤치, 연못 */
  private restDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const S = 3;
    const TS = 16 * S;

    // 잔디 그라운드
    const g = new Graphics();
    g.rect(ix + 8, iy + 8, iw - 16, ih - 16).fill({ color: 0x0a1a0a, alpha: 0.45 });
    this.addChild(g);

    // 화분 — 대형 × 2, 소형 × 2
    this.place(ix + 16,          iy + 24,          T.plantLg, S);
    this.place(ix + iw - TS - 16, iy + 24,         T.plantLg, S);
    this.place(ix + 16,          iy + ih - TS - 16, T.plantSm, S);
    this.place(ix + iw - TS - 16, iy + ih - TS - 16, T.plantSm, S);

    // 벤치 (가운데)
    const bcx = ix + iw / 2 - TS;
    this.place(bcx,       iy + ih / 2 - TS / 2, T.chairE, S);
    this.place(bcx + TS,  iy + ih / 2 - TS / 2, T.chairW, S);

    // 연못 (Graphics — 타원)
    const pond = { x: ix + 54, y: iy + ih - 65 };
    const pg = new Graphics();
    pg.circle(pond.x, pond.y, 28).fill({ color: 0x071628 });
    pg.circle(pond.x, pond.y, 28).stroke({ color: 0x0ea5e9, alpha: 0.4, width: 2 });
    pg.circle(pond.x, pond.y, 12).fill({ color: 0x0369a1, alpha: 0.5 });
    this.addChild(pg);
  }

  /** 스터디룸 — 책장, 모니터 책상, 의자 */
  private studyDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const S = 3;
    const TS = 16 * S;  // 48px

    // 상단 벽 책장 행 (shelfT + shelfB 세로 2타일 = 96px)
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4) {
      this.place(bx, iy + 4,      T.shelfT, S);
      this.place(bx, iy + 4 + TS, T.shelfB, S);
    }

    // 학생 책상 2행 × 3열
    const deskRows = [iy + TS * 2 + 12, iy + TS * 3 + 20];
    const deskCols = [ix + 10, ix + iw / 2 - TS, ix + iw - TS * 2 - 10];
    for (const dy of deskRows) {
      for (const dx of deskCols) {
        this.place(dx,      dy,      T.tableL,  S);
        this.place(dx + TS, dy,      T.tableR,  S);
        this.place(dx + TS / 4, dy + TS, T.chairN, S);
      }
    }

    // 강사석 (하단 중앙, 큰 책상)
    const tdx = ix + iw / 2 - TS * 1.5;
    const tdy = iy + ih - TS - 8;
    this.place(tdx,       tdy, T.tableL, S);
    this.place(tdx + TS,  tdy, T.tableR, S);
    this.place(tdx + TS * 2, tdy, T.tableL, S);

    // 강사 의자 (강단 뒤)
    this.place(tdx + TS, tdy - TS - 4, T.chairS, S);

    // 배경 색 오버레이 (Graphics — 보조)
    const g = new Graphics();
    g.rect(ix + 4, iy + 4, iw - 8, TS * 2 + 4).fill({ color, alpha: 0.03 });
    this.addChild(g);
    void color;
  }

  /** 자료실 — 사방 책장, 중앙 열람 테이블 */
  private libraryDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const S = 3;
    const TS = 16 * S;

    // 상단 책장
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4) {
      this.place(bx, iy + 4,      T.shelfT, S);
      this.place(bx, iy + 4 + TS, T.shelfB, S);
    }

    // 왼쪽 책장 (출입구 반대편)
    for (let by = iy + TS * 2 + 12; by + TS * 2 <= iy + ih - 8; by += TS * 2 + 6) {
      this.place(ix + 4, by,      T.bigShelfL, S);
      this.place(ix + 4, by + TS, T.bigShelfR, S);
    }

    // 중앙 열람 테이블 (가로 4타일)
    const tcx = ix + iw / 2 - TS * 2;
    const tcy = iy + ih / 2 - TS / 2;
    this.place(tcx,          tcy, T.tableL, S);
    this.place(tcx + TS,     tcy, T.tableR, S);
    this.place(tcx + TS * 2, tcy, T.tableL, S);
    this.place(tcx + TS * 3, tcy, T.tableR, S);

    // 의자 (테이블 양쪽)
    this.place(tcx - TS - 4,      tcy, T.chairE, S);
    this.place(tcx + TS * 4 + 4,  tcy, T.chairW, S);

    // 스탠드 조명
    this.place(ix + iw - TS - 8, iy + ih - TS - 8, T.lamp, S);

    void color;
  }

  /** 상담실 — 소파, 커피 테이블, 러그, 화분 */
  private counselDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const cx = ix + iw / 2, cy = iy + ih / 2;
    const S = 3;
    const TS = 16 * S;

    // 러그 (3×2 타일)
    const rugX = cx - TS * 1.5;
    const rugY = cy - TS;
    this.place(rugX,          rugY,      T.rugTL, S);
    this.place(rugX + TS,     rugY,      T.rugTM, S);
    this.place(rugX + TS * 2, rugY,      T.rugTR, S);
    this.place(rugX,          rugY + TS, T.rugBL, S);
    this.place(rugX + TS,     rugY + TS, T.rugBM, S);
    this.place(rugX + TS * 2, rugY + TS, T.rugBR, S);

    // 소파 (상단, 3타일)
    const sofaX = cx - TS * 1.5;
    const sofaY = iy + 10;
    this.place(sofaX,          sofaY, T.sofaL, S);
    this.place(sofaX + TS,     sofaY, T.sofaM, S);
    this.place(sofaX + TS * 2, sofaY, T.sofaR, S);

    // 커피 테이블 (가운데)
    this.place(cx - TS,     cy - TS / 2, T.tableL, S);
    this.place(cx,          cy - TS / 2, T.tableR, S);

    // 안락의자 (좌우)
    this.place(ix + 8,          cy - TS / 2, T.chairE, S);
    this.place(ix + iw - TS - 8, cy - TS / 2, T.chairW, S);

    // 화분 (하단 모서리)
    this.place(ix + 8,           iy + ih - TS - 8, T.plantLg, S);
    this.place(ix + iw - TS - 8, iy + ih - TS - 8, T.plantLg, S);

    void color;
  }

  // ── 벽 렌더링 ────────────────────────────────────────────────────────────

  private drawAllWalls() {
    const g = new Graphics();
    for (const wall of WALL_RECTS)
      g.rect(wall.x, wall.y, wall.w, wall.h).fill({ color: 0x1a1a2e });
    this.addChild(g);

    const hl = new Graphics();
    for (const wall of WALL_RECTS) {
      if (wall.w >= wall.h) hl.rect(wall.x, wall.y, wall.w, 2);
      else                  hl.rect(wall.x, wall.y, 2, wall.h);
    }
    hl.fill({ color: 0x3a3a5c, alpha: 0.9 });
    this.addChild(hl);
  }

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
