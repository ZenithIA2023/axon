import { useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Botão físico de voltar do Android.
 *
 * Sem tratamento, o Capacitor fecha o app a partir de QUALQUER tela — o
 * usuário toca em voltar esperando sair de uma subtela e perde o app inteiro.
 *
 * Comportamento implementado:
 * - Há histórico → volta uma tela.
 * - Está numa tela raiz → não sai direto: exige um segundo toque em 2s
 *   ("Toque de novo para sair"), padrão consagrado no Android.
 * - Uma tela pode assumir o botão enquanto está montada
 *   (useNativeBackHandler) — ex.: o questionário volta uma pergunta.
 */

// ===========================================================================
// TELAS QUE ASSUMEM O BOTÃO
// ===========================================================================
// As perguntas do questionário são estado interno, não rotas: o
// `history.back()` saía da tela inteira e levava à introdução (23/10/2026).
// Mesmo desenho do lib/openPanels: registro em módulo + hook, porque é uma
// tela influenciando um componente da raiz (o listener do NativeShell).
//
// Pilha, e não um único handler: quem montou por último é a tela da frente.
type BackHandler = { current: () => boolean };
const backHandlers: BackHandler[] = [];

/**
 * Enquanto a tela estiver montada, o botão voltar chama `handler` antes de
 * tudo. Devolver `true` = "tratei, não faça mais nada"; `false` = segue o
 * comportamento padrão (voltar uma tela, ou o duplo toque na raiz).
 * No-op fora do app nativo, porque o listener só existe lá.
 */
export function useNativeBackHandler(handler: () => boolean) {
  const ref = useRef(handler);

  // Sempre a versão mais nova: o handler fecha sobre o estado da tela.
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    const entry = ref;
    backHandlers.push(entry);
    return () => {
      const index = backHandlers.lastIndexOf(entry);
      if (index >= 0) backHandlers.splice(index, 1);
    };
  }, []);
}

// Telas onde voltar significa "sair do app", não "voltar uma tela".
const ROOT_ROUTES = ["/dashboard", "/login", "/"];

const EXIT_WINDOW_MS = 2000;

export function initBackButton(onConfirmExit: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let armedAt = 0;

  const handle = App.addListener("backButton", ({ canGoBack }) => {
    if (backHandlers[backHandlers.length - 1]?.current()) return;

    const rota = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
    const naRaiz = ROOT_ROUTES.includes(rota);

    if (!naRaiz && canGoBack) {
      window.history.back();
      return;
    }

    // Na raiz: primeiro toque avisa, segundo dentro da janela realmente sai.
    const agora = Date.now();
    if (agora - armedAt < EXIT_WINDOW_MS) {
      App.exitApp();
      return;
    }

    armedAt = agora;
    onConfirmExit();
  });

  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
