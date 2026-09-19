/**
 * PixiJS 게임 루프를 관리하는 클래스
 *
 * 게임 루프 구조 (매 프레임 실행):
 *   tick()
 *   ├── moveLocal(dt)      → WASD 입력으로 내 아바타를 이동
 *   ├── interpolateRemote() → 다른 플레이어들의 위치를 부드럽게 보간
 *   ├── updateCamera()     → 내 아바타를 화면 중앙에 오도록 뷰포트 이동
 *   └── maybeSend()        → 50ms마다 서버에 내 위치 전송 (20Hz)
 *
 * 뷰포트(Camera) 방식:
 * - app.stage(고정) 아래에 viewport Container를 두고, viewport.x/.y를 조정해 카메라를 구현한다
 * - 내 아바타가 화면 중앙에 오도록 viewport를 반대 방향으로 움직인다
 * - 맵 가장자리에서는 스크롤을 막아 검은 공간이 보이지 않게 클램핑한다
 *
 * static create() 패턴:
 * - PixiJS Application.init()이 비동기이므로 constructor 대신 static 팩토리 메서드를 사용
 * - constructor를 직접 호출하면 await app.init()을 쓸 수 없다
 */
import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import type { PlayerInfo } from "../core/realtime/colyseusClient.js";
import { Avatar } from "./entities/Avatar.js";
import { MapRenderer, MAP_WIDTH, MAP_HEIGHT } from "./world/mapRenderer.js";
import { KeyboardInput } from "./input/keyboard.js";

const MOVE_SPEED = 220;      // 초당 픽셀 이동 속도
const SEND_INTERVAL_MS = 50; // 서버에 위치 전송 주기 (20Hz, 매 프레임 보내면 과부하)
const PLAYER_RADIUS = 20;    // 맵 경계 클램핑에 사용 (아바타 반지름)

export class GameApp {
  private app!: Application;
  private viewport!: Container;
  private avatars = new Map<string, Avatar>();  // sessionId → Avatar
  private keyboard!: KeyboardInput;
  private room: Room;
  private mySessionId: string;
  private lastSendMs = 0;  // 마지막 위치 전송 시각 (ms)
  private tickBound!: () => void;

  private constructor(room: Room, sessionId: string) {
    this.room = room;
    this.mySessionId = sessionId;
  }

  /**
   * PixiJS Application을 초기화하고 GameApp 인스턴스를 반환하는 팩토리 메서드.
   * canvas는 React ref로 전달되므로 React가 렌더링한 DOM 요소를 재사용한다.
   */
  static async create(
    canvas: HTMLCanvasElement,
    sessionId: string,
    playerName: string,
    room: Room,
  ): Promise<GameApp> {
    const self = new GameApp(room, sessionId);

    const app = new Application();
    await app.init({
      canvas,
      resizeTo: canvas.parentElement ?? canvas,  // 부모 요소 크기에 맞게 자동 리사이즈
      backgroundColor: 0x12121a,
      antialias: true,
    });
    self.app = app;

    // viewport: 카메라 역할. stage 아래에 두고 x/y를 조절해 맵을 스크롤한다.
    const viewport = new Container();
    self.viewport = viewport;
    app.stage.addChild(viewport);

    viewport.addChild(new MapRenderer());

    self.keyboard = new KeyboardInput();

    // app.ticker에 tick 함수를 등록하면 매 프레임(기본 60fps) 호출된다
    self.tickBound = self.tick.bind(self);
    app.ticker.add(self.tickBound);

    // 내 아바타는 입장 시 맵 중앙에 배치 (서버의 랜덤 스폰 위치는 state sync로 곧 덮임)
    self.addPlayer(sessionId, {
      id: sessionId,
      name: playerName,
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
    });

    return self;
  }

  /** 새 플레이어 아바타를 씬에 추가 (이미 있으면 중복 추가 방지) */
  addPlayer(sessionId: string, info: PlayerInfo) {
    if (this.avatars.has(sessionId)) return;
    const isSelf = sessionId === this.mySessionId;
    const avatar = new Avatar(sessionId, info.name, info.x, info.y, isSelf);
    this.avatars.set(sessionId, avatar);
    this.viewport.addChild(avatar);
  }

