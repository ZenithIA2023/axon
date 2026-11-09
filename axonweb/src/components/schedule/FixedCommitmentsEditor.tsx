import { Plus, Trash2 } from "lucide-react";

import type { WeekDayKey } from "../../lib/api";
import { MAX_COMMITMENTS, WEEK_DAYS, newDraft, type CommitmentDraft } from "../../lib/fixedCommitments";

// ===========================================================================
// EDITOR DE COMPROMISSOS FIXOS
// ===========================================================================
// Usado pelas Configurações (Estilo de rotina) e pela tela de horários do
// onboarding. Era um componente interno do Settings.tsx que não gravava nada;
// agora quem usa recebe os rascunhos e decide quando salvar
// (lib/fixedCommitments.ts converte e valida).

export default function FixedCommitmentsEditor({
  drafts,
  onChange,
}: {
  drafts: CommitmentDraft[];
  onChange: (next: CommitmentDraft[]) => void;
}) {
  function update(id: string, patch: Partial<CommitmentDraft>) {
    onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function toggleDay(id: string, day: WeekDayKey) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    update(id, { days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day] });
  }

  return (
    <div className="grid gap-3">
      {drafts.map((routine, index) => (
        <FixedRoutineEditor
          key={routine.id}
          routine={routine}
          index={index}
          canRemove={drafts.length > 1}
          onRemove={() => onChange(drafts.filter((d) => d.id !== routine.id))}
          onChange={(field, value) => update(routine.id, { [field]: value })}
          onToggleDay={(day) => toggleDay(routine.id, day)}
        />
      ))}
      {drafts.length < MAX_COMMITMENTS && (
        <button
          type="button"
          onClick={() => onChange([...drafts, newDraft()])}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-dashed border-[#6d28d9]/30 bg-[#6d28d9]/[0.05] px-4 text-xs font-black text-[#6d28d9] transition active:scale-[0.98] dark:bg-[#6d28d9]/10 dark:text-purple-300"
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar outro compromisso
        </button>
      )}
    </div>
  );
}

function FixedRoutineEditor({
  routine,
  index,
  canRemove,
  onRemove,
  onChange,
  onToggleDay,
}: {
  routine: CommitmentDraft;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (field: "activity" | "start" | "end", value: string) => void;
  onToggleDay: (day: WeekDayKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/35">
          Compromisso {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition active:scale-[0.94] dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300"
            aria-label="Remover compromisso"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ScheduleInput
        label="Tipo de compromisso"
        placeholder="Ex.: trabalho, faculdade, estágio"
        value={routine.activity}
        onChange={(value) => onChange("activity", value)}
      />
      <div className="mt-3">
        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-white/45">
          Dias da semana
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEK_DAYS.map((day) => {
            const active = routine.days.includes(day.key);
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onToggleDay(day.key)}
                title={day.fullLabel}
                className={`flex h-9 items-center justify-center rounded-xl border text-xs font-black transition active:scale-[0.94] ${
                  active
                    ? "border-[#6d28d9] bg-[#6d28d9] text-white"
                    : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/45"
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <ScheduleInput
          label="Início"
          type="time"
          value={routine.start}
          onChange={(value) => onChange("start", value)}
        />
        <ScheduleInput
          label="Fim"
          type="time"
          value={routine.end}
          onChange={(value) => onChange("end", value)}
        />
      </div>
    </div>
  );
}
function ScheduleInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "time";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-500 dark:text-white/45">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#6d28d9]/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/25"
      />
    </label>
  );
}
