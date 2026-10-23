import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import * as api from "./api";

// ===========================================================================
// RETORNO AO QUESTIONÁRIO
// ===========================================================================
// Quem fechava o app no meio do questionário nunca mais voltava a ele (ver
// `needsQuestionnaire` em lib/api). Aqui moram as decisões de rota que usam
// aquele sinal: a abertura (NativeEntry, landing), o dashboard e a saída do
// questionário quando o servidor desmente o sinal local.

// Onde o Questionnaire guarda o progresso. Só a EXISTÊNCIA da chave é lida
// aqui; o formato continua sendo assunto do Questionnaire.
export const QUESTIONNAIRE_PROGRESS_KEY = "axon_questionnaire_progress_v1";

// Marca a navegação feita por nós, e não pelo usuário: só ela pode ser
// desfeita sozinha. Quem abre o questionário pelo Perfil para refazê-lo não
// carrega esta marca e nunca é tirado de lá.
const AUTO_STATE = { autoOnboarding: true } as const;

// Com progresso salvo, direto à pergunta onde parou; senão, a introdução.
function questionnaireRoute(): string {
  return localStorage.getItem(QUESTIONNAIRE_PROGRESS_KEY)
    ? "/questionnaire"
    : "/questionnaire-intro";
}

// Destino de quem abre o app já logado. Local e instantâneo: nenhuma rede.
export function homeRoute(): { to: string; state?: typeof AUTO_STATE } {
  return api.needsQuestionnaire()
    ? { to: questionnaireRoute(), state: AUTO_STATE }
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
        navigate(questionnaireRoute(), { replace: true, state: AUTO_STATE });
      }
    }

    check();
    void api.chronotypeSynced().then(check);

    return () => {
      active = false;
    };
  }, [navigate]);
}

// Introdução e questionário: se chegamos aqui por redirecionamento e o perfil
// diz que o cronotipo já existe (respondido em outro aparelho), o sinal local
// estava velho — volta ao dashboard em vez de pedir o questionário de novo.
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