  /** 퇴장한 플레이어의 아바타를 씬에서 제거 */
  removePlayer(sessionId: string) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;
    this.viewport.removeChild(avatar);
    this.avatars.delete(sessionId);
  }

  /** 원격 플레이어의 보간 목표 위치 업데이트 (서버 state sync 콜백에서 호출) */
  movePlayer(sessionId: string, x: number, y: number) {
    if (sessionId === this.mySessionId) return;  // 내 위치는 로컬에서 직접 제어
    this.avatars.get(sessionId)?.setTarget(x, y);
  }

  /** 채팅창 포커스 상태를 키보드 입력기에 전달 */
  setChatFocused(focused: boolean) {
    this.keyboard.setChatFocused(focused);
  }

  /** 매 프레임 호출되는 메인 루프 */
  private tick() {
    const dt = this.app.ticker.deltaMS / 1000;  // 밀리초 → 초 변환 (프레임-레이트 독립 이동)
    this.moveLocal(dt);
    this.interpolateRemote();
    this.updateCamera();
    this.maybeSend();
  }

  /**
   * 키보드 입력에 따라 내 아바타를 이동.
   * dt(deltaTime)를 곱해 60fps/30fps 관계없이 같은 속도로 이동하게 한다.
   * Math.max/min으로 맵 경계를 벗어나지 않게 클램핑.
   */
  private moveLocal(dt: number) {
    const me = this.avatars.get(this.mySessionId);
    if (!me) return;

    const step = MOVE_SPEED * dt;
    const kb = this.keyboard;

    if (kb.isDown("w") || kb.isDown("arrowup"))    me.y = Math.max(PLAYER_RADIUS, me.y - step);
    if (kb.isDown("s") || kb.isDown("arrowdown"))  me.y = Math.min(MAP_HEIGHT - PLAYER_RADIUS, me.y + step);
    if (kb.isDown("a") || kb.isDown("arrowleft"))  me.x = Math.max(PLAYER_RADIUS, me.x - step);
    if (kb.isDown("d") || kb.isDown("arrowright")) me.x = Math.min(MAP_WIDTH - PLAYER_RADIUS, me.x + step);

    // 내 아바타는 로컬에서 직접 이동하므로 targetX/Y를 현재값과 동기화해 보간이 작동하지 않게 한다
    me.targetX = me.x;
    me.targetY = me.y;
  }

  /** 원격 플레이어 아바타들의 보간 처리 (내 아바타 제외) */
  private interpolateRemote() {
    for (const [id, avatar] of this.avatars) {
      if (id !== this.mySessionId) avatar.interpolate();
    }
  }

  /**
   * 카메라를 내 아바타 중심으로 맞춘다.
   * viewport.x = 화면너비/2 - 내아바타X 이면 아바타가 화면 중앙에 온다.
   * 단, 맵 가장자리에서는 스크롤을 멈춰 검은 공간이 보이지 않게 한다.
   */
  private updateCamera() {
    const me = this.avatars.get(this.mySessionId);
    if (!me) return;

    const hw = this.app.screen.width / 2;
    const hh = this.app.screen.height / 2;

    // 카메라 중심을 맵 경계 내로 클램핑
    const cx = Math.max(hw, Math.min(MAP_WIDTH - hw, me.x));
    const cy = Math.max(hh, Math.min(MAP_HEIGHT - hh, me.y));

    this.viewport.x = hw - cx;
    this.viewport.y = hh - cy;
  }

  /**
   * 위치를 서버로 전송한다. 매 프레임 보내면 불필요한 트래픽이 발생하므로
   * 50ms(20Hz)마다 한 번씩 보낸다 (performance.now()로 경과 시간 체크).
   */
  private maybeSend() {
    const now = performance.now();
    if (now - this.lastSendMs < SEND_INTERVAL_MS) return;
    this.lastSendMs = now;

    const me = this.avatars.get(this.mySessionId);
    if (!me) return;
    // 정수로 반올림해 불필요한 소수점 전송을 줄인다
    this.room.send("move", { x: Math.round(me.x), y: Math.round(me.y) });
  }

  /** React 컴포넌트 언마운트 시 게임 루프와 리소스를 정리한다 */
  destroy() {
    this.keyboard.destroy();
    this.app.destroy(false, { children: true });  // canvas DOM은 React가 관리하므로 제거하지 않음
  }
}
