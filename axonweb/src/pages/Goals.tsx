import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  Menu,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Target,
  Trash2,
  X,
} from "lucide-react";

import Sidebar from "../components/layout/Sidebar";
import * as api from "../lib/api";
import type { Objective } from "../lib/api";
import { results, type ChronotypeResultKey } from "../data/results";

// ===========================================================================
// TIPOS E CONSTANTES GERAIS
// ===========================================================================

const validKeys: ChronotypeResultKey[] = [
  "Matutino",
  "Vespertino",
  "Noturno",
  "Misto",
  "Bimodal",
];

const STATUS_TASK: Record<string, string> = {
  todo: "A fazer",
  progress: "Em andamento",
  done: "Concluída",
  scheduled: "Agendada",
};

// "Com/sem etapas" perdeu o sentido quando o objetivo virou contador: todo
// objetivo tem etapas agora. O que interessa é o estágio do contador e se a
// projeção de ritmo indica que o prazo não será cumprido.
type DesktopGoalFilter =
  | "all"
  | "in_progress"
  | "not_started"
  | "with_deadline"
  | "late";

const DESKTOP_GOAL_FILTERS: { key: DesktopGoalFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "in_progress", label: "Em andamento" },
  { key: "not_started", label: "Não iniciadas" },
  { key: "with_deadline", label: "Com prazo" },
  { key: "late", label: "Atrasadas" },
];

type PlanningDesktopView = "rotinas" | "agenda" | "objetivos";

const PLANNING_DESKTOP_TABS: {
  key: PlanningDesktopView;
  label: string;
  icon: typeof Repeat;
}[] = [
  { key: "rotinas", label: "Rotinas", icon: Repeat },
  { key: "agenda", label: "Agenda", icon: CalendarDays },
  { key: "objetivos", label: "Objetivos", icon: Target },
];

const INPUT_CLS =
  "min-h-[52px] w-full rounded-2xl border border-slate-200/80 bg-white px-4 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#a855f7]/40 dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:placeholder:text-white/28";


// ===========================================================================
// PÁGINA DE OBJETIVOS
// ===========================================================================
// Lista objetivos de longo prazo, permite expandir etapas e abre modais de edição.
export default function Goals({
  embedded = false,
  desktopMode = false,
  activeView = "objetivos",
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenDesktopSidebar,
}: {
  embedded?: boolean;
  desktopMode?: boolean;
  activeView?: PlanningDesktopView;
  onViewChange?: (view: PlanningDesktopView) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenDesktopSidebar?: () => void;
} = {}) {
  const navigate = useNavigate();

  // Estado principal da página e da sidebar.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Detalhe carregado sob demanda: lançamentos do ledger + tarefas agendadas.
  const [details, setDetails] = useState<Record<string, ObjectiveDetail>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [addingProgressTo, setAddingProgressTo] = useState<Objective | null>(null);
  const [editingStep, setEditingStep] = useState<{
    task: api.Task;
    objectiveId: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Cronotipo usado para alimentar a sidebar quando a página não está embutida.
  const resultKey: ChronotypeResultKey = (() => {
    const stored = localStorage.getItem("axon_chronotype");

    return stored && validKeys.includes(stored as ChronotypeResultKey)
      ? (stored as ChronotypeResultKey)
      : "Misto";
  })();
  const result = results[resultKey];

  // Carrega objetivos do usuário.
  async function loadObjectives() {
    try {
      const data = await api.getObjectives();
      setObjectives(data);
    } catch {
      // Mantém a página vazia em caso de erro inicial.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!api.isLoggedIn()) {
      navigate("/login");
      return;
    }

    loadObjectives();
  }, [navigate]);

  // Expande o objetivo e carrega o detalhe (lançamentos + tarefas) sob demanda.
  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    if (!details[id]) {
      setLoadingDetailId(id);
      try {
        const { detail } = await loadObjectiveDetail(id);
        setDetails((prev) => ({ ...prev, [id]: detail }));
      } catch {
        // Se falhar, mantém o objetivo aberto sem o detalhe.
      } finally {
        setLoadingDetailId(null);
      }
    }
  }

  // Recarrega contador e detalhe depois de um lançamento ou de mexer numa
  // tarefa vinculada. O objeto vem inteiro do backend — nada é recalculado
  // aqui, senão a tela e o ledger divergiriam.
  async function refreshObjective(objectiveId: string) {
    try {
      const { objective: fresh, detail } = await loadObjectiveDetail(objectiveId);

      setDetails((prev) => ({ ...prev, [objectiveId]: detail }));
      setObjectives((prev) =>
        prev.map((objective) =>
          objective.id === objectiveId ? { ...objective, ...fresh } : objective
        )
      );
    } catch {
      // Mantém os dados atuais em caso de erro.
    }
  }

  // Remove o objetivo e limpa a expansão local caso ele estivesse aberto.
  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.deleteObjective(id);
      setObjectives((prev) => prev.filter((o) => o.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch {
      // Mantém o objetivo na lista em caso de erro.
    } finally {
      setDeletingId(null);
    }
  }

  const completedObjectives = objectives.filter(isObjectiveCompleted);
  const activeObjectiveList = objectives.filter(
    (objective) => !isObjectiveCompleted(objective)
  );
  const doneObjectives = completedObjectives.length;
  const activeObjectives = activeObjectiveList.length;
  const totalSteps = objectives.reduce(
    (total, objective) => total + (objective.total_steps ?? 0),
    0
  );
  const doneSteps = objectives.reduce(
    (total, objective) => total + (objective.completed_steps ?? 0),
    0
  );
  const averageProgress =
    objectives.length === 0
      ? 0
      : Math.round(
          objectives.reduce((total, objective) => total + (objective.progress ?? 0), 0) /
            objectives.length
        );
  const shouldRenderDesktopPanel = desktopMode || !embedded;

  // Conteúdo compartilhado entre a página própria e o modo embedded no Planning.
  const inner = (
    <>
      <div className="lg:hidden">
        {embedded && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.04em] text-white">
                Meus Objetivos
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
                Metas que o Axon ajuda a alcançar.
              </p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/20 px-4 py-2.5 text-sm font-semibold text-[#7e22ce] dark:text-purple-100 shadow-lg shadow-purple-950/20 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500 dark:text-white/45">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando objetivos…
          </div>
        ) : objectives.length === 0 ? (
          <div className="flex flex-col items-center rounded-[2rem] border border-dashed border-slate-200/80 dark:border-white/12 bg-slate-100/80 dark:bg-black/15 px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/10 text-purple-200">
              <Target className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-white">Nenhum objetivo ainda</p>
            <p className="mt-2 max-w-[260px] text-sm leading-6 text-slate-500 dark:text-white/42">
              Defina uma meta com um total de etapas e acompanhe o contador avançar.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              Criar objetivo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {objectives.map((obj) => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                isExpanded={expandedId === obj.id}
                isLoadingDetail={loadingDetailId === obj.id}
                detail={details[obj.id]}
                isDeleting={deletingId === obj.id}
                onToggle={() => toggleExpand(obj.id)}
                onEdit={() => setEditingObjective(obj)}
                onAddProgress={() => setAddingProgressTo(obj)}
                onEditTask={(task) => setEditingStep({ task, objectiveId: obj.id })}
                onDelete={() => handleDelete(obj.id)}
              />
            ))}
          </div>
        )}
      </div>

      {shouldRenderDesktopPanel && (
      <DesktopGoalsPanel
          objectives={objectives}
          loading={loading}
          expandedId={expandedId}
          details={details}
          loadingDetailId={loadingDetailId}
          deletingId={deletingId}
          doneObjectives={doneObjectives}
          completedObjectives={completedObjectives}
          activeObjectives={activeObjectives}
          totalSteps={totalSteps}
          doneSteps={doneSteps}
          averageProgress={averageProgress}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenNotifications={onOpenNotifications}
          unreadCount={unreadCount}
          onOpenSidebar={onOpenDesktopSidebar}
          onCreate={() => setIsCreateOpen(true)}
          onToggleExpand={toggleExpand}
          onEditObjective={setEditingObjective}
          onAddProgress={setAddingProgressTo}
          onEditTask={(task, objectiveId) => setEditingStep({ task, objectiveId })}
          onDelete={handleDelete}
        />
      )}
    </>
  );

  // Modais ficam fora do conteúdo para preservar o empilhamento visual.
  const modals = (
    <>
      {isCreateOpen && (
        <CreateObjectiveModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={async () => {
            // Nada é criado na agenda, então não há o que expandir: só a lista
            // precisa refletir o objetivo novo.
            setIsCreateOpen(false);
            await loadObjectives();
          }}
        />
      )}

      {editingObjective && (
        <EditObjectiveModal
          objective={editingObjective}
          onClose={() => setEditingObjective(null)}
          onUpdated={async (updated) => {
            setObjectives((prev) =>
              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
            );
            setEditingObjective(null);
          }}
        />
      )}

      {addingProgressTo && (
        <AddProgressModal
          objective={addingProgressTo}
          onClose={() => setAddingProgressTo(null)}
          onRegistered={async () => {
            const objId = addingProgressTo.id;
            setAddingProgressTo(null);
            await refreshObjective(objId);
          }}
        />
      )}

      {editingStep && (
        <EditStepModal
          task={editingStep.task}
          onClose={() => setEditingStep(null)}
          onUpdated={async () => {
            const objId = editingStep.objectiveId;
            setEditingStep(null);
            await refreshObjective(objId);
          }}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <>
        {inner}
        {modals}
      </>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#11111a] text-white">
      <Background />

      <div className="relative z-10 min-h-screen px-4 pb-6 pt-5">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 text-purple-200">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Objetivos</p>
              <p className="text-xs text-slate-500 dark:text-white/40">Suas metas de longo prazo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 text-purple-200 active:scale-[0.96]"
              aria-label="Criar objetivo"
            >
              <Plus className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.84] dark:bg-white/[0.06] text-white/65 active:scale-[0.96]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {inner}
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chronotypeLabel={result.label}
        energyPeak={result.energyPeak}
      />

      {modals}
    </main>
  );
}



