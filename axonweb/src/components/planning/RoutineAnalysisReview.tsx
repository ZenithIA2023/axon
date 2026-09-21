import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";

import BottomSheet from "../ui/BottomSheet";
import * as api from "../../lib/api";
import type { RoutineAnalysis, RoutineMove, RoutineMoveKind } from "../../lib/api";

// ===========================================================================
// REVISÃO DA ANÁLISE DE ROTINA
// ===========================================================================
// Uma proposta em lote precisa ser INSPECIONÁVEL antes de aplicar. Há
// precedente doloroso: o Axon criou 40 tarefas de uma vez ao organizar um curso
// — tecnicamente certo, na prática abandonado. Aqui cada movimento tem seu
// motivo e sua caixa, e o ganho do cabeçalho é recalculado conforme o que fica
// marcado, para o usuário ver o que está aceitando de verdade.

const KIND_LABEL: Record<RoutineMoveKind, string> = {
  bad_block: "Horário de baixa energia",
  complexity_match: "Energia × complexidade",
  grouping: "Agrupamento",
  compaction: "Fecha um vão",
};

function toMin(hhmm: string) {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}
function toHHMM(min: number) {
  const m = Math.max(0, Math.min(min, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function fmtGain(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Fim do dia como ficaria aplicando só os movimentos marcados. Recalculado no
// cliente porque desmarcar uma linha muda o ganho — e o usuário precisa ver
// isso ANTES de clicar, não depois.
//
// Exato, não aproximado: fim = max(fim das tarefas que não se movem, fim de
// cada linha conforme marcada). O backend manda `fixed_day_end` justamente
// para este cálculo não precisar chutar.
function projectedDayEnd(
  analysis: RoutineAnalysis,
  selected: Set<string>
): string | null {
  if (!analysis.current_day_end) return null;
  const ends = analysis.proposal.map((m) =>
    selected.has(m.task_id) ? toMin(m.new_end) : toMin(m.old_end)
  );
  if (analysis.fixed_day_end) ends.push(toMin(analysis.fixed_day_end));
  if (ends.length === 0) return analysis.current_day_end;
  return toHHMM(Math.max(...ends));
}

export default function RoutineAnalysisReview({
  analysis,
  isOpen,
  onClose,
  onApplied,
}: {
  analysis: RoutineAnalysis | null;
  isOpen: boolean;
  onClose: () => void;
  onApplied: (result: api.RoutineApplyResult) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<api.RoutineApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Todas marcadas por padrão a cada proposta nova.
  useEffect(() => {
    if (analysis) {
      setSelected(new Set(analysis.proposal.map((m) => m.task_id)));
      setResult(null);
      setError(null);
    }
  }, [analysis]);

  const projectedEnd = useMemo(
    () => (analysis ? projectedDayEnd(analysis, selected) : null),
    [analysis, selected]
  );
  const gain = useMemo(() => {
    if (!analysis?.current_day_end || !projectedEnd) return 0;
    return Math.max(0, toMin(analysis.current_day_end) - toMin(projectedEnd));
  }, [analysis, projectedEnd]);

  if (!analysis) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApply() {
    if (!analysis || selected.size === 0 || applying) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyRoutineAnalysis(analysis.id, [...selected]);
      setResult(res);
      onApplied(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setApplying(false);
    }
  }

  const count = selected.size;
  // "seu dia" / "seu dia de amanhã" / "seu dia 21/09" — o card do Planning
  // analisa qualquer dia de hoje em diante.
  const dayLabel = (() => {
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (analysis.target_date === toIso(today)) return "seu dia";
    if (analysis.target_date === toIso(tomorrow)) return "seu dia de amanhã";
    return `seu dia ${analysis.target_date.slice(8, 10)}/${analysis.target_date.slice(5, 7)}`;
  })();

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      dismissDisabled={applying}
      ariaLabel="Revisar reorganização do dia"
      maxHeightClassName="max-h-[88vh]"
      footer={
        result ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-semibold text-white shadow-card transition active:scale-[0.98]"
          >
            Fechar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={count === 0 || applying}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-50"
          >
            {applying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aplicando…
              </>
            ) : count === 0 ? (
              "Selecione ao menos uma mudança"
            ) : (
              `Aplicar ${count} ${count === 1 ? "mudança" : "mudanças"}`
            )}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {/* Cabeçalho: antes → depois, com o ganho das linhas MARCADAS. */}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-primary">
              O Axon reorganizou {dayLabel}
            </p>
            {analysis.current_day_end && projectedEnd && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>fim do dia:</span>
                <span className="font-semibold text-secondary">{analysis.current_day_end}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-semibold text-primary">{projectedEnd}</span>
                {gain > 0 && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                    {fmtGain(gain)} livres
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {result ? (
          <ApplyResult result={result} />
        ) : (
          <div className="space-y-2">
            {analysis.proposal.map((m) => (
              <MoveRow
                key={m.task_id}
                move={m}
                checked={selected.has(m.task_id)}
                onToggle={() => toggle(m.task_id)}
              />
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-200">
            {error}
          </p>
        )}

        {!result && (
          <p className="px-1 text-[0.68rem] leading-4 text-muted">
            Desmarque o que não quiser mudar. Nada é aplicado até você confirmar.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

function MoveRow({
  move,
  checked,
  onToggle,
}: {
  move: RoutineMove;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
        checked ? "border-accent-soft bg-accent-soft/40" : "border-soft bg-surface-muted opacity-70"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
            : "border-soft bg-surface-elevated"
        }`}
        aria-hidden
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-primary">{move.title}</span>
          <span className="shrink-0 text-[0.62rem] font-medium text-soft">
            {KIND_LABEL[move.kind]}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-secondary">
          <span className={checked ? "line-through opacity-60" : ""}>{move.old_start}</span>
          <ArrowRight className="h-3 w-3 text-muted" />
          <span className="font-semibold">{move.new_start}</span>
          <span className="text-muted">– {move.new_end}</span>
        </span>
        <span className="mt-1 block text-[0.68rem] leading-4 text-muted">{move.reason}</span>
      </span>
    </button>
  );
}

// O que de fato aconteceu: aplicados e PULADOS. Entre ver a proposta e clicar
// pode ter passado tempo; um movimento que conflita agora é pulado, e o usuário
// precisa saber o que não aconteceu.
function ApplyResult({ result }: { result: api.RoutineApplyResult }) {
  return (
    <div className="space-y-3">
      {result.applied.length > 0 && (
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">
            {result.applied.length}{" "}
            {result.applied.length === 1 ? "mudança aplicada" : "mudanças aplicadas"}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {result.applied.map((a) => (
              <li key={a.task_id} className="text-[0.7rem] text-emerald-800/80 dark:text-emerald-100/80">
                {a.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.skipped.length > 0 && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.skipped.length} não {result.skipped.length === 1 ? "aplicada" : "aplicadas"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {result.skipped.map((s) => (
              <li key={s.task_id} className="text-[0.7rem] leading-4 text-amber-800/80 dark:text-amber-100/80">
                <span className="font-semibold">{s.title}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.applied.length === 0 && result.skipped.length === 0 && (
        <p className="px-1 text-xs text-muted">Nenhuma mudança foi aplicada.</p>
      )}
    </div>
  );
}
