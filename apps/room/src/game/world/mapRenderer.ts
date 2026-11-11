/**
 * 2D 맵 렌더러 — 구역별 벽, 출입구, 인테리어를 PixiJS로 그린다
 *
 * 구역 배치 (1600×1200 맵):
 *   휴식 공간 (20,20,480,380)   — 오른쪽 출입구
 *   스터디룸  (1100,20,480,380) — 왼쪽 출입구
 *   중앙 광장 (580,440,440,320) — 사방 출입구
 *   자료실    (20,800,480,380)  — 오른쪽 출입구
 *   상담실    (1100,800,480,380)— 왼쪽 출입구
 *
 * 타일셋: roguelikeIndoor (Kenney, CC0) — 16×16 px, 1px 간격(step=17px)
 * WALL_RECTS: 벽 세그먼트 + 가구 충돌 rect 합산 (GameApp collidesWall에서 사용)
 *
 * 2.5D oblique 렌더링:
 *   - south walls (bottom): DEPTH_H 높이의 앞면(face) 추가
 *   - east walls (right):   DEPTH_W 너비의 측면(face) 추가
 *   - 가구 아래 드롭섀도
 */
import { Container, Graphics, Text, Sprite, Texture, Rectangle } from "pixi.js";

export const MAP_WIDTH  = 1600;
export const MAP_HEIGHT = 1200;

const WALL_T  = 14;
const ENTRY_W = 90;
const TS      = 48;
const DEPTH_H = 24;  // 남쪽 벽 앞면 높이
const DEPTH_W = 10;  // 동쪽 벽 측면 너비

const C = {
  outdoor:    0x1c2a10,
  path:       0x2e1e0c,
  floorBase:  0x3e2206,
  floorA:     0x6b3a18,
  floorB:     0x7c4a22,
  wallMain:   0xc8a060,
  wallLight:  0xe8cc88,
  wallShad:   0x7a5828,
  wallFaceS:  0x7c4e1e,  // 남쪽 앞면 (가장 어두움, 하늘빛 반대)
  wallFaceE:  0x9a6428,  // 동쪽 측면
  wallCorner: 0x6a3c14,  // 남동 코너 포스트
  doorMark:   0xa87840,
  treeD:      0x0a1a06,
  treeM:      0x163010,
  treeL:      0x1e4a14,
  shadow:     0x000000,
} as const;

export interface WallRect {
  x: number; y: number; w: number; h: number;
  isFurniture?: boolean;
  face?: "s" | "e";  // south = 앞면, east = 측면
}

const PLAZA   = { x: 580,  y: 440, w: 440, h: 320, label: "중앙 광장" };
const REST    = { x:  20,  y:  20, w: 480, h: 380, label: "휴식 공간" };
const STUDY   = { x: 1100, y:  20, w: 480, h: 380, label: "스터디룸"  };
const LIBRARY = { x:  20,  y: 800, w: 480, h: 380, label: "자료실"    };
const COUNSEL = { x: 1100, y: 800, w: 480, h: 380, label: "상담실"    };

type ZoneDef = { x: number; y: number; w: number; h: number; label: string; };


// ── 벽 세그먼트 생성 ──────────────────────────────────────────────────────────

function wallSegments(
  side: "top" | "bottom" | "left" | "right",
  zx: number, zy: number, zw: number, zh: number,
  gaps: number[],
): WallRect[] {
  const face: WallRect["face"] =
    side === "bottom" ? "s" : side === "right" ? "e" : undefined;
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
        ? { x: cur, y: wallY, w: gs - cur, h: WALL_T, face }
        : { x: wallX, y: cur, w: WALL_T, h: gs - cur, face });
    cur = ge;
  }
  if (cur < origin + len)
    result.push(isH
      ? { x: cur, y: wallY, w: origin + len - cur, h: WALL_T, face }
      : { x: wallX, y: cur, w: WALL_T, h: origin + len - cur, face });
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

