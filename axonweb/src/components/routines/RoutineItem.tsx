import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Sparkles, Target, Trash2 } from "lucide-react";

import * as api from "../../lib/api";
import type {
  Objective,
  RoutineItem,
  RoutineItemCreateInput,
  RoutineItemUpdateInput,
} from "../../lib/api";

// ===========================================================================
// TIPOS DO ITEM DE ROTINA
// ===========================================================================

export type ItemMode = "fixed" | "axon";

export type DraftItem = {
  key: string;
  title: string;

  // 0 = Seg ... 6 = Dom, no padrão usado pela tela de rotinas.
  days: number[];

  mode: ItemMode;

  // Campos usados quando o item tem horário fixo.
  startTime: string;
  endTime: string;

  // Duração em minutos, mantida como string para controlar o input.
  duration: string;

  // Vínculo com objetivo (opções avançadas). "" = sem objetivo. Concluir a
  // tarefa gerada por este item avança o contador do objetivo em `steps`.
  // O TÉRMINO da rotina por objetivo é da rotina inteira, não do item — fica
  // no passo de período, ao lado da data de término.
  objectiveId: string;
  steps: string;
};

// ===========================================================================
// CONSTANTES
// ===========================================================================

export const WEEKDAYS = [
  { idx: 0, label: "Seg" },
  { idx: 1, label: "Ter" },
  { idx: 2, label: "Qua" },
  { idx: 3, label: "Qui" },
  { idx: 4, label: "Sex" },
  { idx: 5, label: "Sáb" },
  { idx: 6, label: "Dom" },
];

// ===========================================================================
// CONVERSÕES ENTRE DRAFT E API
// ===========================================================================

// Cria um item vazio para o fluxo de nova rotina.
export function blankItem(): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    days: [],
    mode: "fixed",
    startTime: "",
    endTime: "",
    duration: "",
    objectiveId: "",
    steps: "1",
  };
}

// Converte o item salvo no backend para o formato editável da interface.
export function itemToDraft(item: RoutineItem): DraftItem {
  const isFlexible = item.duration_minutes != null;

  return {
    key: item.id,
    title: item.title,
    days: item.days_of_week,
    mode: isFlexible ? "axon" : "fixed",
    startTime: item.start_time ?? "",
    endTime: item.end_time ?? "",
    duration: isFlexible ? String(item.duration_minutes) : "",
    objectiveId: item.objective_id ?? "",
    steps: String(item.steps_per_completion ?? 1),
  };
}

// Valida se o item tem dados suficientes para criação/edição.
export function itemValid(item: DraftItem): boolean {
  if (!item.title.trim()) return false;
  if (item.days.length === 0) return false;

  if (item.mode === "fixed") {
    return !!item.startTime && !!item.endTime && item.startTime < item.endTime;
  }

  const duration = Number(item.duration);

  return Number.isFinite(duration) && duration > 0;
}

// O multiplicador só viaja com um objetivo selecionado: sem ele, o backend o
// ignora e guardá-lo aqui só criaria um valor fantasma.
function objectiveLinkFields(item: DraftItem) {
  if (!item.objectiveId) return { objective_id: null };

  const steps = Number(item.steps);

  return {
    objective_id: item.objectiveId,
    steps_per_completion: Number.isFinite(steps) && steps > 0 ? steps : 1,
  };
}

// Monta o payload de criação esperado pelo backend.
export function draftToCreateInput(
  item: DraftItem
): RoutineItemCreateInput {
  const link = objectiveLinkFields(item);

  return item.mode === "fixed"
    ? {
        title: item.title.trim(),
        days_of_week: item.days,
        start_time: item.startTime,
        end_time: item.endTime,
        ...link,
      }
    : {
        title: item.title.trim(),
        days_of_week: item.days,
        duration_minutes: Number(item.duration),
        ...link,
      };
}

// Para PATCH: envia null no modo que não está em uso.
// Isso evita deixar o item salvo com horário fixo e duração preenchidos ao mesmo tempo.
export function draftToUpdateInput(
  item: DraftItem
): RoutineItemUpdateInput {
  const base = {
    title: item.title.trim(),
    days_of_week: item.days,
    ...objectiveLinkFields(item),
  };

  return item.mode === "fixed"
    ? {
        ...base,
        start_time: item.startTime,
        end_time: item.endTime,
        duration_minutes: null,
      }
    : {
        ...base,
        start_time: null,
        end_time: null,
        duration_minutes: Number(item.duration),
      };
}

// ===========================================================================
// EDITOR VISUAL DO ITEM
// ===========================================================================

export function RoutineItemEditor({
  item,
  index,
  canRemove,
  onChange,
  onToggleDay,
  onRemove,
}: {
  item: DraftItem;
  index?: number;
  canRemove: boolean;
  onChange: (patch: Partial<DraftItem>) => void;
  onToggleDay: (day: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-soft bg-surface-muted p-4">
      <RoutineItemHeader
        index={index}
        canRemove={canRemove}
        onRemove={onRemove}
      />

      <RoutineTitleInput
        title={item.title}
        onChange={(title) => onChange({ title })}
      />

      <WeekdaySelector selectedDays={item.days} onToggleDay={onToggleDay} />

      <RoutineModeSelector
        mode={item.mode}
        onChange={(mode) => onChange({ mode })}
      />

      {item.mode === "fixed" ? (
        <FixedTimeFields
          startTime={item.startTime}
          endTime={item.endTime}
          onStartTimeChange={(startTime) => onChange({ startTime })}
          onEndTimeChange={(endTime) => onChange({ endTime })}
        />
      ) : (
        <FlexibleDurationField
          duration={item.duration}
          onChange={(duration) => onChange({ duration })}
        />
      )}

      <ObjectiveLinkFields item={item} onChange={onChange} />
    </div>
  );
}

// ===========================================================================
// SUBCOMPONENTES DO EDITOR
// ===========================================================================

function RoutineItemHeader({
  index,
  canRemove,
  onRemove,
}: {
  index?: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">
        {index != null ? `Item ${index + 1}` : "Editar item"}
      </p>

      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.95]"
          aria-label="Remover item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function RoutineTitleInput({
  title,
  onChange,
}: {
  title: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={title}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Título do item (ex.: Correr 5km)"
      className="w-full rounded-2xl border border-soft bg-surface-muted px-4 py-2.5 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
    />
  );
}

