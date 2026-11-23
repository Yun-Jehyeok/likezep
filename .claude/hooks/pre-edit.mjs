import path from "node:path";

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  const filePath = input?.tool_input?.file_path ?? "";
  const content = input?.tool_input?.new_string ?? input?.tool_input?.content ?? "";

  const root = process.cwd();
  const rel = path.relative(root, path.resolve(filePath)).replace(/\\/g, "/");

  // ─── Category B: 아키텍처 강제 ───────────────────────────────────

  // Rule 1: apps/room/src/game/ 에서 React import 금지
  if (rel.startsWith("apps/room/src/game/")) {
    if (/from\s+['"]react['"]/.test(content) || /import\s+React\b/.test(content)) {
      console.error("\n🚫 아키텍처 위반: apps/room/src/game/ 에서 React를 import할 수 없습니다.");
      console.error("   game/ 은 순수 PixiJS/로직만 허용됩니다.\n");
      process.exit(1);
    }
  }

  // Rule 2: apps/server/src/rooms/logic/ 에서 Colyseus import 금지
  if (rel.startsWith("apps/server/src/rooms/logic/")) {
    if (/from\s+['"]colyseus/.test(content) || /require\s*\(\s*['"]colyseus/.test(content)) {
      console.error("\n🚫 아키텍처 위반: rooms/logic/ 에서 Colyseus를 import할 수 없습니다.");
      console.error("   logic/ 은 순수 함수만 허용됩니다.\n");
      process.exit(1);
    }
  }

  // Rule 3: apps/server/src/ 에서 db/ 외부 파일이 @prisma/client 직접 import 금지
  if (
    rel.startsWith("apps/server/src/") &&
    !rel.startsWith("apps/server/src/db/") &&
    !rel.startsWith("apps/server/src/db.ts")
  ) {
    if (/from\s+['"]@prisma\/client['"]/.test(content) || /new\s+PrismaClient\s*\(/.test(content)) {
      console.error("\n🚫 아키텍처 위반: @prisma/client를 직접 import할 수 없습니다.");
      console.error("   DB 접근은 apps/server/src/db/ 리포지토리를 통해서만 가능합니다.\n");
      process.exit(1);
    }
  }

  // (2026-11-23) current-task 워크플로우 게이트 제거 — 역할 팀(planner·developer·qa)으로 대체.
  // 차단 종료 코드(exit 1 → exit 2)와 역할별 차단은 하네스 3단계에서 다시 쓴다.

  process.exit(0);
}

main().catch(() => process.exit(1));
