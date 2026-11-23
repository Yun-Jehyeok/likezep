import { execSync } from "node:child_process";

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  const command = input?.tool_input?.command ?? "";

  // CLAUDE.md git staging 차단
  if (/git\s+add/.test(command) && /CLAUDE\.md/.test(command)) {
    console.error("\n🚫 CLAUDE.md는 gitignore 대상입니다. git add에서 제외하세요.\n");
    process.exit(1);
  }

  // git commit 전 pnpm check 강제
  if (/git\s+commit/.test(command)) {
    console.log("\n🔍 git commit 감지 — pnpm check 실행 중...\n");
    try {
      execSync("pnpm check", { stdio: "inherit", cwd: process.cwd() });
      console.log("\n✅ pnpm check 통과\n");
    } catch {
      console.error("\n🚫 pnpm check 실패 — 오류를 수정한 뒤 다시 커밋하세요.\n");
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(1));
