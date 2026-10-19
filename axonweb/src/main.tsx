import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import "@fontsource-variable/inter/index.css";
import "./styles/index.css";

// Marca o "shell de aplicativo": o CSS de safe area e de layout nativo vive
// atrás desta classe. O nome diz `native`, mas hoje ela vale SEMPRE — inclusive
// na web — porque a web em largura de celular é a pré-visualização do design
// mobile e precisa das mesmas regras. Renomear a classe mexeria em ~15 regras
// do index.css sem ganho funcional, então ficou o nome histórico.
//
// Ligar na web é seguro porque `env(safe-area-inset-*)` vale zero fora do
// aparelho: cada regra foi conferida e nenhuma muda o desktop (as de safe area
// viram no-op, e as da barra inferior dependem de `:has([data-bottom-nav])`,
// que é falso no desktop porque o gate DESMONTA a barra).
document.documentElement.classList.add("is-native");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);