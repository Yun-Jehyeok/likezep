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
