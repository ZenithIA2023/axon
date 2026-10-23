import { useEffect } from "react";
import * as push from "../../lib/push";

/**
 * Inicializa somente os listeners do push nativo.
 *
 * Sem toasts, polling, som ou notificações flutuantes.
 * Não solicita permissão automaticamente: a autorização deve ser iniciada
 * por uma ação explícita do usuário na tela de Configurações.
 *
 * Mantenha este componente montado uma única vez em App.tsx.
 */
let listenersInitialized = false;

export default function NotificationToastProvider() {
  useEffect(() => {
    if (!push.isSupported() || listenersInitialized) return;
    listenersInitialized = true;
    push.initPushListeners();
  }, []);

  return null;
}