function normalizeGoalSearchText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesDesktopGoalSearch(objective: Objective, term: string) {
  const normalizedTerm = normalizeGoalSearchText(term);

  if (!normalizedTerm) return true;

  const searchable = normalizeGoalSearchText(
    [
      objective.title,
      objective.description,
      objective.deadline,
      objective.status,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return searchable.includes(normalizedTerm);
}

function matchesDesktopGoalFilter(
  objective: Objective,
  filter: DesktopGoalFilter
) {
  const done = objective.completed_steps ?? 0;
  const deadline = objective.deadline?.slice(0, 10) ?? "";
  const today = new Date().toLocaleDateString("en-CA");

  switch (filter) {
    case "in_progress":
      return done > 0;
    case "not_started":
      return done === 0;
    case "with_deadline":
      return Boolean(deadline);
    case "late":
      // Atrasado é o prazo já vencido OU a projeção do backend apontando que o
      // ritmo atual não chega a tempo — este segundo caso avisa ANTES de dar
      // ruim, que é o ponto da projeção.
      return (
        (Boolean(deadline) && deadline < today) ||
        objective.projection?.on_track === false
      );
    case "all":
    default:
      return true;
  }
}

type ObjectiveWithFallbackStatus = Objective & { status?: string | null };

function isObjectiveCompleted(objective: ObjectiveWithFallbackStatus) {
  const total = objective.total_steps ?? 0;
  const done = objective.completed_steps ?? 0;

  return (
    objective.status === "done" ||
    (objective.progress ?? 0) >= 100 ||
    (total > 0 && done >= total)
  );
}

// O backend é a fonte única do progresso — o frontend não recalcula nada. O
// que ele carrega sob demanda é o DETALHE: os lançamentos do ledger (de onde
// veio cada avanço) e as tarefas que o usuário agendou para este objetivo.
type ObjectiveDetail = {
  entries: api.StepEntry[];
  linkedTasks: api.Task[];
};

async function loadObjectiveDetail(objectiveId: string): Promise<{
  objective: Objective;
  detail: ObjectiveDetail;
}> {
  const objective = await api.getObjective(objectiveId);

  return {
    objective,
    detail: {
      entries: objective.entries ?? [],
      linkedTasks: sortLinkedTasks(objective.linked_tasks ?? []),
    },
  };
}

function sortLinkedTasks(tasks: api.Task[]) {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === "done";
    const bDone = b.status === "done";

    if (aDone !== bDone) return aDone ? 1 : -1;

    const byDate = (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "");
    if (byDate !== 0) return byDate;

    const byTime = (a.start_time ?? "").localeCompare(b.start_time ?? "");
    if (byTime !== 0) return byTime;

    return a.title.localeCompare(b.title);
  });
}

// De onde veio o lançamento. Um item de rotina materializa uma tarefa, então
// rotina e tarefa chegam ambos com source_task_id — o source_routine_item_id é
// o que distingue os dois casos. Subtarefa tem coluna própria e é checada
// antes, senão um avanço de checklist apareceria como "Manual".
function entryOrigin(entry: api.StepEntry) {
  if (entry.source_routine_item_id) return "Rotina";
  if (entry.source_subtask_id) return "Subtarefa";
  if (entry.source_task_id) return "Tarefa";
  return "Manual";
}

function formatEntryDate(occurredAt: string) {
  const parsed = new Date(occurredAt);

  if (Number.isNaN(parsed.getTime())) return occurredAt.slice(0, 10);

  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatProjectedDate(isoDate: string) {
  // "YYYY-MM-DD" precisa virar data LOCAL: `new Date("2027-02-03")` seria
  // interpretada como UTC e viraria o dia anterior em fusos negativos.
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) return isoDate;

  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
  });
}

// Rótulo do contador: "11/257 aulas". O step_label já vem no plural do backend.
function stepCountLabel(objective: Objective) {
  return `${objective.completed_steps ?? 0}/${objective.total_steps ?? 0} ${
    objective.step_label ?? "etapas"
  }`;
}

