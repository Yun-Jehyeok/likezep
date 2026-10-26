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
            exposes: { "./App": "./src/RoomApp.tsx" },
            shared: { react: { singleton: true }, "react-dom": { singleton: true }, zustand: { singleton: true }, "@mentoring/ui": { singleton: true } },
        }),
    ],
    server: {
        proxy: {
            "/api": "http://localhost:2567",
        },
    },
});