// ── 가구 충돌 rect ─────────────────────────────────────────────────────────────

function buildFurnitureRects(): WallRect[] {
  const r: WallRect[] = [];
  const f = (x: number, y: number, w: number, h: number) =>
    r.push({ x, y, w, h, isFurniture: true });

  const { x: px, y: py, w: pw, h: ph } = PLAZA;
  const fcx = px + pw / 2, fcy = py + ph / 2;
  f(fcx - 56, fcy - 56, 112, 112);
  f(fcx - 110, fcy - 24, TS, TS);
  f(fcx +  62, fcy - 24, TS, TS);
  f(fcx -  24, fcy - 94, TS, TS);
  f(fcx -  24, fcy +  46, TS, TS);

  const { x: rx, y: ry, w: rw, h: rh } = REST;
  const rix = rx + WALL_T, riy = ry + WALL_T;
  const riw = rw - WALL_T * 2, rih = rh - WALL_T * 2;
  const rmy = riy + rih / 2;
  f(rix + riw / 2 - TS * 1.5, riy + 16, TS * 3, TS);
  f(rix + riw / 2 - TS,       rmy - TS / 2, TS * 2, TS);
  f(rix + 12,                 rmy - TS / 2, TS, TS);
  f(rix + riw - TS - 58,      rmy - TS / 2, TS, TS);
  f(rix + 8,                  riy + 8, TS, TS);
  f(rix + riw - TS - 8,       riy + 8, TS, TS);
  f(rix + 8,                  riy + rih - TS - 8, TS, TS);
  f(rix + riw - TS - 8,       riy + rih - TS - 8, TS, TS);

  const { x: sx, y: sy, w: sw, h: sh } = STUDY;
  const six = sx + WALL_T, siy = sy + WALL_T;
  const siw = sw - WALL_T * 2, sih = sh - WALL_T * 2;
  for (let bx = six + 4; bx + TS <= six + siw - 4; bx += TS + 4)
    f(bx, siy + 4, TS, TS * 2);
  const sdCols = [six + 60, six + siw - TS * 2 - 24];
  const sdRows = [siy + TS * 2 + 24, siy + TS * 3 + 40];
  for (const dy of sdRows)
    for (const dx of sdCols) {
      f(dx, dy, TS * 2, TS);
      f(dx + 12, dy + TS + 4, TS, TS);
    }
  const stdx = six + siw / 2 - TS, stdy = siy + sih - TS - 8;
  f(stdx, stdy, TS * 2, TS);

  const { x: lx, y: ly, w: lw, h: lh } = LIBRARY;
  const lix = lx + WALL_T, liy = ly + WALL_T;
  const liw = lw - WALL_T * 2, lih = lh - WALL_T * 2;
  for (let bx = lix + 4; bx + TS <= lix + liw - 4; bx += TS + 4)
    f(bx, liy + 4, TS, TS * 2);
  for (let by = liy + TS * 2 + 20; by + TS * 2 <= liy + lih - 8; by += TS * 2 + 12)
    f(lix + 4, by, TS * 2, TS * 2);
  const ltcx = lix + liw / 2 - TS * 2, ltcy = liy + lih / 2 - TS / 2;
  f(ltcx, ltcy, TS * 4, TS);
  f(ltcx - TS - 4,     ltcy, TS, TS);
  f(ltcx + TS * 4 + 4, ltcy, TS, TS);
  f(ltcx + TS,     ltcy - TS - 4, TS, TS);
  f(ltcx + TS * 2, ltcy - TS - 4, TS, TS);
  f(lix + liw - TS - 8, liy + lih - TS - 8, TS, TS);

  const { x: cox, y: coy, w: cow, h: coh } = COUNSEL;
  const ccix = cox + WALL_T, cciy = coy + WALL_T;
  const cciw = cow - WALL_T * 2, ccih = coh - WALL_T * 2;
  const ccmx = ccix + cciw / 2;
  f(ccmx - TS * 1.5, cciy + 16, TS * 3, TS);
  f(ccmx - TS, cciy + ccih / 2 - TS / 2, TS * 2, TS);
  f(ccix + 60,             cciy + ccih / 2 - TS / 2, TS, TS);
  f(ccix + cciw - TS - 12, cciy + ccih / 2 - TS / 2, TS, TS);
  f(ccix + 8,              cciy + ccih - TS - 8, TS, TS);
  f(ccix + cciw - TS - 8,  cciy + ccih - TS - 8, TS, TS);

  return r;
}

