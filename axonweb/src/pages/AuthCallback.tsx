import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../lib/api";
import { finishPendingOnboarding, ONBOARDING_ROUTE } from "../lib/onboarding";

export default function AuthCallback() {
  const navigate = useNavigate();
  // useSearchParams em vez de URLSearchParams sobre location.search: no app o
  // HashRouter põe a query depois do "#", onde location.search não enxerga.
  // O hook lê a query do próprio router e funciona nas duas plataformas.
  const [params] = useSearchParams();

  // Fluxo de retorno do Google e da Apple: valida a URL, cria sessão local e decide a próxima tela.
  useEffect(() => {
    // Erros vindos do backend/OAuth voltam para o login com a mensagem preservada.
    const error = params.get("error");
    if (error) {
      navigate(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    // O backend envia um código temporário usado para buscar os tokens reais da sessão.
    const sessionCode = params.get("session_code");
    if (!sessionCode) {
      navigate("/login?error=Falha+na+autenticação");
      return;
    }

    // Após salvar a sessão: quem veio da tela 29 do onboarding (botão Google ou
    // Apple) tem as respostas gravadas na conta agora; usuários novos sem
    // respostas seguem para o onboarding, já logados.
    api
      .exchangeGoogleSession(sessionCode)
      .then(async (session) => {
        api.saveSession(session);
        void api.syncChronotypeFromProfile();

        const destino = await finishPendingOnboarding(session.has_chronotype);
        navigate(destino ?? (session.has_chronotype ? "/app-loading" : ONBOARDING_ROUTE));
      })
      .catch(() => {
        navigate("/login?error=Falha+na+autenticação");
      });
  }, []);

  // Feedback mínimo enquanto o código do login social é convertido em sessão do Axon.
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <p className="text-sm text-muted">Autenticando...</p>
    </div>
  );
}
