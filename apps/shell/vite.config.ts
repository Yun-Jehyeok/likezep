import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * MF 체인 미리 받기 — shell 쪽 (강의실 성능 P3 ③, docs/plans/learn-performance.md)
 *
 * cold 진입은 MF 체인(remoteEntry → 런타임 → 공유 모듈 맵 → pendingShares → 첫 렌더 → loadRemote → remote 청크)이
 * 순차로 진행된다. shell 자기 청크 중 동적 import라 Vite가 index.html modulepreload에 넣지 않는 두 개를 처리한다.
 * - pendingShares: 모든 경로의 host 초기화에 쓰인다 → 모든 페이지 <head>에 modulepreload
 * - learn loadRemote 청크: /learn과 /lobby(강의실 미리 받기, §5.1 ②)에서만 필요 → index.html 인라인 스크립트의 자리표시자(__MF_LEARN_LOADER__)에 경로를 넣는다
 * remote(learn·room) 파일은 그 인라인 스크립트가 각 remote의 mf-manifest.json을 읽어 미리 받는다.
 * 청크를 못 찾으면 경고만 하고 넘어간다(미리 받기만 빠지고 동작은 같다).
 */
function mfChainPreload(): Plugin {
    return {
        name: "likezep-mf-chain-preload",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html, ctx) {
                const files = Object.keys(ctx.bundle ?? {});
                const pendingShares = files.find((f) => /(^|\/)pendingShares-[^/]+\.js$/.test(f));
                const learnLoader = files.find((f) => /loadRemote__learn_mf_1_App[^/]*\.js$/.test(f));
                if (!pendingShares) console.warn("[mf-chain-preload] pendingShares 청크를 찾지 못함 — 미리 받기 생략");
                if (!learnLoader) console.warn("[mf-chain-preload] learn loadRemote 청크를 찾지 못함 — 미리 받기 생략");
                let out = html;
                if (pendingShares) out = out.replace("</head>", `    <link rel="modulepreload" crossorigin href="/${pendingShares}">\n    </head>`);
                // 따옴표까지 맞춰 바꾼다 (주석 속 같은 글자는 건드리지 않게)
                if (learnLoader) out = out.replace('"__MF_LEARN_LOADER__"', `"/${learnLoader}"`);
                return out;
            },
        },
    };
}

/**
 * shell CSS를 HTML에 인라인 (강의실 성능 §5.1 ⑤, docs/plans/learn-performance.md)
 *
 * Vite는 entry CSS(src/index.css — Tailwind)를 <head>의 <link rel=stylesheet>로 넣는다. 이 링크는 렌더 차단이라
 * 첫 화면(index.html의 정적 뼈대)이 CSS 도착까지 기다리고, 뒤의 module script 실행도 CSS를 기다린다.
 * cold에서는 이 CSS가 MF 미리 받기 20여 개와 회선을 다퉈 약 1.64s에 끝났다(FCP 1.7s).
 * 전체가 작아서(약 18KB, brotli 약 4KB) 같은 자리에 <style>로 바꿔 넣는다 → 뼈대는 HTML만 받으면 그려진다.
 * - 뼈대에 필요한 부분만 넣지 않는 이유: 뼈대와 실제 화면이 같은 Tailwind 클래스를 쓴다. 일부만 넣으면 나머지를
 *   비동기로 받아야 하고, React가 그 전에 그리면 스타일 없는 화면이 잠깐 보인다. 전체를 넣으면 CSS를 두 벌 관리할 일도 없다
 * - HTML은 no-cache + ETag라 재방문은 304로 본문을 다시 받지 않는다. CSS가 따로 1년 캐시되던 이점은 없어진다
 * - CSS 파일은 그대로 내보낸다(HTML 참조만 없앰)
 * - 못 찾으면 경고만 하고 링크를 그대로 둔다(지금과 같은 동작)
 */
function inlineEntryCss(): Plugin {
    return {
        name: "likezep-inline-entry-css",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler(html, ctx) {
                const bundle = ctx.bundle ?? {};
                let inlined = 0;
                const out = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/(assets\/[^"]+\.css)"[^>]*>/g, (tag, file: string) => {
                    const asset = bundle[file];
                    const css = asset?.type === "asset" ? (typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source)) : null;
                    if (!css || /<\/style/i.test(css)) {
                        console.warn(`[inline-entry-css] ${file}를 인라인하지 못함 — <link> 유지`);
                        return tag;
                    }
                    inlined++;
                    return `<style data-from="${file}">${css}</style>`;
                });
                if (!inlined) console.warn("[inline-entry-css] 인라인할 entry CSS 링크를 찾지 못함");
                return out;
            },
        },
    };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    server: { port: 5173 },
    optimizeDeps: {
        exclude: ["@tailwindcss/oxide"],
        include: ["use-sync-external-store/shim/with-selector"],
    },
    plugins: [
        react(),
        tailwindcss(),
        federation({
            name: "shell",
            remotes: {
                room: {
                    name: "room",
                    type: "module",
                    entry: command === "serve" ? "http://localhost:5174/remoteEntry.js" : "https://like-zep.shop/remotes/room/remoteEntry.js",
                },
                learn: {
                    name: "learn",
                    type: "module",
                    entry: command === "serve" ? "http://localhost:5175/remoteEntry.js" : "https://like-zep.shop/remotes/learn/remoteEntry.js",
                },
            },
            shared: {
                react: { singleton: true, requiredVersion: "^18.3.0" },
                "react-dom": { singleton: true, requiredVersion: "^18.3.0" },
                zustand: { singleton: true },
                "@mentoring/ui": { singleton: true },
                "react-router-dom": { singleton: true },
            },
        }),
        mfChainPreload(),
        inlineEntryCss(),
    ],
}));