export const WALL_RECTS: WallRect[] = [...buildWalls(), ...buildFurnitureRects()];

// ── 렌더러 ────────────────────────────────────────────────────────────────────

// 나무 스프라이트 위치 (Outside Objects.png, 32px 타일)
// cols 6-7 (x 192-288): 여름 낙엽수 variant A/B
// cols 9-10 (x 288-384): 같은 타입 variant C/D
// 각 나무: 96px × 192px (3×6 tiles), row 1 시작=y 224 (row 7)
const TREE_W = 96, TREE_H = 192;
const TREE_SCALE = 0.38;
const TREE_VARIANTS = [
  { x: 192, y:   0 },  // green summer A (cols 6-8, row 0)
  { x: 288, y:   0 },  // green summer B (cols 9-11, row 0)
] as const;

// LPC Interior 가구 스프라이트 좌표 (32px 타일, scale=0.75 → 48px per tile = TS)
const LPC_FURN = {
  shelfTall:   { x: 768, y:   0, w: 64, h: 128 },
  shelfMid:    { x: 896, y:   0, w: 64, h:  96 },
  sofaL:       { x: 512, y:  96, w: 64, h:  96 },
  sofaR:       { x: 576, y:  96, w: 64, h:  96 },
  armchairE:   { x: 512, y: 320, w: 32, h:  32 },
  armchairW:   { x: 544, y: 320, w: 32, h:  32 },
  // 테이블: c14-15 r6-7 (amber wood 64×64px → 48×48px)
  table:       { x: 448, y: 192, w: 64, h:  64 },
  // 의자 (gray cushion 32×32px → 24×24px)
  chairS:      { x: 640, y: 320, w: 32, h:  32 },
  chairN:      { x: 864, y: 320, w: 32, h:  32 },
  // 식물: c28 r11-12 (대형), c26 r5-6 (소형) — 32×64px → 24×48px
  plantLg:     { x: 896, y: 352, w: 32, h:  64 },
  plantSm:     { x: 832, y: 160, w: 32, h:  64 },
  // 램프: c16-17 r13-14 (lamp shade + pole 64×64px → 48×48px)
  lamp:        { x: 512, y: 416, w: 64, h:  64 },
} as const;
const LPC_FURN_SCALE = 0.75;

export class MapRenderer extends Container {
  private lo: Texture | null;  // lpc-outside
  private li: Texture | null;  // lpc-interior

  constructor(_tileset?: Texture, lpcOutside?: Texture, lpcInterior?: Texture) {
    super();
    this.lo = lpcOutside ?? null;
    this.li = lpcInterior ?? null;

    this.drawBackground();
    this.drawOutdoor();
    this.drawZoneFloor(PLAZA,   (z) => this.plazaDecorations(z));
    this.drawZoneFloor(REST,    (z) => this.restDecorations(z));
    this.drawZoneFloor(STUDY,   (z) => this.studyDecorations(z));
    this.drawZoneFloor(LIBRARY, (z) => this.libraryDecorations(z));
    this.drawZoneFloor(COUNSEL, (z) => this.counselDecorations(z));
    this.drawDoorThresholds();
    this.drawAllWalls();
    this.drawZoneLabels();
    this.drawBoundary();
  }

  // ── LPC 가구 헬퍼 ────────────────────────────────────────────────────────

