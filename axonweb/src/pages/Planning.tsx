import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Edit3,
  ListTodo,
  Loader2,
  Plus,
  Repeat,
  RotateCcw,
  Menu,
  Sparkles,
  Star,
  Target,
  Trash2,
  X,
} from "lucide-react";

import { results, type ChronotypeResultKey } from "../data/results";
import Sidebar from "../components/layout/Sidebar";
import Routines from "./Routines";
import Goals from "./Goals";
import * as api from "../lib/api";
import { openAuthUrl } from "../lib/nativeAuth";
import type { Task, TaskType, TaskStatus, Subtask, DailyStat } from "../lib/api";
import AppBackground from "../components/layout/AppBackground";
import PageHeader from "../components/layout/PageHeader";
import BottomSheet from "../components/ui/BottomSheet";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import { ScrollArea } from "../components/ui/ScrollArea";

// ===========================================================================
// TIPOS E CONSTANTES GERAIS
// ===========================================================================

type ViewMode = "month" | "week";
type DisplayStatus = "todo" | "progress" | "done" | "scheduled";
type DesktopCalendarKind = "task" | "event" | "routine";
type DesktopTaskHoverPreview = { task: Task; x: number; y: number } | null;
type DesktopCalendarColorName =
  | "purple"
  | "lilac"
  | "mint"
  | "cyan"
  | "amber"
  | "rose"
  | "blue";
type DesktopCalendarColorPrefs = Record<
  DesktopCalendarKind,
  DesktopCalendarColorName
>;

const DESKTOP_CALENDAR_COLORS_STORAGE_KEY =
  "axon:planning:desktop-calendar-colors";
const DESKTOP_CALENDAR_COLORS_UPDATED_EVENT =
  "axon:planning-desktop-calendar-colors-updated";

const DEFAULT_DESKTOP_CALENDAR_COLORS: DesktopCalendarColorPrefs = {
  task: "purple",
  event: "blue",
  routine: "mint",
};

const DESKTOP_CALENDAR_COLOR_OPTIONS: {
  key: DesktopCalendarColorName;
  label: string;
  hex: string;
  iconColor: string;
  iconBackground: string;
  iconBorder: string;
  surface: string;
  border: string;
  bar: string;
  text: string;
  chip: string;
}[] = [
  {
    key: "purple",
    label: "Roxo AXON",
    hex: "#a855f7",
    iconColor: "#7e22ce",
    iconBackground: "rgba(168,85,247,0.16)",
    iconBorder: "rgba(168,85,247,0.34)",
    surface: "bg-[#7b2cbf]/24 dark:bg-[#7b2cbf]/30",
    border: "border-[#7b2cbf]/34 dark:border-[#a855f7]/34",
    bar: "bg-[#a855f7]",
    text: "text-[#4c1d95] dark:text-[#e9d5ff]",
    chip: "border-[#a855f7]/36 bg-[#7b2cbf]/18 text-[#7e22ce] dark:text-[#e9d5ff]",
  },
  {
    key: "lilac",
    label: "Lilás",
    hex: "#c084fc",
    iconColor: "#9333ea",
    iconBackground: "rgba(192,132,252,0.18)",
    iconBorder: "rgba(192,132,252,0.4)",
    surface: "bg-[#c084fc]/22 dark:bg-[#c084fc]/16",
    border: "border-[#9333ea]/30 dark:border-[#c084fc]/34",
    bar: "bg-[#c084fc]",
    text: "text-[#581c87] dark:text-[#f3e8ff]",
    chip: "border-[#c084fc]/36 bg-[#c084fc]/16 text-[#7e22ce] dark:text-[#f3e8ff]",
  },
  {
    key: "mint",
    label: "Menta",
    hex: "#14b8a6",
    iconColor: "#0f766e",
    iconBackground: "rgba(20,184,166,0.16)",
    iconBorder: "rgba(20,184,166,0.36)",
    surface: "bg-[#14b8a6]/20 dark:bg-[#5eead4]/14",
    border: "border-[#0f766e]/30 dark:border-[#5eead4]/32",
    bar: "bg-[#14b8a6] dark:bg-[#5eead4]",
    text: "text-[#0f766e] dark:text-[#ccfbf1]",
    chip: "border-[#14b8a6]/36 bg-[#14b8a6]/14 text-[#0f766e] dark:text-[#ccfbf1]",
  },
  {
    key: "cyan",
    label: "Ciano",
    hex: "#0891b2",
    iconColor: "#0e7490",
    iconBackground: "rgba(8,145,178,0.15)",
    iconBorder: "rgba(8,145,178,0.34)",
    surface: "bg-[#67e8f9]/20 dark:bg-[#67e8f9]/12",
    border: "border-[#0e7490]/30 dark:border-[#67e8f9]/30",
    bar: "bg-[#06b6d4] dark:bg-[#67e8f9]",
    text: "text-[#0e7490] dark:text-[#cffafe]",
    chip: "border-[#0891b2]/34 bg-[#0891b2]/12 text-[#0e7490] dark:text-[#cffafe]",
  },
  {
    key: "amber",
    label: "Amarelo",
    hex: "#f59e0b",
    iconColor: "#b45309",
    iconBackground: "rgba(245,158,11,0.16)",
    iconBorder: "rgba(245,158,11,0.36)",
    surface: "bg-amber-300/28 dark:bg-amber-300/16",
    border: "border-amber-500/36 dark:border-amber-300/38",
    bar: "bg-amber-400 dark:bg-amber-300",
    text: "text-amber-700 dark:text-amber-100",
    chip: "border-amber-500/36 bg-amber-500/12 text-amber-700 dark:text-amber-100",
  },
  {
    key: "rose",
    label: "Rosa",
    hex: "#e11d48",
    iconColor: "#be123c",
    iconBackground: "rgba(225,29,72,0.12)",
    iconBorder: "rgba(225,29,72,0.3)",
    surface: "bg-rose-400/24 dark:bg-rose-300/14",
    border: "border-rose-500/34 dark:border-rose-300/34",
    bar: "bg-rose-400 dark:bg-rose-300",
    text: "text-rose-700 dark:text-rose-100",
    chip: "border-rose-500/34 bg-rose-500/12 text-rose-700 dark:text-rose-100",
  },
  {
    key: "blue",
    label: "Azul",
    hex: "#2563eb",
    iconColor: "#1d4ed8",
    iconBackground: "rgba(37,99,235,0.12)",
    iconBorder: "rgba(37,99,235,0.32)",
    surface: "bg-blue-400/24 dark:bg-blue-300/14",
    border: "border-blue-500/34 dark:border-blue-300/34",
    bar: "bg-blue-400 dark:bg-blue-300",
    text: "text-blue-700 dark:text-blue-100",
    chip: "border-blue-600/34 bg-blue-600/12 text-blue-700 dark:text-blue-100",
  },
];

const validKeys: ChronotypeResultKey[] = [
  "Matutino",
  "Vespertino",
  "Noturno",
  "Misto",
  "Bimodal",
];

const typeLabels: Record<TaskType, string> = {
  task: "Tarefa",
  event: "Evento",
  routine: "Rotina",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "A fazer",
  progress: "Em andamento",
  done: "Concluída",
  scheduled: "Agendado",
};