// Linha de ritmo + previsão. Devolve null quando o backend não tem histórico
// suficiente: a tela OMITE a previsão em vez de inventar um número.
function ObjectiveProjectionLine({
  objective,
  compact = false,
}: {
  objective: Objective;
  compact?: boolean;
}) {
  const projection = objective.projection;

  if (!projection || projection.pace_per_day == null) return null;

  const late = projection.on_track === false && (projection.days_late ?? 0) > 0;
  const unit = objective.step_label ?? "etapas";

  return (
    <div
      className={`mt-2 space-y-0.5 ${
        compact ? "text-[0.64rem]" : "text-[0.68rem]"
      } text-slate-500 dark:text-white/38`}
    >
      <p>
        Ritmo: {projection.pace_per_day.toLocaleString("pt-BR")} {unit}/dia
      </p>
      {projection.projected_date && (
        <p className="flex flex-wrap items-center gap-x-1.5">
          <span>Previsão: {formatProjectedDate(projection.projected_date)}</span>
          {late && (
            <span className="font-semibold text-rose-500 dark:text-rose-300">
              ⚠ {projection.days_late} {projection.days_late === 1 ? "dia" : "dias"} depois
              do prazo
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// Extrato do ledger: data, origem e quantidade de cada avanço.
function ObjectiveEntriesList({
  entries,
  unit,
}: {
  entries: api.StepEntry[];
  unit: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-2 text-xs text-slate-500 dark:text-white/38">
        Nenhum avanço registrado ainda.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 dark:border-white/8 dark:bg-white/[0.03]"
        >
          <span className="w-10 shrink-0 text-[0.65rem] font-semibold text-slate-500 dark:text-white/32">
            {formatEntryDate(entry.occurred_at)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-white/70">
            {entryOrigin(entry)}
          </span>
          <span className="shrink-0 text-xs font-bold text-[#7e22ce] dark:text-[#e9d5ff]">
            +{entry.steps}
          </span>
        </div>
      ))}
      <p className="pt-0.5 text-[0.62rem] text-slate-400 dark:text-white/25">
        Unidade: {unit}
      </p>
    </div>
  );
}

// As tarefas agendadas para o objetivo. Aparecem como CONTEXTO da agenda — não
// definem o progresso, que vem só do ledger. Deixar isso explícito evita o
// engano do modelo antigo, em que a lista de tarefas ERA o progresso.
function ObjectiveLinkedTasks({
  tasks,
  onEditTask,
}: {
  tasks: api.Task[];
  onEditTask: (task: api.Task) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/28">
        Tarefas agendadas · não definem o progresso
      </p>
      <div className="space-y-1.5">
        {tasks.map((task) => {
          const done = task.status === "done";
          const steps = task.objective_steps ?? 1;

          return (
            <div
              key={task.id}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 dark:border-white/8 dark:bg-white/[0.03]"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  done
                    ? "bg-emerald-400"
                    : task.status === "progress"
                    ? "bg-purple-300"
                    : "bg-slate-300 dark:bg-white/25"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-xs font-semibold ${
                    done
                      ? "text-slate-500 line-through dark:text-white/40"
                      : "text-slate-700 dark:text-white/75"
                  }`}
                >
                  {task.title}
                </p>
                {task.scheduled_date && (
                  <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-white/30">
                    {task.scheduled_date}
                    {task.start_time ? ` · ${task.start_time.slice(0, 5)}` : ""}
                  </p>
                )}
              </div>
              {steps > 1 && (
                <span className="shrink-0 text-[0.65rem] font-bold text-[#7e22ce] dark:text-[#e9d5ff]">
                  +{steps}
                </span>
              )}
              <button
                type="button"
                onClick={() => onEditTask(task)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.82] text-slate-500 active:scale-[0.94] dark:bg-white/[0.055] dark:text-white/40"
                aria-label="Editar tarefa"
              >
                <Edit3 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopGoalsPanel({
  objectives,
  loading,
  expandedId,
  details,
  loadingDetailId,
  deletingId,
  doneObjectives,
  completedObjectives,
  activeObjectives,
  totalSteps,
  doneSteps,
  averageProgress,
  activeView = "objetivos",
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
  onCreate,
  onToggleExpand,
  onEditObjective,
  onAddProgress,
  onEditTask,
  onDelete,
}: {
  objectives: Objective[];
  loading: boolean;
  expandedId: string | null;
  details: Record<string, ObjectiveDetail>;
  loadingDetailId: string | null;
  deletingId: string | null;
  doneObjectives: number;
  completedObjectives: Objective[];
  activeObjectives: number;
  totalSteps: number;
  doneSteps: number;
  averageProgress: number;
  activeView?: PlanningDesktopView;
  onViewChange?: (view: PlanningDesktopView) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenSidebar?: () => void;
  onCreate: () => void;
  onToggleExpand: (id: string) => void;
  onEditObjective: (objective: Objective) => void;
  onAddProgress: (objective: Objective) => void;
  onEditTask: (task: api.Task, objectiveId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<DesktopGoalFilter>("all");

  const activeObjectiveList = objectives.filter(
    (objective) => !isObjectiveCompleted(objective)
  );
  const filteredObjectiveList = activeObjectiveList.filter(
    (objective) =>
      matchesDesktopGoalSearch(objective, searchTerm) &&
      matchesDesktopGoalFilter(objective, activeFilter)
  );

  function clearDesktopGoalFilters() {
    setSearchTerm("");
    setActiveFilter("all");
  }

  return (
    <section className="hidden min-h-0 lg:block">
      <div className="mx-auto grid h-[calc(100vh-0.6rem)] max-w-[1500px] grid-cols-[272px_minmax(0,1fr)] gap-2.5">
        <aside className="relative grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-[1.45rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.85] dark:bg-white/[0.035] p-2.5 shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
          <DesktopGoalsBrand />

          <DesktopGoalsProgressCard
            averageProgress={averageProgress}
            activeObjectives={activeObjectives}
            doneObjectives={doneObjectives}
            totalSteps={totalSteps}
            doneSteps={doneSteps}
          />

          <DesktopCompletedObjectivesCard objectives={completedObjectives} />
        </aside>

        <section className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.55rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.85] dark:bg-white/[0.035] shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
          <DesktopGoalsTopbar
            title="Objetivos"
            activeView={activeView}
            onViewChange={onViewChange}
            onCreate={onCreate}
            onOpenNotifications={onOpenNotifications}
            unreadCount={unreadCount}
            onOpenSidebar={onOpenSidebar}
          />

          <div className="min-h-0 flex-1 px-2.5 pb-2.5">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.45rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.88] dark:bg-[#0b0b14]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
              <DesktopGoalsSearchFilters
                searchTerm={searchTerm}
                activeFilter={activeFilter}
                visibleCount={filteredObjectiveList.length}
                totalCount={activeObjectives}
                onSearchChange={setSearchTerm}
                onFilterChange={setActiveFilter}
                onClear={clearDesktopGoalFilters}
              />

              {loading ? (
                <div className="grid gap-3 p-3 xl:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-36 animate-pulse rounded-[1.25rem] border border-slate-200/80 dark:border-white/8 bg-white/75 dark:bg-white/[0.035]"
                    />
                  ))}
                </div>
              ) : activeObjectiveList.length === 0 ? (
                <div className="p-3">
                  <DesktopGoalsEmptyState
                    onCreate={onCreate}
                    title={
                      objectives.length === 0
                        ? "Nenhum objetivo ainda"
                        : "Tudo concluído por aqui"
                    }
                    description={
                      objectives.length === 0
                        ? "Crie um objetivo com um total de etapas e acompanhe o contador avançar — sem poluir a agenda."
                        : "Seus objetivos concluídos foram movidos para o histórico da barra lateral."
                    }
                    actionLabel={
                      objectives.length === 0 ? "Criar objetivo" : "Novo objetivo"
                    }
                  />
                </div>
              ) : filteredObjectiveList.length === 0 ? (
                <div className="p-3">
                  <DesktopGoalsEmptyState
                    onCreate={clearDesktopGoalFilters}
                    title="Nenhuma meta encontrada"
                    description="Tente outro termo de busca ou limpe os filtros para voltar a ver suas metas em andamento."
                    actionLabel="Limpar filtros"
                  />
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 content-start items-start gap-3 overflow-y-auto overflow-x-hidden p-3 xl:grid-cols-2">
                  {filteredObjectiveList.map((objective) => (
                    <DesktopObjectiveCard
                      key={objective.id}
                      objective={objective}
                      isExpanded={expandedId === objective.id}
                      isLoadingDetail={loadingDetailId === objective.id}
                      detail={details[objective.id]}
                      isDeleting={deletingId === objective.id}
                      onToggle={() => onToggleExpand(objective.id)}
                      onEdit={() => onEditObjective(objective)}
                      onAddProgress={() => onAddProgress(objective)}
                      onEditTask={(task) => onEditTask(task, objective.id)}
                      onDelete={() => onDelete(objective.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function DesktopGoalsSearchFilters({
  searchTerm,
  activeFilter,
  visibleCount,
  totalCount,
  onSearchChange,
  onFilterChange,
  onClear,
}: {
  searchTerm: string;
  activeFilter: DesktopGoalFilter;
  visibleCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: DesktopGoalFilter) => void;
  onClear: () => void;
}) {
  const hasActiveFilters = searchTerm.trim() !== "" || activeFilter !== "all";

  return (
    <div className="shrink-0 border-b border-slate-200/90 bg-slate-50/40 px-4 py-3 dark:border-white/8 dark:bg-transparent">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/28" />

          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar meta, prazo ou descrição..."
            className="h-10 w-full rounded-2xl border border-slate-300/80 bg-white/90 pl-10 pr-10 text-xs font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-[#a855f7]/40 focus:bg-white dark:border-white/8 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/28 dark:focus:bg-white/[0.06]"
          />

          {searchTerm ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-[0.96] dark:text-white/34 dark:hover:bg-white/[0.05] dark:hover:text-white/60"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>

        <div className="hidden items-center gap-2 rounded-2xl border border-slate-300/80 bg-slate-50/90 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-700 xl:flex dark:border-white/8 dark:bg-white/[0.035] dark:text-white/34">
          <Target className="h-3.5 w-3.5 text-[#7e22ce] dark:text-[#d8b4fe]" />
          {visibleCount} de {totalCount}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a855f7]/35 bg-[var(--accent-strong)] px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(123,44,191,0.18)]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </span>

        {DESKTOP_GOAL_FILTERS.map((filter) => {
          const active = activeFilter === filter.key;

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onFilterChange(filter.key)}
              className={`min-h-8 rounded-full border px-3 text-[0.7rem] font-black transition active:scale-[0.97] ${
                active
                  ? "border-[#a855f7]/40 bg-[#7b2cbf]/14 text-[#6d28d9] shadow-[0_8px_18px_rgba(123,44,191,0.12)] dark:bg-[#7b2cbf]/24 dark:text-[#eadcff]"
                  : "border-slate-300/80 bg-white/85 text-slate-700 hover:border-[#a855f7]/28 hover:text-[#6d28d9] dark:border-white/8 dark:bg-white/[0.03] dark:text-white/44 dark:hover:text-white/70"
              }`}
            >
              {filter.label}
            </button>
          );
        })}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-8 rounded-full border border-slate-300/80 bg-white/85 px-3 text-[0.7rem] font-black text-slate-700 transition hover:border-[#a855f7]/28 hover:text-[#6d28d9] active:scale-[0.97] dark:border-white/8 dark:bg-white/[0.025] dark:text-white/38 dark:hover:text-white/70"
          >
            Limpar
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DesktopGoalsBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#a855f7]/26 bg-[#7b2cbf]/16 shadow-[0_14px_34px_rgba(123,44,191,0.22)]">
        <img src="/axon-logo.svg" alt="AXON" className="h-6.5 w-6.5" />
      </div>

      <div className="min-w-0">
        <p className="text-[0.95rem] font-black leading-none tracking-[-0.035em] text-slate-950 dark:text-white">
          AXON
        </p>
        <p className="mt-1 truncate text-[0.68rem] font-semibold text-muted">
          Metas e etapas
        </p>
      </div>
    </div>
  );
}

function DesktopGoalsTopbar({
  title,
  activeView,
  onViewChange,
  onCreate,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
}: {
  title: string;
  activeView: PlanningDesktopView;
  onViewChange?: (view: PlanningDesktopView) => void;
  onCreate: () => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenSidebar?: () => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-center gap-4 px-3.5 py-3">
      <h1 className="min-w-0 truncate text-[1.48rem] font-black leading-none tracking-[-0.06em] text-primary">
        {title}
      </h1>

      <DesktopGoalsTabs activeView={activeView} onViewChange={onViewChange} />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl bg-[var(--accent-strong)] px-3.5 text-[0.72rem] font-black text-white shadow-[0_16px_40px_rgba(123,44,191,0.34)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo objetivo
        </button>

        <button
          type="button"
          onClick={onOpenNotifications}
          disabled={!onOpenNotifications}
          className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white/[0.78] dark:bg-white/[0.04] text-slate-500 dark:text-white/50 shadow-card backdrop-blur-xl transition hover:text-slate-900 dark:hover:text-slate-900 dark:hover:text-white active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Abrir notificações"
        >
          <Bell className="h-4 w-4" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute right-[0.42rem] top-[0.42rem] h-2 w-2 rounded-full border border-[#12111a] bg-[#a855f7] shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white/[0.78] dark:bg-white/[0.04] text-slate-500 dark:text-white/50 shadow-card backdrop-blur-xl transition hover:text-slate-900 dark:hover:text-slate-900 dark:hover:text-white active:scale-[0.96]"
          aria-label="Abrir menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function DesktopGoalsTabs({
  activeView,
  onViewChange,
}: {
  activeView: PlanningDesktopView;
  onViewChange?: (view: PlanningDesktopView) => void;
}) {
  return (
    <div className="grid w-[330px] grid-cols-3 rounded-full border border-slate-200/80 dark:border-white/8 bg-white/[0.78] dark:bg-white/[0.04] p-1 shadow-card backdrop-blur-2xl">
      {PLANNING_DESKTOP_TABS.map((tab) => {
        const active = activeView === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onViewChange?.(tab.key)}
            className={`min-h-8 rounded-full text-[0.7rem] font-bold transition active:scale-[0.98] ${
              active
                ? "bg-[var(--accent-strong)] text-white shadow-[0_10px_24px_rgba(123,44,191,0.28)]"
                : "text-slate-500 dark:text-white/38 hover:text-slate-700 dark:hover:text-slate-700 dark:text-white/68"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function DesktopGoalsProgressCard({
  averageProgress,
  activeObjectives,
  doneObjectives,
  totalSteps,
  doneSteps,
}: {
  averageProgress: number;
  activeObjectives: number;
  doneObjectives: number;
  totalSteps: number;
  doneSteps: number;
}) {
  const normalized = Math.min(Math.max(averageProgress, 0), 100);

  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 dark:border-white/8 bg-white/75 dark:bg-white/[0.035] p-3.5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">
            Progresso geral
          </p>
          <h2 className="mt-1 text-[2rem] font-black leading-none tracking-[-0.07em] text-slate-950 dark:text-white">
            {normalized}%
          </h2>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#a855f7]/22 bg-[#7b2cbf]/12 text-[#7e22ce] dark:text-[#e9d5ff]">
          <Target className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[#a855f7]"
          style={{ width: `${normalized}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <DesktopGoalStat label="Ativos" value={activeObjectives} />
        <DesktopGoalStat label="Concluídos" value={doneObjectives} />
        <DesktopGoalStat label="Etapas" value={totalSteps} />
        <DesktopGoalStat label="Concluídas" value={doneSteps} />
      </div>
    </div>
  );
}

function DesktopCompletedObjectivesCard({
  objectives,
}: {
  objectives: Objective[];
}) {
  const [expandedObjectiveId, setExpandedObjectiveId] = useState<string | null>(
    null
  );
  const [loadingEntriesId, setLoadingEntriesId] = useState<string | null>(null);
  // Histórico do ledger do objetivo concluído: como ele foi cumprido.
  const [entriesByObjective, setEntriesByObjective] = useState<
    Record<string, api.StepEntry[]>
  >({});

  const visibleObjectives = [...objectives].sort((a, b) => {
    const aDate = a.deadline ?? "";
    const bDate = b.deadline ?? "";

    return bDate.localeCompare(aDate);
  });

  async function toggleCompletedObjective(objective: Objective) {
    if (expandedObjectiveId === objective.id) {
      setExpandedObjectiveId(null);
      return;
    }

    setExpandedObjectiveId(objective.id);

    if (entriesByObjective[objective.id]) {
      return;
    }

    setLoadingEntriesId(objective.id);

    try {
      const { detail } = await loadObjectiveDetail(objective.id);
      setEntriesByObjective((current) => ({
        ...current,
        [objective.id]: detail.entries,
      }));
    } catch {
      setEntriesByObjective((current) => ({
        ...current,
        [objective.id]: [],
      }));
    } finally {
      setLoadingEntriesId(null);
    }
  }

  return (
    <div className="min-h-0 overflow-hidden rounded-[1.35rem] border border-[#c084fc]/35 bg-[#f3e8ff]/55 p-3.5 shadow-[0_18px_46px_rgba(123,44,191,0.10)] backdrop-blur-xl dark:border-[#a855f7]/18 dark:bg-[#7b2cbf]/12">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-[#7e22ce] dark:text-[#d8b4fe]/68">
            objetivos concluídos
          </p>
          <h3 className="mt-1 text-[1.25rem] font-black leading-none tracking-[-0.055em] text-slate-950 dark:text-white">
            Histórico
          </h3>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#a855f7]/24 bg-[#7b2cbf]/12 text-[#7e22ce] dark:text-[#e9d5ff]">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      </div>

      {visibleObjectives.length === 0 ? (
        <div className="rounded-2xl border border-[#c084fc]/22 bg-white/60 px-3 py-4 dark:border-white/8 dark:bg-black/12">
          <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-white/40">
            Quando um objetivo chegar a 100%, ele sai da lista principal e
            aparece aqui como histórico.
          </p>
        </div>
      ) : (
        <div className="max-h-full space-y-2 overflow-y-auto pr-1">
          {visibleObjectives.map((objective) => {
            const expanded = expandedObjectiveId === objective.id;
            const loading = loadingEntriesId === objective.id;
            const entries = entriesByObjective[objective.id] ?? [];

            return (
              <div
                key={objective.id}
                className="rounded-2xl border border-[#c084fc]/30 bg-white/72 px-3 py-2.5 shadow-[0_10px_22px_rgba(123,44,191,0.06)] dark:border-[#a855f7]/14 dark:bg-black/14"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#a855f7] text-white">
                    <CheckCircle2 className="h-3 w-3" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-2">
                      <p className="line-clamp-2 flex-1 text-xs font-black leading-4 text-slate-950 dark:text-white">
                        {objective.title}
                      </p>

                      <button
                        type="button"
                        onClick={() => toggleCompletedObjective(objective)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#c084fc]/28 bg-[#f3e8ff]/70 text-[#7e22ce] transition hover:border-[#a855f7]/45 hover:bg-[#e9d5ff] active:scale-[0.94] dark:border-[#a855f7]/18 dark:bg-white/[0.045] dark:text-[#d8b4fe]"
                        aria-label={
                          expanded
                            ? "Ocultar histórico do objetivo concluído"
                            : "Ver histórico do objetivo concluído"
                        }
                      >
                        {expanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="mt-1 text-[0.64rem] font-semibold text-[#7e22ce]/80 dark:text-[#d8b4fe]/52">
                      {stepCountLabel(objective)}
                      {objective.deadline ? ` · prazo ${objective.deadline}` : ""}
                    </p>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-2.5 rounded-2xl border border-[#c084fc]/22 bg-[#faf5ff]/70 p-2 dark:border-white/8 dark:bg-black/14">
                    {loading ? (
                      <div className="flex items-center gap-2 px-1 py-1.5 text-[0.66rem] font-semibold text-[#7e22ce]/70 dark:text-[#d8b4fe]/50">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Carregando histórico…
                      </div>
                    ) : entries.length === 0 ? (
                      <p className="px-1 py-1.5 text-[0.66rem] font-semibold text-slate-500 dark:text-white/34">
                        Nenhum lançamento registrado para este objetivo.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex min-w-0 items-center gap-2 rounded-xl border border-[#c084fc]/18 bg-white/72 px-2 py-1.5 dark:border-white/7 dark:bg-white/[0.035]"
                          >
                            <span className="w-9 shrink-0 text-[0.6rem] font-bold text-slate-500 dark:text-white/32">
                              {formatEntryDate(entry.occurred_at)}
                            </span>
                            <p className="min-w-0 flex-1 truncate text-[0.68rem] font-bold text-slate-800 dark:text-white/66">
                              {entryOrigin(entry)}
                            </p>
                            <span className="shrink-0 rounded-full bg-[#f3e8ff] px-2 py-0.5 text-[0.56rem] font-black text-[#7e22ce] dark:bg-[#7b2cbf]/16 dark:text-[#d8b4fe]/70">
                              +{entry.steps}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DesktopGoalStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-white/8 bg-slate-100/80 dark:bg-black/12 px-3 py-2.5">
      <p className="text-[0.55rem] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/26">
        {label}
      </p>
      <p className="mt-1 text-base font-black leading-none tracking-[-0.045em] text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function DesktopObjectiveCard({
  objective,
  isExpanded,
  isLoadingDetail,
  detail,
  isDeleting,
  onToggle,
  onEdit,
  onAddProgress,
  onEditTask,
  onDelete,
}: {
  objective: Objective;
  isExpanded: boolean;
  isLoadingDetail: boolean;
  detail?: ObjectiveDetail;
  isDeleting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddProgress: () => void;
  onEditTask: (task: api.Task) => void;
  onDelete: () => void;
}) {
  const isDone = objective.status === "done";
  const progress = Math.min(Math.max(objective.progress ?? 0, 0), 100);

  return (
    <article
      className={`flex min-h-[9.75rem] flex-col overflow-hidden rounded-[1.28rem] border p-3.5 transition ${
        isDone
          ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-300/18 dark:bg-emerald-400/[0.055]"
          : "border-slate-200/95 bg-white/82 shadow-[0_12px_32px_rgba(93,64,126,0.06)] hover:border-[#a855f7]/28 dark:border-white/8 dark:bg-white/[0.035] dark:shadow-none"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
                isDone
                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-700 dark:text-emerald-100"
                  : "border-[#a855f7]/22 bg-[#7b2cbf]/12 text-[#7e22ce] dark:text-[#e9d5ff]"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-4.5 w-4.5" />
              ) : (
                <Target className="h-4.5 w-4.5" />
              )}
            </span>

            <div className="min-w-0">
              <p
                className={`line-clamp-2 text-sm font-black leading-5 ${
                  isDone ? "text-emerald-700 line-through opacity-80 dark:text-emerald-100" : "text-slate-950 dark:text-white"
                }`}
              >
                {objective.title}
              </p>

              {objective.deadline && (
                <p className="mt-0.5 text-[0.66rem] font-medium text-slate-500 dark:text-white/34">
                  Prazo: {objective.deadline}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/45 transition active:scale-[0.94]"
            aria-label="Editar objetivo"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/35 transition active:scale-[0.94] disabled:opacity-40"
            aria-label="Excluir objetivo"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* O contador: é ele o progresso, não a contagem de tarefas. */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-slate-500 dark:text-white/36">
          <span>{stepCountLabel(objective)}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${
              isDone ? "bg-emerald-400" : "bg-[#a855f7]"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <ObjectiveProjectionLine objective={objective} compact />
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-9 min-w-0 items-center justify-between rounded-2xl border border-slate-200/80 dark:border-white/8 bg-slate-100/80 dark:bg-black/12 px-3 text-xs font-bold text-slate-500 dark:text-white/45 transition active:scale-[0.98]"
        >
          <span className="truncate">
            {isExpanded ? "Ocultar histórico" : "Ver histórico"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={onAddProgress}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-2xl border border-[#a855f7]/20 bg-[#7b2cbf]/10 px-3 text-xs font-black text-[#7e22ce] dark:text-[#e9d5ff] transition active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          Avanço
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-slate-200/80 dark:border-white/8 pt-3">
          {isLoadingDetail ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-500 dark:text-white/38">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico…
            </div>
          ) : (
            <div className="max-h-[16rem] overflow-y-auto pr-1">
              <ObjectiveEntriesList
                entries={detail?.entries ?? []}
                unit={objective.step_label ?? "etapas"}
              />
              <ObjectiveLinkedTasks
                tasks={detail?.linkedTasks ?? []}
                onEditTask={onEditTask}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function DesktopGoalsEmptyState({
  onCreate,
  title = "Nenhum objetivo ainda",
  description = "Crie um objetivo com um total de etapas e acompanhe o contador avançar — sem poluir a agenda.",
  actionLabel = "Criar objetivo",
}: {
  onCreate: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/12 px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#a855f7]/22 bg-[#7b2cbf]/12 text-[#7e22ce] dark:text-[#e9d5ff]">
        <Target className="h-6 w-6" />
      </div>

      <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-2 max-w-[22rem] text-sm leading-6 text-slate-500 dark:text-white/42">
        {description}
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-black text-white transition active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        {actionLabel}
      </button>
    </div>
  );
}


// ===========================================================================
// CARD DE OBJETIVO
// ===========================================================================
// Mostra o contador, o ritmo e, ao expandir, o extrato de lançamentos.
function ObjectiveCard({
  objective,
  isExpanded,
  isLoadingDetail,
  detail,
  isDeleting,
  onToggle,
  onEdit,
  onAddProgress,
  onEditTask,
  onDelete,
}: {
  objective: Objective;
  isExpanded: boolean;
  isLoadingDetail: boolean;
  detail?: ObjectiveDetail;
  isDeleting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddProgress: () => void;
  onEditTask: (task: api.Task) => void;
  onDelete: () => void;
}) {
  const isDone = objective.status === "done";
  const progress = Math.min(Math.max(objective.progress ?? 0, 0), 100);

  return (
    <div className={`overflow-hidden rounded-[1.7rem] border shadow-xl shadow-black/20 backdrop-blur-2xl ${
      isDone ? "border-emerald-300/20 bg-emerald-400/[0.06]" : "border-slate-200/80 dark:border-white/10 bg-[#1b1b27]/82"
    }`}>
      <div className="p-4">
        {/* Cabeçalho: título + ações */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {isDone && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />}
              <p className={`truncate text-sm font-semibold ${isDone ? "text-emerald-700 line-through opacity-80 dark:text-emerald-100" : "text-slate-950 dark:text-white"}`}>
                {objective.title}
              </p>
            </div>
            {objective.deadline && (
              <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-500 dark:text-white/38">
                <CalendarDays className="h-3 w-3" />
                Prazo: {objective.deadline}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/45 active:scale-[0.94]"
              aria-label="Editar objetivo"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/35 active:scale-[0.94] disabled:opacity-40"
              aria-label="Excluir objetivo"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Contador + barra + ritmo/previsão */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-slate-500 dark:text-white/35">
            <span>{stepCountLabel(objective)}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-400" : "bg-gradient-to-r from-purple-400 to-fuchsia-300"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <ObjectiveProjectionLine objective={objective} />
        </div>

        {/* Botão expandir */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/14 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-white/45 active:scale-[0.98]"
        >
          <span>{isExpanded ? "Ocultar histórico" : "Ver histórico de avanços"}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Extrato de lançamentos + tarefas agendadas */}
      {isExpanded && (
        <div className="border-t border-slate-200/80 dark:border-white/8 px-4 pb-4 pt-3">
          {isLoadingDetail ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500 dark:text-white/38">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico…
            </div>
          ) : (
            <>
              <ObjectiveEntriesList
                entries={detail?.entries ?? []}
                unit={objective.step_label ?? "etapas"}
              />
              <ObjectiveLinkedTasks
                tasks={detail?.linkedTasks ?? []}
                onEditTask={onEditTask}
              />

              <button
                type="button"
                onClick={onAddProgress}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300/25 bg-purple-500/[0.06] py-2.5 text-xs font-semibold text-purple-200/70 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                Registrar avanço
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// MODAL DE CRIAÇÃO DE OBJETIVO
// ===========================================================================
// Passo 1: o que é o objetivo. Passo 2: o TAMANHO da meta — quantas etapas e
// como chamá-las. O passo 2 antigo montava uma lista de tarefas e disparava um
// Promise.all de createTask; foi exatamente isso que encheu a agenda de 40
// compromissos sem horário e fez a funcionalidade ser abandonada. Agora ele
// pede dois números e NÃO cria nada na agenda.
function CreateObjectiveModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (newId?: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);

  // Passo 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Passo 2 — o contador.
  const [totalSteps, setTotalSteps] = useState("1");
  const [stepLabel, setStepLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleNextStep() {
    if (!title.trim()) {
      setStep1Error("Dê um nome ao objetivo.");
      return;
    }

    setStep1Error(null);
    setStep(2);
  }

  async function handleSubmit() {
    const total = Number.parseInt(totalSteps, 10);

    if (!Number.isFinite(total) || total < 1) {
      setSubmitError("O objetivo precisa ter pelo menos 1 etapa.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const obj = await api.createObjective({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
        priority,
        total_steps: total,
        step_label: stepLabel.trim() || undefined,
      });

      onCreated(obj.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao criar objetivo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-sm lg:items-center lg:p-6 dark:bg-black/60">
      <div className="relative flex max-h-[90vh] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-white/10 bg-white/96 text-slate-950 shadow-[0_30px_110px_rgba(93,64,126,0.2)] backdrop-blur-2xl dark:bg-[#171720]/95 dark:text-white dark:shadow-black/50">

        {/* Cabeçalho com indicador de passo */}
        <div className="relative border-b border-slate-200/80 dark:border-white/10 px-5 pb-4 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-300 dark:bg-white/18" />

          {/* Stepper visual */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold ${step === 1 ? "bg-purple-500 text-white" : "bg-purple-100 text-purple-700 dark:bg-purple-500/30 dark:text-purple-200"}`}>1</div>
              <span className={`text-[0.65rem] font-semibold ${step === 1 ? "text-slate-700 dark:text-white/70" : "text-slate-500 dark:text-white/35"}`}>Objetivo</span>
            </div>
            <div className="h-px w-6 bg-slate-200 dark:bg-white/15" />
            <div className="flex items-center gap-1.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold ${step === 2 ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/28"}`}>2</div>
              <span className={`text-[0.65rem] font-semibold ${step === 2 ? "text-slate-700 dark:text-white/70" : "text-slate-500 dark:text-white/28"}`}>Tamanho</span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-[#7e22ce] dark:text-purple-100">
                <Target className="h-3.5 w-3.5" />
                {step === 1 ? "Novo objetivo" : title}
              </div>
              <h2 className="text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
                {step === 1 ? "Sobre o objetivo" : "Tamanho da meta"}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/38">
                {step === 1
                  ? "Nome, prazo e descrição."
                  : "Quantas unidades até concluir?"}
              </p>
            </div>
            <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.84] dark:bg-white/[0.06] text-slate-500 dark:text-white/45 active:scale-[0.96]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo do passo */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Nome do objetivo</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Aprender alemão"
                  className={INPUT_CLS}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Descrição (opcional)</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexto, meta ou critério de sucesso…"
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#a855f7]/40 dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:placeholder:text-white/28"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Prazo (opcional)</span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={INPUT_CLS}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Prioridade</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                  className="min-h-[52px] w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white px-4 text-sm text-slate-950 outline-none focus:border-[#a855f7]/40 dark:bg-[#222230] dark:text-white dark:focus:border-purple-300/35"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>

              {step1Error && <p className="text-xs font-medium text-rose-300">{step1Error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">
                  Quantas etapas?
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={totalSteps}
                  onChange={(e) => setTotalSteps(e.target.value)}
                  placeholder="Ex: 257"
                  autoFocus
                  className={INPUT_CLS}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">
                  Como chamar cada uma?
                </span>
                <input
                  value={stepLabel}
                  onChange={(e) => setStepLabel(e.target.value)}
                  placeholder="etapas"
                  className={INPUT_CLS}
                />
                <span className="mt-1.5 block text-[0.68rem] text-slate-500 dark:text-white/32">
                  No plural: aulas, páginas, capítulos. Em branco vira “etapas”.
                </span>
              </label>

              <p className="rounded-2xl border border-slate-200/80 bg-slate-100/70 px-4 py-3 text-[0.72rem] leading-5 text-slate-500 dark:border-white/8 dark:bg-black/14 dark:text-white/40">
                O objetivo é só um contador — nada é criado na sua agenda. Ele
                avança quando você conclui uma tarefa ou uma rotina vinculada,
                ou quando registra um avanço manualmente.
              </p>

              {submitError && <p className="text-xs font-medium text-rose-300">{submitError}</p>}
            </div>
          )}
        </div>

        {/* Botões de ação */}
        <div className="border-t border-slate-200/80 dark:border-white/10 px-5 py-4">
          {step === 1 ? (
            <>
              <button
                onClick={handleNextStep}
                className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-purple-500 px-6 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98]"
              >
                Próximo — Tamanho da meta →
              </button>
              <button onClick={onClose} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-6 text-sm font-semibold text-slate-700 dark:text-white/55 active:scale-[0.98]">
                Cancelar
              </button>
            </>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={submitting}
                className="inline-flex min-h-14 w-[44%] items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-4 text-sm font-semibold text-slate-700 dark:text-white/55 active:scale-[0.98] disabled:opacity-50"
              >
                ← Voltar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-purple-500 px-4 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98] disabled:opacity-60"
              >
                {submitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando…</>
                  : "Criar objetivo"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// MODAL DE EDIÇÃO DE OBJETIVO
// ===========================================================================
// Edita os dados e o TAMANHO da meta. Mexer em total_steps muda o denominador
// do progresso — o backend reconcilia o cache e a barra acompanha. O histórico
// aparece só para leitura: correção de lançamento é feita no card.
function EditObjectiveModal({
  objective,
  onClose,
  onUpdated,
}: {
  objective: Objective;
  onClose: () => void;
  onUpdated: (updated: Objective) => void;
}) {
  const [title, setTitle] = useState(objective.title);
  const [description, setDescription] = useState(objective.description ?? "");
  const [deadline, setDeadline] = useState(objective.deadline ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(
    (objective.priority as "low" | "medium" | "high") ?? "medium"
  );
  const [totalSteps, setTotalSteps] = useState(String(objective.total_steps ?? 1));
  const [stepLabel, setStepLabel] = useState(objective.step_label ?? "etapas");

  const [entries, setEntries] = useState<api.StepEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega o extrato ao abrir, só para o usuário conferir de onde veio o
  // progresso enquanto decide se o total está certo.
  useEffect(() => {
    api
      .getObjective(objective.id)
      .then((obj) => setEntries(obj.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [objective.id]);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("O nome não pode ser vazio.");
      return;
    }

    const total = Number.parseInt(totalSteps, 10);
    if (!Number.isFinite(total) || total < 1) {
      setError("O objetivo precisa ter pelo menos 1 etapa.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.updateObjective(objective.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || null,
        priority,
        total_steps: total,
        step_label: stepLabel.trim() || undefined,
      });

      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-sm lg:items-center lg:p-6 dark:bg-black/60">
      <div className="relative flex max-h-[92vh] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-white/10 bg-white/96 text-slate-950 shadow-[0_30px_110px_rgba(93,64,126,0.2)] backdrop-blur-2xl dark:bg-[#171720]/95 dark:text-white dark:shadow-black/50">

        <div className="relative border-b border-slate-200/80 dark:border-white/10 px-5 pb-4 pt-4">
          <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300 dark:bg-white/18" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-[#7e22ce] dark:text-purple-100">
                <Edit3 className="h-3.5 w-3.5" />
                Editar objetivo
              </div>
              <h2 className="text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
                Editar objetivo
              </h2>
            </div>
            <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.84] dark:bg-white/[0.06] text-slate-500 dark:text-white/45 active:scale-[0.96]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Nome do objetivo</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLS} />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Descrição (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto, meta ou critério de sucesso…"
                rows={2}
                className="w-full resize-none rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#a855f7]/40 dark:border-white/10 dark:bg-white/[0.055] dark:text-white dark:placeholder:text-white/28"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Prazo (opcional)</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={INPUT_CLS}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Prioridade</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                className="min-h-[52px] w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white px-4 text-sm text-slate-950 outline-none focus:border-[#a855f7]/40 dark:bg-[#222230] dark:text-white dark:focus:border-purple-300/35"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>

            {/* Tamanho da meta */}
            <div className="!mt-5 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-4 dark:border-white/8">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Total de etapas</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={totalSteps}
                  onChange={(e) => setTotalSteps(e.target.value)}
                  className={INPUT_CLS}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Unidade</span>
                <input
                  value={stepLabel}
                  onChange={(e) => setStepLabel(e.target.value)}
                  placeholder="etapas"
                  className={INPUT_CLS}
                />
              </label>
            </div>

            {/* Histórico (somente leitura) */}
            <div className="!mt-5 border-t border-slate-200/80 dark:border-white/8 pt-4">
              <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-white/42">
                Histórico de avanços
              </p>

              {loadingEntries ? (
                <div className="flex items-center gap-2 py-3 text-xs text-slate-500 dark:text-white/35">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico…
                </div>
              ) : (
                <ObjectiveEntriesList
                  entries={entries}
                  unit={stepLabel.trim() || "etapas"}
                />
              )}
            </div>

            {error && <p className="text-xs font-medium text-rose-300">{error}</p>}
          </div>
        </div>

        <div className="border-t border-slate-200/80 dark:border-white/10 px-5 py-4">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-purple-500 px-6 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : "Salvar alterações"}
          </button>
          <button onClick={onClose} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-6 text-sm font-semibold text-slate-700 dark:text-white/55 active:scale-[0.98]">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// MODAL DE REGISTRAR AVANÇO
// ===========================================================================
// Lançamento manual no ledger. Antes este modal criava uma TAREFA com
// objective_id — era o caminho que transformava cada unidade de progresso num
// compromisso na agenda. Agora ele só grava quantas etapas foram cumpridas.
function AddProgressModal({
  objective,
  onClose,
  onRegistered,
}: {
  objective: Objective;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [steps, setSteps] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = objective.step_label ?? "etapas";
  const remaining = Math.max(
    (objective.total_steps ?? 0) - (objective.completed_steps ?? 0),
    0
  );

  async function handleSubmit() {
    const amount = Number.parseInt(steps, 10);

    if (!Number.isFinite(amount) || amount < 1) {
      setError("Informe quantas etapas você avançou.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.addObjectiveEntry(objective.id, amount);
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar avanço");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-sm lg:items-center lg:p-6 dark:bg-black/60">
      <div className="w-full max-w-[430px] rounded-[2rem] border border-slate-200/80 dark:border-white/10 bg-white/96 p-5 text-slate-950 shadow-[0_30px_110px_rgba(93,64,126,0.2)] backdrop-blur-2xl dark:bg-[#171720]/95 dark:text-white dark:shadow-black/50">
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300 dark:bg-white/18" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-[#7e22ce] dark:text-purple-100">
              <Plus className="h-3.5 w-3.5" />
              Novo avanço
            </div>
            <h2 className="text-[1.45rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
              Registrar avanço
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-white/38">
              em <span className="font-semibold text-slate-700 dark:text-white/60">{objective.title}</span>
              {" · "}
              {stepCountLabel(objective)}
            </p>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.84] dark:bg-white/[0.06] text-slate-500 dark:text-white/45 active:scale-[0.96]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">
              Quantas {unit} você avançou?
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              autoFocus
              className={INPUT_CLS}
            />
            {remaining > 0 && (
              <span className="mt-1.5 block text-[0.68rem] text-slate-500 dark:text-white/32">
                Faltam {remaining} {unit} para concluir.
              </span>
            )}
          </label>

          {error && <p className="text-xs font-medium text-rose-300">{error}</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-purple-500 px-6 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando…</> : <>Registrar avanço <Plus className="ml-2 h-4 w-4" /></>}
        </button>

        <button onClick={onClose} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-6 text-sm font-semibold text-slate-700 dark:text-white/55 active:scale-[0.98]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MODAL DE EDITAR ETAPA (título, data, hora, prioridade)
// ──────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// MODAL DE EDIÇÃO DE ETAPA
// ===========================================================================

function EditStepModal({
  task,
  onClose,
  onUpdated,
}: {
  task: api.Task;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.scheduled_date ?? "");
  const [time, setTime] = useState(
    task.start_time ? task.start_time.slice(0, 5) : ""
  );
  const [priority, setPriority] = useState<"low" | "medium" | "high">(
    (task.priority as "low" | "medium" | "high") ?? "medium"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Dê um nome à etapa.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateTask(task.id, {
        title: title.trim(),
        scheduled_date: date || undefined,
        start_time: time || undefined,
        priority,
      } as any);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar etapa");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-sm lg:items-center lg:p-6 dark:bg-black/60">
      <div className="w-full max-w-[430px] rounded-[2rem] border border-slate-200/80 dark:border-white/10 bg-white/96 p-5 text-slate-950 shadow-[0_30px_110px_rgba(93,64,126,0.2)] backdrop-blur-2xl dark:bg-[#171720]/95 dark:text-white dark:shadow-black/50">
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-slate-300 dark:bg-white/18" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-[#7e22ce] dark:text-purple-100">
              <Edit3 className="h-3.5 w-3.5" />
              Editar etapa
            </div>
            <h2 className="text-[1.45rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
              Editar etapa
            </h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.84] dark:bg-white/[0.06] text-slate-500 dark:text-white/45 active:scale-[0.96]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Nome da etapa</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLS}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Data</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${INPUT_CLS} [color-scheme:dark]`}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Hora</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={`${INPUT_CLS} [color-scheme:dark]`}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Prioridade</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="min-h-[52px] w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white px-4 text-sm text-slate-950 outline-none focus:border-[#a855f7]/40 dark:bg-[#222230] dark:text-white dark:focus:border-purple-300/35"
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </label>

          {error && <p className="text-xs font-medium text-rose-300">{error}</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-purple-500 px-6 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : "Salvar alterações"}
        </button>

        <button onClick={onClose} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-6 text-sm font-semibold text-slate-700 dark:text-white/55 active:scale-[0.98]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// BACKGROUND
// ──────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// BACKGROUND VISUAL
// ===========================================================================

function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#151520_0%,#101018_48%,#13131d_100%)]" />
      <div className="absolute left-1/2 top-[-14rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-purple-700/22 blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:30px_30px] opacity-[0.12]" />
    </div>
  );
}
