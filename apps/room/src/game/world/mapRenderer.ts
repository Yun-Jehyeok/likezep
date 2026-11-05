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
 */
import { Container, Graphics, Text, Sprite, Texture, Rectangle } from "pixi.js";

export const MAP_WIDTH  = 1600;
export const MAP_HEIGHT = 1200;

const WALL_T  = 14;
const ENTRY_W = 90;
const TS      = 48; // 타일 1개 화면 크기 (16px × scale 3)

export interface WallRect { x: number; y: number; w: number; h: number; }

// ── 구역 정의 ──────────────────────────────────────────────────────────────────
const PLAZA   = { x: 580,  y: 440, w: 440, h: 320, color: 0x0071ff, label: "중앙 광장" };
const REST    = { x:  20,  y:  20, w: 480, h: 380, color: 0x22c55e, label: "휴식 공간" };
const STUDY   = { x: 1100, y:  20, w: 480, h: 380, color: 0xa855f7, label: "스터디룸"  };
const LIBRARY = { x:  20,  y: 800, w: 480, h: 380, color: 0xeab308, label: "자료실"    };
const COUNSEL = { x: 1100, y: 800, w: 480, h: 380, color: 0xec4899, label: "상담실"    };

type ZoneDef = typeof PLAZA;

// ── 타일셋 좌표 (col, row) — roguelikeIndoor 27×18 그리드 ─────────────────────
const T = {
  chairS:    [0,  0],
  chairN:    [1,  0],
  chairW:    [2,  0],
  chairE:    [3,  0],
  tableL:    [4,  0],
  tableR:    [5,  0],
  sofaL:     [0,  4],
  sofaM:     [1,  4],
  sofaR:     [2,  4],
  rugTL:     [0,  6],  rugTM:     [1,  6],  rugTR:     [2,  6],
  rugBL:     [0,  7],  rugBM:     [1,  7],  rugBR:     [2,  7],
  shelfT:    [0,  9],
  shelfB:    [0, 10],
  bigShelfL: [3,  9],
  bigShelfR: [4,  9],
  plantLg:   [24, 0],
  plantSm:   [25, 0],
  lamp:      [26, 0],
} as const;

// ── 벽 세그먼트 생성 ──────────────────────────────────────────────────────────

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

// ── 가구 충돌 rect — 렌더링 위치와 1:1 대응 ─────────────────────────────────

