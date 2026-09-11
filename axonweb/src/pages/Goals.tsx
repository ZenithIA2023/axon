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

type DesktopGoalFilter =
  | "all"
  | "with_steps"
  | "without_steps"
  | "with_deadline"
  | "overdue";

const DESKTOP_GOAL_FILTERS: { key: DesktopGoalFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "with_steps", label: "Com etapas" },
  { key: "without_steps", label: "Sem etapas" },
  { key: "with_deadline", label: "Com prazo" },
  { key: "overdue", label: "Atrasadas" },
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
  const [subtasks, setSubtasks] = useState<Record<string, api.Task[]>>({});
  const [loadingSubtasks, setLoadingSubtasks] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [addingStepTo, setAddingStepTo] = useState<Objective | null>(null);
  const [editingStep, setEditingStep] = useState<{
    task: api.Task;
    objectiveId: string;
  } | null>(null);
  const [togglingStepId, setTogglingStepId] = useState<string | null>(null);
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

  // Expande o objetivo e carrega suas etapas sob demanda.
  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    if (!subtasks[id]) {
      setLoadingSubtasks(id);
      try {
        const { subtasks: objectiveSteps } = await getObjectiveWithAllSteps(id);
        setSubtasks((prev) => ({ ...prev, [id]: objectiveSteps }));
      } catch {
        // Se falhar, mantém o objetivo aberto sem etapas.
      } finally {
        setLoadingSubtasks(null);
      }
    }
  }

  // Atualiza etapas e progresso do objetivo depois de criar/editar/concluir etapas.
  async function refreshSubtasks(objectiveId: string) {
    try {
      const { objective: obj, subtasks: objectiveSteps } =
        await getObjectiveWithAllSteps(objectiveId);

      setSubtasks((prev) => ({ ...prev, [objectiveId]: objectiveSteps }));
      setObjectives((prev) =>
        prev.map((objective) =>
          objective.id === objectiveId
            ? {
                ...objective,
                subtask_count: obj.subtask_count ?? objectiveSteps.length,
                done_count:
                  obj.done_count ??
                  objectiveSteps.filter((task) => task.status === "done").length,
                progress:
                  obj.progress ??
                  calculateObjectiveProgressFromSteps(objectiveSteps),
                status:
                  obj.status ??
                  (objectiveSteps.length > 0 &&
                  objectiveSteps.every((task) => task.status === "done")
                    ? "done"
                    : objective.status),
              }
            : objective
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

  // Marca/desmarca uma etapa e recalcula o progresso do objetivo.
  async function handleToggleStep(objectiveId: string, task: api.Task) {
    setTogglingStepId(task.id);
    const next =
      task.status === "done"
        ? { status: "todo" as api.TaskStatus, progress: 0 }
        : { status: "done" as api.TaskStatus, progress: 100 };
    try {
      await api.updateTask(task.id, next);
      await refreshSubtasks(objectiveId);
    } catch {
      // Mantém a etapa no estado atual em caso de erro.
    } finally {
      setTogglingStepId(null);
    }
  }

  const completedObjectives = objectives.filter(isObjectiveCompleted);
  const activeObjectiveList = objectives.filter(
    (objective) => !isObjectiveCompleted(objective)
  );
  const doneObjectives = completedObjectives.length;
  const activeObjectives = activeObjectiveList.length;
  const totalSteps = objectives.reduce((total, objective) => total + (objective.subtask_count ?? 0), 0);
  const doneSteps = objectives.reduce((total, objective) => total + (objective.done_count ?? 0), 0);
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
              Crie seu primeiro objetivo e adicione as etapas que vão te levar até ele.
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
                isLoadingSubtasks={loadingSubtasks === obj.id}
                subtasks={subtasks[obj.id] ?? []}
                isDeleting={deletingId === obj.id}
                togglingStepId={togglingStepId}
                onToggle={() => toggleExpand(obj.id)}
                onEdit={() => setEditingObjective(obj)}
                onAddStep={() => setAddingStepTo(obj)}
                onToggleStep={(task) => handleToggleStep(obj.id, task)}
                onEditStep={(task) => setEditingStep({ task, objectiveId: obj.id })}
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
          subtasks={subtasks}
          loadingSubtasks={loadingSubtasks}
          deletingId={deletingId}
          togglingStepId={togglingStepId}
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
          onAddStep={setAddingStepTo}
          onToggleStep={handleToggleStep}
          onEditStep={(task, objectiveId) => setEditingStep({ task, objectiveId })}
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
          onCreated={async (newId) => {
            setIsCreateOpen(false);
            await loadObjectives();
            // Expande o novo objetivo para mostrar as etapas criadas
            if (newId) {
              setExpandedId(newId);
              const loaded = await getObjectiveWithAllSteps(newId).catch(() => null);
              if (loaded) {
                setSubtasks((prev) => ({
                  ...prev,
                  [newId]: loaded.subtasks,
                }));
              }
            }
          }}
        />
      )}

      {editingObjective && (
        <EditObjectiveModal
          objective={editingObjective}
          onClose={() => setEditingObjective(null)}
          onUpdated={async (updated) => {
            setObjectives((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o));
            setEditingObjective(null);
          }}
        />
      )}

      {addingStepTo && (
        <AddStepModal
          objective={addingStepTo}
          onClose={() => setAddingStepTo(null)}
          onCreated={async () => {
            setAddingStepTo(null);
            await refreshSubtasks(addingStepTo.id);
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
            await refreshSubtasks(objId);
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
  const subtaskCount = objective.subtask_count ?? 0;
  const deadline = objective.deadline?.slice(0, 10) ?? "";
  const today = new Date().toLocaleDateString("en-CA");

  switch (filter) {
    case "with_steps":
      return subtaskCount > 0;
    case "without_steps":
      return subtaskCount === 0;
    case "with_deadline":
      return Boolean(deadline);
    case "overdue":
      return Boolean(deadline) && deadline < today;
    case "all":
    default:
      return true;
  }
}

type ObjectiveWithFallbackStatus = Objective & { status?: string | null };

function isObjectiveCompleted(objective: ObjectiveWithFallbackStatus) {
  const progress = objective.progress ?? 0;
  const subtaskCount = objective.subtask_count ?? 0;
  const doneCount = objective.done_count ?? 0;

  return (
    objective.status === "done" ||
    progress >= 100 ||
    (subtaskCount > 0 && doneCount >= subtaskCount)
  );
}

async function getObjectiveWithAllSteps(objectiveId: string) {
  const objective = await api.getObjective(objectiveId);
  const objectiveSteps = objective.subtasks ?? [];

  try {
    const allTasks = await api.getTasks();
    const linkedSteps = allTasks.filter((task) =>
      taskBelongsToObjective(task, objectiveId)
    );

    return {
      objective,
      subtasks: sortObjectiveSteps(
        mergeObjectiveSteps([...objectiveSteps, ...linkedSteps])
      ),
    };
  } catch {
    return {
      objective,
      subtasks: sortObjectiveSteps(objectiveSteps),
    };
  }
}

function taskBelongsToObjective(task: api.Task, objectiveId: string) {
  const record = task as api.Task &
    Record<string, unknown> & {
      objective_id?: string | null;
      objectiveId?: string | null;
      objective?: { id?: string | null } | string | null;
    };

  if (record.objective_id === objectiveId || record.objectiveId === objectiveId) {
    return true;
  }

  if (typeof record.objective === "string") {
    return record.objective === objectiveId;
  }

  if (
    record.objective &&
    typeof record.objective === "object" &&
    record.objective.id === objectiveId
  ) {
    return true;
  }

  return false;
}

function mergeObjectiveSteps(steps: api.Task[]) {
  const map = new Map<string, api.Task>();

  steps.forEach((step) => {
    const existing = map.get(step.id);
    map.set(step.id, existing ? { ...existing, ...step } : step);
  });

  return Array.from(map.values());
}

function sortObjectiveSteps(steps: api.Task[]) {
  return [...steps].sort((a, b) => {
    const aDone = a.status === "done";
    const bDone = b.status === "done";

    if (aDone !== bDone) {
      return aDone ? 1 : -1;
    }

    const byDate = (a.scheduled_date ?? "").localeCompare(
      b.scheduled_date ?? ""
    );

    if (byDate !== 0) {
      return byDate;
    }

    const byTime = (a.start_time ?? "").localeCompare(b.start_time ?? "");

    if (byTime !== 0) {
      return byTime;
    }

    return a.title.localeCompare(b.title);
  });
}

function calculateObjectiveProgressFromSteps(steps: api.Task[]) {
  if (steps.length === 0) return 0;

  return Math.round(
    (steps.filter((step) => step.status === "done").length / steps.length) *
      100
  );
}

function DesktopGoalsPanel({
  objectives,
  loading,
  expandedId,
  subtasks,
  loadingSubtasks,
  deletingId,
  togglingStepId,
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
  onAddStep,
  onToggleStep,
  onEditStep,
  onDelete,
}: {
  objectives: Objective[];
  loading: boolean;
  expandedId: string | null;
  subtasks: Record<string, api.Task[]>;
  loadingSubtasks: string | null;
  deletingId: string | null;
  togglingStepId: string | null;
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
  onAddStep: (objective: Objective) => void;
  onToggleStep: (objectiveId: string, task: api.Task) => void;
  onEditStep: (task: api.Task, objectiveId: string) => void;
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
                        ? "Crie um objetivo e transforme a meta em etapas claras para acompanhar no calendário."
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
                      isLoadingSubtasks={loadingSubtasks === objective.id}
                      subtasks={subtasks[objective.id] ?? []}
                      isDeleting={deletingId === objective.id}
                      togglingStepId={togglingStepId}
                      onToggle={() => onToggleExpand(objective.id)}
                      onEdit={() => onEditObjective(objective)}
                      onAddStep={() => onAddStep(objective)}
                      onToggleStep={(task) => onToggleStep(objective.id, task)}
                      onEditStep={(task) => onEditStep(task, objective.id)}
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
        <DesktopGoalStat label="Feitas" value={doneSteps} />
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
  const [loadingStepsId, setLoadingStepsId] = useState<string | null>(null);
  const [stepsByObjective, setStepsByObjective] = useState<
    Record<string, api.Task[]>
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

    if (stepsByObjective[objective.id]) {
      return;
    }

    setLoadingStepsId(objective.id);

    try {
      const { subtasks } = await getObjectiveWithAllSteps(objective.id);
      setStepsByObjective((current) => ({
        ...current,
        [objective.id]: subtasks,
      }));
    } catch {
      setStepsByObjective((current) => ({
        ...current,
        [objective.id]: [],
      }));
    } finally {
      setLoadingStepsId(null);
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
            const loading = loadingStepsId === objective.id;
            const steps = stepsByObjective[objective.id] ?? [];

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
                            ? "Ocultar etapas do objetivo concluído"
                            : "Ver etapas do objetivo concluído"
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
                      {objective.done_count ?? 0} de {objective.subtask_count ?? 0} etapas
                      {objective.deadline ? ` · prazo ${objective.deadline}` : ""}
                    </p>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-2.5 rounded-2xl border border-[#c084fc]/22 bg-[#faf5ff]/70 p-2 dark:border-white/8 dark:bg-black/14">
                    {loading ? (
                      <div className="flex items-center gap-2 px-1 py-1.5 text-[0.66rem] font-semibold text-[#7e22ce]/70 dark:text-[#d8b4fe]/50">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Carregando etapas…
                      </div>
                    ) : steps.length === 0 ? (
                      <p className="px-1 py-1.5 text-[0.66rem] font-semibold text-slate-500 dark:text-white/34">
                        Nenhuma etapa encontrada para este objetivo.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {steps.map((step) => {
                          const done = step.status === "done";

                          return (
                            <div
                              key={step.id}
                              className="flex min-w-0 items-center gap-2 rounded-xl border border-[#c084fc]/18 bg-white/72 px-2 py-1.5 dark:border-white/7 dark:bg-white/[0.035]"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                  done
                                    ? "bg-[#a855f7] text-white"
                                    : "border border-[#c084fc]/45 bg-transparent text-transparent"
                                }`}
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                              </span>

                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-[0.68rem] font-bold ${
                                    done
                                      ? "text-slate-600 line-through decoration-[#a855f7]/40 dark:text-white/42"
                                      : "text-slate-800 dark:text-white/66"
                                  }`}
                                >
                                  {step.title}
                                </p>

                                {(step.scheduled_date || step.start_time) && (
                                  <p className="mt-0.5 truncate text-[0.58rem] font-semibold text-slate-400 dark:text-white/25">
                                    {step.scheduled_date}
                                    {step.start_time
                                      ? ` · ${step.start_time.slice(0, 5)}`
                                      : ""}
                                  </p>
                                )}
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[0.56rem] font-black ${
                                  done
                                    ? "bg-[#f3e8ff] text-[#7e22ce] dark:bg-[#7b2cbf]/16 dark:text-[#d8b4fe]/70"
                                    : "bg-slate-100 text-slate-500 dark:bg-white/[0.045] dark:text-white/34"
                                }`}
                              >
                                {done ? "Feita" : "A fazer"}
                              </span>
                            </div>
                          );
                        })}
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
  isLoadingSubtasks,
  subtasks,
  isDeleting,
  togglingStepId,
  onToggle,
  onEdit,
  onAddStep,
  onToggleStep,
  onEditStep,
  onDelete,
}: {
  objective: Objective;
  isExpanded: boolean;
  isLoadingSubtasks: boolean;
  subtasks: api.Task[];
  isDeleting: boolean;
  togglingStepId: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onAddStep: () => void;
  onToggleStep: (task: api.Task) => void;
  onEditStep: (task: api.Task) => void;
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

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-slate-500 dark:text-white/36">
          <span>{objective.done_count ?? 0} de {objective.subtask_count ?? 0} etapas</span>
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
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-9 min-w-0 items-center justify-between rounded-2xl border border-slate-200/80 dark:border-white/8 bg-slate-100/80 dark:bg-black/12 px-3 text-xs font-bold text-slate-500 dark:text-white/45 transition active:scale-[0.98]"
        >
          <span className="truncate">
            {isExpanded ? "Ocultar etapas" : `Etapas (${objective.subtask_count ?? 0})`}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={onAddStep}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-2xl border border-[#a855f7]/20 bg-[#7b2cbf]/10 px-3 text-xs font-black text-[#7e22ce] dark:text-[#e9d5ff] transition active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          Etapa
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-slate-200/80 dark:border-white/8 pt-3">
          {isLoadingSubtasks ? (
            <div className="flex items-center gap-2 py-3 text-xs text-slate-500 dark:text-white/38">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando etapas…
            </div>
          ) : subtasks.length === 0 ? (
            <p className="py-2 text-xs text-slate-500 dark:text-white/38">
              Nenhuma etapa adicionada ainda.
            </p>
          ) : (
            <div className="max-h-[14rem] space-y-2 overflow-y-auto pr-1">
              {subtasks.map((task, index) => (
                <DesktopGoalStepRow
                  key={task.id}
                  task={task}
                  index={index}
                  toggling={togglingStepId === task.id}
                  onToggle={() => onToggleStep(task)}
                  onEdit={() => onEditStep(task)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function DesktopGoalStepRow({
  task,
  index,
  toggling,
  onToggle,
  onEdit,
}: {
  task: api.Task;
  index: number;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const done = task.status === "done";

  return (
    <div
      className={`group flex min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
        done
          ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-300/16 dark:bg-emerald-400/[0.055]"
          : "border-[#c084fc]/26 bg-[#f3e8ff]/42 shadow-[0_8px_22px_rgba(123,44,191,0.055)] hover:border-[#a855f7]/38 hover:bg-[#f3e8ff]/62 dark:border-[#a855f7]/14 dark:bg-[#7b2cbf]/10 dark:hover:bg-[#7b2cbf]/14"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition active:scale-[0.92] ${
          done
            ? "border-emerald-300 bg-emerald-400 text-white shadow-[0_8px_18px_rgba(16,185,129,0.16)]"
            : "border-[#a855f7]/30 bg-white/70 text-[#7e22ce] hover:bg-[#7b2cbf] hover:text-white dark:bg-white/[0.04] dark:text-[#d8b4fe]"
        } disabled:opacity-60`}
        aria-label={done ? "Desmarcar etapa" : "Marcar etapa como concluída"}
      >
        {toggling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <span className="text-[0.66rem] font-black">{index + 1}</span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className={`block w-full min-w-0 text-left text-xs font-black leading-4 ${
            done
              ? "text-emerald-800 line-through decoration-emerald-500/60 dark:text-emerald-100/64"
              : "text-slate-950 dark:text-white/78"
          }`}
        >
          <span className="line-clamp-1">{task.title}</span>
        </button>

        {(task.scheduled_date || task.start_time) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.62rem] font-semibold text-slate-500 dark:text-white/34">
            <CalendarDays className="h-3 w-3 shrink-0 text-[#7e22ce]/60 dark:text-[#d8b4fe]/50" />
            <span className="truncate">
              {task.scheduled_date || "Sem data"}
              {task.start_time ? ` · ${task.start_time.slice(0, 5)}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-[0.58rem] font-black ${
            done
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-100/72"
              : "bg-white/80 text-[#7e22ce] dark:bg-white/[0.045] dark:text-[#d8b4fe]/70"
          }`}
        >
          {done ? "Feita" : "A fazer"}
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 opacity-100 transition hover:border-[#a855f7]/26 hover:text-[#7e22ce] active:scale-[0.94] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/35 dark:group-hover:text-white/58"
          aria-label="Editar etapa"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DesktopGoalsEmptyState({
  onCreate,
  title = "Nenhum objetivo ainda",
  description = "Crie um objetivo e transforme a meta em etapas claras para acompanhar no calendário.",
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
// Exibe progresso, prazo, ações rápidas e etapas vinculadas ao objetivo.
function ObjectiveCard({
  objective,
  isExpanded,
  isLoadingSubtasks,
  subtasks,
  isDeleting,
  togglingStepId,
  onToggle,
  onEdit,
  onAddStep,
  onToggleStep,
  onEditStep,
  onDelete,
}: {
  objective: Objective;
  isExpanded: boolean;
  isLoadingSubtasks: boolean;
  subtasks: api.Task[];
  isDeleting: boolean;
  togglingStepId: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onAddStep: () => void;
  onToggleStep: (task: api.Task) => void;
  onEditStep: (task: api.Task) => void;
  onDelete: () => void;
}) {
  const isDone = objective.status === "done";

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

        {/* Barra de progresso */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-[0.68rem] text-slate-500 dark:text-white/35">
            <span>{objective.done_count} de {objective.subtask_count} etapas</span>
            <span>{objective.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-400" : "bg-gradient-to-r from-purple-400 to-fuchsia-300"}`}
              style={{ width: `${objective.progress}%` }}
            />
          </div>
        </div>

        {/* Botão expandir */}
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/14 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-white/45 active:scale-[0.98]"
        >
          <span>{isExpanded ? "Ocultar etapas" : `Ver etapas (${objective.subtask_count})`}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Etapas expandidas */}
      {isExpanded && (
        <div className="border-t border-slate-200/80 dark:border-white/8 px-4 pb-4 pt-3">
          {isLoadingSubtasks ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500 dark:text-white/38">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando etapas…
            </div>
          ) : (
            <>
              {subtasks.length === 0 ? (
                <p className="pb-3 pt-1 text-xs text-slate-500 dark:text-white/38">Nenhuma etapa adicionada ainda.</p>
              ) : (
                <div className="mb-3 space-y-2">
                  {subtasks.map((task) => {
                    const done = task.status === "done";
                    const toggling = togglingStepId === task.id;
                    return (
                      <div key={task.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-white/8 bg-white/70 dark:bg-white/[0.03] px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onToggleStep(task)}
                          disabled={toggling}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.9] ${
                            done
                              ? "border-emerald-400 bg-emerald-400 text-[#11111a]"
                              : "border-white/25 bg-transparent text-transparent hover:border-purple-300/60"
                          }`}
                          aria-label={done ? "Desmarcar etapa" : "Marcar etapa como concluída"}
                        >
                          {toggling
                            ? <Loader2 className="h-3 w-3 animate-spin text-slate-700 dark:text-white/60" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-xs font-semibold ${done ? "text-slate-500 dark:text-white/40 line-through" : "text-slate-700 dark:text-white/80"}`}>
                            {task.title}
                          </p>
                          {(task.scheduled_date || task.start_time) && (
                            <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-white/30">
                              {task.scheduled_date}
                              {task.start_time ? ` · ${task.start_time.slice(0, 5)}` : ""}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onEditStep(task)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/40 active:scale-[0.94]"
                          aria-label="Editar etapa"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={onAddStep}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300/25 bg-purple-500/[0.06] py-2.5 text-xs font-semibold text-purple-200/70 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar etapa
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
// Passo 1 cria o objetivo; passo 2 permite adicionar etapas iniciais.
type DraftStep = { key: string; title: string; date: string; time: string };

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
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Passo 2
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2), title: "", date: "", time: "" },
    ]);
  }

  function updateStep(key: string, patch: Partial<DraftStep>) {
    setSteps((prev) =>
      prev.map((stepItem) =>
        stepItem.key === key ? { ...stepItem, ...patch } : stepItem
      )
    );
  }
  function removeStep(key: string) {
    setSteps((prev) => prev.filter((s) => s.key !== key));
  }

  function handleNextStep() {
    if (!title.trim()) {
      setStep1Error("Dê um nome ao objetivo.");
      return;
    }

    setStep1Error(null);
    setStep(2);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const obj = await api.createObjective({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
      });

      const validSteps = steps.filter((s) => s.title.trim());
      if (validSteps.length > 0) {
        await Promise.all(
          validSteps.map((s) =>
            api.createTask({
              title: s.title.trim(),
              objective_id: obj.id,
              scheduled_date: s.date || undefined,
              start_time: s.time || undefined,
            } as any)
          )
        );
      }

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
              <span className={`text-[0.65rem] font-semibold ${step === 2 ? "text-slate-700 dark:text-white/70" : "text-slate-500 dark:text-white/28"}`}>Etapas</span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-[#7e22ce] dark:text-purple-100">
                <Target className="h-3.5 w-3.5" />
                {step === 1 ? "Novo objetivo" : title}
              </div>
              <h2 className="text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
                {step === 1 ? "Sobre o objetivo" : "Adicionar etapas"}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/38">
                {step === 1 ? "Nome, prazo e descrição." : "Quais são os passos para chegar lá?"}
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
                  placeholder="Ex: Fazer o TCC da faculdade"
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

              {step1Error && <p className="text-xs font-medium text-rose-300">{step1Error}</p>}
            </div>
          ) : (
            <div>
              {steps.length > 0 && (
                <div className="mb-3 space-y-3">
                  {steps.map((s, idx) => (
                    <StepInput
                      key={s.key}
                      step={s}
                      index={idx}
                      autoFocus={idx === steps.length - 1}
                      onChange={(patch) => updateStep(s.key, patch)}
                      onRemove={() => removeStep(s.key)}
                    />
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={addStep}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300/20 bg-purple-500/[0.05] py-2.5 text-xs font-semibold text-purple-200/60 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar etapa
              </button>

              {submitError && <p className="mt-3 text-xs font-medium text-rose-300">{submitError}</p>}
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
                Próximo — Adicionar etapas →
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

// ──────────────────────────────────────────────────────────────────────────────
// MODAL DE EDIÇÃO (com etapas existentes + adicionar novas)
// ──────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// MODAL DE EDIÇÃO DE OBJETIVO
// ===========================================================================
// Edita dados principais e permite revisar/criar etapas do objetivo.
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
  // Etapas existentes carregadas da API.
  const [existingSteps, setExistingSteps] = useState<api.Task[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(true);

  // Novas etapas digitadas nesta sessão, ainda não salvas.
  const [newSteps, setNewSteps] = useState<DraftStep[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega as etapas ao abrir o modal.
  useEffect(() => {
    api.getObjective(objective.id)
      .then((obj) => setExistingSteps(obj.subtasks ?? []))
      .catch(() => setExistingSteps([]))
      .finally(() => setLoadingSteps(false));
  }, [objective.id]);

  function addNewStep() {
    setNewSteps((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2), title: "", date: "", time: "" },
    ]);
  }

  function updateNewStep(key: string, patch: Partial<DraftStep>) {
    setNewSteps((prev) =>
      prev.map((stepItem) =>
        stepItem.key === key ? { ...stepItem, ...patch } : stepItem
      )
    );
  }
  function removeNewStep(key: string) {
    setNewSteps((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSubmit() {
    if (!title.trim()) { setError("O nome não pode ser vazio."); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Atualiza o objetivo
      const updated = await api.updateObjective(objective.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || null,
      });

      // Cria as novas etapas
      const validNew = newSteps.filter((s) => s.title.trim());
      if (validNew.length > 0) {
        await Promise.all(
          validNew.map((s) =>
            api.createTask({
              title: s.title.trim(),
              objective_id: objective.id,
              scheduled_date: s.date || undefined,
              start_time: s.time || undefined,
            } as any)
          )
        );
      }

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
            {/* Campos do objetivo */}
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

            {/* Divisor */}
            <div className="!mt-5 border-t border-slate-200/80 dark:border-white/8 pt-4">
              <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-white/42">Etapas</p>

              {loadingSteps ? (
                <div className="flex items-center gap-2 py-3 text-xs text-slate-500 dark:text-white/35">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando etapas…
                </div>
              ) : (
                <>
                  {/* Etapas existentes */}
                  {existingSteps.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {existingSteps.map((task) => (
                        <div key={task.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-white/8 bg-white/70 dark:bg-white/[0.03] px-3 py-2">
                          <div className={`h-2 w-2 shrink-0 rounded-full ${
                            task.status === "done" ? "bg-emerald-400" :
                            task.status === "progress" ? "bg-purple-300" : "bg-white/25"
                          }`} />
                          <p className={`flex-1 truncate text-xs font-semibold ${task.status === "done" ? "text-slate-500 dark:text-white/40 line-through" : "text-white/75"}`}>
                            {task.title}
                          </p>
                          <span className="shrink-0 text-[0.65rem] text-slate-500 dark:text-white/28">
                            {STATUS_TASK[task.status] ?? task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Novas etapas (inputs) */}
                  {newSteps.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {newSteps.map((s, idx) => (
                        <StepInput
                          key={s.key}
                          step={s}
                          index={existingSteps.length + idx}
                          autoFocus={idx === newSteps.length - 1}
                          onChange={(patch) => updateNewStep(s.key, patch)}
                          onRemove={() => removeNewStep(s.key)}
                        />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addNewStep}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300/20 bg-purple-500/[0.05] py-2.5 text-xs font-semibold text-purple-200/60 active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar etapa
                  </button>
                </>
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

// ──────────────────────────────────────────────────────────────────────────────
// MODAL DE ADICIONAR ETAPA
// ──────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// MODAL DE NOVA ETAPA
// ===========================================================================

function AddStepModal({
  objective,
  onClose,
  onCreated,
}: {
  objective: Objective;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [priority, setPriority] =
    useState<"low" | "medium" | "high">("medium");
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
      await api.createTask({
        title: title.trim(),
        scheduled_date: date || undefined,
        priority,
        objective_id: objective.id,
      } as any);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar etapa");
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
              Nova etapa
            </div>
            <h2 className="text-[1.45rem] font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 dark:text-white">
              Adicionar etapa
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-white/38">
              em <span className="font-semibold text-slate-700 dark:text-white/60">{objective.title}</span>
            </p>
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
              placeholder="Ex: Pesquisar referências bibliográficas"
              className={INPUT_CLS}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/42">Data (opcional)</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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

          {error && <p className="text-xs font-medium text-rose-300">{error}</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-purple-500 px-6 text-sm font-semibold text-white shadow-xl shadow-purple-950/35 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando…</> : <>Criar etapa <Plus className="ml-2 h-4 w-4" /></>}
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
// INPUT DE ETAPA (título + data opcional + hora opcional)
// ──────────────────────────────────────────────────────────────────────────────

// ===========================================================================
// INPUT REUTILIZÁVEL DE ETAPA
// ===========================================================================

function StepInput({
  step,
  index,
  autoFocus,
  onChange,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  autoFocus?: boolean;
  onChange: (patch: Partial<DraftStep>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.6rem] font-bold text-slate-500 dark:text-white/40">
          {index + 1}
        </span>
        <input
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={`Etapa ${index + 1}`}
          autoFocus={autoFocus}
          className="min-h-[38px] flex-1 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-purple-300/35"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.82] dark:bg-white/[0.055] text-slate-500 dark:text-white/35 active:scale-[0.94]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 pl-7">
        <div>
          <label className="mb-1 block text-[0.65rem] text-slate-500 dark:text-white/30">Data (opcional)</label>
          <input
            type="date"
            value={step.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="h-9 w-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/[0.78] dark:bg-white/[0.04] px-2.5 text-xs text-slate-700 dark:text-white/70 outline-none focus:border-purple-300/30 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.65rem] text-slate-500 dark:text-white/30">Hora (opcional)</label>
          <input
            type="time"
            value={step.time}
            onChange={(e) => onChange({ time: e.target.value })}
            className="h-9 w-full rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/[0.78] dark:bg-white/[0.04] px-2.5 text-xs text-slate-700 dark:text-white/70 outline-none focus:border-purple-300/30 [color-scheme:dark]"
          />
        </div>
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
