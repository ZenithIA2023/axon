import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ListChecks,
  Loader2,
  Menu,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";

import Sidebar from "../components/layout/Sidebar";
import NewRoutineSheet from "../components/routines/NewRoutineSheet";
import {
  blankItem,
  draftToCreateInput,
  draftToUpdateInput,
  itemToDraft,
  itemValid,
  RoutineItemEditor,
  WEEKDAYS,
  type DraftItem,
} from "../components/routines/RoutineItem";
import * as api from "../lib/api";
import type { Routine, RoutineDetail, RoutineItem } from "../lib/api";

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


type DesktopRoutineFilter =
  | "all"
  | "active"
  | "paused"
  | "with_items"
  | "with_streak";

const DESKTOP_ROUTINE_FILTERS: { key: DesktopRoutineFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "paused", label: "Pausadas" },
  { key: "with_items", label: "Com itens" },
  { key: "with_streak", label: "Com sequência" },
];

// ===========================================================================
// LISTA DE ROTINAS
// ===========================================================================
// Renderiza a aba/página de rotinas e abre o fluxo de criação de nova rotina.
export default function Routines({
  embedded = false,
  desktopMode = false,
  activeView = "rotinas",
  onViewChange,
  onOpenNotifications,
  unreadCount = null,
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

  // Controles visuais da página/lista.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Carrega a lista de rotinas do usuário.
  function load() {
    setLoading(true);
    api
      .getRoutines()
      .then((data) => {
        setRoutines(data);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message || "Não foi possível carregar suas rotinas.");
        setRoutines([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // Pausa ou retoma uma rotina diretamente pelo card.
  async function toggleStatus(routine: Routine) {
    if (actioningId) return;
    setActioningId(routine.id);
    try {
      if (routine.status === "active") {
        await api.pauseRoutine(routine.id);
      } else {
        await api.resumeRoutine(routine.id);
      }
      // Recarrega para refletir streak/contagens recalculados no backend.
      const fresh = await api.getRoutines();
      setRoutines(fresh);
      setError(null);
    } catch (e) {
      setError(
        (e as Error).message || "Não foi possível atualizar a rotina."
      );
    } finally {
      setActioningId(null);
    }
  }

  function goCreate() {
    setIsCreateOpen(true);
  }

  const isEmpty = !loading && routines !== null && routines.length === 0;

  const routineList = routines ?? [];
  const activeCount = routineList.filter((routine) => routine.status === "active").length;
  const pausedCount = routineList.filter((routine) => routine.status !== "active").length;
  const itemCount = routineList.reduce((total, routine) => total + (routine.item_count ?? 0), 0);
  const bestStreak = routineList.reduce((max, routine) => Math.max(max, routine.streak ?? 0), 0);
  const shouldRenderDesktopPanel = desktopMode || !embedded;

  // Conteúdo compartilhado entre a rota própria e a aba embedded do Planning.
  const inner = (
    <>
      <div className="lg:hidden">
        <section className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white">
              Minhas Rotinas
            </h1>

            <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
              Hábitos que o Axon agenda por você.
            </p>
          </div>

          <button
            onClick={goCreate}
            className="flex shrink-0 items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/20 px-4 py-2.5 text-sm font-semibold text-purple-100 shadow-lg shadow-purple-950/20 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            Nova Rotina
          </button>
        </section>

        {error && (
          <div className="mb-4 rounded-[1.4rem] border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-100/80">
            {error}
          </div>
        )}

        {loading ? (
          <RoutinesSkeleton />
        ) : isEmpty ? (
          <EmptyState onCreate={goCreate} />
        ) : (
          <div className="space-y-3">
            {routines!.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                busy={actioningId === routine.id}
                disabled={actioningId !== null && actioningId !== routine.id}
                onToggle={() => toggleStatus(routine)}
                onOpen={() => navigate(`/rotinas/${routine.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {shouldRenderDesktopPanel && (
        <DesktopRoutinesPanel
          routines={routineList}
          loading={loading}
          error={error}
          isEmpty={isEmpty}
          activeCount={activeCount}
          pausedCount={pausedCount}
          itemCount={itemCount}
          bestStreak={bestStreak}
          actioningId={actioningId}
          activeView={activeView}
          onViewChange={onViewChange}
          onOpenNotifications={onOpenNotifications}
          unreadCount={unreadCount}
          onOpenSidebar={onOpenDesktopSidebar ?? (() => setIsSidebarOpen(true))}
          onCreate={goCreate}
          onToggle={toggleStatus}
        />
      )}
    </>
  );

  // Sheet de criação fica fora do conteúdo para preservar o empilhamento visual.
  const modals = (
    <NewRoutineSheet
      isOpen={isCreateOpen}
      onClose={() => setIsCreateOpen(false)}
      onCreated={load}
    />
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
    <main className="relative min-h-screen overflow-hidden bg-[#f8f4ff] text-slate-950 dark:bg-[#05050b] dark:text-white">
      <Background />

      <div className="relative z-10 min-h-screen px-4 pb-6 pt-5">
        <header className="mb-6 flex items-center justify-between lg:hidden">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3 text-left active:scale-[0.98]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/15 text-purple-700 dark:text-purple-200 shadow-lg shadow-purple-950/30">
              <img
                src="/axon-logo.svg"
                alt="Axon"
                className="h-8 w-8 object-contain"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Rotinas</p>
              <p className="text-xs text-slate-500 dark:text-white/40">Hábitos recorrentes</p>
            </div>
          </button>

          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.045] text-slate-700 dark:text-white/60 backdrop-blur-2xl active:scale-[0.96]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {inner}
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {modals}
    </main>
  );
}



function normalizeRoutineSearchText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesDesktopRoutineSearch(routine: Routine, term: string) {
  const normalizedTerm = normalizeRoutineSearchText(term);

  if (!normalizedTerm) return true;

  const searchable = normalizeRoutineSearchText(
    [
      routine.name,
      routine.status,
      routine.paused_until,
      routine.start_date,
      routine.end_date,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return searchable.includes(normalizedTerm);
}

function matchesDesktopRoutineFilter(
  routine: Routine,
  filter: DesktopRoutineFilter
) {
  switch (filter) {
    case "active":
      return routine.status === "active";
    case "paused":
      return routine.status === "paused";
    case "with_items":
      return (routine.item_count ?? 0) > 0;
    case "with_streak":
      return (routine.streak ?? 0) > 0;
    case "all":
    default:
      return true;
  }
}


function DesktopRoutinesPanel({
  routines,
  loading,
  error,
  isEmpty,
  activeCount,
  pausedCount,
  itemCount,
  bestStreak,
  actioningId,
  activeView = "rotinas",
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
  onCreate,
  onToggle,
}: {
  routines: Routine[];
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  activeCount: number;
  pausedCount: number;
  itemCount: number;
  bestStreak: number;
  actioningId: string | null;
  activeView?: PlanningDesktopView;
  onViewChange?: (view: PlanningDesktopView) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenSidebar?: () => void;
  onCreate: () => void;
  onToggle: (routine: Routine) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<DesktopRoutineFilter>("all");
  const [expandedRoutineId, setExpandedRoutineId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [detailsByRoutine, setDetailsByRoutine] = useState<
    Record<string, RoutineDetail>
  >({});

  const featuredRoutine =
    routines.find((routine) => routine.status === "active") ?? routines[0] ?? null;
  const filteredRoutines = routines.filter(
    (routine) =>
      matchesDesktopRoutineSearch(routine, searchTerm) &&
      matchesDesktopRoutineFilter(routine, activeFilter)
  );

  function clearDesktopRoutineFilters() {
    setSearchTerm("");
    setActiveFilter("all");
  }

  async function toggleRoutineDetails(routine: Routine) {
    if (expandedRoutineId === routine.id) {
      setExpandedRoutineId(null);
      return;
    }

    setExpandedRoutineId(routine.id);

    if (detailsByRoutine[routine.id]) {
      return;
    }

    setLoadingDetailId(routine.id);

    try {
      const detail = await api.getRoutine(routine.id);
      setDetailsByRoutine((current) => ({
        ...current,
        [routine.id]: detail,
      }));
    } catch {
      setDetailsByRoutine((current) => ({
        ...current,
        [routine.id]: {
          ...routine,
          items: [],
        } as RoutineDetail,
      }));
    } finally {
      setLoadingDetailId(null);
    }
  }

  return (
    <section className="hidden min-h-0 lg:block">
      <div className="mx-auto grid h-[calc(100vh-0.6rem)] max-w-[1500px] grid-cols-[272px_minmax(0,1fr)] gap-2.5">
        <aside className="relative grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-[1.45rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.85] dark:bg-white/[0.035] p-2.5 shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
          <DesktopRoutinesBrand />

          <DesktopRoutinesSummaryCard
            activeCount={activeCount}
            pausedCount={pausedCount}
            itemCount={itemCount}
            bestStreak={bestStreak}
            totalCount={routines.length}
          />

          <DesktopRoutinesSidebarCard routine={featuredRoutine} />
        </aside>

        <section className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.55rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.85] dark:bg-white/[0.035] shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
          <DesktopRoutinesTopbar
            title="Rotinas"
            activeView={activeView}
            onViewChange={onViewChange}
            onCreate={onCreate}
            onOpenNotifications={onOpenNotifications}
            unreadCount={unreadCount}
            onOpenSidebar={onOpenSidebar}
          />

          <div className="min-h-0 flex-1 px-2.5 pb-2.5">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.45rem] border border-slate-200/80 dark:border-white/8 bg-white/[0.88] dark:bg-[#0b0b14]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
              <DesktopRoutinesSearchFilters
                searchTerm={searchTerm}
                activeFilter={activeFilter}
                visibleCount={filteredRoutines.length}
                totalCount={routines.length}
                onSearchChange={setSearchTerm}
                onFilterChange={setActiveFilter}
                onClear={clearDesktopRoutineFilters}
              />

              {error && (
                <div className="mx-3 mt-3 rounded-[1.2rem] border border-red-300/30 bg-red-500/10 p-3 text-xs font-medium leading-5 text-red-700 dark:text-red-100/80">
                  {error}
                </div>
              )}

              {loading ? (
                <DesktopRoutinesSkeleton />
              ) : isEmpty ? (
                <div className="p-3">
                  <DesktopRoutinesEmptyState onCreate={onCreate} />
                </div>
              ) : filteredRoutines.length === 0 ? (
                <div className="p-3">
                  <DesktopRoutinesEmptyState
                    onCreate={clearDesktopRoutineFilters}
                    title="Nenhuma rotina encontrada"
                    description="Tente outro termo de busca ou limpe os filtros para voltar a ver suas rotinas."
                    actionLabel="Limpar filtros"
                  />
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-y-auto overflow-x-hidden p-3 xl:grid-cols-2">
                  {filteredRoutines.map((routine) => (
                    <DesktopRoutineCard
                      key={routine.id}
                      routine={routine}
                      detail={detailsByRoutine[routine.id] ?? null}
                      isExpanded={expandedRoutineId === routine.id}
                      isLoadingDetails={loadingDetailId === routine.id}
                      busy={actioningId === routine.id}
                      disabled={actioningId !== null && actioningId !== routine.id}
                      onToggle={() => onToggle(routine)}
                      onToggleDetails={() => toggleRoutineDetails(routine)}
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

function DesktopRoutinesSearchFilters({
  searchTerm,
  activeFilter,
  visibleCount,
  totalCount,
  onSearchChange,
  onFilterChange,
  onClear,
}: {
  searchTerm: string;
  activeFilter: DesktopRoutineFilter;
  visibleCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: DesktopRoutineFilter) => void;
  onClear: () => void;
}) {
  const hasActiveFilters = searchTerm.trim() !== "" || activeFilter !== "all";

  return (
    <div className="shrink-0 border-b border-slate-200/90 bg-slate-50/45 px-4 py-3 dark:border-white/8 dark:bg-transparent">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/28" />

          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar rotina, status ou data..."
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

        <div className="hidden items-center gap-2 rounded-2xl border border-slate-300/80 bg-white/90 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-700 xl:flex dark:border-white/8 dark:bg-white/[0.035] dark:text-white/34">
          <Repeat className="h-3.5 w-3.5 text-[#7e22ce] dark:text-[#d8b4fe]" />
          {visibleCount} de {totalCount}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a855f7]/35 bg-[var(--accent-strong)] px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_24px_rgba(123,44,191,0.18)]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </span>

        {DESKTOP_ROUTINE_FILTERS.map((filter) => {
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

function DesktopRoutinesTopbar({
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

      <div className="grid grid-cols-3 rounded-full border border-slate-200/80 dark:border-white/8 bg-white/[0.82] dark:bg-white/[0.055] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {PLANNING_DESKTOP_TABS.map((tab) => {
          const active = activeView === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onViewChange?.(tab.key)}
              disabled={!onViewChange && !active}
              className={`min-h-8 min-w-[6.5rem] rounded-full px-5 text-[0.72rem] font-black transition active:scale-[0.98] disabled:cursor-default disabled:opacity-35 ${
                active
                  ? "bg-[var(--accent-strong)] text-white shadow-[0_8px_18px_rgba(123,44,191,0.2)]"
                  : "text-slate-500 dark:text-white/34 hover:text-slate-700 dark:hover:text-slate-700 dark:text-white/60"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl bg-[var(--accent-strong)] px-3.5 text-[0.72rem] font-black text-white shadow-[0_16px_40px_rgba(123,44,191,0.34)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Nova rotina
        </button>

        <button
          type="button"
          onClick={onOpenNotifications}
          disabled={!onOpenNotifications}
          className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white/[0.78] dark:bg-white/[0.04] text-slate-500 dark:text-white/46 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-slate-700 dark:hover:text-slate-700 dark:text-white/72 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
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
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white/[0.78] dark:bg-white/[0.04] text-slate-500 dark:text-white/46 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:text-slate-700 dark:hover:text-slate-700 dark:text-white/72 active:scale-[0.96]"
          aria-label="Abrir menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function DesktopRoutinesBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#a855f7]/24 bg-[#7b2cbf]/18 shadow-[0_12px_28px_rgba(123,44,191,0.26)]">
        <img src="/axon-logo.svg" alt="AXON" className="h-7 w-7 object-contain" />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-black leading-tight text-primary">AXON</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-muted">
          Rotinas e hábitos
        </p>
      </div>
    </div>
  );
}

function DesktopRoutinesSummaryCard({
  activeCount,
  pausedCount,
  itemCount,
  bestStreak,
  totalCount,
}: {
  activeCount: number;
  pausedCount: number;
  itemCount: number;
  bestStreak: number;
  totalCount: number;
}) {
  const progress = totalCount === 0 ? 0 : Math.round((activeCount / totalCount) * 100);

  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-slate-50/82 p-3.5 shadow-[0_18px_46px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">
            Ritmo ativo
          </p>
          <h2 className="mt-1 text-[2rem] font-black leading-none tracking-[-0.07em] text-slate-950 dark:text-white">
            {activeCount} rotina{activeCount === 1 ? "" : "s"}
          </h2>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 text-[#7e22ce] shadow-[0_10px_24px_rgba(71,85,105,0.08)] dark:border-white/8 dark:bg-white/[0.045] dark:text-[#d8b4fe]">
          <Repeat className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--accent-strong)] transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DesktopRoutineStat label="Pausadas" value={pausedCount} />
        <DesktopRoutineStat label="Itens" value={itemCount} />
        <DesktopRoutineStat label="Sequência" value={bestStreak} suffix="d" />
        <DesktopRoutineStat label="Total" value={totalCount} />
      </div>
    </div>
  );
}

function DesktopRoutinesSidebarCard({ routine }: { routine: Routine | null }) {
  return (
    <div className="min-h-0 overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-slate-50/82 p-3.5 shadow-[0_16px_45px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">
            Próxima rotina
          </p>

          <h3 className="mt-2 break-words text-xl font-black leading-tight tracking-[-0.055em] text-slate-950 dark:text-white">
            {routine?.name ?? "Sem rotina criada"}
          </h3>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 text-[#7e22ce] shadow-[0_10px_24px_rgba(71,85,105,0.08)] dark:border-white/8 dark:bg-white/[0.045] dark:text-[#d8b4fe]">
          <Sparkles className="h-4 w-4" />
        </div>
      </div>

      <p className="text-xs font-medium leading-5 text-slate-600 dark:text-white/42">
        {routine
          ? `${routine.item_count ?? 0} ${routine.item_count === 1 ? "item cadastrado" : "itens cadastrados"} · ${routine.status === "active" ? "ativa" : "pausada"}`
          : "Crie rotinas para transformar hábitos em blocos recorrentes."}
      </p>

      {routine ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <DesktopRoutineStat
            label="Status"
            value={routine.status === "active" ? 1 : 0}
            suffix={routine.status === "active" ? " ativa" : " pausada"}
          />
          <DesktopRoutineStat label="Streak" value={routine.streak ?? 0} suffix="d" />
        </div>
      ) : null}
    </div>
  );
}

function DesktopRoutineStat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-white/8 bg-white/70 dark:bg-black/12 px-3 py-2.5">
      <p className="text-[0.58rem] font-black uppercase tracking-[0.13em] text-slate-500 dark:text-white/26">
        {label}
      </p>
      <p className="mt-1 text-lg font-black leading-none tracking-[-0.045em] text-slate-950 dark:text-white">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function DesktopRoutineCard({
  routine,
  detail,
  isExpanded,
  isLoadingDetails,
  busy,
  disabled,
  onToggle,
  onToggleDetails,
}: {
  routine: Routine;
  detail: RoutineDetail | null;
  isExpanded: boolean;
  isLoadingDetails: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  onToggleDetails: () => void;
}) {
  const isActive = routine.status === "active";
  const items = detail?.items ?? [];
  const itemCount = detail?.items.length ?? routine.item_count ?? 0;
  const itemLabel = `${itemCount} ${itemCount === 1 ? "item" : "itens"}`;
  const streakLabel =
    routine.streak > 0
      ? `${routine.streak} ${routine.streak === 1 ? "dia" : "dias"}`
      : "iniciar hoje";

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.28rem] border p-3.5 transition hover:-translate-y-0.5 active:scale-[0.99] ${
        isActive
          ? "border-[#c084fc]/34 bg-[#f3e8ff]/42 shadow-[0_14px_34px_rgba(123,44,191,0.07)] hover:border-[#a855f7]/44 hover:bg-[#f3e8ff]/58 dark:border-[#a855f7]/16 dark:bg-[#7b2cbf]/10 dark:hover:bg-[#7b2cbf]/14"
          : "border-amber-300/38 bg-amber-50/78 shadow-[0_14px_34px_rgba(245,158,11,0.07)] hover:border-amber-300/60 dark:border-amber-300/18 dark:bg-amber-400/[0.06]"
      } ${disabled ? "opacity-45" : ""}`}
    >
      <div className="pointer-events-none absolute -right-14 -top-16 h-28 w-28 rounded-full bg-[#a855f7]/10 blur-[48px] dark:bg-[#7b2cbf]/18" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
              isActive
                ? "border-[#a855f7]/26 bg-white/70 text-[#7e22ce] shadow-[0_10px_24px_rgba(123,44,191,0.08)] dark:bg-white/[0.045] dark:text-[#d8b4fe]"
                : "border-amber-300/35 bg-white/70 text-amber-700 dark:bg-white/[0.045] dark:text-amber-100"
            }`}
          >
            <Repeat className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-black leading-5 text-slate-950 dark:text-white">
              {routine.name}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={routine.status} />

              {routine.status === "paused" && routine.paused_until && (
                <span className="rounded-full border border-amber-300/26 bg-white/55 px-2 py-0.5 text-[0.62rem] font-bold text-amber-700 dark:bg-white/[0.04] dark:text-amber-100/70">
                  até {formatDate(routine.paused_until)}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          disabled={busy || disabled}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.68rem] font-black transition active:scale-[0.97] ${
            isActive
              ? "border-slate-300/80 bg-white/80 text-slate-700 hover:border-[#a855f7]/30 hover:text-[#6d28d9] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58 dark:hover:text-white/78"
              : "border-[#a855f7]/30 bg-white/78 text-[#6d28d9] dark:border-[#a855f7]/18 dark:bg-[#7b2cbf]/12 dark:text-[#d8b4fe]"
          } ${busy || disabled ? "opacity-40" : ""}`}
        >
          {busy ? (
            "..."
          ) : isActive ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Retomar
            </>
          )}
        </button>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <DesktopRoutineInlineStat
          label="Início"
          value={formatDate(getRoutineStartDate(routine, detail))}
        />

        <DesktopRoutineInlineStat
          label="Término"
          value={
            getRoutineEndDate(routine, detail)
              ? formatDate(getRoutineEndDate(routine, detail)!)
              : "Sem data"
          }
        />

        <DesktopRoutineInlineStat label="Sequência" value={streakLabel} />
      </div>

      <button
        type="button"
        onClick={onToggleDetails}
        className="relative mt-3 flex min-h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/60 px-3 text-[0.72rem] font-black text-slate-700 transition hover:border-[#a855f7]/26 hover:bg-white/80 active:scale-[0.98] dark:border-white/8 dark:bg-white/[0.035] dark:text-white/52 dark:hover:text-white/76"
      >
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-[#7e22ce]/70 dark:text-[#d8b4fe]/62" />
          {isExpanded ? "Ocultar itens" : `Ver itens (${itemCount})`}
        </span>

        {isLoadingDetails ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7e22ce] dark:text-[#d8b4fe]" />
        ) : isExpanded ? (
          <ChevronUp className="h-4 w-4 text-[#7e22ce] dark:text-[#d8b4fe]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#7e22ce] dark:text-[#d8b4fe]" />
        )}
      </button>

      {isExpanded && (
        <div className="relative mt-3 space-y-3 rounded-[1.15rem] border border-[#c084fc]/24 bg-white/56 p-3 dark:border-white/8 dark:bg-black/14">
          {isLoadingDetails ? (
            <div className="flex min-h-20 items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7e22ce] dark:text-[#d8b4fe]" />
              Carregando itens…
            </div>
          ) : (
            <>
              {items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#c084fc]/24 bg-white/60 px-3 py-3 text-xs font-semibold text-slate-500 dark:border-white/8 dark:bg-white/[0.025] dark:text-white/34">
                  Nenhum item cadastrado nessa rotina.
                </p>
              ) : (
                <div className="max-h-[14rem] space-y-2 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <DesktopRoutineItemPreview key={item.id} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function getRoutineStartDate(
  routine: Routine,
  detail: RoutineDetail | null
): string {
  return detail?.start_date ?? (routine as Routine & { start_date?: string }).start_date ?? "";
}

function getRoutineEndDate(
  routine: Routine,
  detail: RoutineDetail | null
): string | null {
  return detail?.end_date ?? (routine as Routine & { end_date?: string | null }).end_date ?? null;
}

function DesktopRoutineInlineStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/64 px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
      <p className="text-[0.56rem] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/24">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-slate-900 dark:text-white/62">
        {value}
      </p>
    </div>
  );
}

function DesktopRoutineItemPreview({ item }: { item: RoutineItem }) {
  return (
    <div className="rounded-2xl border border-[#c084fc]/22 bg-white/72 px-3 py-2.5 shadow-[0_8px_20px_rgba(123,44,191,0.055)] dark:border-white/8 dark:bg-white/[0.035]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-xs font-black text-slate-950 dark:text-white/76">
            {item.title}
          </p>

          <p className="mt-1 truncate text-[0.64rem] font-semibold text-slate-500 dark:text-white/34">
            {daysText(item.days_of_week)}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-[#c084fc]/24 bg-[#f3e8ff]/62 px-2 py-0.5 text-[0.58rem] font-black text-[#7e22ce] dark:border-[#a855f7]/16 dark:bg-[#7b2cbf]/12 dark:text-[#d8b4fe]/72">
          Item
        </span>
      </div>

      <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/88 px-2.5 py-1 text-[0.66rem] font-bold text-slate-600 dark:border-white/8 dark:bg-black/18 dark:text-white/44">
        {item.duration_minutes != null ? (
          <>
            <Sparkles className="h-3 w-3 shrink-0 text-[#7e22ce] dark:text-[#d8b4fe]" />
            <span className="truncate">
              ~{item.duration_minutes} min · Axon decide
            </span>
          </>
        ) : (
          <>
            <Clock className="h-3 w-3 shrink-0 text-[#7e22ce] dark:text-[#d8b4fe]" />
            <span className="truncate">
              {item.start_time} – {item.end_time}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function DesktopRoutinesSkeleton() {
  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-[1.25rem] border border-slate-200/80 dark:border-white/8 bg-white/75 dark:bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function DesktopRoutinesEmptyState({
  onCreate,
  title = "Nenhuma rotina ainda",
  description = "Crie rotinas para organizar blocos recorrentes como treino, estudos e descanso.",
  actionLabel = "Criar rotina",
}: {
  onCreate: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-slate-200/80 bg-white/70 px-6 text-center dark:border-white/10 dark:bg-black/12">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#a855f7]/24 bg-[#7b2cbf]/12 text-[#7e22ce] dark:text-[#d8b4fe]">
        <Repeat className="h-6 w-6" />
      </div>

      <h3 className="text-base font-black text-slate-950 dark:text-white">
        {title}
      </h3>
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

function RoutineCard({
  routine,
  busy,
  disabled,
  onToggle,
  onOpen,
}: {
  routine: Routine;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const isActive = routine.status === "active";
  const itemLabel = `${routine.item_count} ${
    routine.item_count === 1 ? "item" : "itens"
  }`;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-[1.7rem] border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] p-4 shadow-[0_16px_45px_rgba(93,64,126,0.12)] dark:shadow-black/20 backdrop-blur-2xl transition active:scale-[0.99] hover:border-slate-300 dark:hover:border-white/15"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-300/15 bg-purple-500/10 text-purple-700 dark:text-purple-200">
            <Repeat className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-950 dark:text-white">
              {routine.name}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={routine.status} />

              {routine.status === "paused" && routine.paused_until && (
                <span className="text-[0.7rem] text-slate-500 dark:text-white/35">
                  até {formatDate(routine.paused_until)}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          disabled={busy || disabled}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
            isActive
              ? "border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] text-slate-700 dark:text-white/60"
              : "border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-500/15 dark:text-emerald-100"
          } ${busy || disabled ? "opacity-40" : ""}`}
        >
          {busy ? (
            "..."
          ) : isActive ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Retomar
            </>
          )}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-slate-500 dark:text-white/45">
        <span className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-slate-500 dark:text-white/35" />
          {itemLabel}
        </span>

        <span className="text-slate-300 dark:text-white/15">•</span>

        {routine.streak > 0 ? (
          <span className="font-medium text-amber-700 dark:text-amber-100/90">
            🔥 {routine.streak}{" "}
            {routine.streak === 1 ? "dia seguido" : "dias seguidos"}
          </span>
        ) : (
          <span className="text-slate-500 dark:text-white/35">Comece sua sequência hoje</span>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// BADGES, ESTADOS VISUAIS E HELPERS DA LISTA
// ===========================================================================

function StatusBadge({ status }: { status: Routine["status"] }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-black ${
        active
          ? "border-[#a855f7]/28 bg-[#f3e8ff]/78 text-[#6d28d9] dark:border-[#a855f7]/20 dark:bg-[#7b2cbf]/14 dark:text-[#d8b4fe]"
          : "border-amber-300/35 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-500/10 dark:text-amber-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-[#a855f7]" : "bg-amber-400"
        }`}
      />
      {active ? "Ativa" : "Pausada"}
    </span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-[2rem] border border-dashed border-slate-200/80 dark:border-white/12 bg-white/70 dark:bg-white/[0.03] px-6 py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-purple-300/20 bg-purple-500/10 text-purple-700 dark:text-purple-200">
        <Repeat className="h-7 w-7" />
      </div>

      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
        Nenhuma rotina por aqui ainda
      </h2>

      <p className="mt-2 max-w-[18rem] text-sm leading-6 text-slate-500 dark:text-white/45">
        Crie sua primeira rotina e deixe o Axon encaixar os hábitos nos seus
        melhores horários de energia.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-6 flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-500/20 px-5 py-3 text-sm font-semibold text-purple-100 shadow-lg shadow-purple-950/20 active:scale-[0.97]"
      >
        <Plus className="h-4 w-4" />
        Criar primeira rotina
      </button>
    </div>
  );
}

function RoutinesSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[1.7rem] border border-slate-200/80 dark:border-white/10 bg-white/[0.78] dark:bg-white/[0.04] p-4"
        >
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-white/[0.84] dark:bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/[0.84] dark:bg-white/[0.06]" />
              <div className="h-3 w-1/4 animate-pulse rounded-full bg-white/80 dark:bg-white/[0.05]" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded-full bg-white/80 dark:bg-white/[0.05]" />
          </div>
          <div className="mt-4 h-3 w-1/2 animate-pulse rounded-full bg-white/80 dark:bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ===========================================================================
// BACKGROUND VISUAL COMPARTILHADO
// ===========================================================================

function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-16rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-purple-700/25 blur-[120px]" />
      <div className="absolute right-[-14rem] top-[14rem] h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/10 blur-[110px]" />
      <div className="absolute bottom-[-12rem] left-[-12rem] h-[26rem] w-[26rem] rounded-full bg-indigo-500/10 blur-[120px]" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(107,114,128,0.10)_1px,transparent_1px)] [background-size:28px_28px] opacity-50 dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055)_1px,transparent_1px)] dark:opacity-20" />

      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#f8f5fc_0%,#f4effa_58%,#efe8f7_100%)] dark:bg-[linear-gradient(to_bottom,rgba(5,5,11,0.05),#05050b_88%)]" />
    </div>
  );
}

// ===========================================================================
// DETALHE DE UMA ROTINA
// ===========================================================================
// Rota /rotinas/:id. Permite renomear, pausar, retomar, excluir e editar itens.
export function RoutineDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  // Estado principal da página de detalhe.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edição inline do nome da rotina.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Edição de item existente.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<DraftItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Criação de novo item dentro da rotina.
  const [newItemDraft, setNewItemDraft] = useState<DraftItem | null>(null);
  const [savingNewItem, setSavingNewItem] = useState(false);

  // Confirmação de exclusão de item.
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [busyDeleteItem, setBusyDeleteItem] = useState(false);

  // Pausa, retomada e exclusão da rotina inteira.
  const [showPause, setShowPause] = useState(false);
  const [pauseUntil, setPauseUntil] = useState("");
  const [busyStatus, setBusyStatus] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Carrega a rotina selecionada pelo id da rota.
  function load() {
    setLoading(true);
    api
      .getRoutine(id)
      .then((data) => {
        setRoutine(data);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message || "Não foi possível carregar a rotina.");
        setRoutine(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Inicia a edição inline do nome usando o valor atual da rotina.
  function startEditName() {
    if (!routine) return;
    setNameDraft(routine.name);
    setEditingName(true);
  }

  async function saveName() {
    if (!routine || !nameDraft.trim()) return;
    setSavingName(true);
    try {
      const updated = await api.updateRoutine(routine.id, {
        name: nameDraft.trim(),
      });
      setRoutine(updated);
      setEditingName(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível renomear a rotina.");
    } finally {
      setSavingName(false);
    }
  }

  // Converte o item salvo para o draft usado pelo RoutineItemEditor.
  function startEditItem(item: RoutineItem) {
    setItemDraft(itemToDraft(item));
    setEditingItemId(item.id);
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setItemDraft(null);
  }

  // Salva alterações de um item existente e recarrega a rotina.
  async function saveItem() {
    if (!routine || !itemDraft || !editingItemId) return;
    setSavingItem(true);
    try {
      await api.updateRoutineItem(
        routine.id,
        editingItemId,
        draftToUpdateInput(itemDraft)
      );
      // Recarrega a rotina para refletir itens + streak recalculados.
      const fresh = await api.getRoutine(routine.id);
      setRoutine(fresh);
      cancelEditItem();
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível salvar o item.");
    } finally {
      setSavingItem(false);
    }
  }

  // Adiciona um novo item à rotina atual.
  async function saveNewItem() {
    if (!routine || !newItemDraft) return;
    setSavingNewItem(true);
    try {
      await api.addRoutineItem(routine.id, draftToCreateInput(newItemDraft));
      const fresh = await api.getRoutine(routine.id);
      setRoutine(fresh);
      setNewItemDraft(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível adicionar o item.");
    } finally {
      setSavingNewItem(false);
    }
  }

  // Exclui um item; se for o último, a rotina inteira é removida.
  async function confirmDeleteItem() {
    if (!routine || !deletingItemId) return;
    setBusyDeleteItem(true);
    try {
      // Era o último item: uma rotina sem itens não faz sentido, então a
      // exclusão do item também exclui a rotina inteira (cascata no backend).
      if (routine.items.length === 1) {
        await api.deleteRoutine(routine.id);
        navigate("/rotinas");
        return;
      }
      await api.deleteRoutineItem(routine.id, deletingItemId);
      const fresh = await api.getRoutine(routine.id);
      setRoutine(fresh);
      setDeletingItemId(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível excluir o item.");
    } finally {
      setBusyDeleteItem(false);
    }
  }

  // Pausa a rotina, com ou sem data automática de retomada.
  async function confirmPause() {
    if (!routine) return;
    setBusyStatus(true);
    try {
      const updated = await api.pauseRoutine(routine.id, pauseUntil || null);
      setRoutine(updated);
      setShowPause(false);
      setPauseUntil("");
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível pausar a rotina.");
    } finally {
      setBusyStatus(false);
    }
  }

  // Retoma uma rotina pausada.
  async function resume() {
    if (!routine) return;
    setBusyStatus(true);
    try {
      const updated = await api.resumeRoutine(routine.id);
      setRoutine(updated);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Não foi possível retomar a rotina.");
    } finally {
      setBusyStatus(false);
    }
  }

  // Exclui a rotina inteira e retorna para a lista.
  async function confirmDelete() {
    if (!routine) return;
    setDeleting(true);
    try {
      await api.deleteRoutine(routine.id);
      navigate("/rotinas");
    } catch (e) {
      setError((e as Error).message || "Não foi possível excluir a rotina.");
      setDeleting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8f4ff] text-slate-950 dark:bg-[#05050b] dark:text-white">
      <Background />

      <div className="relative z-10 min-h-screen px-4 pb-6 pt-5">
        <header className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate("/rotinas")}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.045] text-slate-700 dark:text-white/60 active:scale-[0.96]"
            aria-label="Voltar para rotinas"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <button
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.045] text-slate-700 dark:text-white/60 backdrop-blur-2xl active:scale-[0.96]"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {loading ? (
          <DetailSkeleton />
        ) : !routine ? (
          <div className="rounded-[1.6rem] border border-red-300/20 bg-red-50 p-5 text-sm leading-6 text-red-700 dark:bg-red-500/10 dark:text-red-100/80">
            {error || "Rotina não encontrada."}
          </div>
        ) : (
          <>
            {/* Nome editável inline */}
            <section className="mb-5">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/25 px-4 py-2.5 text-lg font-semibold text-slate-950 dark:text-white outline-none focus:border-purple-300/40"
                  />
                  <button
                    onClick={saveName}
                    disabled={!nameDraft.trim() || savingName}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-500/15 dark:text-emerald-100 active:scale-[0.96] disabled:opacity-40"
                    aria-label="Salvar nome"
                  >
                    <Check className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] text-slate-700 dark:text-white/55 active:scale-[0.96]"
                    aria-label="Cancelar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <h1 className="min-w-0 flex-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white">
                    {routine.name}
                  </h1>
                  <button
                    onClick={startEditName}
                    className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] text-slate-500 dark:text-white/50 active:scale-[0.96]"
                    aria-label="Editar nome"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </section>

            {/* Status + streak */}
            <section className="mb-5 rounded-[1.7rem] border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] p-4 shadow-[0_16px_45px_rgba(93,64,126,0.12)] dark:shadow-black/20 backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={routine.status} />
                {routine.status === "paused" && routine.paused_until && (
                  <span className="text-xs text-slate-500 dark:text-white/40">
                    Retomar em {formatDate(routine.paused_until)}
                  </span>
                )}
              </div>

              <div className="mt-4 rounded-[1.4rem] border border-amber-300/15 bg-amber-500/[0.07] p-4">
                {routine.streak > 0 ? (
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-100/90">
                    🔥 {routine.streak}{" "}
                    {routine.streak === 1 ? "dia seguido" : "dias seguidos"}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500 dark:text-white/45">
                    Sem sequência ainda
                  </p>
                )}
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/40">
                  Conclua todos os itens do dia para manter sua sequência.
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-white/40">
                <span>Início {formatDate(routine.start_date)}</span>
                <span className="text-slate-300 dark:text-white/15">•</span>
                <span>
                  {routine.end_date
                    ? `Término ${formatDate(routine.end_date)}`
                    : "Sem data de término"}
                </span>
              </div>
            </section>

            {/* Itens */}
            <section className="mb-5">
              <p className="mb-3 text-sm font-semibold text-slate-950 dark:text-white">
                Itens da rotina
              </p>

              <div className="space-y-3">
                {routine.items.map((item) =>
                  editingItemId === item.id && itemDraft ? (
                    <div key={item.id}>
                      <div className="mb-2 flex items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 dark:border-purple-300/15 dark:bg-purple-500/[0.08] px-3 py-2 text-xs text-purple-700 dark:text-purple-100/80">
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        Apenas as tarefas futuras serão alteradas.
                      </div>

                      <RoutineItemEditor
                        item={itemDraft}
                        canRemove={false}
                        onChange={(patch) =>
                          setItemDraft((currentDraft) =>
                            currentDraft
                              ? { ...currentDraft, ...patch }
                              : currentDraft
                          )
                        }
                        onToggleDay={(day) =>
                          setItemDraft((cur) => {
                            if (!cur) return cur;
                            const days = cur.days.includes(day)
                              ? cur.days.filter((d) => d !== day)
                              : [...cur.days, day].sort((a, b) => a - b);
                            return { ...cur, days };
                          })
                        }
                        onRemove={() => {}}
                      />

                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={cancelEditItem}
                          disabled={savingItem}
                          className="rounded-full border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-white/60 active:scale-[0.97] disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={saveItem}
                          disabled={savingItem || !itemValid(itemDraft)}
                          className="flex-1 rounded-full bg-purple-500/90 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 active:scale-[0.98] disabled:opacity-40"
                        >
                          {savingItem ? "Salvando..." : "Salvar item"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onEdit={() => startEditItem(item)}
                      onDelete={() => setDeletingItemId(item.id)}
                    />
                  )
                )}

                {newItemDraft ? (
                  <div>
                    <RoutineItemEditor
                      item={newItemDraft}
                      canRemove={false}
                      onChange={(patch) =>
                        setNewItemDraft((cur) => (cur ? { ...cur, ...patch } : cur))
                      }
                      onToggleDay={(day) =>
                        setNewItemDraft((cur) => {
                          if (!cur) return cur;
                          const days = cur.days.includes(day)
                            ? cur.days.filter((d) => d !== day)
                            : [...cur.days, day].sort((a, b) => a - b);
                          return { ...cur, days };
                        })
                      }
                      onRemove={() => {}}
                    />

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setNewItemDraft(null)}
                        disabled={savingNewItem}
                        className="rounded-full border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-white/60 active:scale-[0.97] disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={saveNewItem}
                        disabled={savingNewItem || !itemValid(newItemDraft)}
                        className="flex-1 rounded-full bg-purple-500/90 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 active:scale-[0.98] disabled:opacity-40"
                      >
                        {savingNewItem ? "Adicionando..." : "Adicionar item"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setNewItemDraft(blankItem())}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200/80 bg-white/80 dark:border-white/15 dark:bg-white/[0.02] py-3 text-sm font-medium text-slate-700 dark:text-white/55 active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar item
                  </button>
                )}
              </div>
            </section>

            {error && (
              <div className="mb-4 rounded-[1.4rem] border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-100/80">
                {error}
              </div>
            )}

            {/* Ações */}
            <section className="space-y-3">
              {routine.status === "active" ? (
                <button
                  onClick={() => setShowPause(true)}
                  disabled={busyStatus}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] py-3.5 text-sm font-semibold text-slate-700 dark:text-white/70 active:scale-[0.98] disabled:opacity-40"
                >
                  <Pause className="h-4 w-4" />
                  Pausar rotina
                </button>
              ) : (
                <button
                  onClick={resume}
                  disabled={busyStatus}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/15 py-3.5 text-sm font-semibold text-emerald-100 active:scale-[0.98] disabled:opacity-40"
                >
                  <Play className="h-4 w-4" />
                  {busyStatus ? "Retomando..." : "Retomar rotina"}
                </button>
              )}

              <button
                onClick={() => setShowDelete(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-red-300/15 bg-red-500/[0.08] py-3.5 text-sm font-semibold text-red-200/80 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" />
                Excluir rotina
              </button>
            </section>
          </>
        )}
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Modal: pausar rotina */}
      {showPause && (
        <Modal onClose={() => !busyStatus && setShowPause(false)}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-purple-500/10 text-purple-700 dark:text-purple-200">
            <Pause className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
            Pausar rotina
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
            As tarefas futuras serão removidas. Você pode definir uma data para o
            Axon retomar automaticamente — ou deixar em branco para pausar
            indefinidamente.
          </p>

          <div className="mt-5 text-left">
            <label className="text-sm font-medium text-slate-700 dark:text-white/70">
              Retomar em <span className="text-slate-500 dark:text-white/35">(opcional)</span>
            </label>
            <input
              type="date"
              value={pauseUntil}
              min={new Date().toLocaleDateString("en-CA")}
              onChange={(e) => setPauseUntil(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/25 px-4 py-3 text-sm text-slate-950 dark:text-white outline-none focus:border-purple-300/40 [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowPause(false)}
              disabled={busyStatus}
              className="min-h-12 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.92] dark:bg-white/[0.055] px-4 text-sm font-semibold text-slate-700 dark:text-white/60 active:scale-[0.98] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={confirmPause}
              disabled={busyStatus}
              className="min-h-12 rounded-2xl bg-purple-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 active:scale-[0.98] disabled:opacity-60"
            >
              {busyStatus ? "Pausando..." : "Confirmar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: excluir item */}
      {deletingItemId && (
        <Modal onClose={() => !busyDeleteItem && setDeletingItemId(null)}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200">
            <Trash2 className="h-6 w-6" />
          </div>
          {routine && routine.items.length === 1 ? (
            <>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
                Excluir o último item?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
                Este é o único item da rotina. Ao confirmar, a{" "}
                <span className="font-semibold text-slate-700 dark:text-white/70">
                  rotina inteira
                </span>{" "}
                também será excluída. As tarefas futuras serão removidas; as já
                concluídas permanecem no seu histórico.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
                Excluir este item?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
                As tarefas futuras geradas por este item serão removidas. As já
                concluídas permanecem no seu histórico.
              </p>
            </>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setDeletingItemId(null)}
              disabled={busyDeleteItem}
              className="min-h-12 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.92] dark:bg-white/[0.055] px-4 text-sm font-semibold text-slate-700 dark:text-white/60 active:scale-[0.98] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDeleteItem}
              disabled={busyDeleteItem}
              className="min-h-12 rounded-2xl bg-red-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-red-950/30 active:scale-[0.98] disabled:opacity-60"
            >
              {busyDeleteItem
                ? "Excluindo..."
                : routine && routine.items.length === 1
                ? "Excluir rotina"
                : "Excluir"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: excluir rotina */}
      {showDelete && (
        <Modal onClose={() => !deleting && setShowDelete(false)}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200">
            <Trash2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
            Excluir esta rotina?
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/45">
            As tarefas futuras geradas por ela serão removidas. As tarefas já
            concluídas permanecem no seu histórico. Esta ação não pode ser
            desfeita.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowDelete(false)}
              disabled={deleting}
              className="min-h-12 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/[0.92] dark:bg-white/[0.055] px-4 text-sm font-semibold text-slate-700 dark:text-white/60 active:scale-[0.98] disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="min-h-12 rounded-2xl bg-red-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-red-950/30 active:scale-[0.98] disabled:opacity-60"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ===========================================================================
// LINHA DE ITEM DA ROTINA
// ===========================================================================

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: RoutineItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-slate-200/80 dark:border-white/10 bg-white/[0.82] dark:bg-white/[0.055] p-4 shadow-[0_16px_45px_rgba(93,64,126,0.12)] dark:shadow-black/20 backdrop-blur-2xl">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
          {item.title}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/40">{daysText(item.days_of_week)}</p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/20 px-2.5 py-1 text-[0.7rem] text-slate-700 dark:text-white/55">
          {item.duration_minutes != null ? (
            <>
              <Sparkles className="h-3 w-3 text-purple-700 dark:text-purple-200" />~
              {item.duration_minutes} min · Axon decide
            </>
          ) : (
            <>
              <Clock className="h-3 w-3 text-purple-700 dark:text-purple-200" />
              {item.start_time} – {item.end_time}
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-white/[0.05] text-slate-500 dark:text-white/50 active:scale-[0.96]"
          aria-label="Editar item"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-red-300/15 bg-red-500/[0.08] text-red-600 dark:text-red-200/70 active:scale-[0.96]"
          aria-label="Excluir item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// MODAL BASE E SKELETON DO DETALHE
// ===========================================================================

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-white/10 bg-white/[0.97] dark:bg-[#15141f]/95 p-5 text-center shadow-2xl shadow-black/50 backdrop-blur-2xl">
        {children}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-2/3 animate-pulse rounded-2xl bg-white/[0.84] dark:bg-white/[0.06]" />
      <div className="h-32 animate-pulse rounded-[1.7rem] bg-white/80 dark:bg-white/[0.05]" />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[1.5rem] bg-white/80 dark:bg-white/[0.05]"
          />
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// HELPERS DE FORMATAÇÃO
// ===========================================================================

function daysText(days: number[]) {
  if (days.length === 7) return "Todos os dias";
  return days.map((d) => WEEKDAYS[d]?.label ?? d).join(" · ");
}
