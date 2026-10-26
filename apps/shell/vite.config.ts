import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import tailwindcss from "@tailwindcss/vite";

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
    ],
}));