const recurrenceLabels: Record<string, string> = {
  daily: "Todos os dias",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CALENDAR_SETUP_STORAGE_KEY = "axon_calendar_setup_choice";
const NOTIFICATIONS_PAGE_SIZE = 10;
type CalendarSetupChoice = "google" | "independent";

// ===========================================================================
// HELPERS DE DATA E STATUS
// ===========================================================================

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTaskEndDate(task: Task): string | undefined {
  return (task as Task & { end_date?: string | null }).end_date || undefined;
}

function getDisplayStatus(task: Task, selectedIso: string): DisplayStatus {
  const isDone = task.status === "done";

  if (isDone) {
    return "done";
  }

  const endDate = getTaskEndDate(task);
  const isMultiDayEvent =
    task.task_type === "event" &&
    task.scheduled_date &&
    endDate &&
    endDate !== task.scheduled_date;

  if (isMultiDayEvent && task.scheduled_date && endDate) {
    if (selectedIso > task.scheduled_date && selectedIso < endDate) {
      return "progress";
    }

    if (selectedIso === endDate) {
      return "progress";
    }

    return "scheduled";
  }

  if (task.task_type === "event") {
    return "scheduled";
  }

  return task.status as DisplayStatus;
}

function isEventCompleted(task: Task, now: Date): boolean {
  // evento multi-dia marcado manualmente já conta como concluído
  if (task.status === "done") return true;

  const endIso = getTaskEndDate(task) || task.scheduled_date;
  if (!endIso) return false;

  // usa o fim do evento; se não houver, o início; se não houver horário, fim do dia
  const time = hhmm(task.end_time) || hhmm(task.start_time) || "23:59";
  const endDateTime = new Date(`${endIso}T${time}:00`);

  return now >= endDateTime;
}

function isTaskOnDate(task: Task, isoDate: string): boolean {
  if (!task.scheduled_date) return false;

  const startDate = task.scheduled_date;
  const endDate = getTaskEndDate(task);

  if (task.task_type === "event" && endDate) {
    return isoDate >= startDate && isoDate <= endDate;
  }

  return isoDate === startDate;
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(diffDays + 1, 1);
}

function getDayIndexInRange(startIso: string, currentIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const current = new Date(`${currentIso}T00:00:00`);

  const diffMs = current.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(diffDays + 1, 1);
}

function getMultiDayEventProgress(task: Task, selectedIso: string) {
  const endDate = getTaskEndDate(task);

  if (!task.scheduled_date || !endDate || endDate === task.scheduled_date) {
    return null;
  }

  const totalDays = daysBetweenInclusive(task.scheduled_date, endDate);
  const currentDay = Math.min(
    getDayIndexInRange(task.scheduled_date, selectedIso),
    totalDays
  );

  const progress = Math.round((currentDay / totalDays) * 100);
  const isLastDay = selectedIso === endDate;

  return {
    totalDays,
    currentDay,
    progress,
    isLastDay,
  };
}

function hhmm(value?: string | null): string | undefined {
  return value ? value.slice(0, 5) : undefined;
}

function weekDaysOf(selected: Date): Date[] {
  const dow = selected.getDay(); // 0 Dom .. 6 Sáb
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(selected);
  monday.setDate(selected.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ===========================================================================
// CONFIGURAÇÃO DO HUB DE PLANEJAMENTO
// ===========================================================================

type View = "agenda" | "rotinas" | "objetivos";

const TABS: { key: View; label: string }[] = [
  { key: "rotinas", label: "Rotinas" },
  { key: "agenda", label: "Agenda" },
  { key: "objetivos", label: "Objetivos" },
];

// ===========================================================================
// HUB DE PLANEJAMENTO
// ===========================================================================
// Controla o cabeçalho, a sidebar e as abas Agenda, Rotinas e Objetivos.
export default function Planning({
  initialView = "agenda",
}: {
  initialView?: View;
} = {}) {
  const navigate = useNavigate();

  // Aba ativa do hub e estado da sidebar global.
  const [view, setView] = useState<View>(initialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  // Cronotipo usado para alimentar a sidebar.
  const resultKey: ChronotypeResultKey = (() => {
    const s = localStorage.getItem("axon_chronotype");
    return s && validKeys.includes(s as ChronotypeResultKey)
      ? (s as ChronotypeResultKey)
      : "Misto";
  })();
  const result = results[resultKey];

  const refreshUnreadCount = useCallback(() => {
    if (!api.isLoggedIn()) {
      setUnreadCount(null);
      return;
    }

    api
      .getNotifications(NOTIFICATIONS_PAGE_SIZE + 1, 0)
      .then((notifications) => {
        const visibleNotifications = notifications.slice(
          0,
          NOTIFICATIONS_PAGE_SIZE
        );

        const nextUnreadCount = visibleNotifications.filter(
          (notification) => notification.status === "unread"
        ).length;

        setUnreadCount(nextUnreadCount);
      })
      .catch(() => setUnreadCount(0));
  }, []);

  useEffect(() => {
    refreshUnreadCount();

    const handleNotificationsUpdated = () => {
      refreshUnreadCount();
    };

    const interval = window.setInterval(refreshUnreadCount, 2 * 60 * 1000);

    window.addEventListener(
      "axon:notifications-updated",
      handleNotificationsUpdated
    );

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        "axon:notifications-updated",
        handleNotificationsUpdated
      );
    };
  }, [refreshUnreadCount]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-app text-primary">
      <AppBackground />

      {/* Mobile preservado: mantém a estrutura vertical atual. */}
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[430px] px-1 pb-6 pt-5 lg:hidden">
        <div className="relative">
          <PageHeader
            title="Planejamento"
            subtitle="Agenda, rotinas e objetivos"
            onBack={() => navigate("/dashboard")}
            onMenuClick={() => setIsSidebarOpen(true)}
          />

          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            className="absolute right-14 top-0 flex h-11 w-11 items-center justify-center rounded-2xl border border-soft bg-surface-elevated text-muted shadow-card backdrop-blur-xl transition active:scale-[0.96]"
            aria-label="Abrir notificações"
          >
            <Bell className="h-5 w-5" />
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute right-[0.46rem] top-[0.46rem] h-2 w-2 rounded-full border border-[var(--surface-elevated)] bg-[var(--accent)] shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
            )}
          </button>
        </div>

        <div className="mb-4 flex rounded-full border border-soft bg-surface-elevated p-1.5 shadow-card backdrop-blur-2xl">
          {TABS.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition active:scale-[0.98] ${
                  active
                    ? "bg-[var(--accent-strong)] text-white shadow-card"
                    : "text-muted"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {view === "agenda" && <AgendaView embedded />}
        {view === "rotinas" && <Routines embedded />}
        {view === "objetivos" && <Goals embedded />}
      </div>

      {/* Desktop: layout próprio, inspirado no calendário em painel. */}
      <div className="relative z-10 hidden min-h-screen bg-[#f4effc]/70 px-4 py-4 lg:block xl:px-5 dark:bg-transparent">
        {view === "agenda" ? (
          <AgendaView
            embedded
            desktopMode
            activeView={view}
            onViewChange={setView}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            unreadCount={unreadCount}
            onOpenDesktopSidebar={() => setIsSidebarOpen(true)}
          />
        ) : view === "objetivos" ? (
          <Goals
            embedded
            desktopMode
            activeView={view}
            onViewChange={setView}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            unreadCount={unreadCount}
            onOpenDesktopSidebar={() => setIsSidebarOpen(true)}
          />
        ) : (
          <Routines
            embedded
            desktopMode
            activeView={view}
            onViewChange={setView}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            unreadCount={unreadCount}
            onOpenDesktopSidebar={() => setIsSidebarOpen(true)}
          />
        )}
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chronotypeLabel={result.label}
        energyPeak={result.energyPeak}
      />

      <NotificationsSheet
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onUnreadCountChange={setUnreadCount}
      />
    </main>
  );
}

// ===========================================================================
// VISÃO DE AGENDA
// ===========================================================================
// Pode funcionar embutida no hub ou como página independente.
function AgendaView({
  embedded = false,
  desktopMode = false,
  activeView = "agenda",
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenDesktopSidebar,
}: {
  embedded?: boolean;
  desktopMode?: boolean;
  activeView?: View;
  onViewChange?: (view: View) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenDesktopSidebar?: () => void;
} = {}) {
  const navigate = useNavigate();

  // Controles visuais da agenda.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [, setDesktopCalendarColorRevision] = useState(0);
  const [subtasksMap, setSubtasksMap] = useState<Record<string, Subtask[]>>({});

  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [carriedCount, setCarriedCount] = useState(0);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [calendarSetupChoice, setCalendarSetupChoice] =
    useState<CalendarSetupChoice | null>(() => {
      const stored = localStorage.getItem(CALENDAR_SETUP_STORAGE_KEY);

      if (stored === "google" || stored === "independent") {
        return stored;
      }

      return null;
    });
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [calendarConnectError, setCalendarConnectError] =
    useState<string | null>(null);
  const [dailyStatsMap, setDailyStatsMap] =
    useState<Record<string, DailyStat>>({});

  // Cronotipo local da agenda quando ela é renderizada fora do hub.
  const resultKey = useMemo<ChronotypeResultKey>(() => {
    const stored = localStorage.getItem("axon_chronotype");
    if (stored && validKeys.includes(stored as ChronotypeResultKey)) {
      return stored as ChronotypeResultKey;
    }
    return "Misto";
  }, []);

  const result = results[resultKey];

  // Carrega todas as subtarefas e agrupa por task_id para renderização rápida.
  const loadSubtasks = useCallback(async () => {
    try {
      const all = await api.getSubtasks();

      const map: Record<string, Subtask[]> = {};

      for (const subtask of all) {
        if (!map[subtask.task_id]) {
          map[subtask.task_id] = [];
        }

        map[subtask.task_id].push(subtask);
      }

      Object.values(map).forEach((items) => {
        items.sort((a, b) => a.position - b.position);
      });

      setSubtasksMap(map);
    } catch {
      setSubtasksMap({});
    }
  }, []);

  // Carrega tarefas e subtarefas em conjunto.
  const loadTasks = useCallback(async () => {
    setError(null);
    try {
      const [data] = await Promise.all([api.getTasks(), loadSubtasks()]);
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [loadSubtasks]);

  useEffect(() => {
    // Primeiro arrasta pendentes de ontem, depois carrega a lista atualizada
    api.carryForwardTasks()
      .then((moved) => {
        if (moved.length > 0) setCarriedCount(moved.length);
      })
      .catch(() => null)
      .finally(async () => {
        await loadTasks();
        await loadSubtasks();
        await loadDailyStats();
      });
  }, [loadTasks, loadSubtasks]);

  // Dados derivados do dia selecionado.
  const selectedIso = toISODate(selectedDate);
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => isTaskOnDate(task, selectedIso))
        .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "")),
    [tasks, selectedIso]
  );
  const undatedTasks = useMemo(() => {
    const W: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return tasks
      .filter((t) => !t.scheduled_date)
      .sort((a, b) => (W[a.priority ?? "medium"] ?? 1) - (W[b.priority ?? "medium"] ?? 1));
  }, [tasks]);

  const now = new Date();
  // base = itens do dia selecionado (dayTasks já filtra por isTaskOnDate); agora inclui eventos
  const actionable = dayTasks;

  // Pontuação proporcional: tarefas sem subtarefas valem 0 ou 1;
  // tarefas com subtarefas contribuem com a fração concluída (ex: 3/5 = 0.6).
  const completedScore = actionable.reduce((acc, t) => {
    if (t.task_type === "event") return acc + (isEventCompleted(t, now) ? 1 : 0);
    const subs = subtasksMap[t.id];
    if (subs && subs.length > 0) {
      return acc + subs.filter((s) => s.done).length / subs.length;
    }
    return acc + (t.status === "done" ? 1 : 0);
  }, 0);

  const todayIso = toISODate(new Date());
  const selectedDailyStat = dailyStatsMap[selectedIso];
  // Só usa o snapshot se ele REALMENTE existir para o dia. Sem isso, um dia
  // passado sem linha em daily_task_stats (job de fim de dia ainda não rodou
  // para esse usuário/dia) caía no fallback "?? 0" e mostrava 0% mesmo tendo
  // tarefas concluídas de verdade — o cálculo ao vivo abaixo é sempre um
  // resultado melhor que "0% categórico" quando não há snapshot.
  const shouldUseSnapshot = selectedIso < todayIso && !!selectedDailyStat;

  const liveCompletedItems = actionable.filter((t) =>
    t.task_type === "event" ? isEventCompleted(t, now) : t.status === "done"
  ).length;

  const completedItems = shouldUseSnapshot
    ? selectedDailyStat!.completed_items
    : liveCompletedItems;

  const totalItems = shouldUseSnapshot
    ? selectedDailyStat!.total
    : actionable.length;

  const progress = shouldUseSnapshot
    ? selectedDailyStat!.completion_rate
    : totalItems === 0
    ? 0
    : Math.round((completedScore / totalItems) * 100);

  // Estatísticas históricas usadas quando o usuário consulta dias anteriores.
  const loadDailyStats = useCallback(async () => {
    try {
      const { start, end } = monthRangeOf(selectedDate);
      const stats = await api.getDailyStats(start, end);

      const map: Record<string, DailyStat> = {};

      for (const stat of stats) {
        map[stat.date] = stat;
      }

      setDailyStatsMap(map);
    } catch {
      setDailyStatsMap({});
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDailyStats();
  }, [loadDailyStats]);

  useEffect(() => {
    function handleDesktopCalendarColorsUpdated() {
      setDesktopCalendarColorRevision((revision) => revision + 1);
    }

    window.addEventListener(
      DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
      handleDesktopCalendarColorsUpdated
    );

    return () => {
      window.removeEventListener(
        DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
        handleDesktopCalendarColorsUpdated
      );
    };
  }, []);

  async function handleToggleDone(task: Task) {
    const next =
      task.status === "done"
        ? { status: "todo" as TaskStatus, progress: 0 }
        : { status: "done" as TaskStatus, progress: 100 };
    try {
      await api.updateTask(task.id, next);
      await loadTasks();
      await loadSubtasks();
    } catch {
      // mantém o estado atual em caso de erro
    }
  }

  async function handleToggleSubtask(subtask: Subtask) {
    const nextDone = !subtask.done;

    setSubtasksMap((prev) => ({
      ...prev,
      [subtask.task_id]: (prev[subtask.task_id] ?? []).map((item) =>
        item.id === subtask.id ? { ...item, done: nextDone } : item
      ),
    }));

    try {
      await api.updateSubtask(subtask.id, { done: nextDone });
      await loadTasks();
      await loadSubtasks();
    } catch {
      await loadSubtasks();
    }
  }

  async function handleDeleteSubtask(subtask: Subtask) {
    const previous = subtasksMap;
    // Otimista: some da lista na hora.
    setSubtasksMap((map) => ({
      ...map,
      [subtask.task_id]: (map[subtask.task_id] ?? []).filter(
        (s) => s.id !== subtask.id
      ),
    }));

    try {
      await api.deleteSubtask(subtask.id);
      // O backend recalcula status/progresso da tarefa mãe a cada exclusão
      // (ex.: excluir a única pendente conclui a tarefa) — recarrega ambos.
      await loadTasks();
      await loadSubtasks();
    } catch {
      setSubtasksMap(previous); // reverte
      showToast("Não foi possível excluir a subtarefa");
    }
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  async function handleToggleKey(task: Task) {
    const marking = !task.is_key_task;
    // Troca: já existe outra tarefa chave no mesmo dia? (o backend desmarca-a)
    const hadOtherKey =
      marking && dayTasks.some((t) => t.is_key_task && t.id !== task.id);
    try {
      await api.updateTask(task.id, { is_key_task: marking });
      // O backend desmarca a anterior automaticamente, então recarregamos o dia
      // inteiro em vez de atualizar só o card clicado.
      await loadTasks();
      if (marking) {
        showToast(
          hadOtherKey ? "Tarefa chave atualizada" : "Tarefa chave definida"
        );
      } else {
        showToast("Tarefa chave removida");
      }
    } catch {
      // mantém o estado atual em caso de erro
    }
  }

  function handleDelete(task: Task) {
    setTaskToDelete(task);
  }

  function handleEdit(task: Task) {
    setTaskToEdit(task);
  }

  async function confirmDeleteTask() {
    if (!taskToDelete) return;

    setIsDeletingTask(true);

    try {
      await api.deleteTask(taskToDelete.id);
      setTaskToDelete(null);
      await loadTasks();
      await loadSubtasks();
    } catch {
      // depois podemos colocar um toast/erro visual aqui
    } finally {
      setIsDeletingTask(false);
    }
  }

  function cancelDeleteTask() {
    if (isDeletingTask) return;
    setTaskToDelete(null);
  }

  async function handleConnectGoogleCalendar() {
    if (isConnectingCalendar) return;

    setIsConnectingCalendar(true);
    setCalendarConnectError(null);

    try {
      const { auth_url } = await api.connectGoogleCalendar();

      localStorage.setItem(CALENDAR_SETUP_STORAGE_KEY, "google");
      setCalendarSetupChoice("google");
      // A URL já vem pronta do backend (com o state) e aponta para o Google;
      // aqui só decidimos ONDE abrir. A plataforma já foi informada na chamada
      // /connect acima, por isso markPlatform: false.
      await openAuthUrl(auth_url, { markPlatform: false });
    } catch (e) {
      setCalendarConnectError(
        e instanceof Error
          ? e.message
          : "Não foi possível iniciar a conexão com o Google Calendar."
      );
      setIsConnectingCalendar(false);
    }
  }

  function handleUseIndependentCalendar() {
    localStorage.setItem(CALENDAR_SETUP_STORAGE_KEY, "independent");
    setCalendarSetupChoice("independent");
    setCalendarConnectError(null);
  }

  // Conteúdo principal da agenda, compartilhado entre modo embutido e página própria.
  const inner = (
    <>
      {carriedCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3">
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-100">
              <span className="font-semibold">{carriedCount} {carriedCount === 1 ? "tarefa pendente" : "tarefas pendentes"}</span> de ontem {carriedCount === 1 ? "foi movida" : "foram movidas"} para hoje.
            </p>
            <button
              type="button"
              onClick={() => setCarriedCount(0)}
              className="shrink-0 text-amber-700/60 transition active:scale-95 dark:text-amber-200/60"
              aria-label="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* px-2 (em vez de p-4): com a coluna da página em px-1, o conteúdo
            fica próximo da borda do cartão e ganha largura útil. */}
        <section className="rounded-[2rem] border border-soft bg-surface-elevated px-2 py-4 text-primary shadow-card backdrop-blur-2xl lg:px-6 lg:py-6">
          <div className="mb-4 px-1">
            <h1 className="text-[1.75rem] font-bold leading-[1.05] tracking-[-0.03em] text-primary">
              Calendário Diário
            </h1>
            <p className="mt-1 text-sm text-muted">
              {calendarSetupChoice
                ? "Suas tarefas, eventos e rotinas do dia de hoje"
                : "Escolha como deseja usar sua agenda no Axon"}
            </p>
          </div>

          {!calendarSetupChoice ? (
            <CalendarSetupCard
              isConnecting={isConnectingCalendar}
              error={calendarConnectError}
              onConnect={handleConnectGoogleCalendar}
              onUseIndependent={handleUseIndependentCalendar}
            />
          ) : (
            <>
              {calendarSetupChoice === "independent" && (
                <div className="mb-4 rounded-[1.4rem] border border-soft bg-surface-muted p-3">
                  <p className="text-xs leading-5 text-muted">
                    Você está usando o calendário independente do Axon. Depois será
                    possível conectar o Google Calendar pelas configurações.
                  </p>
                </div>
              )}

              {calendarSetupChoice === "google" && (
                <div className="mb-4 rounded-[1.4rem] border border-accent-soft bg-accent-soft p-3">
                  <p className="text-xs leading-5 text-accent">
                    Google Calendar selecionado. Se a autorização ainda não foi
                    concluída, o Axon terminará a conexão após o retorno do Google.
                  </p>
                </div>
              )}

              {/* No desktop a tela vira duas colunas: calendário à esquerda e
                  a lista do dia à direita, no lugar da pilha única do celular. */}
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)] lg:items-start lg:gap-7">
                <div className="lg:min-w-0">
                  <div className="flex rounded-full border border-soft bg-surface-muted p-1.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("month")}
                      className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition active:scale-[0.98] ${
                        viewMode === "month"
                          ? "bg-[var(--accent-strong)] text-white shadow-card"
                          : "text-muted"
                      }`}
                    >
                      Mês
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewMode("week")}
                      className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition active:scale-[0.98] ${
                        viewMode === "week"
                          ? "bg-[var(--accent-strong)] text-white shadow-card"
                          : "text-muted"
                      }`}
                    >
                      Dia/Semana
                    </button>
                  </div>

                  {/* Resumo e anel do dia selecionado: comuns aos dois modos. */}
                  <p className="mt-5 text-center text-sm text-muted">
                    <span className="font-semibold text-primary">
                      {completedItems} de {totalItems}
                    </span>{" "}
                    {totalItems === 1
                      ? "tarefa concluída"
                      : "tarefas concluídas"}
                  </p>

                  <div className="mt-4 flex justify-center">
                    <CircularProgress value={progress} />
                  </div>

                  {viewMode !== "month" && (
                    <div className="mt-6">
                      <WeekCalendar
                        selectedDate={selectedDate}
                        onSelect={setSelectedDate}
                        tasks={tasks}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-6 flex min-h-10 w-full items-center justify-center rounded-full border border-[var(--accent)] bg-accent-muted text-sm font-bold text-accent transition active:scale-[0.98]"
                  >
                    + Nova tarefa
                  </button>

                  {viewMode === "month" && (
                    <div className="mt-6">
                      <MonthCalendar
                        selectedDate={selectedDate}
                        onSelect={setSelectedDate}
                        tasks={tasks}
                      />
                    </div>
                  )}
                </div>

                {/* No celular a lista aparece só na visão de semana; no desktop
                    ela acompanha os dois modos, ocupando a coluna livre. */}
                <div
                  className={`mt-6 lg:mt-0 lg:min-w-0 ${
                    viewMode !== "month" ? "" : "hidden lg:block"
                  }`}
                >
                  {/* Chip da fila — sempre visível quando há tarefas sem data */}
                  {undatedTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsQueueOpen(true)}
                      className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-indigo-300/25 bg-indigo-500/10 px-4 py-3 text-left transition active:scale-[0.98]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-700 dark:text-indigo-200">
                        <ListTodo className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-100">
                          Fila de tarefas
                        </p>
                        <p className="text-xs text-indigo-700/55 dark:text-indigo-200/55">
                          {undatedTasks.length}{" "}
                          {undatedTasks.length === 1
                            ? "tarefa sem data definida"
                            : "tarefas sem data definida"}
                        </p>
                      </div>
                      <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-500 px-1.5 text-xs font-bold text-white">
                        {undatedTasks.length}
                      </span>
                    </button>
                  )}

                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando tarefas…
                    </div>
                  ) : error ? (
                    <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-100">
                      {error}
                    </div>
                  ) : dayTasks.length === 0 && undatedTasks.length === 0 ? (
                    <EmptyState
                      icon={ListTodo}
                      title="Nenhuma tarefa neste dia"
                      description="Converse com o Axon para ele organizar sua rotina, ou crie manualmente."
                      actionLabel="Criar tarefa"
                      onAction={() => setIsCreateModalOpen(true)}
                    />
                  ) : dayTasks.length === 0 ? (
                    <EmptyState title="Nenhuma tarefa neste dia" />
                  ) : (
                    <div className="space-y-4">
                      {dayTasks.map((task) => (
                        <TimelineItem
                          key={task.id}
                          task={task}
                          selectedIso={selectedIso}
                          subtasks={subtasksMap[task.id] ?? []}
                          onToggle={handleToggleDone}
                          onToggleKey={handleToggleKey}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onToggleSubtask={handleToggleSubtask}
                          onDeleteSubtask={handleDeleteSubtask}
                          onSubtaskChange={loadSubtasks}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
    </>
  );

  // Modais e toasts ficam fora do conteúdo para manter a hierarquia visual fixa.
  const modals = (
    <>
      <CreatePlanningItemModal
        isOpen={isCreateModalOpen}
        defaultDate={selectedIso}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={async () => {
          setIsCreateModalOpen(false);
          await loadTasks();
          await loadSubtasks();
        }}
      />

      <EditPlanningItemModal
        task={taskToEdit}
        onClose={() => setTaskToEdit(null)}
        onUpdated={async () => {
          setTaskToEdit(null);
          await loadTasks();
          await loadSubtasks();
        }}
        onDelete={(task) => {
          setTaskToEdit(null);
          handleDelete(task);
        }}
        onSubtaskChange={loadSubtasks}
      />

      <DeletePlanningItemModal
        task={taskToDelete}
        isDeleting={isDeletingTask}
        onClose={cancelDeleteTask}
        onConfirm={confirmDeleteTask}
      />

      {isQueueOpen && (
        <UndatedTasksSheet
          tasks={undatedTasks}
          onClose={() => setIsQueueOpen(false)}
          onEdit={(t) => { setIsQueueOpen(false); handleEdit(t); }}
          onDelete={(t) => { setIsQueueOpen(false); handleDelete(t); }}
          onToggle={handleToggleDone}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-amber-300/25 bg-surface-elevated px-4 py-2.5 text-sm font-medium text-amber-700 shadow-soft backdrop-blur-xl dark:text-amber-100">
            <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
            {toast}
          </div>
        </div>
      )}
    </>
  );

  if (embedded && desktopMode) {
    return (
      <>
        <DesktopAgendaExperience
          view={activeView}
          onViewChange={onViewChange}
          onOpenNotifications={onOpenNotifications}
          unreadCount={unreadCount}
          onOpenSidebar={onOpenDesktopSidebar}
          selectedDate={selectedDate}
          selectedIso={selectedIso}
          viewMode={viewMode}
          tasks={tasks}
          undatedTasks={undatedTasks}
          subtasksMap={subtasksMap}
          loading={loading}
          error={error}
          progress={progress}
          completedItems={completedItems}
          totalItems={totalItems}
          calendarSetupChoice={calendarSetupChoice}
          isConnectingCalendar={isConnectingCalendar}
          calendarConnectError={calendarConnectError}
          onSelectDate={setSelectedDate}
          onViewModeChange={setViewMode}
          onCreate={() => setIsCreateModalOpen(true)}
          onOpenQueue={() => setIsQueueOpen(true)}
          onConnectGoogleCalendar={handleConnectGoogleCalendar}
          onUseIndependentCalendar={handleUseIndependentCalendar}
          onToggleDone={handleToggleDone}
          onToggleKey={handleToggleKey}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
          onSubtaskChange={loadSubtasks}
        />

        {modals}
      </>
    );
  }

  // No hub (embedded), a moldura — main, header, Sidebar — vem do componente
  // Planning (hub de abas) acima, neste mesmo arquivo.
  if (embedded) {
    return (
      <>
        {inner}
        {modals}
      </>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-app text-primary">
      <AppBackground />

      {/* Mesma medida do hub e da tela de Insights. */}
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[430px] px-1 pb-6 pt-5 lg:max-w-[1120px] lg:px-8 lg:pt-7">
        <PageHeader
          title="Planejamento"
          subtitle="Rotina e tarefas"
          onBack={() => navigate("/dashboard")}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

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

// ===========================================================================
// DESKTOP — PLANEJAMENTO EM PAINEL
// ===========================================================================

function DesktopPlanningStaticShell({
  view,
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
  children,
}: {
  view: View;
  onViewChange: (view: View) => void;
  onOpenNotifications: () => void;
  unreadCount: number | null;
  onOpenSidebar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid h-[calc(100vh-0.6rem)] max-w-[1500px] grid-cols-[272px_minmax(0,1fr)] gap-2.5">
      <aside className="relative overflow-hidden rounded-[1.7rem] border border-white/8 bg-white/[0.035] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
        <DesktopPlanningBrand />

        <div className="mt-6 rounded-[1.55rem] border border-white/8 bg-black/10 p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-white/32">
            Módulo aberto
          </p>

          <p className="mt-2 text-2xl font-black tracking-[-0.05em] text-primary">
            {view === "rotinas" ? "Rotinas" : "Objetivos"}
          </p>

          <p className="mt-2 text-sm leading-6 text-muted">
            Continue organizando seu planejamento com a mesma base visual do Axon.
          </p>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white/[0.82] shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
        <DesktopPlanningTopbar
          title={view === "rotinas" ? "Rotinas" : "Objetivos"}
          view={view}
          onViewChange={onViewChange}
          onOpenNotifications={onOpenNotifications}
          unreadCount={unreadCount}
          onOpenSidebar={onOpenSidebar}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </section>
    </div>
  );
}

function DesktopAgendaExperience({
  view,
  onViewChange,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
  selectedDate,
  selectedIso,
  viewMode,
  tasks,
  undatedTasks,
  subtasksMap,
  loading,
  error,
  progress,
  completedItems,
  totalItems,
  calendarSetupChoice,
  isConnectingCalendar,
  calendarConnectError,
  onSelectDate,
  onViewModeChange,
  onCreate,
  onOpenQueue,
  onConnectGoogleCalendar,
  onUseIndependentCalendar,
  onToggleDone,
  onToggleKey,
  onEdit,
  onDelete,
  onToggleSubtask,
  onDeleteSubtask,
  onSubtaskChange,
}: {
  view: View;
  onViewChange?: (view: View) => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenSidebar?: () => void;
  selectedDate: Date;
  selectedIso: string;
  viewMode: ViewMode;
  tasks: Task[];
  undatedTasks: Task[];
  subtasksMap: Record<string, Subtask[]>;
  loading: boolean;
  error: string | null;
  progress: number;
  completedItems: number;
  totalItems: number;
  calendarSetupChoice: CalendarSetupChoice | null;
  isConnectingCalendar: boolean;
  calendarConnectError: string | null;
  onSelectDate: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onCreate: () => void;
  onOpenQueue: () => void;
  onConnectGoogleCalendar: () => void;
  onUseIndependentCalendar: () => void;
  onToggleDone: (task: Task) => void;
  onToggleKey: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onSubtaskChange?: () => void;
}) {
  const monthLabel = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  function shiftPeriod(delta: number) {
    const next = new Date(selectedDate);

    if (viewMode === "month") {
      next.setMonth(selectedDate.getMonth() + delta);
      next.setDate(1);
    } else if (viewMode === "week") {
      next.setDate(selectedDate.getDate() + delta * 7);
    } else {
      next.setDate(selectedDate.getDate() + delta);
    }

    onSelectDate(next);
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-0.6rem)] max-w-[1500px] grid-cols-[272px_minmax(0,1fr)] gap-2.5">
      <DesktopAgendaSidebar
        selectedDate={selectedDate}
        tasks={tasks}
        progress={progress}
        completedItems={completedItems}
        totalItems={totalItems}
        onSelectDate={onSelectDate}
      />

      <section className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white/[0.82] shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl">
        <DesktopPlanningTopbar
          title={monthLabel}
          view={view}
          onViewChange={(nextView) => onViewChange?.(nextView)}
          onCreate={onCreate}
          onOpenNotifications={onOpenNotifications}
          unreadCount={unreadCount}
          onOpenSidebar={onOpenSidebar}
        />

        <div className="min-h-0 flex-1 px-2.5 pb-2.5">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.45rem] border border-slate-200/80 bg-white/90 text-slate-950 dark:border-white/8 dark:bg-[#0b0b14]/72 dark:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-2 dark:border-white/8">
              <div className="grid grid-cols-2 rounded-full border border-slate-200/80 bg-white/80 p-1 dark:border-white/8 dark:bg-white/[0.045]">
                {[
                  { key: "month" as const, label: "Mês" },
                  { key: "week" as const, label: "Semana" },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onViewModeChange(option.key)}
                    className={`min-h-8 rounded-full px-6 text-[0.72rem] font-bold transition active:scale-[0.98] ${
                      viewMode === option.key
                        ? "bg-[var(--accent-strong)] text-white shadow-[0_6px_16px_rgba(123,44,191,0.18)]"
                        : "text-muted hover:text-secondary"
                    } focus:outline-none focus-visible:ring-1 focus-visible:ring-[#a855f7]/30`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => shiftPeriod(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 transition hover:text-slate-950 active:scale-[0.96] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/44 dark:hover:text-white"
                  aria-label="Período anterior"
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </button>

                <button
                  type="button"
                  onClick={() => shiftPeriod(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 transition hover:text-slate-950 active:scale-[0.96] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/44 dark:hover:text-white"
                  aria-label="Próximo período"
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectDate(new Date())}
                  className="min-h-9 rounded-xl border border-slate-200/80 bg-white/80 px-4 text-[0.72rem] font-bold text-slate-600 transition hover:text-slate-950 active:scale-[0.98] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/58 dark:hover:text-white"
                >
                  Hoje
                </button>
              </div>
            </div>

            {!calendarSetupChoice ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                <div className="w-full max-w-xl">
                  <CalendarSetupCard
                    isConnecting={isConnectingCalendar}
                    error={calendarConnectError}
                    onConnect={onConnectGoogleCalendar}
                    onUseIndependent={onUseIndependentCalendar}
                  />
                </div>
              </div>
            ) : loading ? (
              <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Carregando planejamento…
              </div>
            ) : error ? (
              <div className="m-6 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm text-rose-100">
                {error}
              </div>
            ) : viewMode === "month" ? (
              <DesktopMonthBoard
                selectedDate={selectedDate}
                tasks={tasks}
                subtasksMap={subtasksMap}
                onSelect={onSelectDate}
                onEdit={onEdit}
                onToggle={onToggleDone}
                onToggleSubtask={onToggleSubtask}
              />
            ) : (
              <DesktopScheduleGrid
                selectedDate={selectedDate}
                tasks={tasks}
                selectedIso={selectedIso}
                subtasksMap={subtasksMap}
                onSelectDate={onSelectDate}
                onToggle={onToggleDone}
                onToggleKey={onToggleKey}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onSubtaskChange={onSubtaskChange}
              />
            )}
          </div>

          {undatedTasks.length > 0 && (
            <button
              type="button"
              onClick={onOpenQueue}
              className="absolute bottom-7 right-7 flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-500/12 px-4 py-2 text-xs font-bold text-indigo-700 shadow-[0_18px_48px_rgba(79,70,229,0.16)] backdrop-blur-xl transition active:scale-[0.98] dark:border-indigo-300/20 dark:text-indigo-100 dark:shadow-[0_18px_48px_rgba(0,0,0,0.3)]"
            >
              <ListTodo className="h-3.5 w-3.5" />
              {undatedTasks.length} sem data
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function DesktopPlanningBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#a855f7]/26 bg-[#7b2cbf]/16 shadow-[0_14px_34px_rgba(123,44,191,0.22)]">
        <img src="/axon-logo.svg" alt="AXON" className="h-6.5 w-6.5" />
      </div>

      <div className="min-w-0">
        <p className="text-[0.95rem] font-black leading-none tracking-[-0.035em] text-primary">
          AXON
        </p>

        <p className="mt-1 truncate text-[0.68rem] font-semibold text-muted">
          Agenda, rotinas e objetivos
        </p>
      </div>
    </div>
  );
}

function DesktopPlanningTopbar({
  title = "Planejamento",
  view,
  onViewChange,
  onCreate,
  onOpenNotifications,
  unreadCount,
  onOpenSidebar,
}: {
  title?: string;
  view?: View;
  onViewChange?: (view: View) => void;
  onCreate?: () => void;
  onOpenNotifications?: () => void;
  unreadCount?: number | null;
  onOpenSidebar?: () => void;
}) {
  return (
    <div className="grid shrink-0 grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)] items-center gap-4 px-3.5 py-3">
      <h1 className="min-w-0 truncate text-[1.48rem] font-black leading-none tracking-[-0.06em] text-primary">
        {title}
      </h1>

      {view && onViewChange ? (
        <DesktopPlanningTabs view={view} onViewChange={onViewChange} />
      ) : (
        <div />
      )}

      <div className="flex items-center justify-end gap-2">
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl bg-[var(--accent-strong)] px-3.5 text-[0.72rem] font-black text-white shadow-[0_16px_40px_rgba(123,44,191,0.34)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Nova tarefa
          </button>
        ) : null}

        <button
          type="button"
          onClick={onOpenNotifications}
          disabled={!onOpenNotifications}
          className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-muted shadow-card dark:border-white/8 dark:bg-white/[0.04] backdrop-blur-xl transition hover:text-primary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
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
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-muted shadow-card dark:border-white/8 dark:bg-white/[0.04] backdrop-blur-xl transition hover:text-primary active:scale-[0.96]"
          aria-label="Abrir menu"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}

function DesktopPlanningTabs({
  view,
  onViewChange,
}: {
  view: View;
  onViewChange: (view: View) => void;
}) {
  return (
    <div className="grid w-[330px] grid-cols-3 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-card backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.04]">
      {TABS.map((tab) => {
        const active = view === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onViewChange(tab.key)}
            className={`min-h-8 rounded-full text-[0.7rem] font-bold transition active:scale-[0.98] ${
              active
                ? "bg-[var(--accent-strong)] text-white shadow-[0_10px_24px_rgba(123,44,191,0.28)]"
                : "text-muted hover:text-secondary"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function DesktopAgendaSidebar({
  selectedDate,
  tasks,
  progress,
  completedItems,
  totalItems,
  onSelectDate,
}: {
  selectedDate: Date;
  tasks: Task[];
  progress: number;
  completedItems: number;
  totalItems: number;
  onSelectDate: (date: Date) => void;
}) {
  const [calendarColors, setCalendarColors] =
    useState<DesktopCalendarColorPrefs>(() => getDesktopCalendarColorPrefs());
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);

  useEffect(() => {
    function handleDesktopCalendarColorsUpdated() {
      setCalendarColors(getDesktopCalendarColorPrefs());
    }

    window.addEventListener(
      DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
      handleDesktopCalendarColorsUpdated
    );

    return () => {
      window.removeEventListener(
        DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
        handleDesktopCalendarColorsUpdated
      );
    };
  }, []);

  function handleSaveColors(nextColors: DesktopCalendarColorPrefs) {
    saveDesktopCalendarColorPrefs(nextColors);
    setCalendarColors(nextColors);
    setIsColorModalOpen(false);

    window.dispatchEvent(new Event(DESKTOP_CALENDAR_COLORS_UPDATED_EVENT));
  }

  return (
    <>
      <aside className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-2.5 overflow-hidden rounded-[1.45rem] border border-slate-200/80 bg-white/[0.85] p-2.5 shadow-[0_24px_90px_rgba(93,64,126,0.16)] dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
        <DesktopPlanningBrand />

        <DesktopMiniMonthCalendar
          selectedDate={selectedDate}
          tasks={tasks}
          onSelect={onSelectDate}
        />

        <DesktopProgressBlockCard
          progress={progress}
          completedItems={completedItems}
          totalItems={totalItems}
        />

        <div className="rounded-[1.2rem] border border-slate-200/80 bg-white/70 p-2.5 dark:border-white/8 dark:bg-white/[0.035]">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-primary">Meus calendários</p>

            <button
              type="button"
              onClick={() => setIsColorModalOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-500 transition hover:text-slate-900 active:scale-[0.96] dark:border-white/8 dark:bg-white/[0.035] dark:text-white/42 dark:hover:text-white"
              aria-label="Editar cores dos calendários"
              title="Editar cores"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <DesktopCalendarLegend
              label="Tarefas"
              icon={ListTodo}
              colorName={calendarColors.task}
            />
            <DesktopCalendarLegend
              label="Eventos"
              icon={CalendarDays}
              colorName={calendarColors.event}
            />
            <DesktopCalendarLegend
              label="Rotinas"
              icon={Repeat}
              colorName={calendarColors.routine}
            />
          </div>
        </div>
      </aside>

      <DesktopCalendarColorsModal
        isOpen={isColorModalOpen}
        value={calendarColors}
        onClose={() => setIsColorModalOpen(false)}
        onSave={handleSaveColors}
      />
    </>
  );
}

function DesktopCalendarLegend({
  label,
  icon: Icon,
  colorName,
}: {
  label: string;
  icon: ElementType;
  colorName: DesktopCalendarColorName;
}) {
  const color = getDesktopCalendarColorOption(colorName);

  return (
    <div className="flex min-h-5 items-center gap-2.5">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-md border"
        style={{
          backgroundColor: color.iconBackground,
          borderColor: color.iconBorder,
        }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: color.iconColor }} />
      </span>

      <span className="flex-1 text-xs font-semibold text-secondary">
        {label}
      </span>

      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color.hex }}
      />
    </div>
  );
}


function DesktopCalendarColorsModal({
  isOpen,
  value,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  value: DesktopCalendarColorPrefs;
  onClose: () => void;
  onSave: (value: DesktopCalendarColorPrefs) => void;
}) {
  const [draft, setDraft] = useState<DesktopCalendarColorPrefs>(value);

  useEffect(() => {
    if (isOpen) {
      setDraft(value);
    }
  }, [isOpen, value]);

  if (!isOpen || typeof document === "undefined") return null;

  function updateColor(
    kind: DesktopCalendarKind,
    colorName: DesktopCalendarColorName
  ) {
    setDraft((current) => ({
      ...current,
      [kind]: colorName,
    }));
  }

  const rows: {
    kind: DesktopCalendarKind;
    label: string;
    icon: ElementType;
    description: string;
  }[] = [
    {
      kind: "task",
      label: "Tarefas",
      icon: ListTodo,
      description: "Ações pontuais do dia",
    },
    {
      kind: "event",
      label: "Eventos",
      icon: CalendarDays,
      description: "Compromissos com horário definido",
    },
    {
      kind: "routine",
      label: "Rotinas",
      icon: Repeat,
      description: "Blocos recorrentes",
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[150] hidden items-center justify-center bg-black/35 p-5 backdrop-blur-md dark:bg-black/62 lg:flex">
      <div className="relative w-full max-w-[470px] overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-white/96 p-5 text-slate-950 shadow-[0_30px_110px_rgba(93,64,126,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#11101a]/96 dark:text-white dark:shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#7b2cbf]/10 blur-[84px] dark:bg-[#7b2cbf]/18" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#a855f7]/24 bg-[#7b2cbf]/10 px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#7e22ce] dark:bg-[#7b2cbf]/12 dark:text-[#d8b4fe]">
              <Edit3 className="h-3.5 w-3.5" />
              Cores do calendário
            </div>

            <h2 className="text-xl font-black leading-tight tracking-[-0.045em] text-slate-950 dark:text-white">
              Personalizar categorias
            </h2>

            <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500 dark:text-white/44">
              Escolha cores bem diferentes para reconhecer cada categoria rapidamente.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-500 transition active:scale-[0.96] dark:border-white/8 dark:bg-white/[0.04] dark:text-white/46"
            aria-label="Fechar editor de cores"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="relative mt-5 space-y-4">
          {rows.map((row) => {
            const color = getDesktopCalendarColorOption(draft[row.kind]);
            const Icon = row.icon;

            return (
              <div
                key={row.kind}
                className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-white/8 dark:bg-white/[0.035]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-2xl border"
                    style={{
                      backgroundColor: color.iconBackground,
                      borderColor: color.iconBorder,
                    }}
                  >
                    <Icon className="h-4.5 w-4.5" style={{ color: color.iconColor }} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-950 dark:text-white">{row.label}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-white/36">
                      {row.description}
                    </p>
                  </div>

                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DESKTOP_CALENDAR_COLOR_OPTIONS.map((option) => {
                    const selected = draft[row.kind] === option.key;
                    const unavailable =
                      !selected &&
                      isDesktopCalendarColorUnavailable(
                        row.kind,
                        option.key,
                        draft
                      );

                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          if (!unavailable) {
                            updateColor(row.kind, option.key);
                          }
                        }}
                        disabled={unavailable}
                        className={`flex h-8 items-center justify-center rounded-xl border transition active:scale-[0.96] ${
                          selected
                            ? "border-slate-400 bg-white shadow-sm dark:border-white/55 dark:bg-white/[0.075]"
                            : unavailable
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-28 dark:border-white/5 dark:bg-white/[0.018]"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/8 dark:bg-white/[0.028] dark:hover:bg-white/[0.045]"
                        }`}
                        aria-label={`Usar ${option.label} em ${row.label}`}
                        title={
                          unavailable
                            ? `${option.label} está muito parecida com outra categoria`
                            : option.label
                        }
                      >
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{
                            backgroundColor: option.hex,
                            boxShadow: selected
                              ? `0 0 18px ${option.hex}66`
                              : undefined,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_DESKTOP_CALENDAR_COLORS)}
            className="min-h-11 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 text-xs font-black text-slate-600 transition hover:text-slate-950 active:scale-[0.98] dark:border-white/8 dark:bg-white/[0.04] dark:text-white/48 dark:hover:text-white/70"
          >
            Restaurar
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 text-xs font-black text-slate-600 transition hover:text-slate-950 active:scale-[0.98] dark:border-white/8 dark:bg-white/[0.04] dark:text-white/58 dark:hover:text-white/76"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => onSave(draft)}
            className="min-h-11 flex-1 rounded-2xl bg-[var(--accent-strong)] px-4 text-xs font-black text-white shadow-[0_16px_40px_rgba(123,44,191,0.3)] transition active:scale-[0.98]"
          >
            Salvar cores
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DesktopMiniMonthCalendar({
  selectedDate,
  tasks,
  onSelect,
}: {
  selectedDate: Date;
  tasks: Task[];
  onSelect: (date: Date) => void;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const selectedIso = toISODate(selectedDate);
  const todayIso = toISODate(new Date());
  const firstWeekday = new Date(year, month, 1).getDay();
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });

  function shiftMonth(delta: number) {
    const next = new Date(selectedDate);
    next.setMonth(selectedDate.getMonth() + delta);
    next.setDate(1);
    onSelect(next);
  }

  return (
    <div className="flex min-h-0 flex-col rounded-[1.2rem] border border-slate-200/80 bg-white/70 p-2.5 dark:border-white/8 dark:bg-white/[0.035]">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-[0.78rem] font-black tracking-[-0.02em] text-primary">
          {monthNames[month]} {year}
        </h2>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-muted transition active:scale-[0.96]"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-muted transition active:scale-[0.96]"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-1 grid shrink-0 grid-cols-7 text-center">
        {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((day) => (
          <p key={day} className="text-[0.46rem] font-black text-slate-400 dark:text-white/32">
            {day}
          </p>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-[0.1rem]">
        {cells.map((date) => {
          const iso = toISODate(date);
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;
          const isOutside = date.getMonth() !== month;
          const hasItems = tasks.some((task) => isTaskOnDate(task, iso));

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(date)}
              className={`relative flex min-h-0 items-center justify-center rounded-md text-[0.62rem] font-bold transition active:scale-[0.96] ${
                isSelected
                  ? "bg-[var(--accent-strong)] text-white shadow-[0_10px_22px_rgba(123,44,191,0.36)]"
                  : isToday
                  ? "border border-[#a855f7]/24 bg-[#7b2cbf]/12 text-[#d8b4fe]"
                  : isOutside
                  ? "text-slate-400 dark:text-white/16"
                  : "text-secondary hover:bg-white/[0.05]"
              }`}
            >
              {date.getDate()}

              {hasItems && !isSelected && (
                <span className="absolute bottom-0 h-0.5 w-0.5 rounded-full bg-[#a855f7]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DesktopProgressBlockCard({
  progress,
  completedItems,
  totalItems,
}: {
  progress: number;
  completedItems: number;
  totalItems: number;
}) {
  const normalized = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="relative min-h-[6.1rem] overflow-hidden rounded-[1.2rem] border border-[#a855f7]/24 bg-[#f0ddff] p-3 shadow-[0_18px_46px_rgba(123,44,191,0.13)] dark:bg-[#7b2cbf]/18">
      <div className="pointer-events-none absolute -right-14 -top-16 h-32 w-32 rounded-full bg-[#c084fc]/18 blur-[58px]" />

      <div className="relative">
        <p className="text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#6b21a8]/65 dark:text-[#e9d5ff]/58">
          tarefas concluídas
        </p>

        <div className="mt-1.5 flex items-end justify-between gap-4">
          <p className="text-[2.05rem] font-black leading-none tracking-[-0.07em] text-[#23063d] dark:text-white">
            {normalized}%
          </p>

          <p className="pb-1 text-right text-[0.66rem] font-semibold leading-4 text-[#5b21b6]/72 dark:text-[#e9d5ff]/62">
            {completedItems} de {totalItems || 0}
            <br />
            no dia selecionado
          </p>
        </div>

        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#d9c6ec] dark:bg-white/10">
          <div
            className="h-full rounded-full bg-[#c084fc]"
            style={{ width: `${normalized}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DesktopScheduleGrid({
  selectedDate,
  tasks,
  selectedIso,
  subtasksMap,
  onSelectDate,
  onToggle,
  onToggleKey,
  onEdit,
  onDelete,
  onToggleSubtask,
  onDeleteSubtask,
  onSubtaskChange,
}: {
  selectedDate: Date;
  tasks: Task[];
  selectedIso: string;
  subtasksMap: Record<string, Subtask[]>;
  onSelectDate: (date: Date) => void;
  onToggle: (task: Task) => void;
  onToggleKey: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onSubtaskChange?: () => void;
}) {
  const [hoverPreview, setHoverPreview] =
    useState<DesktopTaskHoverPreview>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const days = weekDaysOf(selectedDate);
  const dayIsos = days.map(toISODate);
  const todayIso = toISODate(new Date());

  const visibleItems = tasks.filter((task) =>
    dayIsos.some((iso) => isTaskOnDate(task, iso))
  );

  const taskMinutes = visibleItems
    .flatMap((task) => [timeToMinutes(task.start_time), timeToMinutes(task.end_time)])
    .filter((value): value is number => value !== null);

  const minMinutes = Math.min(...taskMinutes, 8 * 60);
  const maxMinutes = Math.max(...taskMinutes, 18 * 60);
  const startHour = Math.max(5, Math.min(8, Math.floor(minMinutes / 60)));
  const endHour = Math.min(23, Math.max(18, Math.ceil(maxMinutes / 60)));
  const hourHeight = 45;
  const totalHeight = (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) {
        window.clearTimeout(hoverCloseTimer.current);
      }
    };
  }, []);

  function clearHoverCloseTimer() {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }

  function scheduleCloseHoverPreview() {
    clearHoverCloseTimer();

    hoverCloseTimer.current = window.setTimeout(() => {
      setHoverPreview(null);
    }, 520);
  }

  function openHoverPreview(
    task: Task,
    event: { currentTarget: HTMLButtonElement; clientX?: number; clientY?: number }
  ) {
    clearHoverCloseTimer();

    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX ?? rect.right;
    const clientY = event.clientY ?? rect.top + rect.height / 2;

    setHoverPreview({
      task,
      ...getDesktopHoverPreviewPosition(clientX, clientY),
    });
  }

  function handlePreviewComplete(task: Task) {
    setHoverPreview(null);

    if (task.status !== "done") {
      onToggle(task);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="grid shrink-0 border-b border-slate-200/70 dark:border-white/8"
        style={{
          gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="border-r border-slate-200/70 dark:border-white/8" />

        {days.map((date) => {
          const iso = toISODate(date);
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`flex min-h-[48px] flex-col items-center justify-center border-r border-slate-200/70 text-center last:border-r-0 dark:border-white/8 ${
                isSelected
                  ? "bg-[#7b2cbf]/16 text-[#581c87] dark:bg-[#7b2cbf]/18 dark:text-white"
                  : isToday
                  ? "bg-[#7b2cbf]/8 text-[#6b21a8] dark:text-[#d8b4fe]"
                  : "text-muted"
              }`}
            >
              <span className="text-[0.58rem] font-black uppercase tracking-[0.12em]">
                {weekdayShort[date.getDay()]}
              </span>

              <span
                className={`mt-0.5 text-lg font-black leading-none tracking-[-0.05em] ${
                  isSelected ? "text-[#7e22ce] dark:text-[#c084fc]" : "text-primary"
                }`}
              >
                {String(date.getDate()).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="relative border-r border-white/8" style={{ height: totalHeight }}>
            {hours.slice(0, -1).map((hour, index) => (
              <p
                key={hour}
                className="absolute left-2 text-[0.58rem] font-semibold text-slate-400 dark:text-white/32"
                style={{ top: index * hourHeight + 8 }}
              >
                {String(hour).padStart(2, "0")}:00
              </p>
            ))}
          </div>

          {days.map((date) => {
            const iso = toISODate(date);
            const items = tasks
              .filter((task) => isTaskOnDate(task, iso) && timeToMinutes(task.start_time) !== null)
              .sort((a, b) => (timeToMinutes(a.start_time) ?? 0) - (timeToMinutes(b.start_time) ?? 0));

            return (
              <div
                key={iso}
                className="relative border-r border-slate-200/60 last:border-r-0 dark:border-white/8"
                style={{ height: totalHeight }}
              >
                {hours.slice(0, -1).map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-slate-200/65 dark:border-white/8"
                    style={{ top: index * hourHeight }}
                  >
                    <div className="mt-[32px] border-t border-dashed border-slate-200/55 dark:border-white/[0.055]" />
                  </div>
                ))}

                {items.map((task) => {
                  const start = timeToMinutes(task.start_time) ?? startHour * 60;
                  const end = timeToMinutes(task.end_time) ?? start + 60;
                  const top = ((start - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(((end - start) / 60) * hourHeight - 4, 36);
                  const tone = getDesktopScheduleTone(task);
                  const isDone = task.status === "done";
                  const kind = getDesktopTaskKind(task);
                  const subtasks = subtasksMap[task.id] ?? [];
                  const completedSubtasks = subtasks.filter((subtask) => subtask.done).length;
                  const hasSubtasks = subtasks.length > 0;

                  return (
                    <button
                      key={`${task.id}-${iso}`}
                      type="button"
                      onClick={() => onEdit(task)}
                      onMouseEnter={(event) => openHoverPreview(task, event)}
                      onMouseMove={(event) => openHoverPreview(task, event)}
                      onMouseLeave={scheduleCloseHoverPreview}
                      onFocus={(event) => openHoverPreview(task, event)}
                      onBlur={scheduleCloseHoverPreview}
                      className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-[0_12px_28px_rgba(79,70,229,0.08)] backdrop-blur-xl transition hover:scale-[1.01] active:scale-[0.99] dark:shadow-[0_12px_28px_rgba(0,0,0,0.18)] ${tone.surface} ${tone.border} ${
                        isDone ? "opacity-58" : ""
                      }`}
                      style={{
                        top,
                        minHeight: height,
                        height,
                      }}
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />

                      <span className="block truncate text-[0.67rem] font-black leading-3.5 text-slate-950 dark:text-white">
                        {task.title}
                      </span>

                      <span className={`mt-0.5 block text-[0.6rem] font-bold ${tone.text}`}>
                        {getDesktopTaskTime(task)}
                      </span>

                      <span className={`mt-1 flex items-center gap-1 truncate text-[0.56rem] font-bold ${tone.text}`}>
                        {hasSubtasks ? (
                          <>
                            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">
                              {completedSubtasks}/{subtasks.length} subtarefas
                            </span>
                          </>
                        ) : kind === "routine" ? (
                          <Repeat className="h-2.5 w-2.5" />
                        ) : kind === "event" ? (
                          <CalendarDays className="h-2.5 w-2.5" />
                        ) : (
                          <ListTodo className="h-2.5 w-2.5" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <DesktopTaskPreviewPopover
        preview={hoverPreview}
        subtasks={
          hoverPreview ? subtasksMap[hoverPreview.task.id] ?? [] : []
        }
        onMouseEnter={clearHoverCloseTimer}
        onMouseLeave={scheduleCloseHoverPreview}
        onComplete={handlePreviewComplete}
        onToggleSubtask={onToggleSubtask}
      />

      {/* Mantém os handlers detalhados vivos sem alterar o visual desktop. */}
      <div className="hidden">
        {visibleItems.map((task) => (
          <TimelineItem
            key={task.id}
            task={task}
            selectedIso={selectedIso}
            subtasks={subtasksMap[task.id] ?? []}
            onToggle={onToggle}
            onToggleKey={onToggleKey}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleSubtask={onToggleSubtask}
            onDeleteSubtask={onDeleteSubtask}
            onSubtaskChange={onSubtaskChange}
          />
        ))}
      </div>
    </div>
  );
}

function DesktopMonthBoard({
  selectedDate,
  tasks,
  subtasksMap,
  onSelect,
  onEdit,
  onToggle,
  onToggleSubtask,
}: {
  selectedDate: Date;
  tasks: Task[];
  subtasksMap: Record<string, Subtask[]>;
  onSelect: (date: Date) => void;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onToggleSubtask: (subtask: Subtask) => void;
}) {
  const [hoverPreview, setHoverPreview] =
    useState<DesktopTaskHoverPreview>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const selectedIso = toISODate(selectedDate);
  const todayIso = toISODate(new Date());
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const cells = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) {
        window.clearTimeout(hoverCloseTimer.current);
      }
    };
  }, []);

  function clearHoverCloseTimer() {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }

  function scheduleCloseHoverPreview() {
    clearHoverCloseTimer();

    hoverCloseTimer.current = window.setTimeout(() => {
      setHoverPreview(null);
    }, 520);
  }

  function openHoverPreview(
    task: Task,
    event: { currentTarget: HTMLButtonElement; clientX?: number; clientY?: number }
  ) {
    clearHoverCloseTimer();

    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX ?? rect.right;
    const clientY = event.clientY ?? rect.top + rect.height / 2;

    setHoverPreview({
      task,
      ...getDesktopHoverPreviewPosition(clientX, clientY),
    });
  }

  function handlePreviewComplete(task: Task) {
    setHoverPreview(null);

    if (task.status !== "done") {
      onToggle(task);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
      <div className="grid grid-cols-7 gap-1.5">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((day) => (
          <p key={day} className="px-2 text-[0.68rem] font-black text-slate-500 dark:text-white/34">
            {day}
          </p>
        ))}

        {cells.map((date) => {
          const iso = toISODate(date);
          const isOutside = date.getMonth() !== month;
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;
          const allDayItems = tasks
            .filter((task) => isTaskOnDate(task, iso))
            .sort(sortDesktopMonthItems);
          const dayItems = allDayItems.slice(0, 3);
          const hiddenCount = Math.max(allDayItems.length - dayItems.length, 0);

          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(date)}
              className={`relative min-h-[120px] overflow-hidden rounded-2xl border p-2 text-left transition active:scale-[0.99] ${
                isSelected
                  ? "border-[#a855f7]/55 bg-[#7b2cbf]/12 text-[#2e1065] dark:bg-[#7b2cbf]/16 dark:text-white"
                  : isToday
                  ? "border-[#a855f7]/32 bg-[#7b2cbf]/8 text-[#4c1d95] dark:bg-[#7b2cbf]/8 dark:text-white"
                  : "border-slate-200/80 bg-white/68 dark:border-white/8 dark:bg-white/[0.025]"
              } ${isOutside ? "opacity-70 dark:opacity-42" : ""}`}
            >
              <span className="text-sm font-black text-primary">
                {date.getDate()}
              </span>

              {hiddenCount > 0 ? (
                <span className="absolute right-2 top-2 rounded-full border border-[#7c3aed]/35 bg-[#7c3aed] px-2 py-0.5 text-[0.62rem] font-black text-white shadow-[0_10px_22px_rgba(124,58,237,0.24)] dark:border-[#a855f7]/24 dark:bg-[#7b2cbf]/22 dark:text-[#e9d5ff] dark:shadow-none">
                  +{hiddenCount}
                </span>
              ) : null}

              <span className="mt-2 block space-y-1">
                {dayItems.map((task) => {
                  const tone = getDesktopScheduleTone(task);
                  const subtasks = subtasksMap[task.id] ?? [];
                  const completedSubtasks = subtasks.filter((subtask) => subtask.done).length;

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(task);
                      }}
                      onMouseEnter={(event) => openHoverPreview(task, event)}
                      onMouseMove={(event) => openHoverPreview(task, event)}
                      onMouseLeave={scheduleCloseHoverPreview}
                      onFocus={(event) => openHoverPreview(task, event)}
                      onBlur={scheduleCloseHoverPreview}
                      className={`block w-full truncate rounded-lg border px-2 py-1 text-left text-[0.68rem] font-bold shadow-[0_8px_18px_rgba(79,70,229,0.06)] backdrop-blur-xl dark:shadow-none ${tone.surface} ${tone.border} ${tone.text}`}
                    >
                      {task.title}
                      {subtasks.length > 0 ? ` · ${completedSubtasks}/${subtasks.length}` : ""}
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>

      <DesktopTaskPreviewPopover
        preview={hoverPreview}
        subtasks={
          hoverPreview ? subtasksMap[hoverPreview.task.id] ?? [] : []
        }
        onMouseEnter={clearHoverCloseTimer}
        onMouseLeave={scheduleCloseHoverPreview}
        onComplete={handlePreviewComplete}
        onToggleSubtask={onToggleSubtask}
      />
    </div>
  );
}

function DesktopTaskPreviewPopover({
  preview,
  subtasks,
  onMouseEnter,
  onMouseLeave,
  onComplete,
  onToggleSubtask,
}: {
  preview: DesktopTaskHoverPreview;
  subtasks: Subtask[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onComplete: (task: Task) => void;
  onToggleSubtask: (subtask: Subtask) => void;
}) {
  if (!preview || typeof document === "undefined") return null;

  const task = preview.task;
  const tone = getDesktopScheduleTone(task);
  const isDone = task.status === "done";
  const completedSubtasks = subtasks.filter((subtask) => subtask.done).length;
  const visibleSubtasks = subtasks.slice(0, 6);
  const hiddenSubtasks = Math.max(subtasks.length - visibleSubtasks.length, 0);

  return createPortal(
    <div
      className="fixed z-[999] hidden max-h-[min(78vh,430px)] w-[330px] max-w-[calc(100vw-28px)] overflow-y-auto overflow-x-hidden rounded-[1.45rem] border border-slate-200/90 bg-white/96 p-4 text-slate-950 shadow-[0_28px_90px_rgba(93,64,126,0.22)] backdrop-blur-2xl dark:border-[#a855f7]/28 dark:bg-[#11101a]/96 dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)] lg:block"
      style={{ left: preview.x, top: preview.y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-[#7b2cbf]/10 blur-[70px] dark:bg-[#7b2cbf]/20" />

      <div className="relative min-w-0">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <span
            className={`inline-flex max-w-[11rem] items-center gap-2 rounded-full border px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.11em] ${tone.chip}`}
          >
            {getDesktopTaskIcon(task)}
            <span className="truncate">{getDesktopTaskTypeLabel(task)}</span>
          </span>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-black ${
              task.is_key_task
                ? "bg-amber-400/14 text-amber-700 dark:bg-amber-300/12 dark:text-amber-100"
                : isDone
                ? "bg-emerald-400/14 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100"
                : "bg-slate-100 text-slate-500 dark:bg-white/[0.055] dark:text-slate-500 dark:text-white/46"
            }`}
          >
            {task.is_key_task
              ? "Tarefa chave"
              : isDone
              ? "Concluído"
              : statusLabels[task.status]}
          </span>
        </div>

        <h3 className="break-words text-base font-black leading-tight tracking-[-0.035em] text-slate-950 dark:text-slate-950 dark:text-white">
          {task.title}
        </h3>

        {task.description ? (
          <p className="mt-2 line-clamp-3 break-words text-xs font-medium leading-5 text-slate-500 dark:text-slate-500 dark:text-white/48">
            {task.description}
          </p>
        ) : null}

        <div className="mt-4 grid min-w-0 gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-400 dark:text-white/35" />
            <p className="min-w-0 truncate text-xs font-semibold text-slate-600 dark:text-slate-600 dark:text-white/56">
              {getDesktopTaskDateLabel(task)}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
            <Clock className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-400 dark:text-white/35" />
            <p className="min-w-0 truncate text-xs font-semibold text-slate-600 dark:text-slate-600 dark:text-white/56">
              {getDesktopTaskTime(task)}
            </p>
          </div>
        </div>

        {subtasks.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/8 dark:bg-white/[0.035]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 dark:text-white/34">
                Subtarefas
              </p>

              <p className="text-[0.62rem] font-black text-[#7e22ce] dark:text-[#d8b4fe]">
                {completedSubtasks} de {subtasks.length}
              </p>
            </div>

            <div className="space-y-1.5">
              {visibleSubtasks.map((subtask) => (
                <button
                  key={subtask.id}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleSubtask(subtask);
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-100 active:scale-[0.99] dark:text-slate-600 dark:text-white/56 dark:hover:bg-white/[0.045]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                      subtask.done
                        ? "border-[#a855f7]/40 bg-[#7b2cbf] text-white"
                        : "border-slate-300 bg-white text-transparent dark:border-white/14 dark:bg-white/[0.035]"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  </span>

                  <span className={`min-w-0 flex-1 truncate ${subtask.done ? "text-slate-400 line-through dark:text-slate-400 dark:text-white/34" : ""}`}>
                    {subtask.title}
                  </span>
                </button>
              ))}

              {hiddenSubtasks > 0 ? (
                <p className="pt-0.5 text-[0.68rem] font-semibold text-slate-400 dark:text-slate-400 dark:text-white/30">
                  + {hiddenSubtasks} subtarefa{hiddenSubtasks === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onComplete(task)}
          disabled={isDone}
          className="mt-4 inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-4 text-xs font-black text-white shadow-[0_16px_40px_rgba(123,44,191,0.3)] transition active:scale-[0.98] hover:brightness-110 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:text-white dark:disabled:bg-white/[0.06] dark:disabled:text-white/34"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {isDone ? "Tarefa já concluída" : "Marcar como concluído"}
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
}

function getDesktopHoverPreviewPosition(clientX: number, clientY: number) {
  const previewWidth = 330;
  const previewHeight = 390;
  const margin = 14;
  const gap = 14;

  const openOnLeft = clientX + gap + previewWidth > window.innerWidth - margin;
  const rawX = openOnLeft ? clientX - previewWidth - gap : clientX + gap;

  const openAbove =
    clientY + gap + previewHeight > window.innerHeight - margin;
  const rawY = openAbove ? clientY - previewHeight - gap : clientY + gap;

  const maxX = Math.max(margin, window.innerWidth - previewWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - previewHeight - margin);

  return {
    x: Math.min(Math.max(rawX, margin), maxX),
    y: Math.min(Math.max(rawY, margin), maxY),
  };
}

const ROUTINE_TITLE_HINTS = [
  "academia",
  "treino",
  "pilates",
  "faculdade",
  "fiap",
  "aula fiap",
  "ingles",
  "inglês",
  "alemao",
  "alemão",
  "idioma",
  "idiomas",
  "curso",
] as const;

const ROUTINE_META_KEYS = [
  "recurrence",
  "recurrence_rule",
  "rrule",
  "repeat",
  "frequency",
  "routine_id",
  "parent_routine_id",
  "routine_template_id",
  "template_routine_id",
  "recurring_task_id",
  "recurrence_id",
  "source_type",
  "source",
  "category",
  "calendar_type",
  "kind",
  "item_type",
  "type",
] as const;

const ROUTINE_BOOLEAN_KEYS = [
  "is_routine",
  "is_recurring",
  "generated_from_routine",
  "from_routine",
] as const;

function normalizeDesktopKindText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDesktopTaskKind(task: Task): DesktopCalendarKind {
  const rawTaskType = normalizeDesktopKindText(task.task_type);

  if (rawTaskType === "event" || rawTaskType === "evento") {
    return "event";
  }

  if (rawTaskType === "routine" || rawTaskType === "rotina") {
    return "routine";
  }

  const record = task as Task & Record<string, unknown>;

  const hasRoutineBooleanFlag = ROUTINE_BOOLEAN_KEYS.some(
    (key) => record[key] === true
  );

  if (hasRoutineBooleanFlag) {
    return "routine";
  }

  const metaText = ROUTINE_META_KEYS.map((key) => record[key])
    .filter((value: unknown) => value !== undefined && value !== null && value !== "")
    .map(normalizeDesktopKindText)
    .join(" ");

  if (
    metaText.includes("routine") ||
    metaText.includes("rotina") ||
    metaText.includes("recurring") ||
    metaText.includes("recorrente") ||
    metaText.includes("daily") ||
    metaText.includes("weekly") ||
    metaText.includes("monthly")
  ) {
    return "routine";
  }

  const titleText = normalizeDesktopKindText(
    [
      task.title,
      task.description,
      (task as Task & { group_name?: string | null }).group_name,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (ROUTINE_TITLE_HINTS.some((hint) => titleText.includes(normalizeDesktopKindText(hint)))) {
    return "routine";
  }

  return "task";
}

function getDesktopTaskTypeLabel(task: Task) {
  return typeLabels[getDesktopTaskKind(task)];
}

function getDesktopTaskIcon(task: Task) {
  const kind = getDesktopTaskKind(task);

  if (kind === "routine") {
    return <Repeat className="h-3.5 w-3.5" />;
  }

  if (kind === "event") {
    return <CalendarDays className="h-3.5 w-3.5" />;
  }

  return <ListTodo className="h-3.5 w-3.5" />;
}

function normalizeTaskDate(value?: string | null) {
  return value ? value.slice(0, 10) : null;
}

function getDesktopTaskDateLabel(task: Task) {
  const start = normalizeTaskDate(task.scheduled_date);
  const end = normalizeTaskDate((task as Task & { end_date?: string | null }).end_date);

  if (!start) return "Sem data";

  const startLabel = formatDesktopDate(start);
  const endLabel = end && end !== start ? formatDesktopDate(end) : null;

  return endLabel ? `${startLabel} até ${endLabel}` : startLabel;
}

function formatDesktopDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) return isoDate;

  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}


function isDesktopCalendarColorName(
  value: unknown
): value is DesktopCalendarColorName {
  return DESKTOP_CALENDAR_COLOR_OPTIONS.some((option) => option.key === value);
}

function getDesktopCalendarColorOption(colorName: DesktopCalendarColorName) {
  return (
    DESKTOP_CALENDAR_COLOR_OPTIONS.find((option) => option.key === colorName) ??
    DESKTOP_CALENDAR_COLOR_OPTIONS[0]
  );
}

function getDesktopCalendarColorPrefs(): DesktopCalendarColorPrefs {
  if (typeof window === "undefined") {
    return DEFAULT_DESKTOP_CALENDAR_COLORS;
  }

  try {
    const raw = window.localStorage.getItem(
      DESKTOP_CALENDAR_COLORS_STORAGE_KEY
    );

    if (!raw) {
      return DEFAULT_DESKTOP_CALENDAR_COLORS;
    }

    const parsed = JSON.parse(raw) as Partial<
      Record<DesktopCalendarKind, unknown>
    >;

    return normalizeDesktopCalendarColorPrefs({
      task: isDesktopCalendarColorName(parsed.task)
        ? parsed.task
        : DEFAULT_DESKTOP_CALENDAR_COLORS.task,
      event: isDesktopCalendarColorName(parsed.event)
        ? parsed.event
        : DEFAULT_DESKTOP_CALENDAR_COLORS.event,
      routine: isDesktopCalendarColorName(parsed.routine)
        ? parsed.routine
        : DEFAULT_DESKTOP_CALENDAR_COLORS.routine,
    });
  } catch {
    return DEFAULT_DESKTOP_CALENDAR_COLORS;
  }
}

function normalizeDesktopCalendarColorPrefs(
  colors: DesktopCalendarColorPrefs
): DesktopCalendarColorPrefs {
  const normalized = { ...colors };

  if (
    normalized.task === normalized.event ||
    areDesktopCalendarColorsTooSimilar(normalized.task, normalized.event)
  ) {
    normalized.event = "blue";
  }

  if (
    normalized.routine === normalized.task ||
    normalized.routine === normalized.event ||
    areDesktopCalendarColorsTooSimilar(normalized.routine, normalized.task) ||
    areDesktopCalendarColorsTooSimilar(normalized.routine, normalized.event)
  ) {
    normalized.routine = "mint";
  }

  if (
    normalized.event === normalized.task ||
    normalized.event === normalized.routine ||
    areDesktopCalendarColorsTooSimilar(normalized.event, normalized.task) ||
    areDesktopCalendarColorsTooSimilar(normalized.event, normalized.routine)
  ) {
    normalized.event = "blue";
  }

  return normalized;
}

function isDesktopCalendarColorUnavailable(
  kind: DesktopCalendarKind,
  colorName: DesktopCalendarColorName,
  colors: DesktopCalendarColorPrefs
) {
  return (Object.keys(colors) as DesktopCalendarKind[]).some((otherKind) => {
    if (otherKind === kind) return false;

    const otherColor = colors[otherKind];

    return (
      otherColor === colorName ||
      areDesktopCalendarColorsTooSimilar(otherColor, colorName)
    );
  });
}

function areDesktopCalendarColorsTooSimilar(
  first: DesktopCalendarColorName,
  second: DesktopCalendarColorName
) {
  const pairs = new Set([
    "purple:lilac",
    "lilac:purple",
    "mint:cyan",
    "cyan:mint",
  ]);

  return pairs.has(`${first}:${second}`);
}

function saveDesktopCalendarColorPrefs(colors: DesktopCalendarColorPrefs) {
  window.localStorage.setItem(
    DESKTOP_CALENDAR_COLORS_STORAGE_KEY,
    JSON.stringify(normalizeDesktopCalendarColorPrefs(colors))
  );
}

function getDesktopScheduleTone(task: Task) {
  if (task.is_key_task) {
    return getDesktopCalendarColorOption("amber");
  }

  const kind = getDesktopTaskKind(task);
  const prefs = getDesktopCalendarColorPrefs();

  return getDesktopCalendarColorOption(prefs[kind]);
}

function sortDesktopMonthItems(a: Task, b: Task) {
  if (!!a.is_key_task !== !!b.is_key_task) {
    return a.is_key_task ? -1 : 1;
  }

  const byTime = (timeToMinutes(a.start_time) ?? 9999) - (timeToMinutes(b.start_time) ?? 9999);

  if (byTime !== 0) {
    return byTime;
  }

  return a.title.localeCompare(b.title);
}

function getDesktopTaskTime(task: Task) {
  const start = hhmm(task.start_time);
  const end = hhmm(task.end_time);

  if (start && end) return `${start} – ${end}`;
  if (start) return start;

  return "Sem horário";
}

function timeToMinutes(value?: string | null) {
  const time = hhmm(value);
  if (!time) return null;

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}


// ===========================================================================
// CONFIGURAÇÃO INICIAL DO CALENDÁRIO
// ===========================================================================

function CalendarSetupCard({
  isConnecting,
  error,
  onConnect,
  onUseIndependent,
}: {
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
  onUseIndependent: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.7rem] border border-accent-soft bg-accent-soft p-5 text-primary">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_48%)]" />
      <div className="relative">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-soft bg-surface-elevated text-accent">
          <CalendarDays className="h-5 w-5" />
        </div>

        <h2 className="text-[1.45rem] font-semibold leading-[1.05] tracking-[-0.05em] text-primary">
          Como você quer usar sua agenda?
        </h2>

        <p className="mt-3 text-sm leading-6 text-muted">
          Conecte o Google Calendar para sincronizar seus compromissos ou use o
          calendário independente do Axon por enquanto.
        </p>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={onConnect}
            disabled={isConnecting}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando…
              </>
            ) : (
              <>
                <CalendarDays className="mr-2 h-4 w-4" />
                Vincular Google Calendar
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onUseIndependent}
            disabled={isConnecting}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-5 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuar sem vincular
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-xs leading-5 text-rose-700 dark:text-rose-100">
            {error}
          </p>
        )}

        <p className="mt-4 text-xs leading-5 text-soft">
          Você poderá conectar o Google Calendar depois em Configurações.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// ESTADOS VISUAIS E PROGRESSO
// ===========================================================================

function CircularProgress({ value }: { value: number }) {
  // raio + metade do traço = 63 + 7 = 70, deixando 5 de folga até a borda do
  // viewBox (75) para o strokeLinecap arredondado não ser cortado.
  const radius = 63;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (circumference * Math.min(Math.max(value, 0), 100)) / 100;

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_62%)] blur-xl" />

      <svg className="relative h-40 w-40 -rotate-90" viewBox="0 0 150 150">
        <circle
          cx="75"
          cy="75"
          r={radius}
          stroke="var(--border-medium)"
          strokeWidth="14"
          fill="none"
        />

        <circle
          cx="75"
          cy="75"
          r={radius}
          stroke="url(#progress-gradient)"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />

        <defs>
          <linearGradient
            id="progress-gradient"
            x1="20"
            y1="20"
            x2="130"
            y2="130"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#c084fc" />
            <stop offset="0.52" stopColor="#a855f7" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute text-center">
        <p className="text-[2.25rem] font-bold leading-none tracking-[-0.04em] text-primary">
          {value}%
        </p>
        <p className="mt-1.5 text-[0.68rem] font-semibold text-muted">
          concluído
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
// CALENDÁRIO MENSAL
// ===========================================================================

// Quantos pontinhos e quantas barras de evento cabem numa célula antes de o
// excedente virar "+N".
const MONTH_MAX_DOTS = 5;
const MONTH_MAX_BARS = 3;

function MonthCalendar({
  selectedDate,
  onSelect,
  tasks,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  tasks: Task[];
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = toISODate(new Date());
  const selectedIso = toISODate(selectedDate);

  function shiftMonth(delta: number) {
    onSelect(new Date(year, month + delta, 1));
  }

  // Grade completa, incluindo os dias vizinhos que fecham a primeira e a
  // última semana — antes essas posições eram células vazias.
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });

  function getItemsForDay(date: Date) {
    return tasks.filter((task) => isTaskOnDate(task, toISODate(date)));
  }

  // Eventos que cobrem o dia. Cada um vira uma barra arredondada; quando dura
  // vários dias, a barra é desenhada em cada célula do intervalo e se estende
  // sobre o gap da grade para parecer contínua.
  function getEventBars(date: Date) {
    const iso = toISODate(date);

    return tasks
      .filter(
        (task) => task.task_type === "event" && isTaskOnDate(task, iso)
      )
      .map((event) => {
        const startIso = event.scheduled_date;
        const endIso = getTaskEndDate(event) || startIso;

        return {
          id: event.id,
          isStart: iso === startIso,
          isEnd: iso === endIso,
        };
      });
  }

  return (
    <div className="rounded-[1.6rem] border border-accent-soft bg-calendar p-2.5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="text-center">
          <p className="text-base font-bold text-primary">
            {monthNames[month]}
          </p>
          <p className="mt-0.5 text-xs text-muted">Mês atual</p>
        </div>

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
          <p key={`${day}-${index}`} className="text-[0.68rem] text-muted">
            {day}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          const iso = toISODate(date);

          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;
          const isOutside = date.getMonth() !== month;

          // Eventos viram barras; o restante (tarefas e rotinas), pontinhos.
          const items = getItemsForDay(date);
          const dotItems = items.filter((item) => item.task_type !== "event");
          const dots = dotItems.slice(0, MONTH_MAX_DOTS);

          const eventBars = getEventBars(date);
          const bars = eventBars.slice(0, MONTH_MAX_BARS);

          const extraCount =
            dotItems.length - dots.length + (eventBars.length - bars.length);

          const isRowStart = index % 7 === 0;
          const isRowEnd = index % 7 === 6;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(date)}
              className={`flex min-h-[4.6rem] flex-col items-center gap-1 rounded-xl border px-0.5 pb-1 pt-1.5 transition active:scale-[0.96] ${
                isOutside
                  ? // dias de outro mês não ganham quadrado: só número e itens
                    "border-transparent bg-transparent"
                  : isSelected
                  ? "border-[var(--accent)] bg-transparent"
                  : isToday
                  ? "border-accent-soft bg-accent-soft"
                  : "border-transparent bg-[#242430]/12"
              }`}
            >
              <span
                className={`text-sm font-semibold ${
                  isSelected
                    ? "text-primary"
                    : isOutside
                    ? "text-soft"
                    : isToday
                    ? "text-accent"
                    : "text-secondary"
                }`}
              >
                {date.getDate()}
              </span>

              {/* Barras dos eventos. Nas pontas do evento (ou da semana) ficam
                  arredondadas; nos dias do meio, a margem negativa de 5px cobre
                  o gap da grade (4px) mais a borda e o padding da célula, para
                  a barra parecer contínua entre um dia e o seguinte. */}
              {bars.length > 0 ? (
                <span className="flex w-full flex-col gap-0.5">
                  {bars.map((bar) => (
                    <span
                      key={bar.id}
                      className={`h-1.5 bg-[var(--accent)] ${
                        bar.isStart || isRowStart
                          ? "rounded-l-full"
                          : "-ml-[5px]"
                      } ${
                        bar.isEnd || isRowEnd ? "rounded-r-full" : "-mr-[5px]"
                      }`}
                    />
                  ))}
                </span>
              ) : (
                <span className="h-1.5" />
              )}

              {(dots.length > 0 || extraCount > 0) && (
                <span className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-0.5">
                    {dots.map((item) => (
                      <span
                        key={item.id}
                        className={`h-1 w-1 rounded-full ${getMonthItemColor(
                          item.task_type,
                          false
                        )}`}
                      />
                    ))}
                  </span>

                  {extraCount > 0 && (
                    <span className="text-[0.55rem] font-semibold leading-none text-muted">
                      + {extraCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getMonthItemColor(taskType: TaskType, isSelected: boolean) {
  if (isSelected) return "bg-white";

  if (taskType === "event") return "bg-cyan-300";
  if (taskType === "routine") return "bg-fuchsia-300";

  return "bg-purple-300";
}

function monthRangeOf(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    start: toISODate(start),
    end: toISODate(end),
  };
}

function isPastDate(isoDate: string) {
  return isoDate < toISODate(new Date());
}

// ===========================================================================
// CALENDÁRIO SEMANAL
// ===========================================================================

function WeekCalendar({
  selectedDate,
  onSelect,
  tasks,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  tasks: Task[];
}) {
  const days = weekDaysOf(selectedDate);
  const todayIso = toISODate(new Date());
  const monthLabel = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  function shiftWeek(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(selectedDate.getDate() + delta * 7);
    onSelect(d);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="text-center">
          <p className="text-base font-bold text-primary">{monthLabel}</p>
          <p className="mt-0.5 text-xs text-muted">Semana atual</p>
        </div>

        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
          aria-label="Próxima semana"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* items-center evita o stretch padrão do grid: sem ele todos os cards
          assumiriam a altura do mais alto e a diferença do dia selecionado
          não apareceria. */}
      <div className="grid grid-cols-7 items-center gap-1.5">
        {days.map((date) => {
          const iso = toISODate(date);
          const isSelected = iso === toISODate(selectedDate);
          const isToday = iso === todayIso;

          // Até 3 pontinhos indicam a carga do dia, coloridos por tipo de
          // item; acima disso entra um "+" no lugar da contagem exata.
          const dayItems = tasks.filter((task) => isTaskOnDate(task, iso));
          const dots = dayItems.slice(0, 3);
          const hasMore = dayItems.length > dots.length;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(date)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-0.5 transition active:scale-[0.96] ${
                isSelected ? "min-h-[76px]" : "min-h-[66px]"
              } ${
                isSelected
                  ? "border-accent-soft bg-[var(--accent-strong)] text-white shadow-card"
                  : isToday
                  ? "border-accent-soft bg-accent-soft text-accent"
                  : "border-soft bg-surface-muted text-muted"
              }`}
            >
              <p className="text-[0.6rem] font-semibold uppercase tracking-wide">
                {weekdayShort[date.getDay()]}
              </p>

              <p
                className={`text-lg font-bold ${
                  isSelected ? "text-white" : "text-primary"
                }`}
              >
                {String(date.getDate()).padStart(2, "0")}
              </p>

              <div className="flex h-2 items-center gap-0.5">
                {dots.map((item) => (
                  <span
                    key={item.id}
                    className={`h-1 w-1 rounded-full ${getMonthItemColor(
                      item.task_type,
                      isSelected
                    )}`}
                  />
                ))}

                {hasMore && (
                  <span
                    className={`text-[0.55rem] font-bold leading-none ${
                      isSelected ? "text-white" : "text-muted"
                    }`}
                  >
                    +
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// ITEM DA LINHA DO TEMPO
// ===========================================================================

// Silhueta do card: a aba de status (canto superior esquerdo) e o corpo saem
// de uma peça só. O contorno percorre a aba, desce até a altura do corpo,
// vira à direita e segue pelo topo do corpo — a curva dessa virada é o canto
// côncavo, que border-radius não consegue fazer.
//
//   TAB_W / TAB_H: largura e altura da aba.  R: raio dos cantos convexos.
//   RC: raio do canto côncavo da junção.
//
// TAB_H precisa ser >= R + RC: a lateral direita da aba vai do fim do canto
// superior (y = R) até o início da curva côncava (y = TAB_H - RC), e esse
// trecho não pode ter altura negativa.
const TAB_W = 77; // px
const TAB_H = 38; // px
const R = 18; // px — cantos externos
const RC = 14; // px — canto côncavo

// Usa shape() em vez de path(): path() só aceita coordenadas absolutas em px,
// e o card precisa acompanhar a largura fluida da coluna (100%).
//
// O canto côncavo é um quarto de círculo: a lateral da aba desce reta até
// y = TAB_H, e só então a curva vira para a direita, saindo horizontal na
// altura do topo do corpo. Descrever a virada como um arco diagonal (de
// y = TAB_H - RC direto para x = TAB_W + RC) achata a curva num corte
// enviesado — o arco precisa dos dois trechos separados.
// O sentido de cada arco é sempre explícito: em shape() o arc-sweep tem
// default ccw, que coloca o centro do arco FORA da massa do card. Nos cantos
// externos isso recorta uma mordida circular em vez de arredondar. Portanto:
//   cw  -> centro dentro do card  -> canto convexo (os quatro externos)
//   ccw -> centro fora do card    -> canto côncavo (só a junção da aba)
const CARD_CLIP_PATH = [
  `shape(from 0px ${TAB_H}px,`,
  // aba: sobe pela esquerda e contorna o topo
  `line to 0px ${R}px,`,
  `arc to ${R}px 0px of ${R}px cw,`,
  `line to ${TAB_W - R}px 0px,`,
  `arc to ${TAB_W}px ${R}px of ${R}px cw,`,
  // lateral direita da aba, reta até a altura do topo do corpo
  `line to ${TAB_W}px ${TAB_H - RC}px,`,
  // canto côncavo: quarto de volta para a direita, entrando no corpo
  `arc to ${TAB_W + RC}px ${TAB_H}px of ${RC}px ccw,`,
  // topo do corpo até o canto superior direito
  `line to calc(100% - ${R}px) ${TAB_H}px,`,
  `arc to 100% ${TAB_H + R}px of ${R}px cw,`,
  // lateral direita, base e volta pela esquerda
  `line to 100% calc(100% - ${R}px),`,
  `arc to calc(100% - ${R}px) 100% of ${R}px cw,`,
  `line to ${R}px 100%,`,
  `arc to 0px calc(100% - ${R}px) of ${R}px cw,`,
  `close)`,
].join(" ");

function TimelineItem({
  task,
  selectedIso,
  subtasks = [],
  onToggle,
  onToggleKey,
  onEdit,
  onDelete,
  onToggleSubtask,
  onDeleteSubtask,
  onSubtaskChange,
}: {
  task: Task;
  selectedIso: string;
  subtasks?: Subtask[];
  onToggle: (t: Task) => void;
  onToggleKey?: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onSubtaskChange?: () => void;
}) {
  const isKey = !!task.is_key_task;
  const Icon =
    task.task_type === "task"
      ? ListTodo
      : task.task_type === "event"
      ? CalendarDays
      : Repeat;

  const start = hhmm(task.start_time);
  const end = hhmm(task.end_time);
  const subtitle = task.description || typeLabels[task.task_type];

  const isDone = task.status === "done";
  const isEvent = task.task_type === "event";
  const isRoutine = task.task_type === "routine";

  const completedSubtasks = subtasks.filter((subtask) => subtask.done).length;
  const hasSubtasks = subtasks.length > 0;
  const visualProgress = hasSubtasks
    ? Math.round((completedSubtasks / subtasks.length) * 100)
    : task.progress ?? 0;

  const displayStatus = hasSubtasks && completedSubtasks === subtasks.length
    ? "done"
    : getDisplayStatus(task, selectedIso);
  const isDisplayDone = displayStatus === "done";
  const isDisplayProgress = displayStatus === "progress";
  const isDisplayScheduled = displayStatus === "scheduled";

  const multiDayProgress = isEvent
    ? getMultiDayEventProgress(task, selectedIso)
    : null;

  const isMultiDayEvent = Boolean(multiDayProgress);
  const canCompleteMultiDayEvent = multiDayProgress?.isLastDay;
  const taskEndDate = getTaskEndDate(task);

  const detailLabel =
    isRoutine && task.recurrence
      ? recurrenceLabels[task.recurrence] ?? task.recurrence
      : isMultiDayEvent && task.scheduled_date && taskEndDate
      ? `${task.scheduled_date} até ${taskEndDate}`
      : isEvent
      ? `${start ?? "—"}${end ? ` - ${end}` : ""}`
      : start && end
      ? `${start} - ${end}`
      : start ?? "Sem horário";

  // Percentual mostrado na aba de status: eventos multi-dia usam o avanço no
  // intervalo; os demais itens usam o progresso/checklist.
  const headerProgress = isMultiDayEvent
    ? isDone
      ? 100
      : multiDayProgress?.progress ?? 0
    : isDisplayDone
    ? 100
    : visualProgress;

  const statusLabel = isDisplayDone ? "Completo" : statusLabels[displayStatus];

  const statusToneClass = isDisplayDone
    ? "text-accent"
    : isDisplayProgress
    ? "text-accent"
    : isDisplayScheduled
    ? "text-cyan-600 dark:text-cyan-200"
    : "text-muted";

  const barFillClass = isDisplayDone
    ? "bg-[var(--accent)]"
    : isMultiDayEvent
    ? "bg-gradient-to-r from-cyan-300 to-purple-300"
    : isRoutine
    ? "bg-gradient-to-r from-fuchsia-300 to-purple-300"
    : isDisplayProgress
    ? "bg-gradient-to-r from-purple-400 to-fuchsia-300"
    : "bg-[var(--border-medium)]";

  // Cor da superfície do card. Sem borda: a silhueta é recortada por
  // clip-path (aba + corpo numa peça só) e um contorno de 1px não
  // acompanharia o recorte.
  const surfaceClass = isKey
    ? "bg-amber-400/[0.08]"
    : isDisplayDone
    ? "bg-emerald-400/10"
    : isEvent && isDisplayProgress
    ? "bg-accent-soft"
    : isEvent
    ? "bg-cyan-400/10"
    : isRoutine
    ? "bg-fuchsia-400/10"
    : isDisplayProgress
    ? "bg-accent-soft"
    : "bg-surface-muted";

  return (
    <div className="grid grid-cols-[2.1rem_1fr] gap-1">
      {/* Coluna de horários com a linha do tempo tracejada. Alinhada à
          esquerda para os horários baterem com a borda esquerda dos demais
          blocos da tela (botão "Nova tarefa", seta da semana, card de segunda). */}
      <div className="flex flex-col items-stretch pt-1 text-left">
        <p className="text-[0.62rem] font-semibold text-secondary">
          {start ?? "—"}
        </p>

        {/* mx-auto centraliza a linha na coluna, que tem a mesma largura do
            texto do horário — assim ela cai no meio dos números. */}
        <div
          className={`mx-auto my-2 w-px flex-1 border-l ${
            isRoutine
              ? "border-dashed border-accent-soft"
              : "border-dashed border-[var(--border-soft)]"
          }`}
        />

        <p className="pb-1 text-[0.62rem] font-semibold text-muted">
          {end ?? "—"}
        </p>
      </div>

      {/* Card em peça única: a aba de status e o corpo formam uma silhueta só,
          recortada por clip-path (ver CARD_CLIP_PATH). A faixa com barra, %
          e botões fica fora do recorte, sobre o fundo da tela. */}
      <div
        className="relative min-w-0"
        style={
          {
            "--tab-w": `${TAB_W}px`,
            "--tab-h": `${TAB_H}px`,
          } as CSSProperties
        }
      >
        <div className="absolute inset-x-0 top-0 flex h-[var(--tab-h)] items-center gap-2 pl-[var(--tab-w)]">
          <div className="ml-2 h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--border-soft)]">
            <div
              className={`h-full rounded-full ${barFillClass}`}
              style={{
                width: `${Math.min(Math.max(headerProgress, 0), 100)}%`,
              }}
            />
          </div>

          <p className="shrink-0 text-xs font-bold text-accent">
            {headerProgress}%
          </p>

          <div className="flex shrink-0 items-center gap-1">
              {onToggleKey && (
                <button
                  type="button"
                  onClick={() => onToggleKey(task)}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl border border-soft active:scale-[0.94] ${
                    isKey
                      ? "bg-amber-400/15 text-amber-500 dark:text-amber-200"
                      : "bg-surface-muted text-muted"
                  }`}
                  aria-label={
                    isKey ? "Desmarcar tarefa chave" : "Marcar como tarefa chave"
                  }
                  title={
                    isKey ? "Desmarcar tarefa chave" : "Marcar como tarefa chave"
                  }
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      isKey ? "fill-amber-300 text-amber-300" : ""
                    }`}
                  />
                </button>
              )}

            <button
              type="button"
              onClick={() => onEdit(task)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.94]"
              aria-label="Editar item"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(task)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.94]"
              aria-label="Remover item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Superfície única: a aba de status e o corpo saem do mesmo retângulo,
            recortado pelo clip-path — por isso a junção tem canto côncavo e
            não existe linha separando as duas partes. */}
        <div
          className={`timeline-card relative min-w-0 pt-[var(--tab-h)] ${surfaceClass}`}
          style={{
            clipPath: CARD_CLIP_PATH,
          }}
        >
          {/* Rótulo do status, dentro da aba recortada. */}
          {/* text-center além do justify-center: rótulos longos ("Em
              andamento") quebram em duas linhas dentro da aba, e sem ele cada
              linha ficaria alinhada à esquerda. */}
          <p
            className={`absolute left-0 top-0 flex h-[var(--tab-h)] w-[var(--tab-w)] items-center justify-center px-1 text-center text-[0.75rem] font-bold leading-tight ${statusToneClass}`}
          >
            {statusLabel}
          </p>

          {/* Ícone em losango, título, chips e ação de conclusão. */}
          <div className="flex items-start gap-2.5 px-2.5 pb-2.5 pt-3">
            <div className="min-w-0 flex-1">
              {/* O losango é irmão do título/subtítulo num flex items-center,
                  então o centro dele casa com o centro desse par — sem depender
                  da altura dos chips e do horário, que vêm abaixo. */}
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-11 w-11 shrink-0 rotate-45 items-center justify-center rounded-[0.9rem] border ${
                    isDisplayDone
                      ? "border-emerald-300/20 bg-emerald-400/15 text-emerald-600 dark:text-emerald-100"
                      : isEvent && isDisplayProgress
                      ? "border-accent-soft bg-accent-soft text-accent"
                      : isEvent
                      ? "border-cyan-300/20 bg-cyan-400/15 text-cyan-600 dark:text-cyan-100"
                      : isRoutine
                      ? "border-fuchsia-300/20 bg-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-100"
                      : isDisplayProgress
                      ? "border-accent-soft bg-accent-soft text-accent"
                      : "border-soft bg-surface-muted text-muted"
                  }`}
                >
                  {isDisplayDone ? (
                    <CheckCircle2 className="h-5 w-5 -rotate-45" />
                  ) : (
                    <Icon className="h-5 w-5 -rotate-45" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="break-words text-[0.95rem] font-bold leading-snug text-primary">
                    {task.title}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-muted">
                    {subtitle}
                  </p>
                </div>
              </div>

              {/* pl = largura do losango (2.75rem) + gap (0.625rem), para os
                  chips e o horário alinharem com o título. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[3.375rem]">
                {isKey && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-600 dark:text-amber-200">
                    <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                    Chave
                  </span>
                )}

                {task.objective_title && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[0.62rem] font-medium text-accent">
                    <Target className="h-2.5 w-2.5" />
                    {task.objective_title}
                  </span>
                )}

                {hasSubtasks && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[0.62rem] font-semibold text-accent">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {completedSubtasks}/{subtasks.length}
                  </span>
                )}

                {task.carry_count > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-orange-300/20 bg-orange-400/10 px-2 py-0.5 text-[0.62rem] font-semibold text-orange-600 dark:text-orange-200"
                    title={`Adiada ${task.carry_count}x`}
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    {task.carry_count}
                  </span>
                )}

                {/* Último item da linha, seguindo o gap das tags: sem tag
                    nenhuma ele encosta à esquerda, alinhado com o título; a
                    cada tag adicionada ele vai deslocando para a direita. */}
                <p className="shrink-0 whitespace-nowrap text-[0.68rem] text-soft">
                  {detailLabel}
                </p>
              </div>
            </div>

            {/* Ação de conclusão: círculo grande à direita, como na referência. */}
            {isMultiDayEvent ? (
              <button
                type="button"
                onClick={() => {
                  if (canCompleteMultiDayEvent) {
                    onToggle(task);
                  }
                }}
                disabled={!canCompleteMultiDayEvent}
                className="flex shrink-0 flex-col items-center gap-1 pt-1 active:scale-[0.97] disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-500 dark:text-emerald-300"
                      : canCompleteMultiDayEvent
                      ? "border-[var(--accent)]"
                      : "border-[var(--border-medium)]"
                  }`}
                >
                  {isDone && <CheckCircle2 className="h-3 w-3" />}
                </span>

                <span
                  className={`text-[0.62rem] font-semibold ${
                    isDone
                      ? "text-emerald-600 dark:text-emerald-300"
                      : canCompleteMultiDayEvent
                      ? "text-accent"
                      : "text-soft"
                  }`}
                >
                  {isDone
                    ? "Feito"
                    : canCompleteMultiDayEvent
                    ? "Marcar"
                    : "Em curso"}
                </span>
              </button>
            ) : !isEvent ? (
              <button
                type="button"
                onClick={() => onToggle(task)}
                className="flex shrink-0 flex-col items-center gap-1 pt-1 transition active:scale-[0.97]"
                aria-label={
                  isDone ? "Desmarcar tarefa" : "Marcar tarefa como feita"
                }
              >
                <span
                  className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-500 dark:text-emerald-300"
                      : "border-[var(--accent)]"
                  }`}
                >
                  {isDone && <CheckCircle2 className="h-3 w-3" />}
                </span>

                <span
                  className={`text-[0.62rem] font-semibold ${
                    isDone
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-accent"
                  }`}
                >
                  {isDone ? "Feita" : "Marcar"}
                </span>
              </button>
            ) : null}
          </div>

          {/* Checklist de subtarefas (tarefas e rotinas). */}
          {!isEvent && (
            <div className="px-2.5 pb-2.5">
              <SubtasksPreview
                taskId={task.id}
                subtasks={subtasks}
                completedSubtasks={completedSubtasks}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onSubtaskChange={onSubtaskChange}
              />
            </div>
          )}

          {/* Eventos multi-dia mantêm o indicador de dia dentro do intervalo. */}
          {isMultiDayEvent && (
            <div className="px-2.5 pb-2.5">
              <p className="text-[0.68rem] text-muted">
                Dia {multiDayProgress?.currentDay} de{" "}
                {multiDayProgress?.totalDays}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ===========================================================================
// PRÉVIA DE SUBTAREFAS NO CARD
// ===========================================================================

function SubtasksPreview({
  taskId,
  subtasks,
  completedSubtasks,
  onToggleSubtask,
  onDeleteSubtask,
  onSubtaskChange,
}: {
  taskId: string;
  subtasks: Subtask[];
  completedSubtasks: number;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
  onSubtaskChange?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const hasSubtasks = subtasks.length > 0;
  const visibleSubtasks = expanded ? subtasks : subtasks.slice(0, 3);
  const hiddenCount = subtasks.length - visibleSubtasks.length;
  const canExpand = subtasks.length > 3;

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await api.createSubtask(taskId, { title });
      setNewTitle("");
      setAdding(false);
      onSubtaskChange?.();
    } catch {
      // Mantém o estado atual em caso de erro.
    } finally {
      setSaving(false);
    }
  }

  // Campo de criação (ou o botão que o abre). Fica numa variável porque é
  // renderizado dentro da moldura quando já há subtarefas e solto quando não há.
  const composer = adding ? (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
          if (e.key === "Escape") {
            setAdding(false);
            setNewTitle("");
          }
        }}
        placeholder="Nome da subtarefa…"
        className="min-h-[34px] flex-1 rounded-xl border border-accent-soft bg-surface-muted px-3 text-xs text-primary outline-none placeholder:text-soft"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={saving || !newTitle.trim()}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-white transition active:scale-[0.94] disabled:opacity-45"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setAdding(false);
          setNewTitle("");
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted transition active:scale-[0.94]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border-medium)] py-2 text-[0.7rem] font-bold text-secondary active:scale-[0.98]"
    >
      <Plus className="h-3 w-3" />
      Adicionar subtarefas
    </button>
  );

  // Sem subtarefas não há lista para emoldurar — a moldura em volta de um
  // botão solto parecia um card vazio.
  if (!hasSubtasks) {
    return composer;
  }

  return (
    <div className="space-y-2 rounded-[1.25rem] border border-soft bg-surface-muted p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-soft">
          Subtarefas
        </p>

        <p className="text-[0.68rem] font-semibold text-accent">
          {completedSubtasks} de {subtasks.length}
        </p>
      </div>

      {visibleSubtasks.map((subtask) => (
        // Linha = div com dois botões irmãos: <button> aninhado é HTML
        // inválido e faria o X disparar o toggle junto.
        <div
          key={subtask.id}
          className="flex w-full items-start gap-2 rounded-xl px-1 py-1.5 text-left"
        >
          <button
            type="button"
            onClick={() => onToggleSubtask(subtask)}
            className="flex min-w-0 flex-1 items-start gap-2 text-left active:scale-[0.99]"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                subtask.done
                  ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                  : "border-soft bg-surface-muted text-soft"
              }`}
            >
              {subtask.done && <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>

            <span
              className={`min-w-0 flex-1 break-words text-xs ${
                subtask.done ? "text-soft line-through" : "text-secondary"
              }`}
            >
              {subtask.title}
            </span>
          </button>

          <button
            type="button"
            aria-label={`Excluir subtarefa ${subtask.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteSubtask(subtask);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-soft transition hover:text-red-400 active:scale-[0.92]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 pl-7 text-[0.68rem] font-semibold text-accent transition active:scale-[0.98]"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
          {expanded ? "Ver menos" : `Ver mais (${hiddenCount})`}
        </button>
      )}

      {composer}
    </div>
  );
}

// ===========================================================================
// MODAL DE CRIAÇÃO DE ITEM
// ===========================================================================

function CreatePlanningItemModal({
  isOpen,
  defaultDate,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [selectedType, setSelectedType] = useState<TaskType>("task");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [endDate, setEndDate] = useState(defaultDate);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [axonPickTime, setAxonPickTime] = useState(false);
  const [duration, setDuration] = useState("");
  const [isKeyTask, setIsKeyTask] = useState(false);

  const [description, setDescription] = useState("");
  const [draftSubtasks, setDraftSubtasks] = useState<
    { key: string; title: string }[]
  >([]);
  const [objectiveId, setObjectiveId] = useState("");
  const [objectives, setObjectives] = useState<api.Objective[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function addDraftSubtask() {
    setDraftSubtasks((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2), title: "" },
    ]);
  }
  function updateDraftSubtask(key: string, title: string) {
    setDraftSubtasks((prev) =>
      prev.map((subtask) =>
        subtask.key === key ? { ...subtask, title } : subtask
      )
    );
  }
  function removeDraftSubtask(key: string) {
    setDraftSubtasks((prev) => prev.filter((s) => s.key !== key));
  }

  useEffect(() => {
    if (isOpen) {
      setSelectedType("task");
      setTitle("");
      setDate(defaultDate);
      setStartTime("");
      setEndTime("");
      setPriority("medium");
      setLocation("");
      setRecurrence("daily");
      setDescription("");
      setDraftSubtasks([]);
      setObjectiveId("");
      setFormError(null);
      setEndDate(defaultDate);
      setAxonPickTime(false);
      setDuration("");
      setIsKeyTask(false);

      // Objetivos ativos para o campo "Vincular a objetivo".
      api.getObjectives()
        .then((list) => setObjectives(list.filter((o) => o.status === "active")))
        .catch(() => setObjectives([]));
    }
  }, [isOpen, defaultDate]);

  const titlePlaceholder =
    selectedType === "task"
      ? "Ex: Estender as roupas"
      : selectedType === "event"
      ? "Ex: Reunião com cliente"
      : "Ex: Pilates";

  const description_text =
    selectedType === "task"
      ? "Tarefas são ações pontuais que você pode marcar como concluídas."
      : selectedType === "event"
      ? "Eventos ocupam um horário fixo, com início e fim definidos."
      : "Rotinas são compromissos recorrentes que se repetem automaticamente.";

  async function handleSubmit() {
    if (!title.trim()) {
      setFormError("Dê um nome para o item.");
      return;
    }
    if (selectedType === "event" && endDate && date && endDate < date) {
      setFormError("A data final do evento não pode ser anterior à data inicial.");
      return;
    }
    if (!axonPickTime && startTime && endTime && endTime <= startTime) {
      setFormError("O horário de término precisa ser depois do horário de início.");
      return;
    }
    if (axonPickTime && selectedType !== "routine") {
      const d = Number(duration);
      if (!duration || !Number.isFinite(d) || d <= 0) {
        setFormError("Informe a duração em minutos para o Axon escolher o horário.");
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const useAxon = axonPickTime && selectedType !== "routine";
      const task = await api.createTask({
        title: title.trim(),
        task_type: selectedType,
        scheduled_date: date || undefined,
        end_date: selectedType === "event" ? endDate || date : undefined,
        start_time: useAxon ? undefined : startTime || undefined,
        end_time: useAxon ? undefined : endTime || undefined,
        priority: selectedType === "task" ? priority : undefined,
        location: selectedType === "event" ? location || undefined : undefined,
        recurrence: selectedType === "routine" ? recurrence : undefined,
        description: description || undefined,
        axon_pick_time: useAxon || undefined,
        duration_minutes: useAxon ? Number(duration) : undefined,
        is_key_task: selectedType === "task" && isKeyTask ? true : undefined,
        objective_id:
          selectedType === "task" && objectiveId ? objectiveId : undefined,
      } as any);

      const validDrafts = draftSubtasks.filter((s) => s.title.trim());
      if (validDrafts.length > 0) {
        await Promise.all(
          validDrafts.map((subtask) =>
            api.createSubtask(task.id, { title: subtask.title.trim() })
          )
        );
      }
      await onCreated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={false}
      ariaLabel="Adicionar ao planejamento"
      maxHeightClassName="max-h-[88vh] lg:max-h-[78dvh]"
      className="overflow-x-hidden lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:right-auto lg:top-1/2 lg:mx-0 lg:w-[min(520px,calc(100vw-2rem))] lg:max-w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[2rem]"
      contentClassName="overflow-x-hidden bg-white text-slate-950 lg:px-6 lg:py-5 dark:bg-[#181421] dark:text-white"
      footerClassName="overflow-x-hidden border-t border-slate-200/80 bg-white/95 lg:px-6 lg:pb-5 lg:pt-4 dark:border-white/10 dark:bg-[#181421]/95"
      surfaceClassName="overflow-x-hidden bg-white text-slate-950 shadow-soft lg:bg-white/98 lg:shadow-[0_30px_110px_rgba(93,64,126,0.18)] dark:bg-[#181421] dark:text-white dark:lg:bg-[#181421]/95 dark:lg:shadow-[0_30px_110px_rgba(0,0,0,0.55)]"
      footer={
        <>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando…
              </>
            ) : (
              <>
                Criar {typeLabels[selectedType].toLowerCase()}
                <Plus className="ml-2 h-4 w-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-6 text-sm font-semibold text-secondary transition active:scale-[0.98]"
          >
            Cancelar
          </button>
        </>
      }
    >
      {/* Cabeçalho mantido no conteúdo para preservar o visual. */}
      <div className="mb-4">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
          <Plus className="h-3.5 w-3.5" />
          Novo item
        </div>

        <h2 className="text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.05em] text-primary">
          Adicionar ao planejamento
        </h2>

        <p className="mt-2 text-xs leading-5 text-muted">
          {description_text}
        </p>
      </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <TypeButton
              active={selectedType === "task"}
              icon={ListTodo}
              label="Tarefa"
              onClick={() => setSelectedType("task")}
            />

            <TypeButton
              active={selectedType === "event"}
              icon={CalendarDays}
              label="Evento"
              onClick={() => setSelectedType("event")}
            />
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Nome
              </span>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            {selectedType === "event" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-muted">
                    Data inicial
                  </span>

                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);

                      if (!endDate || endDate < e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-muted">
                    Data final
                  </span>

                  <input
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Data
                </span>

                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                />
              </label>
            )}

            {selectedType !== "routine" && (
              <div>
                <span className="mb-2 block text-xs font-medium text-muted">
                  Horário
                </span>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAxonPickTime(false)}
                    className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-xs font-semibold transition active:scale-[0.97] ${
                      !axonPickTime
                        ? "border-accent-soft bg-accent-soft text-accent"
                        : "border-soft bg-surface-muted text-muted"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Horário fixo
                  </button>
                  <button
                    type="button"
                    onClick={() => setAxonPickTime(true)}
                    className={`flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-xs font-semibold transition active:scale-[0.97] ${
                      axonPickTime
                        ? "border-accent-soft bg-accent-soft text-accent"
                        : "border-soft bg-surface-muted text-muted"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Axon decide
                  </button>
                </div>

                {axonPickTime ? (
                  <div>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-muted">
                        Duração (minutos)
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="Ex: 45"
                        className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
                      />
                    </label>
                    <p className="mt-2 text-[0.7rem] leading-4 text-muted">
                      O Axon escolhe o melhor horário com base no seu cronotipo e no que já está agendado no dia.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-muted">
                        Início
                      </span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-muted">
                        Fim
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {selectedType === "task" && (
              <button
                type="button"
                onClick={() => {
                  const next = !isKeyTask;
                  setIsKeyTask(next);
                  if (next) setPriority("high");
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                  isKeyTask
                    ? "border-amber-300/30 bg-amber-400/[0.08]"
                    : "border-soft bg-surface-muted"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                  isKeyTask
                    ? "border-amber-300/30 bg-amber-400/15 text-amber-700 dark:text-amber-200"
                    : "border-soft bg-surface-muted text-muted"
                }`}>
                  <Star className={`h-4.5 w-4.5 ${isKeyTask ? "fill-amber-300 text-amber-300" : ""}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${isKeyTask ? "text-amber-700 dark:text-amber-100" : "text-secondary"}`}>
                    Tarefa chave do dia
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-muted">
                    A única que, se feita, torna o dia bem-sucedido.
                  </p>
                </div>
                <div className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${
                  isKeyTask ? "border-amber-400 bg-amber-400" : "border-soft bg-transparent"
                }`} />
              </button>
            )}

            {selectedType === "task" && (
              <label className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">
                    Prioridade
                  </span>
                  {isKeyTask && (
                    <span className="text-[0.68rem] font-semibold text-amber-300/80">
                      Travada em Alta pela tarefa chave
                    </span>
                  )}
                </div>

                <select
                  value={priority}
                  disabled={isKeyTask}
                  onChange={(e) =>
                    setPriority(e.target.value as "low" | "medium" | "high")
                  }
                  className={`min-h-[52px] w-full rounded-2xl border px-4 text-sm text-primary outline-none transition ${
                    isKeyTask
                      ? "cursor-not-allowed border-amber-300/20 bg-amber-400/[0.06] opacity-70"
                      : "border-soft bg-surface-muted focus:border-accent-soft"
                  }`}
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>
            )}

            {selectedType === "task" && objectives.length > 0 && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Vincular a objetivo
                </span>

                <select
                  value={objectiveId}
                  onChange={(e) => setObjectiveId(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none transition focus:border-accent-soft"
                >
                  <option value="">Nenhum</option>
                  {objectives.map((objective) => (
                    <option key={objective.id} value={objective.id}>
                      {objective.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedType === "event" && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Local ou link
                </span>

                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Google Meet, sala 203..."
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
                />
              </label>
            )}

            {selectedType === "routine" && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Repetição
                </span>

                <select
                  value={recurrence}
                  onChange={(e) =>
                    setRecurrence(e.target.value as "daily" | "weekly" | "monthly")
                  }
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                >
                  <option value="daily">Todos os dias</option>
                  <option value="weekly">Toda semana</option>
                  <option value="monthly">Todo mês</option>
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Observação
              </span>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicione detalhes, contexto ou instruções..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-soft bg-surface-muted px-4 py-3 text-sm leading-6 text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            {selectedType === "task" && (
              <div className="rounded-2xl border border-soft bg-surface-muted p-4">
                <p className="mb-3 text-xs font-semibold text-muted">Subtarefas (opcional)</p>
                {draftSubtasks.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {draftSubtasks.map((s, idx) => (
                      <div key={s.key} className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-soft text-[0.55rem] font-bold text-soft">
                          {idx + 1}
                        </span>
                        <input
                          value={s.title}
                          onChange={(e) => updateDraftSubtask(s.key, e.target.value)}
                          placeholder={`Subtarefa ${idx + 1}`}
                          autoFocus={idx === draftSubtasks.length - 1}
                          className="min-h-[38px] flex-1 rounded-xl border border-soft bg-surface-muted px-3 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
                        />
                        <button
                          type="button"
                          onClick={() => removeDraftSubtask(s.key)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted transition active:scale-[0.94]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addDraftSubtask}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-soft)] py-2 text-xs font-semibold text-muted active:scale-[0.98]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar subtarefa
                </button>
              </div>
            )}

            {formError && (
              <p className="text-xs font-medium text-rose-300">{formError}</p>
            )}
          </div>
    </BottomSheet>
  );
}

function TypeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[4.4rem] flex-col items-center justify-center gap-2 rounded-2xl border text-[0.68rem] font-semibold transition active:scale-[0.98] ${
        active
          ? "border-accent-soft bg-accent-soft text-accent shadow-card"
          : "border-soft bg-surface-muted text-muted"
      }`}
    >
      <Icon className="h-4.5 w-4.5" />
      {label}
    </button>
  );
}


// ===========================================================================
// MODAL DE EXCLUSÃO DE ITEM
// ===========================================================================

function DeletePlanningItemModal({
  task,
  isDeleting,
  onClose,
  onConfirm,
}: {
  task: Task | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!task) return null;

  const itemLabel = getDesktopTaskTypeLabel(task).toLowerCase();

  return (
    <ConfirmDialog
      isOpen
      title={`Remover ${itemLabel}?`}
      description={
        <>
          <p>
            Essa ação vai excluir{" "}
            <span className="font-semibold text-primary">"{task.title}"</span>{" "}
            do seu planejamento.
          </p>

          <div className="mt-5 rounded-[1.35rem] border border-soft bg-surface-muted p-3 text-left">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-soft">
              Item selecionado
            </p>

            <p className="mt-2 truncate text-sm font-semibold text-primary">
              {task.title}
            </p>

            <p className="mt-1 text-xs text-muted">
              {getDesktopTaskTypeLabel(task)} · {statusLabels[task.status]}
            </p>
          </div>
        </>
      }
      confirmLabel="Excluir"
      variant="danger"
      icon={Trash2}
      loading={isDeleting}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

// ===========================================================================
// MODAL DE EDIÇÃO DE ITEM
// ===========================================================================

function EditPlanningItemModal({
  task,
  onClose,
  onUpdated,
  onDelete,
  onSubtaskChange,
}: {
  task: Task | null;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
  onDelete?: (task: Task) => void;
  onSubtaskChange?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [description, setDescription] = useState("");
  const [isKeyTask, setIsKeyTask] = useState(false);
  const [objectiveId, setObjectiveId] = useState("");
  const [objectives, setObjectives] = useState<api.Objective[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;

    setTitle(task.title ?? "");
    setDate(task.scheduled_date ?? "");
    setEndDate((task as Task & { end_date?: string | null }).end_date ?? task.scheduled_date ?? "");
    setStartTime(hhmm(task.start_time) ?? "");
    setEndTime(hhmm(task.end_time) ?? "");
    setPriority((task.priority as "low" | "medium" | "high") ?? "medium");
    setLocation(task.location ?? "");
    setRecurrence((task.recurrence as "daily" | "weekly" | "monthly") ?? "daily");
    setDescription(task.description ?? "");
    setIsKeyTask(!!task.is_key_task);
    setObjectiveId(task.objective_id ?? "");
    setFormError(null);

    // Objetivos ativos para o campo "Vincular a objetivo". Mantém o objetivo
    // já vinculado na lista mesmo que ele esteja concluído, para não perder a
    // seleção atual da tarefa.
    api.getObjectives()
      .then((list) =>
        setObjectives(
          list.filter(
            (o) => o.status === "active" || o.id === task.objective_id
          )
        )
      )
      .catch(() => setObjectives([]));
  }, [task]);

  if (!task) return null;

  const isEvent = task.task_type === "event";
  const isTask = task.task_type === "task";
  const isRoutine = task.task_type === "routine";

  const descriptionText = isTask
    ? "Atualize os detalhes dessa tarefa pontual."
    : isEvent
    ? "Atualize data, horário e informações desse evento."
    : "Atualize os detalhes dessa rotina recorrente.";

  async function handleSubmit() {
    if (!title.trim()) {
      setFormError("Dê um nome para o item.");
      return;
    }

    if (isEvent && endDate && date && endDate < date) {
      setFormError("A data final do evento não pode ser anterior à data inicial.");
      return;
    }

    if (startTime && endTime && endTime <= startTime) {
      setFormError("O horário de término precisa ser depois do horário de início.");
      return;
    }

    if (!task) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await api.updateTask(
        task.id,
        {
          title: title.trim(),
          scheduled_date: date || undefined,
          end_date: isEvent ? endDate || date : undefined,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          priority: isTask ? priority : undefined,
          location: isEvent ? location || undefined : undefined,
          recurrence: isRoutine ? recurrence : undefined,
          description: description || undefined,
          is_key_task: isTask ? isKeyTask : undefined,
          objective_id: isTask ? objectiveId : undefined,
        } as any
      );

      await onUpdated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao atualizar item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      closeOnOverlayClick={false}
      dismissDisabled={submitting}
      ariaLabel="Ajustar planejamento"
      maxHeightClassName="max-h-[88vh] lg:max-h-[78dvh]"
      className="overflow-x-hidden lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:right-auto lg:top-1/2 lg:mx-0 lg:w-[min(520px,calc(100vw-2rem))] lg:max-w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[2rem]"
      contentClassName="overflow-x-hidden bg-white text-slate-950 lg:px-6 lg:py-5 dark:bg-[#181421] dark:text-white"
      footerClassName="overflow-x-hidden border-t border-slate-200/80 bg-white/95 lg:px-6 lg:pb-5 lg:pt-4 dark:border-white/10 dark:bg-[#181421]/95"
      surfaceClassName="overflow-x-hidden bg-white text-slate-950 shadow-soft lg:bg-white/98 lg:shadow-[0_30px_110px_rgba(93,64,126,0.18)] dark:bg-[#181421] dark:text-white dark:lg:bg-[#181421]/95 dark:lg:shadow-[0_30px_110px_rgba(0,0,0,0.55)]"
      footer={
        <>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              <>
                Salvar alterações
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-6 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-50"
          >
            Cancelar
          </button>
        </>
      }
    >
      {/* Cabeçalho mantido no conteúdo para preservar o visual. */}
      <div className="mb-4">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
          <Edit3 className="h-3.5 w-3.5" />
          Editar {getDesktopTaskTypeLabel(task).toLowerCase()}
        </div>

        <h2 className="text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.05em] text-primary">
          Ajustar planejamento
        </h2>

        <p className="mt-2 text-xs leading-5 text-muted">
          {descriptionText}
        </p>
      </div>

          <div className="mb-4 rounded-[1.35rem] border border-soft bg-surface-muted p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-soft">
              Tipo de item
            </p>

            <p className="mt-1 text-sm font-semibold text-primary">
              {getDesktopTaskTypeLabel(task)}
            </p>

            <p className="mt-1 text-xs leading-5 text-muted">
              O tipo não pode ser alterado depois da criação. Para trocar de tipo,
              exclua este item e crie um novo.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Nome
              </span>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            {isEvent ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-muted">
                    Data inicial
                  </span>

                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);

                      if (!endDate || endDate < e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-muted">
                    Data final
                  </span>

                  <input
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Data
                </span>

                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Início
                </span>

                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Fim
                </span>

                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                />
              </label>
            </div>

            {isTask && (
              <button
                type="button"
                onClick={() => {
                  const next = !isKeyTask;
                  setIsKeyTask(next);
                  if (next) setPriority("high");
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                  isKeyTask
                    ? "border-amber-300/30 bg-amber-400/[0.08]"
                    : "border-soft bg-surface-muted"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                  isKeyTask
                    ? "border-amber-300/30 bg-amber-400/15 text-amber-700 dark:text-amber-200"
                    : "border-soft bg-surface-muted text-muted"
                }`}>
                  <Star className={`h-4.5 w-4.5 ${isKeyTask ? "fill-amber-300 text-amber-300" : ""}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${isKeyTask ? "text-amber-700 dark:text-amber-100" : "text-secondary"}`}>
                    Tarefa chave do dia
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-muted">
                    A única que, se feita, torna o dia bem-sucedido.
                  </p>
                </div>
                <div className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${
                  isKeyTask ? "border-amber-400 bg-amber-400" : "border-soft bg-transparent"
                }`} />
              </button>
            )}

            {isTask && (
              <label className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">
                    Prioridade
                  </span>
                  {isKeyTask && (
                    <span className="text-[0.68rem] font-semibold text-amber-300/80">
                      Travada em Alta pela tarefa chave
                    </span>
                  )}
                </div>

                <select
                  value={priority}
                  disabled={isKeyTask}
                  onChange={(e) =>
                    setPriority(e.target.value as "low" | "medium" | "high")
                  }
                  className={`min-h-[52px] w-full rounded-2xl border px-4 text-sm text-primary outline-none transition ${
                    isKeyTask
                      ? "cursor-not-allowed border-amber-300/20 bg-amber-400/[0.06] opacity-70"
                      : "border-soft bg-surface-muted focus:border-accent-soft"
                  }`}
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>
            )}

            {isTask && objectives.length > 0 && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Vincular a objetivo
                </span>

                <select
                  value={objectiveId}
                  onChange={(e) => setObjectiveId(e.target.value)}
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none transition focus:border-accent-soft"
                >
                  <option value="">Nenhum</option>
                  {objectives.map((objective) => (
                    <option key={objective.id} value={objective.id}>
                      {objective.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isEvent && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Local ou link
                </span>

                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Google Meet, sala 203..."
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
                />
              </label>
            )}

            {isRoutine && (
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">
                  Repetição
                </span>

                <select
                  value={recurrence}
                  onChange={(e) =>
                    setRecurrence(e.target.value as "daily" | "weekly" | "monthly")
                  }
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
                >
                  <option value="daily">Todos os dias</option>
                  <option value="weekly">Toda semana</option>
                  <option value="monthly">Todo mês</option>
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Observação
              </span>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Adicione detalhes, contexto ou instruções..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-soft bg-surface-muted px-4 py-3 text-sm leading-6 text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            {isTask && (
              <SubtaskEditor taskId={task.id} onSubtaskChange={onSubtaskChange} />
            )}

            {formError && (
              <p className="text-xs font-medium text-rose-300">{formError}</p>
            )}

            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(task)}
                disabled={submitting}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/10 px-6 text-sm font-semibold text-rose-700 transition active:scale-[0.98] disabled:opacity-60 dark:text-rose-100"
              >
                Excluir item
                <Trash2 className="ml-2 h-4 w-4" />
              </button>
            ) : null}
          </div>
    </BottomSheet>
  );
}
// ===========================================================================
// EDITOR DE SUBTAREFAS DO MODAL DE EDIÇÃO
// ===========================================================================

function SubtaskEditor({
  taskId,
  onSubtaskChange,
}: {
  taskId: string;
  onSubtaskChange?: () => void;
}) {
  const [subtasks, setSubtasks] = useState<api.Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getTaskSubtasks(taskId)
      .then(setSubtasks)
      .catch(() => setSubtasks([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  async function handleToggle(s: api.Subtask) {
    try {
      const updated = await api.updateSubtask(s.id, { done: !s.done });
      setSubtasks((prev) =>
        prev.map((subtask) =>
          subtask.id === updated.id ? updated : subtask
        )
      );
      onSubtaskChange?.();
    } catch {
      // Mantém o estado atual em caso de erro.
    }
  }

  async function handleDelete(subtaskId: string) {
    try {
      await api.deleteSubtask(subtaskId);
      setSubtasks((prev) => prev.filter((x) => x.id !== subtaskId));
      onSubtaskChange?.();
    } catch {
      // Mantém o estado atual em caso de erro.
    }
  }

  async function handleAdd() {
    const t = newTitle.trim();
    if (!t) return;
    try {
      const created = await api.createSubtask(taskId, { title: t });
      setSubtasks((prev) => [...prev, created]);
      setNewTitle("");
      setAdding(false);
      onSubtaskChange?.();
    } catch {
      // Mantém o estado atual em caso de erro.
    }
  }

  return (
    <div className="rounded-2xl border border-soft bg-surface-muted p-4">
      <p className="mb-3 text-xs font-semibold text-muted">Subtarefas</p>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {subtasks.length > 0 && (
            <div className="mb-3 space-y-2">
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggle(s)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
                      s.done
                        ? "border-emerald-400 bg-emerald-400 text-[#11111a]"
                        : "border-soft hover:border-accent-soft"
                    }`}
                  >
                    {s.done && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <p className={`flex-1 truncate text-sm ${s.done ? "text-soft line-through" : "text-primary"}`}>
                    {s.title}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted transition active:scale-[0.94]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
                  if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
                }}
                placeholder="Nome da subtarefa…"
                className="min-h-[38px] flex-1 rounded-xl border border-accent-soft bg-surface-muted px-3 text-sm text-primary outline-none placeholder:text-soft"
              />
              <button type="button" onClick={handleAdd} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-white transition active:scale-[0.94]">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewTitle(""); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted transition active:scale-[0.94]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-soft)] py-2 text-xs font-semibold text-muted active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar subtarefa
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// FILA DE TAREFAS SEM DATA
// ===========================================================================

const PRIORITY_META_QUEUE = {
  high: {
    label: "Alta",
    dot: "bg-rose-400",
    badge:
      "border-rose-300/35 bg-rose-500/10 text-rose-700 dark:border-rose-300/25 dark:text-rose-200",
  },
  medium: {
    label: "Média",
    dot: "bg-amber-400",
    badge:
      "border-amber-300/35 bg-amber-500/10 text-amber-700 dark:border-amber-300/25 dark:text-amber-200",
  },
  low: {
    label: "Baixa",
    dot: "bg-sky-400",
    badge:
      "border-sky-300/35 bg-sky-500/10 text-sky-700 dark:border-sky-300/25 dark:text-sky-200",
  },
};

const QUEUE_PAGE_SIZE = 10;

function UndatedTasksSheet({
  tasks,
  onClose,
  onEdit,
  onDelete,
  onToggle,
}: {
  tasks: Task[];
  onClose: () => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onToggle: (t: Task) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tasks : tasks.slice(0, QUEUE_PAGE_SIZE);
  const hidden = tasks.length - QUEUE_PAGE_SIZE;

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      ariaLabel="Tarefas sem data"
      maxHeightClassName="max-h-[82vh] lg:max-h-[78dvh]"
      className="overflow-x-hidden lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:right-auto lg:top-1/2 lg:mx-0 lg:w-[min(520px,calc(100vw-2rem))] lg:max-w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[2rem]"
      contentClassName="overflow-x-hidden bg-white text-slate-950 lg:px-6 lg:py-5 dark:bg-[#181421] dark:text-white"
      surfaceClassName="overflow-x-hidden bg-white text-slate-950 shadow-soft lg:bg-white/98 lg:shadow-[0_30px_110px_rgba(93,64,126,0.18)] dark:bg-[#181421] dark:text-white dark:lg:bg-[#181421]/95 dark:lg:shadow-[0_30px_110px_rgba(0,0,0,0.55)]"
    >
      {/* Cabeçalho da fila mantido no conteúdo para preservar o visual. */}
      <div className="mb-4">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-300/20 dark:text-indigo-100">
          <ListTodo className="h-3.5 w-3.5" />
          Fila · {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
        </div>
        <h2 className="text-[1.35rem] font-semibold leading-tight tracking-[-0.04em] text-primary">
          Tarefas sem data
        </h2>
        <p className="mt-1 text-xs text-muted">
          Ordenadas por prioridade. Toque no lápis para atribuir uma data.
        </p>
      </div>

      {tasks.length === 0 ? (
            <EmptyState icon={ListTodo} title="Fila vazia" />
          ) : (
            <div className="space-y-2">
              {visible.map((task) => {
                const priority = (task.priority as "low" | "medium" | "high") ?? "medium";
                const meta = PRIORITY_META_QUEUE[priority];
                const isDone = task.status === "done";
                const Icon =
                  task.task_type === "task"
                    ? ListTodo
                    : task.task_type === "event"
                    ? CalendarDays
                    : Repeat;

                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3 ${
                      isDone
                        ? "border-emerald-300/20 bg-emerald-400/[0.08]"
                        : "border-soft bg-surface-muted"
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${isDone ? "text-soft line-through" : "text-primary"}`}>
                        {task.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <span className="flex items-center gap-1 text-[0.6rem] text-soft">
                          <Icon className="h-2.5 w-2.5" />
                          {typeLabels[task.task_type]}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggle(task)}
                        className={`flex h-7 w-7 items-center justify-center rounded-xl border border-soft active:scale-[0.94] ${
                          isDone ? "bg-emerald-400/15 text-emerald-600 dark:text-emerald-300" : "bg-surface-muted text-muted"
                        }`}
                        aria-label={isDone ? "Desmarcar" : "Marcar como feita"}
                      >
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(task)}
                        className="flex h-7 w-7 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.94]"
                        aria-label="Editar"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(task)}
                        className="flex h-7 w-7 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.94]"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {!showAll && hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-soft bg-surface-muted py-3 text-xs font-semibold text-secondary transition active:scale-[0.98]"
                >
                  Mostrar mais {hidden} {hidden === 1 ? "tarefa" : "tarefas"}
                </button>
              )}
            </div>
          )}
    </BottomSheet>
  );
}

// ===========================================================================
// CENTRAL DE NOTIFICAÇÕES
// ===========================================================================

type NotificationAction = {
  task_id?: string;
  new_date?: string | null;
  new_start_time?: string | null;
  new_end_time?: string | null;
  reason?: string | null;
};

type NotificationWithAction = api.NotificationData & {
  action?: NotificationAction | null;
};

// Item individual do modal: leitura simples, alteração aplicada ou sugestão acionável.
function NotificationItem({
  notification,
  onRead,
  onAccept,
  onReject,
}: {
  notification: api.NotificationData;
  onRead: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const typedNotification = notification as NotificationWithAction;

  const isUnread = notification.status === "unread";
  const isImprovement = notification.type === "improvement";
  const isChange = notification.type === "change";
  const isAccepted = notification.status === "accepted";
  const isRejected = notification.status === "rejected";
  const isHandled = isAccepted || isRejected;

  const canAct = isImprovement && !isHandled;
  const action = typedNotification.action;

  function handleCardClick() {
    if (isUnread) {
      onRead(notification.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          handleCardClick();
        }
      }}
      className={`rounded-[1.55rem] border p-4 text-left transition active:scale-[0.99] ${
        isImprovement
          ? isHandled
            ? "border-soft bg-surface-muted"
            : "border-accent-soft bg-surface-elevated shadow-card"
          : isUnread
          ? "border-accent-soft bg-surface-elevated shadow-card"
          : "border-soft bg-surface-muted"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
              isImprovement || isChange || isUnread
                ? "border-accent-soft bg-accent-soft text-accent"
                : "border-soft bg-surface-muted text-secondary"
            }`}
          >
            {isImprovement ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${
                  isImprovement || isChange || isUnread
                    ? "border-accent-soft bg-accent-soft text-accent"
                    : "border-soft bg-surface-muted text-secondary"
                }`}
              >
                {isImprovement
                  ? "Sugestão"
                  : isChange
                  ? "Alteração"
                  : "Aviso"}
              </span>

              {isUnread && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </div>

            <p className="text-sm font-semibold leading-5 text-primary">
              {notification.title}
            </p>

            <p className="mt-1 text-xs leading-5 text-muted">
              {notification.body}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 text-[0.65rem] font-medium ${
            isUnread ? "text-accent" : "text-soft"
          }`}
        >
          {formatNotificationTime(notification.created_at)}
        </span>
      </div>

      {isImprovement && action && !isHandled && (
        <div className="mb-3 rounded-[1.15rem] border border-soft bg-surface-muted p-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-soft">
            Ajuste sugerido
          </p>

          {(action.new_date || action.new_start_time || action.new_end_time) && (
            <p className="mt-2 text-xs font-semibold text-secondary">
              {action.new_date && <>Data: {action.new_date}</>}
              {action.new_start_time && (
                <>
                  {action.new_date ? " · " : ""}
                  {action.new_start_time}
                  {action.new_end_time ? ` – ${action.new_end_time}` : ""}
                </>
              )}
            </p>
          )}

          {action.reason && (
            <p className="mt-1 text-xs leading-5 text-muted">
              {action.reason}
            </p>
          )}
        </div>
      )}

      {canAct && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAccept(notification.id);
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-purple-500 px-4 text-xs font-semibold text-white shadow-lg shadow-purple-950/25 active:scale-[0.98]"
          >
            Aceitar
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReject(notification.id);
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-soft bg-surface-muted px-4 text-xs font-semibold text-muted active:scale-[0.98]"
          >
            Recusar
          </button>
        </div>
      )}

      {!isImprovement && isUnread && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRead(notification.id);
          }}
          className="mt-3 inline-flex min-h-8 items-center justify-center rounded-xl border border-accent-soft bg-accent-soft px-3 text-[0.68rem] font-semibold text-accent transition active:scale-[0.98]"
        >
          Marcar como lida
        </button>
      )}

      {isAccepted && (
        <p className="mt-3 text-[0.68rem] font-semibold text-accent">
          Sugestão aceita
        </p>
      )}

      {isRejected && (
        <p className="mt-3 text-[0.68rem] font-semibold text-soft">
          Sugestão recusada
        </p>
      )}
    </div>
  );
}

// Formata datas recentes em linguagem curta para caber no card mobile.
function formatNotificationTime(createdAt: string) {
  const date = new Date(createdAt);
  const now = new Date();

  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `Há ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);

  if (diffH < 24) return `Há ${diffH}h`;

  const diffDays = Math.floor(diffH / 24);

  if (diffDays === 1) return "Ontem";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function NotificationsSheet({
  isOpen,
  onClose,
  onUnreadCountChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}) {
  // Estados do modal: lista local, aba ativa, paginação e carregamento.
  const [notifications, setNotifications] = useState<api.NotificationData[]>([]);
  const [notificationView, setNotificationView] = useState<"unread" | "read">(
    "unread"
  );
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // Listas derivadas para separar rapidamente o que está pendente do que já foi tratado.
  const unreadNotifications = notifications.filter(
    (notification) => notification.status === "unread"
  );

  const readNotifications = notifications.filter(
    (notification) => notification.status !== "unread"
  );

  const filteredNotifications =
    notificationView === "unread" ? unreadNotifications : readNotifications;
  const shouldShowLoadMore =
    hasMore && filteredNotifications.length >= NOTIFICATIONS_PAGE_SIZE;

  const unreadCount = unreadNotifications.length;
  const readCount = readNotifications.length;

  // Carrega uma página extra para descobrir se ainda existe “Ver mais”.
  function loadNotifications({ showLoading = true } = {}) {
    if (showLoading) {
      setLoading(true);
    }

    api
      .getNotifications(NOTIFICATIONS_PAGE_SIZE + 1, 0)
      .then((data) => {
        const visibleNotifications = data.slice(0, NOTIFICATIONS_PAGE_SIZE);

        setNotifications(visibleNotifications);
        setHasMore(data.length > NOTIFICATIONS_PAGE_SIZE);

        const nextUnreadCount = visibleNotifications.filter(
          (notification) => notification.status === "unread"
        ).length;

        onUnreadCountChange(nextUnreadCount);
      })
      .catch(() => null)
      .finally(() => {
        if (showLoading) {
          setLoading(false);
        }
      });
  }

  useEffect(() => {
    if (!isOpen) return;

    loadNotifications({ showLoading: true });

    const handleNotificationsUpdated = () => {
      loadNotifications({ showLoading: false });
    };

    window.addEventListener(
      "axon:notifications-updated",
      handleNotificationsUpdated
    );

    return () => {
      window.removeEventListener(
        "axon:notifications-updated",
        handleNotificationsUpdated
      );
    };
  }, [isOpen]);

  async function loadMore() {
    try {
      const more = await api.getNotifications(
        NOTIFICATIONS_PAGE_SIZE + 1,
        notifications.length
      );

      const visibleMore = more.slice(0, NOTIFICATIONS_PAGE_SIZE);

      setNotifications((prev) => {
        const next = [...prev, ...visibleMore];

        return next;
      });

      setHasMore(more.length > NOTIFICATIONS_PAGE_SIZE);
    } catch {
      // Falha silenciosa para não travar a central de notificações.
    }
  }

  function syncUnreadCount(nextNotifications: api.NotificationData[]) {
    const nextUnreadCount = nextNotifications.filter(
      (notification) => notification.status === "unread"
    ).length;

    onUnreadCountChange(nextUnreadCount);
  }

  // Marca como lida de forma otimista, sem recarregar a central inteira.
  async function handleRead(id: string) {
    const currentNotification = notifications.find(
      (notification) => notification.id === id
    );

    if (!currentNotification || currentNotification.status !== "unread") {
      return;
    }

    const nextNotifications = notifications.map((notification) =>
      notification.id === id
        ? { ...notification, status: "read" as const }
        : notification
    );

    setNotifications(nextNotifications);
    syncUnreadCount(nextNotifications);

    await api.markNotificationRead(id).catch(() => {
      loadNotifications({ showLoading: false });
    });
  }

  // Aceita sugestões de melhoria e move o item para a aba de lidas/tratadas.
  async function handleAccept(id: string) {
    const nextNotifications = notifications.map((notification) =>
      notification.id === id
        ? { ...notification, status: "accepted" as const }
        : notification
    );

    setNotifications(nextNotifications);
    syncUnreadCount(nextNotifications);
    setNotificationView("read");

    await api.acceptNotification(id).catch(() => {
      loadNotifications({ showLoading: false });
    });
  }

  // Recusa sugestões mantendo o histórico visível na aba de lidas/tratadas.
  async function handleReject(id: string) {
    const nextNotifications = notifications.map((notification) =>
      notification.id === id
        ? { ...notification, status: "rejected" as const }
        : notification
    );

    setNotifications(nextNotifications);
    syncUnreadCount(nextNotifications);
    setNotificationView("read");

    await api.rejectNotification(id).catch(() => {
      loadNotifications({ showLoading: false });
    });
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="relative flex h-[82dvh] max-h-[720px] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-soft bg-surface-elevated shadow-soft backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.22),transparent_48%)]" />

        <div className="relative border-b border-soft px-5 pb-4 pt-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
                <Bell className="h-3.5 w-3.5" />
                Central do Axon
              </div>

              <h2 className="text-[1.65rem] font-semibold leading-[1.05] tracking-[-0.055em] text-primary">
                Notificações
              </h2>

              <p className="mt-2 text-xs leading-5 text-muted">
                Avisos importantes, lembretes inteligentes e sugestões para
                melhorar seu planejamento.
              </p>
            </div>

            <button
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted active:scale-[0.96]"
              aria-label="Fechar notificações"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex rounded-2xl border border-soft bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => setNotificationView("unread")}
              className={`min-h-10 flex-1 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                notificationView === "unread"
                  ? "bg-purple-500 text-white shadow-lg shadow-purple-950/25"
                  : "text-muted"
              }`}
            >
              Não lidas
              {unreadCount > 0 && (
                <span className="ml-1 text-[0.65rem] opacity-75">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setNotificationView("read")}
              className={`min-h-10 flex-1 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                notificationView === "read"
                  ? "bg-purple-500 text-white shadow-lg shadow-purple-950/25"
                  : "text-muted"
              }`}
            >
              Lidas
              {readCount > 0 && (
                <span className="ml-1 text-[0.65rem] opacity-75">
                  {readCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <ScrollArea
          className="min-h-0 flex-1 overflow-hidden"
          contentClassName="relative px-5 py-4"
        >
          {loading && notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">
              Carregando...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={
                notificationView === "unread"
                  ? "Nenhuma notificação não lida"
                  : "Nenhuma notificação lida"
              }
              description={
                notificationView === "unread"
                  ? "Quando houver novos avisos ou sugestões, eles aparecerão aqui."
                  : "Notificações já lidas, aceitas ou recusadas aparecerão nesta aba."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={handleRead}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />
              ))}

              {shouldShowLoadMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  className="mt-1 inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-4 text-xs font-semibold text-muted active:scale-[0.98]"
                >
                  Ver mais
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
