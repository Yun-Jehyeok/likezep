/**
 * Pretendard 자체 호스팅용 @font-face CSS 생성기
 *
 * 입력: node_modules/pretendard (package.json에 정확한 버전 고정)의 가변 폰트 dynamic subset CSS
 * 출력: src/fonts/pretendard.css
 *
 * 패키지 CSS를 그대로 import하지 않고 다시 만드는 이유
 * - font-family를 'Pretendard Variable' → 'Pretendard'로 바꾼다. room/learn remote CSS가
 *   `--font-sans: "Pretendard"`를 직접 정의하고 shell보다 나중에 로드되므로, 이름이 같아야
 *   remote를 고치지 않고 shell만 바꿀 수 있다.
 * - woff2만 참조한다. (가변 폰트 CSS는 원래 woff2뿐이지만, 정적 CSS를 쓰면 woff까지 빌드에 딸려온다)
 * - 경로를 node_modules 기준으로 바꿔 Vite가 해시 파일명으로 dist/assets에 내보내게 한다
 *   (shell은 S3 루트에 배포되므로 MF 에셋 경로 규칙에도 맞다).
 *
 * 브라우저는 unicode-range 92조각 중 화면에 실제로 쓰인 글자가 든 조각만 받는다.
 * 가변 폰트라 400/500/600/700 굵기를 조각 하나로 처리한다.
 *
 * 실행: node apps/shell/scripts/generate-font-css.mjs  (pretendard 버전을 올렸을 때만)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const shellDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(shellDir, "package.json"));
const pkgJson = require.resolve("pretendard/package.json");
const { version } = JSON.parse(readFileSync(pkgJson, "utf8"));

const outDir = join(shellDir, "src", "fonts");
const outFile = join(outDir, "pretendard.css");
// src/fonts → apps/shell/node_modules/pretendard (pnpm 심볼릭 링크)
const fontDir = relative(outDir, join(shellDir, "node_modules", "pretendard", "dist", "web", "variable")).replaceAll("\\", "/");

const source = readFileSync(join(dirname(pkgJson), "dist/web/variable/pretendardvariable-dynamic-subset.css"), "utf8");
const faces = source.match(/@font-face\s*{[^}]*}/g) ?? [];
if (faces.length === 0) throw new Error("@font-face 블록을 찾지 못했습니다 — 패키지 구조가 바뀌었는지 확인하세요");

const rewritten = faces.map((block) => {
    const src = block.match(/url\(\.\/([^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!src || !range) throw new Error(`형식이 예상과 다릅니다:\n${block}`);
    return [
        "@font-face {",
        "    font-family: 'Pretendard';",
        "    font-style: normal;",
        "    font-display: swap;",
        "    font-weight: 45 920;",
        `    src: url('${fontDir}/${src}') format('woff2-variations');`,
        `    unicode-range: ${range.trim()};`,
        "}",
    ].join("\n");
});

const header = `/*
 * 자동 생성 파일 — 직접 고치지 말고 apps/shell/scripts/generate-font-css.mjs를 실행할 것
 * pretendard@${version} 가변 폰트 dynamic subset (${faces.length}조각), font-family 'Pretendard'
 *
 * Pretendard — Copyright (c) 2021 Kil Hyung-jin, with Reserved Font Name Pretendard.
 * SIL Open Font License 1.1 — https://github.com/orioncactus/pretendard
 */
`;
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${header}\n${rewritten.join("\n\n")}\n`);
console.log(`✔ ${relative(process.cwd(), outFile)} — ${faces.length} @font-face, pretendard@${version}`);
