import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { federation } from "@module-federation/vite";

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        federation({
            name: "room",
            filename: "remoteEntry.js",
            // mf-manifest.json: shell이 /learn 첫 진입 때 room의 초기화 파일(런타임·공유 모듈 맵)을 미리 받는 데 쓴다.
            // host 초기화가 room 초기화까지 기다리기 때문(강의실 성능 P3 ③). 배포 때 no-cache로 올린다(deploy-room.yml)
            manifest: true,
            exposes: { "./App": "./src/RoomApp.tsx" },
            shared: { react: { singleton: true }, "react-dom": { singleton: true }, zustand: { singleton: true }, "@mentoring/ui": { singleton: true }, "react-router-dom": { singleton: true } },
        }),
    ],
    optimizeDeps: {
        exclude: ["@tailwindcss/oxide"],
        include: ["use-sync-external-store/shim/with-selector"],
    },
    server: {
        port: 5174,
        proxy: {
            "/api": "http://localhost:2567",
        },
    },
});
