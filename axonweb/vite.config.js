import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "child_process";
import path from "path";

// Hash do commit que originou este bundle, carimbado na tela de login do app
// para dar para conferir a olho se o APK instalado e o novo (ver
// src/lib/buildInfo.ts). Lido do git na hora do build; se o git nao estiver
// disponivel (build fora do repo), vira "dev" em vez de quebrar o build.
function commitAtual() {
  if (process.env.VITE_BUILD_COMMIT) return process.env.VITE_BUILD_COMMIT;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(commitAtual()),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