function buildFurnitureRects(): WallRect[] {
  const r: WallRect[] = [];
  const f = (x: number, y: number, w: number, h: number) => r.push({ x, y, w, h });

  // ── PLAZA ──────────────────────────────────────────────────────────
  const { x: px, y: py, w: pw, h: ph } = PLAZA;
  const fcx = px + pw / 2, fcy = py + ph / 2;
  f(fcx - 56, fcy - 56, 112, 112);            // 분수 (수원 차단)
  f(fcx - 110, fcy - 24,  TS, TS);            // 벤치 왼쪽
  f(fcx +  62, fcy - 24,  TS, TS);            // 벤치 오른쪽
  f(fcx -  24, fcy - 94,  TS, TS);            // 벤치 위
  f(fcx -  24, fcy +  46, TS, TS);            // 벤치 아래

  // ── REST ───────────────────────────────────────────────────────────
  const { x: rx, y: ry, w: rw, h: rh } = REST;
  const rix = rx + WALL_T, riy = ry + WALL_T;
  const riw = rw - WALL_T * 2, rih = rh - WALL_T * 2;
  const rmy = riy + rih / 2;
  f(rix + riw / 2 - TS * 1.5, riy + 16, TS * 3, TS);           // 소파
  f(rix + riw / 2 - TS,       rmy - TS / 2,  TS * 2, TS);       // 커피 테이블
  f(rix + 12,           rmy - TS / 2, TS, TS);                  // 안락의자 L
  f(rix + riw - TS - 12, rmy - TS / 2, TS, TS);                 // 안락의자 R
  f(rix + 8,       riy + 8,       TS, TS);                      // 화분 TL
  f(rix + riw - TS - 8, riy + 8,  TS, TS);                      // 화분 TR
  f(rix + 8,       riy + rih - TS - 8, TS, TS);                 // 화분 BL
  f(rix + riw - TS - 8, riy + rih - TS - 8, TS, TS);            // 화분 BR

  // ── STUDY ──────────────────────────────────────────────────────────
  const { x: sx, y: sy, w: sw, h: sh } = STUDY;
  const six = sx + WALL_T, siy = sy + WALL_T;
  const siw = sw - WALL_T * 2, sih = sh - WALL_T * 2;
  for (let bx = six + 4; bx + TS <= six + siw - 4; bx += TS + 4)
    f(bx, siy + 4, TS, TS * 2);                                  // 책장
  const sdCols = [six + 24, six + siw - TS * 2 - 24];
  const sdRows = [siy + TS * 2 + 24, siy + TS * 3 + 40];
  for (const dy of sdRows)
    for (const dx of sdCols) {
      f(dx, dy, TS * 2, TS);                                     // 책상
      f(dx + 12, dy + TS + 4, TS, TS);                           // 의자
    }
  const stdx = six + siw / 2 - TS, stdy = siy + sih - TS - 8;
  f(stdx, stdy, TS * 2, TS);                                     // 강사 책상

  // ── LIBRARY ────────────────────────────────────────────────────────
  const { x: lx, y: ly, w: lw, h: lh } = LIBRARY;
  const lix = lx + WALL_T, liy = ly + WALL_T;
  const liw = lw - WALL_T * 2, lih = lh - WALL_T * 2;
  for (let bx = lix + 4; bx + TS <= lix + liw - 4; bx += TS + 4)
    f(bx, liy + 4, TS, TS * 2);                                  // 상단 책장
  for (let by = liy + TS * 2 + 20; by + TS * 2 <= liy + lih - 8; by += TS * 2 + 12)
    f(lix + 4, by, TS * 2, TS * 2);                              // 왼쪽 대형 책장
  const ltcx = lix + liw / 2 - TS * 2, ltcy = liy + lih / 2 - TS / 2;
  f(ltcx, ltcy, TS * 4, TS);                                     // 열람 테이블
  f(ltcx - TS - 4, ltcy, TS, TS);                                // 의자 L
  f(ltcx + TS * 4 + 4, ltcy, TS, TS);                            // 의자 R
  f(ltcx + TS,     ltcy - TS - 4, TS, TS);                       // 의자 위1
  f(ltcx + TS * 2, ltcy - TS - 4, TS, TS);                       // 의자 위2
  f(lix + liw - TS - 8, liy + lih - TS - 8, TS, TS);             // 조명

  // ── COUNSEL ────────────────────────────────────────────────────────
  const { x: cox, y: coy, w: cow, h: coh } = COUNSEL;
  const ccix = cox + WALL_T, cciy = coy + WALL_T;
  const cciw = cow - WALL_T * 2, ccih = coh - WALL_T * 2;
  const ccmx = ccix + cciw / 2;
  f(ccmx - TS * 1.5, cciy + 16, TS * 3, TS);                     // 소파
  f(ccmx - TS, cciy + ccih / 2 - TS / 2, TS * 2, TS);            // 커피 테이블
  f(ccix + 12,            cciy + ccih / 2 - TS / 2, TS, TS);     // 안락의자 L
  f(ccix + cciw - TS - 12, cciy + ccih / 2 - TS / 2, TS, TS);    // 안락의자 R
  f(ccix + 8,              cciy + ccih - TS - 8, TS, TS);         // 화분 BL
  f(ccix + cciw - TS - 8,  cciy + ccih - TS - 8, TS, TS);         // 화분 BR

  return r;
}

export const WALL_RECTS: WallRect[] = [...buildWalls(), ...buildFurnitureRects()];