  // 카펫/러그 — Graphics 직접 그리기 (LPC Interior에 적절한 러그 없음)
  private drawRug(x: number, y: number, w: number, h: number) {
    const g = new Graphics();
    g.rect(x, y, w, h).fill({ color: 0x7a2535 });
    g.rect(x + 6, y + 6, w - 12, h - 12).fill({ color: 0x963042 });
    g.rect(x + 12, y + 12, w - 24, h - 24).fill({ color: 0xa83850 });
    g.rect(x + 4, y + 4, w - 8, 2).fill({ color: 0xc45060 });
    g.rect(x + 4, y + h - 6, w - 8, 2).fill({ color: 0xc45060 });
    g.rect(x + 4, y + 4, 2, h - 8).fill({ color: 0xc45060 });
    g.rect(x + w - 6, y + 4, 2, h - 8).fill({ color: 0xc45060 });
    this.addChild(g);
  }

  // LPC Interior 가구 스프라이트
  private lpcFurnSpr(key: keyof typeof LPC_FURN): Sprite {
    if (!this.li) return new Sprite(Texture.EMPTY);
    const f = LPC_FURN[key];
    const tex = new Texture({
      source: this.li.source,
      frame: new Rectangle(f.x, f.y, f.w, f.h),
    });
    const s = new Sprite(tex);
    s.scale.set(LPC_FURN_SCALE);
    return s;
  }

  private placeLpc(wx: number, wy: number, key: keyof typeof LPC_FURN): Sprite {
    const s = this.lpcFurnSpr(key);
    s.x = wx;
    s.y = wy;
    this.addChild(s);
    return s;
  }

  // LPC Outside Objects 나무 스프라이트 (variant 0-3)
  private treeSpr(variant: number): Sprite {
    if (!this.lo) return new Sprite(Texture.EMPTY);
    const v = TREE_VARIANTS[variant % TREE_VARIANTS.length];
    const tex = new Texture({
      source: this.lo.source,
      frame: new Rectangle(v.x, v.y, TREE_W, TREE_H),
    });
    const s = new Sprite(tex);
    s.scale.set(TREE_SCALE);
    return s;
  }

  // 오브젝트 아래 드롭섀도 (Graphics g에 렌더 — 반드시 sprite보다 먼저 addChild)
  private dropShadow(g: Graphics, x: number, y: number, w: number, h: number) {
    g.ellipse(x + w * 0.5, y + h + 3, w * 0.42, 5)
      .fill({ color: C.shadow, alpha: 0.28 });
  }

  // ── 배경/공통 ─────────────────────────────────────────────────────────────

