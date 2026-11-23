import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  const filePath = input?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const root = process.cwd();
  const rel = path.relative(root, path.resolve(filePath)).replace(/\\/g, "/");

  // schema.prisma 수정 → migrate 알림
  if (rel.endsWith("schema.prisma")) {
    console.log("\n⚠️  schema.prisma 수정 감지");
    console.log("   로컬: pnpm --filter @mentoring/server exec prisma migrate dev");
    console.log("   EC2:  pnpm --filter @mentoring/server exec prisma migrate deploy\n");
    process.exit(0);
  }

  // TS/TSX 파일만 이하 처리
  if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

  // packages/ui/src 수정 → 자동 빌드
  if (rel.startsWith("packages/ui/src/")) {
    console.log("\n📦 packages/ui/src 변경 감지 — @mentoring/ui 빌드 실행 중...\n");
    try {
      execSync("pnpm --filter @mentoring/ui build", { stdio: "inherit", cwd: root });
      console.log("\n✅ @mentoring/ui 빌드 완료\n");
    } catch {
      console.error("\n🚫 @mentoring/ui 빌드 실패\n");
      process.exit(1);
    }
    process.exit(0);
  }

  // 패키지별 tsconfig 매핑
  const pkgDirMap = [
    ["apps/shell/",    "apps/shell"],
    ["apps/room/",     "apps/room"],
    ["apps/learn/",    "apps/learn"],
    ["apps/server/",   "apps/server"],
    ["packages/ui/",   "packages/ui"],
    ["packages/shared/", "packages/shared"],
  ];

  let pkgDir = root;
  for (const [prefix, dir] of pkgDirMap) {
    if (rel.startsWith(prefix)) {
      pkgDir = path.join(root, dir);
      break;
    }
  }

  let hasError = false;

  try {
    execSync(`npx eslint --fix "${filePath}"`, { stdio: "inherit", cwd: root });
  } catch {
    hasError = true;
  }

  const tsconfigPath = path.join(pkgDir, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      execSync(`npx tsc --noEmit -p "${tsconfigPath}"`, { stdio: "inherit", cwd: root });
    } catch {
      hasError = true;
    }
  }

  if (hasError) process.exit(1);
}

main().catch(() => process.exit(1));
