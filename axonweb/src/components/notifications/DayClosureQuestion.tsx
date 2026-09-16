import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Clock, X } from "lucide-react";

import * as api from "../../lib/api";

// ===========================================================================
// PERGUNTA DE FECHAMENTO DO DIA (horas poupadas)
// ===========================================================================
// Por que esta pergunta existe: `completed_at` registra quando o usuário tocou
// no botão, não quando terminou a tarefa — 64% das marcações vêm depois do fim
// planejado, no mesmo dia, e 11% em outro dia. Quando a marcação cai DENTRO do
// horário planejado o backend já sabe o bastante e não pergunta nada; quando
// cai depois, ele não sabe, e um toque do usuário resolve o que nenhuma
// heurística resolveria.
//
// Ela fala sempre de um dia NOMEADO ("ontem"), porque o disparo é o fechamento
// do dia — não a conclusão da última tarefa. Disparar na conclusão faria a
// pergunta aparecer na terça falando de segunda sem contexto.

// Rotas em que a pergunta pode aparecer: as telas de uso normal do app. Fora
// daí (login, onboarding, chamada de voz) ela seria uma interrupção.
const ENABLED_ROUTES = [
  "/dashboard",
  "/planejamento",
  "/insights",
  "/rotina",
  "/profile",
];

function isEnabledRoute(pathname: string) {
  return ENABLED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

// Espera antes de aparecer: entrar numa tela e receber a pergunta no mesmo
// instante atropela o que o usuário foi fazer ali.
const ENTRY_DELAY_MS = 2500;

export default function DayClosureQuestion() {
  const location = useLocation();
  const [question, setQuestion] = useState<api.SavedTimeQuestion | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Busca uma única vez por carga do app: o backend marca a pergunta como
  // exibida ao devolvê-la, então repetir a chamada a cada navegação só gastaria
  // requisição — a mesma pergunta não volta.
  useEffect(() => {
    if (!isEnabledRoute(location.pathname)) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getSavedTimePending()
        .then((res) => {
          if (cancelled || !res.question) return;
          setQuestion(res.question);
          setVisible(true);
        })
        .catch(() => {
          // Sem pergunta é o caso normal; falha de rede aqui não merece ruído.
        });
    }, ENTRY_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Só na primeira rota válida da sessão — não a cada navegação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!question || !visible || !isEnabledRoute(location.pathname)) return null;

  const dayLabel = question.is_yesterday
    ? "Ontem"
    : new Date(`${question.date}T12:00:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });

  async function answer(payload: {
    reported_end?: string;
    not_finished?: boolean;
  }) {
    if (!question || saving) return;
    setSaving(true);
    try {
      await api.answerSavedTime(question.date, payload);
    } catch {
      // Falhar aqui não pode travar o card aberto na tela do usuário: o dia
      // continua sem resposta e simplesmente não entra no número.
    } finally {
      setVisible(false);
      setSaving(false);
    }
  }

  function dismiss() {
    setVisible(false);
    if (question) void api.dismissSavedTime(question.date).catch(() => {});
  }

  return (
    // z-[80]: abaixo do toast de notificações (z-200) e da BottomNav (z-90),
    // para nunca cobrir a navegação nem competir com um toast.
    // pointer-events-none no container + auto no cartão: o resto da tela segue
    // clicável, então a pergunta não bloqueia o app.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
      <div className="pointer-events-auto mx-auto max-w-md rounded-[1.5rem] border border-soft bg-surface-elevated p-4 shadow-card backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5 text-primary">
              {dayLabel}, que horas você terminou o que estava planejado?
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={saving}
                  onClick={() => void answer({ reported_end: option })}
                  className="min-h-9 rounded-xl border border-soft bg-surface-muted px-3 text-xs font-semibold text-primary transition active:scale-[0.98] disabled:opacity-60"
                >
                  {option}
                </button>
              ))}

              {/* "Quando marquei" = o horário cru da marcação. É uma resposta
                  válida (quem marca na hora), e sem ela o usuário pontual não
                  teria como dizer isso. */}
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void answer({ reported_end: question.recorded_end })
                }
                className="min-h-9 rounded-xl border border-soft bg-surface-muted px-3 text-xs font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-60"
              >
                Quando marquei
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => void answer({ not_finished: true })}
                className="min-h-9 rounded-xl border border-soft bg-surface-muted px-3 text-xs font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-60"
              >
                Não terminei
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
            aria-label="Fechar pergunta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
