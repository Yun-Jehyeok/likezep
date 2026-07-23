import { useEffect, useRef } from "react";
import { useGameStore } from "../../core/store/gameStore.js";

const CANVAS_W = 800;
const CANVAS_H = 600;
const SPEED = 4;
const AVATAR_SIZE = 40;
const GRID_SIZE = 50;

interface Props {
  onMove: (x: number, y: number) => void;
}

export function GameCanvas({ onMove }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep latest onMove in a ref so the animation loop doesn't capture a stale closure
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Local position for client-side prediction (smooth movement without server round-trip)
    let localX = CANVAS_W / 2;
    let localY = CANVAS_H / 2;
    let localInitialized = false;

    const keys = new Set<string>();
    let animFrame: number;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore key events when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keys.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function drawGrid() {
      ctx.strokeStyle = "#2a2a4e";
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_W; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_H; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }
    }

    function loop() {
      const { players, mySessionId } = useGameStore.getState();

      // Initialize local position from server state on first sync
      if (!localInitialized && mySessionId) {
        const me = players.get(mySessionId);
        if (me) {
          localX = me.x;
          localY = me.y;
          localInitialized = true;
        }
      }

      // Process movement input
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= SPEED;
      if (keys.has("ArrowRight") || keys.has("d")) dx += SPEED;
      if (keys.has("ArrowUp") || keys.has("w")) dy -= SPEED;
      if (keys.has("ArrowDown") || keys.has("s")) dy += SPEED;

      if (dx !== 0 || dy !== 0) {
        localX = Math.max(AVATAR_SIZE / 2, Math.min(CANVAS_W - AVATAR_SIZE / 2, localX + dx));
        localY = Math.max(AVATAR_SIZE / 2, Math.min(CANVAS_H - AVATAR_SIZE / 2, localY + dy));
        onMoveRef.current(localX, localY);
      }

      // Render
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = "#16162a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid();

      ctx.textAlign = "center";
      ctx.font = "12px sans-serif";

      players.forEach((player, sessionId) => {
        const isMe = sessionId === mySessionId;
        const px = isMe ? localX : player.x;
        const py = isMe ? localY : player.y;

        ctx.fillStyle = isMe ? "#3b82f6" : "#6b7280";
        ctx.fillRect(px - AVATAR_SIZE / 2, py - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(player.name, px, py + AVATAR_SIZE / 2 + 16);
      });

      animFrame = requestAnimationFrame(loop);
    }

    animFrame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{
        display: "block",
        margin: "0 auto",
        marginTop: "calc(50vh - 300px)",
        border: "1px solid #333",
      }}
    />
  );
}
