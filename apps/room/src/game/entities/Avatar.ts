/**
 * 아바타 — PixiJS Container를 상속한 플레이어 표현 객체
 *
 * PixiJS의 씬 그래프(Scene Graph):
 * Stage(root) → viewport(Container) → Avatar(Container) → Graphics, Text
 * Container는 여러 자식 DisplayObject를 그룹으로 묶고 위치/회전/스케일을 공유한다.
 *
 * 원격 플레이어 보간(Interpolation):
 * - 서버는 100ms마다 위치를 전송하지만 화면은 60fps(~16ms)로 렌더링된다
 * - 매 프레임 실제 위치로 텔레포트하면 버벅임이 심하다
 * - setTarget()으로 목표 위치를 저장하고, interpolate()가 매 프레임 현재→목표로
 *   18%(factor=0.18)씩 이동하면 부드럽게 추종하는 효과가 난다 (지수 감쇠 보간)
 */
import { Container, Graphics, Text } from "pixi.js";

/** 아바타 색상 팔레트 — sessionId 해시로 고정 색상을 배정해 매 렌더마다 달라지지 않게 한다 */
const PALETTE = [0xff6b35, 0x22c55e, 0xa855f7, 0xec4899, 0xeab308, 0x06b6d4];

/** sessionId를 해시해 팔레트에서 색상을 선택한다. 같은 ID는 항상 같은 색이다. */
function sessionColor(sessionId: string): number {
  let h = 0;
  // djb2 해시 알고리즘 변형 (빠르고 분포가 고름)
  for (const c of sessionId) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export class Avatar extends Container {
  /** 보간 목표 위치. GameApp.tick()에서 setTarget()으로 설정하고 interpolate()가 추종한다. */
  targetX: number;
  targetY: number;

  constructor(sessionId: string, name: string, x: number, y: number, isSelf: boolean) {
    super();
    this.targetX = x;
    this.targetY = y;
    this.position.set(x, y);

    // 내 아바타는 파란색, 다른 사람은 sessionId 기반 고정 색상
    const color = isSelf ? 0x0071ff : sessionColor(sessionId);

    // 자기 자신임을 알 수 있도록 발광 링을 추가 (반투명 파란 원)
    if (isSelf) {
      const ring = new Graphics();
      ring.circle(0, 0, 26).fill({ color: 0x0071ff, alpha: 0.2 });
      this.addChild(ring);
    }

    // 아바타 본체 원
    const body = new Graphics();
    body.circle(0, 0, 20).fill({ color });
    this.addChild(body);

    // 이름 첫 글자를 원 중앙에 표시
    const letter = new Text({
      text: name[0]?.toUpperCase() ?? "?",
      style: { fontSize: 16, fill: "#ffffff", fontFamily: "Pretendard, sans-serif", fontWeight: "bold" },
    });
    letter.anchor.set(0.5);  // 중앙 정렬 (0,0은 좌상단, 0.5는 중앙)
    this.addChild(letter);

    // 이름 레이블 (원 아래에 표시)
    const label = new Text({
      text: isSelf ? `${name} (나)` : name,
      style: { fontSize: 11, fill: "#cccccc", fontFamily: "Pretendard, sans-serif" },
    });
    label.anchor.set(0.5, 0);  // x 중앙, y 상단 정렬
    label.y = 26;               // 원 반지름(20) + 여백(6)
    this.addChild(label);
  }

  /** 원격 플레이어의 새 위치를 목표로 설정 */
  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * 지수 감쇠 보간(Exponential Decay Interpolation).
   * 매 프레임 현재 위치와 목표 위치의 차이를 factor만큼 줄인다.
   * factor가 클수록 빠르게 추종하고, 작을수록 부드럽게 따라간다.
   * frame-rate 독립적이지 않으므로 60fps 환경을 전제한다.
   */
  interpolate(factor = 0.18) {
    this.x += (this.targetX - this.x) * factor;
    this.y += (this.targetY - this.y) * factor;
  }
}
