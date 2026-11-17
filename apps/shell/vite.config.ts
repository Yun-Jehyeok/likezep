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
    ],
}));
