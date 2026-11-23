import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Em dev o Vite repassa o WebSocket para o servidor do jogo.
      "/ws": { target: "ws://localhost:3001", ws: true },
      "/health": { target: "http://localhost:3001" },
    },
  },
  build: {
    target: "es2022",
  },
});
