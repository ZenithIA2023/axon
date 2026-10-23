import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
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

// Só no app iOS instalado: o WebKit dá zoom automático ao focar um campo com
// fonte abaixo de 16px e não desfaz depois, deixando a tela aproximada e
// deslocada. Quase todos os campos do app estão abaixo de 16px; travar a escala
// evita mexer no design. Não use `is-native` como condição (ela vale na web,
// onde tirar o pinch-zoom seria regressão de acessibilidade), nem
// isNativePlatform() (o Android não tem esse comportamento).
if (Capacitor.getPlatform() === "ios") {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no"
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);