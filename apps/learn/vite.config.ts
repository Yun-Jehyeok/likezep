import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { federation } from "@module-federation/vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        federation({
            name: "learn",
            filename: "remoteEntry.js",
            // mf-manifest.json: expose별 JS·CSS 목록. shell index.html이 /learn 첫 진입 때 읽어 MF 체인 파일을
            // 한꺼번에 미리 받는다(강의실 성능 P3 ③). 배포 때 no-cache로 올린다(deploy-learn.yml)
            manifest: true,
            exposes: { "./App": "./LearnApp.tsx" },
            shared: { react: { singleton: true }, "react-dom": { singleton: true }, zustand: { singleton: true }, "@mentoring/ui": { singleton: true }, "react-router-dom": { singleton: true } },
        }),
    ],
    optimizeDeps: {
        exclude: ["@tailwindcss/oxide"],
        include: ["use-sync-external-store/shim/with-selector"],
    },
    server: {
        port: 5175,
        proxy: {
            "/api": "http://localhost:2567",
        },
    },
});
