import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Read the server port from config/settings.json so the dev proxy always matches the server
function serverPort(): number {
  const file = fileURLToPath(new URL("../../config/settings.json", import.meta.url));
  if (!existsSync(file)) return 3000;
  try {
    const settings = JSON.parse(readFileSync(file, "utf8"));
    return Number(settings?.server?.port) || 3000;
  } catch {
    return 3000;
  }
}

const target = `http://127.0.0.1:${serverPort()}`;
console.log("proxy target:", target);

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": target },
  },
});
