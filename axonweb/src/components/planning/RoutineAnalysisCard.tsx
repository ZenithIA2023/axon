import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";

import * as api from "../../lib/api";
import type { RoutineAnalysis } from "../../lib/api";
import RoutineAnalysisReview from "./RoutineAnalysisReview";

// ===========================================================================
// CARD "ANALISAR MINHA ROTINA" — Planning
// ===========================================================================
// Mora no Planning, acima da lista do dia: é ali que o usuário está olhando os
// compromissos, e o card analisa O DIA SELECIONADO (hoje ou futuro — a página
// não o mostra em dia passado). Discreto de propósito: é uma ação sob demanda,
// não um banner. Quatro estados: ocioso, analisando, proposta pronta (abre a
// revisão) e "sem melhorias".
//
// O estado "sem melhorias" fala com clareza que a agenda já está boa. Sem isso o
// usuário clica, nada aparece, e conclui que o botão falhou.
//
// Auto-contido: busca a proposta pendente do dia ao montar e a cada troca de
// dia (a análise agendada gera a de amanhã e notifica; ao abrir amanhã no
// calendário ela já está aqui) e reabre a revisão.

type Idle = { kind: "idle" };
type Busy = { kind: "busy" };
type Ready = { kind: "ready"; analysis: RoutineAnalysis };
type Nothing = { kind: "nothing"; message: string };
type Limit = { kind: "limit"; limit: number };
type Failed = { kind: "failed" };
type State = Idle | Busy | Ready | Nothing | Limit | Failed;

function fmtGain(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function RoutineAnalysisCard({
  targetDate,
  onApplied,
}: {
  // Dia analisado (YYYY-MM-DD): o selecionado no Planning.
  targetDate: string;
  // O Planning recarrega as tarefas depois de aplicar.
  onApplied?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [reviewOpen, setReviewOpen] = useState(false);
  // A proposta foi aplicada mas a revisão ainda está aberta mostrando o
  // resultado (aplicadas/puladas). Só zeramos o card quando ela fechar — zerar
  // antes desmontaria a revisão no meio da leitura.
  const [appliedPendingClose, setAppliedPendingClose] = useState(false);

  // Proposta pendente DO DIA (da análise agendada, ou de uma manual não
  // resolvida). Trocar de dia zera o card: o "sem melhorias" de hoje não vale
  // para amanhã.
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "idle" });
    setReviewOpen(false);
    setAppliedPendingClose(false);
    api
      .getPendingRoutineAnalysis(targetDate)
      .then((res) => {
        if (!cancelled && res.analysis) {
          setState({ kind: "ready", analysis: res.analysis });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetDate]);

  const run = useCallback(async () => {
    setState({ kind: "busy" });
    try {
      const res = await api.runRoutineAnalysis(targetDate);
      if (res.status === "proposal" || res.status === "pending") {
        setState({ kind: "ready", analysis: res.analysis });
        setReviewOpen(true);
      } else if (res.status === "nothing") {
        setState({ kind: "nothing", message: res.message });
      } else {
        setState({ kind: "limit", limit: res.limit });
      }
    } catch {
      setState({ kind: "failed" });
    }
  }, [targetDate]);

  const analysis = state.kind === "ready" ? state.analysis : null;

  return (
    <>
      <section className="mb-4 rounded-[2rem] border border-soft bg-surface-elevated p-4 shadow-card backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
            {state.kind === "busy" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : state.kind === "nothing" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Wand2 className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {state.kind === "ready" ? (
              <>
                <p className="text-sm font-black text-primary">
                  {analysis!.proposal.length}{" "}
                  {analysis!.proposal.length === 1 ? "ajuste proposto" : "ajustes propostos"}
                </p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-muted">
                  {analysis!.freed_minutes > 0
                    ? `Seu dia terminaria ${fmtGain(analysis!.freed_minutes)} mais cedo`
                    : "Toque para revisar antes de aplicar"}
                </p>
              </>
            ) : state.kind === "nothing" ? (
              <>
                <p className="text-sm font-black text-primary">Agenda bem distribuída</p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-muted">{state.message}</p>
              </>
            ) : state.kind === "limit" ? (
              <>
                <p className="text-sm font-black text-primary">Limite de hoje atingido</p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-muted">
                  Até {state.limit} análises por dia. Amanhã libera de novo.
                </p>
              </>
            ) : state.kind === "failed" ? (
              <>
                <p className="text-sm font-black text-primary">Não deu para analisar</p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-muted">
                  Tente de novo em instantes.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-primary">Analisar minha rotina</p>
                <p className="mt-0.5 text-[0.68rem] font-medium text-muted">
                  {state.kind === "busy"
                    ? "Olhando a agenda deste dia…"
                    : "O Axon reorganiza o dia e você aprova cada mudança"}
                </p>
              </>
            )}
          </div>

          {state.kind === "ready" ? (
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-[var(--accent-strong)] px-3 text-xs font-black text-white shadow-card transition active:scale-[0.96]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Revisar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={state.kind === "busy" || state.kind === "limit"}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-3 text-xs font-black text-accent transition active:scale-[0.96] disabled:opacity-50"
            >
              {state.kind === "nothing" || state.kind === "failed" ? "Analisar de novo" : "Analisar"}
            </button>
          )}
        </div>
      </section>

      <RoutineAnalysisReview
        analysis={analysis}
        isOpen={reviewOpen && !!analysis}
        // Fechar sem aplicar mantém a proposta no card ("Revisar" continua
        // disponível). Depois de aplicar, o fechamento é o que zera o card.
        onClose={() => {
          setReviewOpen(false);
          if (appliedPendingClose) {
            setAppliedPendingClose(false);
            setState({ kind: "idle" });
          }
        }}
        onApplied={() => {
          setAppliedPendingClose(true);
          onApplied?.();
        }}
      />
    </>
  );
}
