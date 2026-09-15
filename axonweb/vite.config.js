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

  // DEV apenas (o build de produção já vem empacotado). O Vite serve cada
  // módulo como um arquivo separado; pelo túnel do Codespace cada um custa uma
  // ida e volta de rede, então uma tela que importa dezenas de módulos vira
  // dezenas de requisições e a navegação parece travar na primeira visita.
  // Pré-empacotar as bibliotecas pesadas transforma essa cascata em poucos
  // arquivos prontos.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "framer-motion",
      "lucide-react",
      "recharts",
      "react-markdown",
      "@capacitor/core",
    ],
  },

  server: {
    host: true,
    port: 5173,
    // Compila o App já na subida (ele importa todas as telas estaticamente),
    // em vez de esperar a primeira requisição do navegador.
    warmup: {
      clientFiles: ["./src/app/App.tsx", "./src/pages/LandingPage.jsx"],
    },
  },
  resolve: {
    // import.meta.dirname (não __dirname): este arquivo é um módulo ESM, e o
    // Vite avisa que __dirname deixa de existir aqui no carregador nativo que
    // vira padrão numa próxima major. Nativo no Node >= 20.11.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