  private drawBackground() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).fill({ color: C.outdoor });
    this.addChild(g);
  }

  private drawBoundary() {
    const g = new Graphics();
    g.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).stroke({ color: C.wallShad, alpha: 0.4, width: 2 });
    this.addChild(g);
  }

  // ── 실외 ──────────────────────────────────────────────────────────────────

  private drawOutdoor() {
    const { x: px, y: py, w: pw, h: ph } = PLAZA;
    const pathW = 80;
    const pcx = px + pw / 2, pcy = py + ph / 2;

    const g = new Graphics();
    g.rect(pcx - pathW / 2, 0,       pathW, py);
    g.rect(pcx - pathW / 2, py + ph, pathW, MAP_HEIGHT - py - ph);
    g.rect(0,       pcy - pathW / 2, px,              pathW);
    g.rect(px + pw, pcy - pathW / 2, MAP_WIDTH - px - pw, pathW);
    g.fill({ color: C.path });
    this.addChild(g);

    const trees = [
      { x: 660, y: 100  }, { x: 760, y:  55  }, { x: 850, y:  55  }, { x: 940, y: 100  },
      { x: 710, y: 240  }, { x: 890, y: 240  },
      { x: 660, y: 1100 }, { x: 760, y: 1145 }, { x: 850, y: 1145 }, { x: 940, y: 1100 },
      { x: 710, y: 960  }, { x: 890, y: 960  },
      { x: 100, y: 480  }, { x: 220, y: 560  }, { x: 100, y: 660  }, { x: 350, y: 500  },
      { x: 420, y: 680  }, { x: 240, y: 720  },
      { x: 1500, y: 480 }, { x: 1380, y: 560 }, { x: 1500, y: 660 }, { x: 1250, y: 500 },
      { x: 1180, y: 680 }, { x: 1360, y: 720 },
      { x: 540, y: 120  }, { x: 1060, y: 120 }, { x: 540, y: 880  }, { x: 1060, y: 880  },
    ];
    const tw = TREE_W * TREE_SCALE;
    const th = TREE_H * TREE_SCALE;
    // 나무 아래 그림자 먼저
    const tsg = new Graphics();
    for (const t of trees)
      tsg.ellipse(t.x, t.y + th * 0.1, tw * 0.45, 8).fill({ color: 0x000000, alpha: 0.22 });
    this.addChild(tsg);
    // 나무 스프라이트 (variant는 위치 기반 결정론적 선택)
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      const s = this.treeSpr(i);
      s.x = t.x - tw / 2;
      s.y = t.y - th * 0.78;  // 나무 하단 기준점이 t.y 위치
      this.addChild(s);
    }
  }

  // ── 바닥 ──────────────────────────────────────────────────────────────────

  private drawWoodFloor(g: Graphics, ix: number, iy: number, iw: number, ih: number) {
    g.rect(ix, iy, iw, ih).fill({ color: C.floorBase });
    const plankH = 20;
    for (let py = iy; py < iy + ih; py += plankH) {
      const isAlt = Math.floor((py - iy) / plankH) % 2 === 1;
      const h = Math.min(plankH - 1, iy + ih - py);
      // 아래쪽(카메라 가까운 쪽)으로 갈수록 미세하게 밝아짐 — 깊이감
      const depthAlpha = 0.03 * ((py - iy) / ih);
      g.rect(ix, py, iw, h).fill({ color: isAlt ? C.floorB : C.floorA });
      if (depthAlpha > 0)
        g.rect(ix, py, iw, h).fill({ color: 0xffffff, alpha: depthAlpha });
    }
  }

  private drawZoneFloor(zone: ZoneDef, decorate: (z: ZoneDef) => void) {
    const { x, y, w, h } = zone;
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;

    const floor = new Graphics();
    this.drawWoodFloor(floor, ix, iy, iw, ih);
    this.addChild(floor);

    decorate(zone);
  }

  // ── 출입구 색 마킹 ────────────────────────────────────────────────────────

  private drawDoorThresholds() {
    const g = new Graphics();
    const mark = (x: number, y: number, w: number, h: number) =>
      g.rect(x, y, w, h).fill({ color: C.doorMark });

    const { x: px, y: py, w: pw, h: ph } = PLAZA;
    const pcx = px + pw / 2, pcy = py + ph / 2;
    mark(pcx - ENTRY_W / 2, py,              ENTRY_W, WALL_T);
    mark(pcx - ENTRY_W / 2, py + ph - WALL_T, ENTRY_W, WALL_T);
    mark(px,                 pcy - ENTRY_W / 2, WALL_T, ENTRY_W);
    mark(px + pw - WALL_T,   pcy - ENTRY_W / 2, WALL_T, ENTRY_W);

    const { x: rx, y: ry, w: rw, h: rh } = REST;
    mark(rx + rw - WALL_T, ry + rh / 2 - ENTRY_W / 2, WALL_T, ENTRY_W);

    const { x: sx, y: sy, w: sw, h: sh } = STUDY;
    mark(sx, sy + sh / 2 - ENTRY_W / 2, WALL_T, ENTRY_W);

    const { x: lx, y: ly, w: lw, h: lh } = LIBRARY;
    mark(lx + lw - WALL_T, ly + lh / 2 - ENTRY_W / 2, WALL_T, ENTRY_W);

    const { x: cox, y: coy, w: cow, h: coh } = COUNSEL;
    mark(cox, coy + coh / 2 - ENTRY_W / 2, WALL_T, ENTRY_W);

    this.addChild(g);
  }

  // ── 구역별 인테리어 ──────────────────────────────────────────────────────

  private plazaDecorations({ x, y, w, h }: ZoneDef) {
    const cx = x + w / 2, cy = y + h / 2;

    // 분수 섀도
    const sg = new Graphics();
    sg.ellipse(cx, cy + 58, 50, 10).fill({ color: C.shadow, alpha: 0.3 });
    this.addChild(sg);

    const g = new Graphics();
    g.circle(cx, cy, 56).fill({ color: 0x1a3a5c });
    g.circle(cx, cy, 56).stroke({ color: C.wallLight, alpha: 0.35, width: 3 });
    g.circle(cx, cy, 36).fill({ color: 0x0d2a48 });
    g.circle(cx, cy, 36).stroke({ color: C.wallLight, alpha: 0.4, width: 2 });
    g.circle(cx, cy, 12).fill({ color: 0x60b0e0, alpha: 0.8 });
    g.circle(cx, cy,  7).fill({ color: 0xc0e8ff, alpha: 0.65 });
    this.addChild(g);

    // 벤치 섀도
    const bs = new Graphics();
    this.dropShadow(bs, cx - 110, cy - 24, 24, 24);
    this.dropShadow(bs, cx +  62, cy - 24, 24, 24);
    this.dropShadow(bs, cx -  24, cy - 94, 24, 24);
    this.dropShadow(bs, cx -  24, cy +  46, 24, 24);
    this.addChild(bs);

    this.placeLpc(cx - 110, cy - 24,  "armchairE");
    this.placeLpc(cx +  62, cy - 24,  "armchairW");
    this.placeLpc(cx -  24, cy - 94,  "chairS");
    this.placeLpc(cx -  24, cy +  46, "chairN");

    const ix2 = x + WALL_T + 4, iy2 = y + WALL_T + 4;
    for (const [lx, ly] of [
      [ix2, iy2],
      [x + w - WALL_T - 4 - TS, iy2],
      [ix2, y + h - WALL_T - 4 - TS],
      [x + w - WALL_T - 4 - TS, y + h - WALL_T - 4 - TS],
    ] as [number, number][])
      this.placeLpc(lx, ly, "lamp");
  }

  private restDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const mcx = ix + iw / 2, mcy = iy + ih / 2;
    const sofaX = mcx - TS, sofaY = iy + 16;
    const tblX  = mcx - TS,       tblY  = mcy - TS / 2;

    const sg = new Graphics();
    this.dropShadow(sg, ix + 8,           iy + 8,          TS, TS);
    this.dropShadow(sg, ix + iw - TS - 8, iy + 8,          TS, TS);
    this.dropShadow(sg, ix + 8,           iy + ih - TS - 8, TS, TS);
    this.dropShadow(sg, ix + iw - TS - 8, iy + ih - TS - 8, TS, TS);
    this.dropShadow(sg, sofaX, sofaY, TS * 2, 72);
    this.dropShadow(sg, tblX,  tblY,  TS * 2, TS);
    this.dropShadow(sg, ix + 12,            mcy - TS / 2, 24, 24);
    this.dropShadow(sg, ix + iw - TS - 58,  mcy - TS / 2, 24, 24);
    this.addChild(sg);

    this.placeLpc(ix + 8,              iy + 8,            "plantLg");
    this.placeLpc(ix + iw - TS - 8,   iy + 8,            "plantLg");
    this.placeLpc(ix + 8,              iy + ih - TS - 8,  "plantSm");
    this.placeLpc(ix + iw - TS - 8,   iy + ih - TS - 8,  "plantSm");

    this.placeLpc(sofaX,      sofaY, "sofaL");
    this.placeLpc(sofaX + TS, sofaY, "sofaR");

    const rugX = mcx - TS * 1.5, rugY = sofaY + TS + 8;
    this.drawRug(rugX, rugY, TS * 3, TS * 2);

    this.placeLpc(tblX,      tblY, "table");
    this.placeLpc(tblX + TS, tblY, "table");

    this.placeLpc(ix + 12,            mcy - TS / 2, "armchairE");
    this.placeLpc(ix + iw - TS - 58,  mcy - TS / 2, "armchairW");
  }

  private studyDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const dCols = [ix + 60, ix + iw - TS * 2 - 24];
    const dRows = [iy + TS * 2 + 24, iy + TS * 3 + 40];
    const stdx  = ix + iw / 2 - TS, stdy = iy + ih - TS - 8;

    const sg = new Graphics();
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4)
      this.dropShadow(sg, bx, iy + 4, TS, TS * 2);
    for (const dy of dRows)
      for (const dx of dCols) {
        this.dropShadow(sg, dx, dy, TS * 2, TS);
        this.dropShadow(sg, dx + 12, dy + TS + 4, TS, TS);
      }
    this.dropShadow(sg, stdx, stdy, TS * 2, TS);
    this.addChild(sg);

    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4)
      this.placeLpc(bx, iy + 4, "shelfTall");

    for (const dy of dRows)
      for (const dx of dCols) {
        this.placeLpc(dx,      dy,          "table");
        this.placeLpc(dx + TS, dy,          "table");
        this.placeLpc(dx + 12, dy + TS + 4, "chairN");
      }

    this.placeLpc(stdx,      stdy, "table");
    this.placeLpc(stdx + TS, stdy, "table");
    this.placeLpc(stdx + TS / 2 - 4, stdy - TS - 4, "chairS");
  }

  private libraryDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const tcx = ix + iw / 2 - TS * 2, tcy = iy + ih / 2 - TS / 2;

    const sg = new Graphics();
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4)
      this.dropShadow(sg, bx, iy + 4, TS, TS * 2);
    for (let by = iy + TS * 2 + 20; by + TS * 2 <= iy + ih - 8; by += TS * 2 + 12)
      this.dropShadow(sg, ix + 4, by, TS * 2, TS * 2);
    this.dropShadow(sg, tcx, tcy, TS * 4, TS);
    this.dropShadow(sg, ix + iw - TS - 8, iy + ih - TS - 8, TS, TS);
    this.addChild(sg);

    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4)
      this.placeLpc(bx, iy + 4, "shelfTall");

    for (let by = iy + TS * 2 + 20; by + TS * 2 <= iy + ih - 8; by += TS * 2 + 12) {
      this.placeLpc(ix + 4,      by, "shelfTall");
      this.placeLpc(ix + 4 + TS, by, "shelfTall");
    }

    this.placeLpc(tcx,          tcy, "table");
    this.placeLpc(tcx + TS,     tcy, "table");
    this.placeLpc(tcx + TS * 2, tcy, "table");
    this.placeLpc(tcx + TS * 3, tcy, "table");

    this.placeLpc(tcx - TS - 4,     tcy,          "armchairE");
    this.placeLpc(tcx + TS * 4 + 4, tcy,          "armchairW");
    this.placeLpc(tcx + TS,         tcy - TS - 4, "chairS");
    this.placeLpc(tcx + TS * 2,     tcy - TS - 4, "chairS");

    this.placeLpc(ix + iw - TS - 8, iy + ih - TS - 8, "lamp");
  }

  private counselDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const mcx = ix + iw / 2, mcy = iy + ih / 2;
    const sfX = mcx - TS, sfY = iy + 16;

    const sg = new Graphics();
    this.dropShadow(sg, sfX, sfY, TS * 2, 72);
    this.dropShadow(sg, mcx - TS, mcy - TS / 2, TS * 2, TS);
    this.dropShadow(sg, ix + 60,            mcy - TS / 2, 24, 24);
    this.dropShadow(sg, ix + iw - TS - 12,  mcy - TS / 2, 24, 24);
    this.dropShadow(sg, ix + 8,             iy + ih - TS - 8, TS, TS);
    this.dropShadow(sg, ix + iw - TS - 8,   iy + ih - TS - 8, TS, TS);
    this.addChild(sg);

    this.placeLpc(sfX,      sfY, "sofaL");
    this.placeLpc(sfX + TS, sfY, "sofaR");

    const rgX = mcx - TS * 1.5, rgY = mcy - TS;
    this.drawRug(rgX, rgY, TS * 3, TS * 2);

    this.placeLpc(mcx - TS, mcy - TS / 2, "table");
    this.placeLpc(mcx,      mcy - TS / 2, "table");

    this.placeLpc(ix + 60,            mcy - TS / 2, "armchairE");
    this.placeLpc(ix + iw - TS - 12,  mcy - TS / 2, "armchairW");

    this.placeLpc(ix + 8,             iy + ih - TS - 8, "plantLg");
    this.placeLpc(ix + iw - TS - 8,   iy + ih - TS - 8, "plantLg");
  }

  // ── 벽 렌더링 + 2.5D 앞면 ────────────────────────────────────────────────

  private drawAllWalls() {
    const walls = WALL_RECTS.filter(w => !w.isFurniture);

    // 1. 깊이 앞면 (south/east face) — 먼저 그려서 벽 몸체 뒤에 위치
    const faceG = new Graphics();
    for (const w of walls) {
      if (w.face === "s")
        faceG.rect(w.x, w.y + w.h, w.w, DEPTH_H).fill({ color: C.wallFaceS });
      else if (w.face === "e")
        faceG.rect(w.x + w.w, w.y, DEPTH_W, w.h).fill({ color: C.wallFaceE });
    }
    // 남동 코너 포스트 (south face + east face 사이 틈 메움)
    for (const z of [PLAZA, REST, STUDY, LIBRARY, COUNSEL])
      faceG.rect(z.x + z.w, z.y + z.h, DEPTH_W, DEPTH_H).fill({ color: C.wallCorner });
    this.addChild(faceG);

    // 2. 벽 몸체
    const g = new Graphics();
    for (const w of walls)
      g.rect(w.x, w.y, w.w, w.h).fill({ color: C.wallMain });
    this.addChild(g);

    // 3. 상단/좌측 하이라이트
    const hl = new Graphics();
    for (const w of walls) {
      if (w.w >= w.h) hl.rect(w.x, w.y, w.w, 2);
      else             hl.rect(w.x, w.y, 2, w.h);
    }
    hl.fill({ color: C.wallLight });
    this.addChild(hl);

    // 4. 하단/우측 섀도 라인 (벽 상단 면과 앞면의 경계 강조)
    const sh = new Graphics();
    for (const w of walls) {
      if (w.w >= w.h) sh.rect(w.x, w.y + w.h - 2, w.w, 2);
      else             sh.rect(w.x + w.w - 2, w.y, 2, w.h);
    }
    sh.fill({ color: C.wallShad });
    this.addChild(sh);
  }

  private drawZoneLabels() {
    for (const zone of [PLAZA, REST, STUDY, LIBRARY, COUNSEL]) {
      const label = new Text({
        text: zone.label,
        style: {
          fontSize: 11,
          fill: "#e8cc88",
          fontFamily: "Pretendard, sans-serif",
          fontWeight: "600",
        },
      });
      label.alpha = 0.7;
      label.x = zone.x + zone.w / 2 - label.width / 2;
      label.y = zone.y + WALL_T + 5;
      this.addChild(label);
    }
  }
}
