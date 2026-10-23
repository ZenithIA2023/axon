import { useEffect, useSyncExternalStore } from "react";

// ===========================================================================
// PAINÉIS INFERIORES ABERTOS
// ===========================================================================
// Decisão de produto (23/10/2026): enquanto um painel que sobe de baixo está
// aberto, a BottomNav não aparece nem recebe toque — o usuário está numa
// tarefa focada, e trocar de aba por baixo do painel não é desejado.
//
// Contador em módulo, como a trava de scroll do BottomSheet: dois painéis
// sobrepostos não podem devolver a barra quando só um deles fecha.
let openCount = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hasOpenPanel() {
  return openCount > 0;
}

// Chamado pelo painel: conta enquanto `isOpen` for verdadeiro.
export function useRegisterOpenPanel(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    openCount += 1;
    notify();

    return () => {
      openCount = Math.max(0, openCount - 1);
      notify();
    };
  }, [isOpen]);
}

// Lido pela BottomNav.
export function useHasOpenPanel() {
  return useSyncExternalStore(subscribe, hasOpenPanel, hasOpenPanel);
}
