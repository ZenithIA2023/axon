import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { listenForAuthDeepLink } from "../../lib/nativeAuth";
import { initPushListeners } from "../../lib/push";
import { markNotificationTapped } from "../../lib/api";

/**
 * Traz o app de volta ao lugar certo quando o Android o reabre por deep link
 * (`tech.axonapp.app:///#/auth/callback?session_code=...`), que é como o OAuth do
 * Google retorna no app.
 *
 * Precisa ficar DENTRO do Router para poder navegar. Na web não faz nada — lá
 * o retorno do OAuth é uma navegação normal do navegador.
 */
/**
 * Para onde o toque numa notificação leva, pelo tipo dela.
 *
 * - lembretes de planejamento: Planning;
 * - "30 min antes" e "organizar o amanhã": Planning já no dia certo (o `date`
 *   vem do backend no push; ver notification_service._push);
 * - "registro do dia": Dashboard com o registro aberto — o de ONTEM quando a
 *   ofensiva está em risco (`registro: "ontem"` no push), senão o de hoje;
 * - o resto (sugestões, mudanças): Dashboard, onde o card e o toast aparecem.
 */
function routeForNotification(tipo: string, date: string, registro: string): string {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?dia=${date}` : "";
  switch (tipo) {
    case "planning_daily":
    case "planning_weekly":
      return "/planning";
    case "task_reminder":
    case "plan_tomorrow_reminder":
      return `/planning${dia}`;
    case "day_review_reminder":
      return registro === "ontem" ? "/dashboard?registro=ontem" : "/dashboard?registro=hoje";
    default:
      return "/dashboard";
  }
}

export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // `replace` para que o botão voltar não caia de novo no callback, que é uma
    // rota de passagem e já consumiu seu código de uso único.
    return listenForAuthDeepLink((route) => navigate(route, { replace: true }));
  }, [navigate]);

  // Tocar numa notificação do sistema abre o app na tela correspondente. O
  // `type` vem do backend junto com o push (é o tipo da notificação).
  useEffect(() => {
    initPushListeners((data) => {
      // Marca o toque antes de navegar. Sem await e sem travar a navegação:
      // é medição, e falhar nela não pode deixar a pessoa parada na tela.
      const id = typeof data.notification_id === "string" ? data.notification_id : "";
      if (id) {
        markNotificationTapped(id).catch(() => {
          /* silencioso de propósito: ver acima */
        });
      }
      navigate(
        routeForNotification(String(data.type ?? ""), String(data.date ?? ""), String(data.registro ?? ""))
      );
    });
  }, [navigate]);

  return null;
}