// ── 렌더러 ────────────────────────────────────────────────────────────────────

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

  // ── 타일셋 헬퍼 ───────────────────────────────────────────────────────────

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

  private place(wx: number, wy: number, tile: readonly [number, number], scale = 3): Sprite {
    const s = this.spr(tile, scale);
    s.x = wx;
    s.y = wy;
    this.addChild(s);
    return s;
  }

  // ── 배경/공통 ─────────────────────────────────────────────────────────────

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
    // 광장에서 사방으로 뻗는 십자형 통로
    const { x: px, y: py, w: pw, h: ph } = PLAZA;
    const pathColor = 0x1a1a2e;
    const pathW = 64;
    const pcx = px + pw / 2, pcy = py + ph / 2;
    const g = new Graphics();
    g.rect(pcx - pathW / 2, 0,       pathW, py);                   // 북
    g.rect(pcx - pathW / 2, py + ph, pathW, MAP_HEIGHT - py - ph); // 남
    g.rect(0,       pcy - pathW / 2, px,                   pathW); // 서
    g.rect(px + pw, pcy - pathW / 2, MAP_WIDTH - px - pw,  pathW); // 동
    g.fill({ color: pathColor });
    this.addChild(g);

    // 실외 나무 (Graphics 원)
    const trees = [
      // 광장 위쪽 (REST ~ STUDY 사이)
      { x: 660, y: 100 }, { x: 760, y: 55 }, { x: 850, y: 55 }, { x: 940, y: 100 },
      { x: 710, y: 240 }, { x: 890, y: 240 },
      // 광장 아래쪽 (LIBRARY ~ COUNSEL 사이)
      { x: 660, y: 1100 }, { x: 760, y: 1145 }, { x: 850, y: 1145 }, { x: 940, y: 1100 },
      { x: 710, y: 960  }, { x: 890, y: 960  },
      // 왼쪽 (REST 아래 ~ LIBRARY 위)
      { x: 100, y: 480 }, { x: 220, y: 560 }, { x: 100, y: 660 }, { x: 350, y: 500 },
      { x: 420, y: 680 }, { x: 240, y: 720 },
      // 오른쪽 (STUDY 아래 ~ COUNSEL 위)
      { x: 1500, y: 480 }, { x: 1380, y: 560 }, { x: 1500, y: 660 }, { x: 1250, y: 500 },
      { x: 1180, y: 680 }, { x: 1360, y: 720 },
      // 외곽 모서리
      { x: 540, y: 120 }, { x: 1060, y: 120 }, { x: 540, y: 880 }, { x: 1060, y: 880 },
    ];
    const tg = new Graphics();
    for (const t of trees) {
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

  /** 중앙 광장 — 분수, 사방 벤치, 모서리 가로등 */
  private plazaDecorations({ x, y, w, h, color }: ZoneDef) {
    const cx = x + w / 2, cy = y + h / 2;
    const g = new Graphics();

    // 분수
    g.circle(cx, cy, 56).fill({ color: 0x071628 });
    g.circle(cx, cy, 56).stroke({ color, alpha: 0.45, width: 3 });
    g.circle(cx, cy, 36).fill({ color: 0x0d1f3c });
    g.circle(cx, cy, 36).stroke({ color, alpha: 0.5, width: 2 });
    g.circle(cx, cy, 12).fill({ color, alpha: 0.75 });
    g.circle(cx, cy,  7).fill({ color: 0xffffff, alpha: 0.65 });

    const ix = x + WALL_T + 10, iy = y + WALL_T + 10;
    g.rect(ix, iy, w - WALL_T * 2 - 20, h - WALL_T * 2 - 20)
      .stroke({ color, alpha: 0.1, width: 1 });
    this.addChild(g);

    // 벤치 (분수 사방)
    this.place(cx - 110, cy - 24,  T.chairE);
    this.place(cx +  62, cy - 24,  T.chairW);
    this.place(cx -  24, cy - 94,  T.chairS);
    this.place(cx -  24, cy +  46, T.chairN);

    // 모서리 가로등
    const ix2 = x + WALL_T + 4, iy2 = y + WALL_T + 4;
    for (const [lx, ly] of [
      [ix2, iy2],
      [x + w - WALL_T - 4 - TS, iy2],
      [ix2, y + h - WALL_T - 4 - TS],
      [x + w - WALL_T - 4 - TS, y + h - WALL_T - 4 - TS],
    ] as [number, number][])
      this.place(lx, ly, T.lamp);
  }

  /** 휴식 공간 — 소파·안락의자·커피 테이블·러그·화분·연못 */
  private restDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const mcx = ix + iw / 2, mcy = iy + ih / 2;

    // 잔디 바닥 오버레이
    const g = new Graphics();
    g.rect(ix + 8, iy + 8, iw - 16, ih - 16).fill({ color: 0x0a1a0a, alpha: 0.3 });
    this.addChild(g);

    // 화분 × 4
    this.place(ix + 8,          iy + 8,          T.plantLg);
    this.place(ix + iw - TS - 8, iy + 8,         T.plantLg);
    this.place(ix + 8,          iy + ih - TS - 8, T.plantSm);
    this.place(ix + iw - TS - 8, iy + ih - TS - 8, T.plantSm);

    // 소파 (상단, 가로 3타일)
    const sofaX = mcx - TS * 1.5, sofaY = iy + 16;
    this.place(sofaX,          sofaY, T.sofaL);
    this.place(sofaX + TS,     sofaY, T.sofaM);
    this.place(sofaX + TS * 2, sofaY, T.sofaR);

    // 러그 (소파 아래 ~ 테이블 위치, 3×2)
    const rugX = mcx - TS * 1.5, rugY = sofaY + TS + 8;
    this.place(rugX,          rugY,      T.rugTL);
    this.place(rugX + TS,     rugY,      T.rugTM);
    this.place(rugX + TS * 2, rugY,      T.rugTR);
    this.place(rugX,          rugY + TS, T.rugBL);
    this.place(rugX + TS,     rugY + TS, T.rugBM);
    this.place(rugX + TS * 2, rugY + TS, T.rugBR);

    // 커피 테이블 (러그 위)
    const tblX = mcx - TS, tblY = mcy - TS / 2;
    this.place(tblX,      tblY, T.tableL);
    this.place(tblX + TS, tblY, T.tableR);

    // 안락의자 (소파 맞은편, 좌우)
    this.place(ix + 12,           mcy - TS / 2, T.chairE);
    this.place(ix + iw - TS - 12, mcy - TS / 2, T.chairW);

    // 연못 (Graphics — 오른쪽 하단)
    const pg = new Graphics();
    const pondX = ix + iw - 72, pondY = iy + ih - 72;
    pg.circle(pondX, pondY, 36).fill({ color: 0x071628 });
    pg.circle(pondX, pondY, 36).stroke({ color: 0x0ea5e9, alpha: 0.4, width: 2 });
    pg.circle(pondX, pondY, 16).fill({ color: 0x0369a1, alpha: 0.5 });
    this.addChild(pg);
  }

  /** 스터디룸 — 상단 책장·학생 책상(2×2)·강사 책상 */
  private studyDecorations({ x, y, w, h, color }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;

    // 상단 책장 행 (shelfT + shelfB = 세로 2타일)
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4) {
      this.place(bx, iy + 4,       T.shelfT);
      this.place(bx, iy + 4 + TS,  T.shelfB);
    }

    // 학생 책상 2행 × 2열 (여백 넉넉히)
    const dCols = [ix + 24, ix + iw - TS * 2 - 24];
    const dRows = [iy + TS * 2 + 24, iy + TS * 3 + 40];
    for (const dy of dRows) {
      for (const dx of dCols) {
        this.place(dx,      dy,       T.tableL);
        this.place(dx + TS, dy,       T.tableR);
        this.place(dx + 12, dy + TS + 4, T.chairN);
      }
    }

    // 강사 책상 (하단 중앙)
    const stdx = ix + iw / 2 - TS, stdy = iy + ih - TS - 8;
    this.place(stdx,      stdy, T.tableL);
    this.place(stdx + TS, stdy, T.tableR);
    this.place(stdx + TS / 2 - 4, stdy - TS - 4, T.chairS);

    // 책장 뒤 오버레이 (Graphics 보조)
    const g = new Graphics();
    g.rect(ix + 4, iy + 4, iw - 8, TS * 2 + 4).fill({ color, alpha: 0.03 });
    this.addChild(g);
  }

  /** 자료실 — 상단 책장·왼쪽 대형 책장·중앙 열람 테이블·조명 */
  private libraryDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;

    // 상단 책장
    for (let bx = ix + 4; bx + TS <= ix + iw - 4; bx += TS + 4) {
      this.place(bx, iy + 4,      T.shelfT);
      this.place(bx, iy + 4 + TS, T.shelfB);
    }

    // 왼쪽 대형 책장 (bigShelfL+R, 출입구 반대편)
    for (let by = iy + TS * 2 + 20; by + TS * 2 <= iy + ih - 8; by += TS * 2 + 12) {
      this.place(ix + 4,       by, T.bigShelfL);
      this.place(ix + 4 + TS,  by, T.bigShelfR);
    }

    // 중앙 열람 테이블 (4타일 가로)
    const tcx = ix + iw / 2 - TS * 2, tcy = iy + ih / 2 - TS / 2;
    this.place(tcx,          tcy, T.tableL);
    this.place(tcx + TS,     tcy, T.tableR);
    this.place(tcx + TS * 2, tcy, T.tableL);
    this.place(tcx + TS * 3, tcy, T.tableR);

    // 의자 (테이블 좌우, 위아래)
    this.place(tcx - TS - 4,     tcy, T.chairE);
    this.place(tcx + TS * 4 + 4, tcy, T.chairW);
    this.place(tcx + TS,     tcy - TS - 4, T.chairS);
    this.place(tcx + TS * 2, tcy - TS - 4, T.chairS);

    // 조명 (오른쪽 하단 모서리)
    this.place(ix + iw - TS - 8, iy + ih - TS - 8, T.lamp);
  }

  /** 상담실 — 소파·러그·커피 테이블·안락의자·화분 */
  private counselDecorations({ x, y, w, h }: ZoneDef) {
    const ix = x + WALL_T, iy = y + WALL_T;
    const iw = w - WALL_T * 2, ih = h - WALL_T * 2;
    const mcx = ix + iw / 2, mcy = iy + ih / 2;

    // 소파 (상단 중앙, 3타일)
    const sfX = mcx - TS * 1.5, sfY = iy + 16;
    this.place(sfX,          sfY, T.sofaL);
    this.place(sfX + TS,     sfY, T.sofaM);
    this.place(sfX + TS * 2, sfY, T.sofaR);

    // 러그 (3×2, 세팅 중앙)
    const rgX = mcx - TS * 1.5, rgY = mcy - TS;
    this.place(rgX,          rgY,      T.rugTL);
    this.place(rgX + TS,     rgY,      T.rugTM);
    this.place(rgX + TS * 2, rgY,      T.rugTR);
    this.place(rgX,          rgY + TS, T.rugBL);
    this.place(rgX + TS,     rgY + TS, T.rugBM);
    this.place(rgX + TS * 2, rgY + TS, T.rugBR);

    // 커피 테이블 (러그 위, 중앙)
    this.place(mcx - TS,     mcy - TS / 2, T.tableL);
    this.place(mcx,          mcy - TS / 2, T.tableR);

    // 안락의자 (좌우, 테이블 맞은편)
    this.place(ix + 12,            mcy - TS / 2, T.chairE);
    this.place(ix + iw - TS - 12,  mcy - TS / 2, T.chairW);

    // 화분 (하단 모서리 × 2)
    this.place(ix + 8,              iy + ih - TS - 8, T.plantLg);
    this.place(ix + iw - TS - 8,    iy + ih - TS - 8, T.plantLg);
  }

  // ── 벽 렌더링 ─────────────────────────────────────────────────────────────

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
