import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import type { PlayerInfo } from "../core/realtime/colyseusClient.js";
import { Avatar } from "./entities/Avatar.js";
import { MapRenderer, MAP_WIDTH, MAP_HEIGHT } from "./world/mapRenderer.js";
import { KeyboardInput } from "./input/keyboard.js";

const MOVE_SPEED = 220; // px/sec
const SEND_INTERVAL_MS = 50; // 20 updates/sec
const PLAYER_RADIUS = 20;

export class GameApp {
  private app!: Application;
  private viewport!: Container;
  private avatars = new Map<string, Avatar>();
  private keyboard!: KeyboardInput;
  private room: Room;
  private mySessionId: string;
  private lastSendMs = 0;
  private tickBound!: () => void;

  private constructor(room: Room, sessionId: string) {
    this.room = room;
    this.mySessionId = sessionId;
  }

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
      resizeTo: canvas.parentElement ?? canvas,
      backgroundColor: 0x12121a,
      antialias: true,
    });
    self.app = app;

    // World container (moves for camera)
    const viewport = new Container();
    self.viewport = viewport;
    app.stage.addChild(viewport);

    viewport.addChild(new MapRenderer());

    self.keyboard = new KeyboardInput();

    self.tickBound = self.tick.bind(self);
    app.ticker.add(self.tickBound);

    // Add self avatar at center of map
    self.addPlayer(sessionId, {
      id: sessionId,
      name: playerName,
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
    });

    return self;
  }

  addPlayer(sessionId: string, info: PlayerInfo) {
    if (this.avatars.has(sessionId)) return;
    const isSelf = sessionId === this.mySessionId;
    const avatar = new Avatar(sessionId, info.name, info.x, info.y, isSelf);
    this.avatars.set(sessionId, avatar);
    this.viewport.addChild(avatar);
  }

  removePlayer(sessionId: string) {
    const avatar = this.avatars.get(sessionId);
    if (!avatar) return;
    this.viewport.removeChild(avatar);
    this.avatars.delete(sessionId);
  }

  movePlayer(sessionId: string, x: number, y: number) {
    if (sessionId === this.mySessionId) return; // self is driven locally
    this.avatars.get(sessionId)?.setTarget(x, y);
  }

  setChatFocused(focused: boolean) {
    this.keyboard.setChatFocused(focused);
  }

  private tick() {
    const dt = this.app.ticker.deltaMS / 1000; // seconds
    this.moveLocal(dt);
    this.interpolateRemote();
    this.updateCamera();
    this.maybeSend();
  }

  private moveLocal(dt: number) {
    const me = this.avatars.get(this.mySessionId);
    if (!me) return;

    const step = MOVE_SPEED * dt;
    const kb = this.keyboard;

    if (kb.isDown("w") || kb.isDown("arrowup"))    me.y = Math.max(PLAYER_RADIUS, me.y - step);
    if (kb.isDown("s") || kb.isDown("arrowdown"))  me.y = Math.min(MAP_HEIGHT - PLAYER_RADIUS, me.y + step);
    if (kb.isDown("a") || kb.isDown("arrowleft"))  me.x = Math.max(PLAYER_RADIUS, me.x - step);
    if (kb.isDown("d") || kb.isDown("arrowright")) me.x = Math.min(MAP_WIDTH - PLAYER_RADIUS, me.x + step);

    me.targetX = me.x;
    me.targetY = me.y;
  }

  private interpolateRemote() {
    for (const [id, avatar] of this.avatars) {
      if (id !== this.mySessionId) avatar.interpolate();
    }
  }

  private updateCamera() {
    const me = this.avatars.get(this.mySessionId);
    if (!me) return;

    const hw = this.app.screen.width / 2;
    const hh = this.app.screen.height / 2;
    const cx = Math.max(hw, Math.min(MAP_WIDTH - hw, me.x));
    const cy = Math.max(hh, Math.min(MAP_HEIGHT - hh, me.y));

    this.viewport.x = hw - cx;
    this.viewport.y = hh - cy;
  }

  private maybeSend() {
    const now = performance.now();
    if (now - this.lastSendMs < SEND_INTERVAL_MS) return;
    this.lastSendMs = now;

    const me = this.avatars.get(this.mySessionId);
    if (!me) return;
    this.room.send("move", { x: Math.round(me.x), y: Math.round(me.y) });
  }

  destroy() {
    this.keyboard.destroy();
    this.app.destroy(false, { children: true });
  }
}