function WeekdaySelector({
  selectedDays,
  onToggleDay,
}: {
  selectedDays: number[];
  onToggleDay: (day: number) => void;
}) {
  return (
    <>
      <p className="mb-2 mt-4 text-xs font-medium text-muted">
        Dias da semana
      </p>

      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => {
          const isSelected = selectedDays.includes(day.idx);

          return (
            <button
              key={day.idx}
              type="button"
              onClick={() => onToggleDay(day.idx)}
              className={`h-9 w-10 rounded-xl border text-xs font-semibold transition active:scale-[0.95] ${
                isSelected
                  ? "border-accent-soft bg-accent-soft text-accent"
                  : "border-soft bg-surface-muted text-muted"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function RoutineModeSelector({
  mode,
  onChange,
}: {
  mode: ItemMode;
  onChange: (mode: ItemMode) => void;
}) {
  return (
    <>
      <p className="mb-2 mt-4 text-xs font-medium text-muted">Horário</p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("fixed")}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.97] ${
            mode === "fixed"
              ? "border-accent-soft bg-accent-soft text-accent"
              : "border-soft bg-surface-muted text-muted"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Horário fixo
        </button>

        <button
          type="button"
          onClick={() => onChange("axon")}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition active:scale-[0.97] ${
            mode === "axon"
              ? "border-accent-soft bg-accent-soft text-accent"
              : "border-soft bg-surface-muted text-muted"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Axon decide
        </button>
      </div>
    </>
  );
}

function FixedTimeFields({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[0.68rem] text-muted">Início</label>

        <input
          type="time"
          value={startTime}
          onChange={(e) => onStartTimeChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm text-primary outline-none focus:border-accent-soft"
        />
      </div>

      <div>
        <label className="text-[0.68rem] text-muted">Fim</label>

        <input
          type="time"
          value={endTime}
          onChange={(e) => onEndTimeChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm text-primary outline-none focus:border-accent-soft"
        />
      </div>
    </div>
  );
}

function FlexibleDurationField({
  duration,
  onChange,
}: {
  duration: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[0.68rem] text-muted">
        Duração (minutos)
      </label>

      <input
        type="number"
        min={1}
        value={duration}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex.: 30"
        className="mt-1 w-full rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
      />

      <p className="mt-1.5 text-[0.68rem] leading-4 text-muted">
        O Axon escolhe o melhor horário com base no seu cronotipo.
      </p>
    </div>
  );
}

// ===========================================================================
// OPÇÕES AVANÇADAS — VÍNCULO COM OBJETIVO
// ===========================================================================
// Recolhido por padrão: o formulário já tem título, dias e horário, e a maioria
// dos itens não avança objetivo nenhum. Abre sozinho quando o item JÁ está
// vinculado, senão a configuração ficaria escondida na edição.
function ObjectiveLinkFields({
  item,
  onChange,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
}) {
  const [open, setOpen] = useState(Boolean(item.objectiveId));
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Busca sob demanda: quem nunca abre o bloco não paga a requisição.
  useEffect(() => {
    if (!open || loaded) return;

    let active = true;

    api
      .getObjectives()
      .then((data) => {
        if (active) setObjectives(data.filter((o) => o.status !== "done"));
      })
      .catch(() => {
        if (active) setObjectives([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [open, loaded]);

  const selected = objectives.find((o) => o.id === item.objectiveId);
  const unit = selected?.step_label ?? "etapas";

  return (
    <div className="mt-4 border-t border-soft pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Opções avançadas
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[0.68rem] text-muted">
              Vincular a objetivo
            </label>

            <select
              value={item.objectiveId}
              onChange={(e) =>
                onChange({
                  objectiveId: e.target.value,
                  // Desvincular volta os dois campos ao padrão para não guardar
                  // "vale 3 etapas" de um objetivo que não está mais escolhido.
                  ...(e.target.value ? {} : { steps: "1" }),
                })
              }
              className="mt-1 w-full rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm text-primary outline-none focus:border-accent-soft"
            >
              <option value="">Nenhum</option>
              {objectives.map((objective) => (
                <option key={objective.id} value={objective.id}>
                  {objective.title}
                </option>
              ))}
            </select>

            <p className="mt-1.5 text-[0.68rem] leading-4 text-muted">
              Concluir este item avança o contador do objetivo.
            </p>
          </div>

          {item.objectiveId && (
            <div>
              <label className="text-[0.68rem] text-muted">
                Quantas {unit} cada conclusão vale
              </label>

              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={item.steps}
                onChange={(e) => onChange({ steps: e.target.value })}
                className="mt-1 w-full rounded-xl border border-soft bg-surface-muted px-3 py-2 text-sm text-primary outline-none focus:border-accent-soft"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
