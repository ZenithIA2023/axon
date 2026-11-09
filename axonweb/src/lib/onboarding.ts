import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

import * as api from "./api";
import { FIRST_RESULT_STEP_ID, FLOW_VERSION } from "../data/onboardingSteps";
import {
  ONBOARDING_PROGRESS_KEY,
  buildPayload,
  clearProgress,
  loadProgress,
  saveProgress,
  type OnboardingProgress,
} from "./onboardingState";

// Rota do onboarding novo. /questionnaire-intro, /questionnaire e /analyzing
// redirecionam para cá (App.tsx).
export const ONBOARDING_ROUTE = "/comecar";

// ===========================================================================
// RETORNO AO QUESTIONÁRIO
// ===========================================================================
// Quem fechava o app no meio do questionário nunca mais voltava a ele (ver
// `needsQuestionnaire` em lib/api). Aqui moram as decisões de rota que usam
// aquele sinal: a abertura (NativeEntry, landing), o dashboard e a saída do
// questionário quando o servidor desmente o sinal local.

// Marca a navegação feita por nós, e não pelo usuário: só ela pode ser
// desfeita sozinha. Quem abre o questionário pelo Perfil para refazê-lo não
// carrega esta marca e nunca é tirado de lá.
const AUTO_STATE = { autoOnboarding: true } as const;

// Destino de quem abre o app já logado. Local e instantâneo: nenhuma rede.
// O próprio onboarding retoma da tela onde a pessoa parou (progresso salvo).
export function homeRoute(): { to: string; state?: typeof AUTO_STATE } {
  return api.needsQuestionnaire()
    ? { to: ONBOARDING_ROUTE, state: AUTO_STATE }
    : { to: "/dashboard" };
}

// Dashboard: confere o sinal na hora e de novo quando o perfil desta carga da
// página chega (sem nova busca se ele já chegou). Antes o dashboard escondia o
// problema mostrando "Perfil Intermediário" para quem nunca respondeu.
export function useRedirectToQuestionnaireIfMissing() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    function check() {
      if (active && api.isLoggedIn() && api.needsQuestionnaire()) {
        navigate(ONBOARDING_ROUTE, { replace: true, state: AUTO_STATE });
      }
    }

    check();
    void api.chronotypeSynced().then(check);

    return () => {
      active = false;
    };
  }, [navigate]);
}

// Onboarding: se chegamos aqui por redirecionamento e o perfil diz que o
// cronotipo já existe (respondido em outro aparelho), o sinal local estava
// velho — volta ao dashboard em vez de pedir o questionário de novo.
export function useLeaveQuestionnaireIfAnswered() {
  const navigate = useNavigate();
  const location = useLocation();
  const auto =
    (location.state as { autoOnboarding?: boolean } | null)?.autoOnboarding ===
    true;

  useEffect(() => {
    if (!auto) return;

    let active = true;

    void api.chronotypeSynced().then(() => {
      if (active && api.isLoggedIn() && !api.needsQuestionnaire()) {
        navigate("/dashboard", { replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [auto, navigate]);
}

/**
 * "Refazer o teste" no Perfil. Um "refazer" interrompido no meio das perguntas
 * retoma de onde parou; um que já foi gravado (a pessoa saiu durante as telas
 * do resultado) começa do zero — senão o botão abria no resultado antigo.
 * Fica no clique, e não ao abrir a página, para que recarregar a página no
 * meio do resultado continue nele.
 */
export function startRetake(): void {
  const saved = loadProgress();
  if (saved?.saved) clearProgress();
}

// Existe um onboarding em andamento neste navegador?
export function hasOnboardingInProgress(): boolean {
  return !!localStorage.getItem(ONBOARDING_PROGRESS_KEY);
}

// ===========================================================================
// CONCLUSÃO
// ===========================================================================

/**
 * Grava o onboarding na conta logada e devolve o progresso já no resultado.
 *
 * O progresso NÃO é apagado aqui: depois de gravar a pessoa ainda passa pelas
 * telas do resultado (cronotipo, significado, curva…), que leem dele. Só
 * `finishOnboarding`, no último botão, apaga.
 */
export async function saveOnboarding(progress: OnboardingProgress): Promise<OnboardingProgress> {
  const res = await api.classifyAndSave(buildPayload(progress, FLOW_VERSION));
  localStorage.setItem("axon_chronotype", res.cronotipo);
  if (progress.answers.schedule_type) {
    localStorage.setItem("axon_schedule_type", progress.answers.schedule_type);
  }
  const saved: OnboardingProgress = {
    ...progress,
    saved: true,
    result: {
      cronotipo: res.cronotipo,
      jet_lag_social_min: res.jet_lag_social_min,
      energia: res.energia,
      segmentos: res.segmentos,
    },
    stepId: FIRST_RESULT_STEP_ID,
  };
  saveProgress(saved);
  return saved;
}

/** Último botão do resultado: apaga o progresso e diz para onde ir. */
export function finishOnboarding(progress: OnboardingProgress): string {
  clearProgress();
  return progress.origin === "retake" ? "/profile" : "/dashboard";
}

/**
 * Chamado logo depois de um login (e-mail, Google, Apple): se havia um
 * onboarding respondido neste navegador, grava na conta que acabou de entrar
 * e devolve a rota do onboarding, que retoma no resultado.
 *
 * Devolve null quando não há nada pendente (o chamador segue o caminho normal).
 *
 * Conta que JÁ tinha cronotipo fica como está (decisão de nov/2026): as
 * respostas deste navegador são descartadas, e a pessoa entra no app. Isso
 * cobre quem refez o teste no site sem estar logado e entrou com uma conta
 * antiga na tela de cadastro.
 *
 * Se gravar falhar, o progresso fica como estava e a pessoa volta ao
 * onboarding: logada, ela retoma na análise, que tenta gravar de novo.
 */
export async function finishPendingOnboarding(hasChronotype: boolean): Promise<string | null> {
  const progress = loadProgress();
  if (!progress?.result) return null;
  if (progress.saved) return ONBOARDING_ROUTE;

  if (hasChronotype && progress.origin !== "retake") {
    clearProgress();
    return null;
  }

  try {
    await saveOnboarding({ ...progress, origin: progress.origin === "new" ? "account" : progress.origin });
  } catch {
    // Sem tratamento aqui de propósito: o progresso continua salvo e o
    // onboarding refaz a gravação (ver comentário acima).
  }
  return ONBOARDING_ROUTE;
}

// ===========================================================================
// FUNIL
// ===========================================================================

function platform(): "web" | "android" | "ios" {
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : "web";
}

/**
 * Fila de eventos do funil. Cada troca de tela gera um `view` (e um `answer`
 * da tela anterior); o lote é enviado na troca seguinte, para não fazer uma
 * requisição por evento.
 */
export function createOnboardingTracker(anonId: string) {
  let queue: api.OnboardingEvent[] = [];

  function flush() {
    if (queue.length === 0) return;
    const events = queue.slice(0, 50);
    queue = queue.slice(50);
    api
      .sendOnboardingEvents({ anon_id: anonId, flow_version: FLOW_VERSION, platform: platform(), events })
      .catch(() => {
        // O funil é medição, não fluxo: perder um lote não pode travar nem
        // avisar a pessoa que está respondendo.
      });
  }

  function track(event: api.OnboardingEvent) {
    queue.push(event);
  }

  return { track, flush };
}
