import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  Link2,

  Moon,
  Palette,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Tags,
  Trash2,
  Volume2,
} from "lucide-react";
import TagEditorSheet from "../components/settings/TagEditorSheet";
import TaskTagsSheet from "../components/settings/TaskTagsSheet";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import VoiceLab from "../components/settings/VoiceLab";
import { results, type ChronotypeResultKey } from "../data/results";
import * as api from "../lib/api";
import { openAuthUrl } from "../lib/nativeAuth";
import type { ProfileData } from "../lib/api";
type SettingsSectionKey = "organization" | "appearance" | "voice" | "integrations";
type ScheduleType = "flexible" | "fixed";
type CalendarKind = "task" | "event" | "routine";
type CalendarColor = "purple" | "lilac" | "mint" | "cyan" | "amber" | "rose" | "blue";
type CalendarColors = Record<CalendarKind, CalendarColor>;
type WeekDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
type FixedRoutineEntry = {
  id: string;
  activity: string;
  days: WeekDayKey[];
  startTime: string;
  endTime: string;
};
const CALENDAR_STORAGE_KEY = "axon:planning:desktop-calendar-colors";
const CALENDAR_UPDATED_EVENT = "axon:planning-desktop-calendar-colors-updated";
const SETTINGS_SECTIONS: Array<{
  key: SettingsSectionKey;
  title: string;
  description: string;
  icon: ElementType;
}> = [
  { key: "organization", title: "Organização", description: "Rotina, categorias e tags", icon: CalendarClock },
  { key: "appearance", title: "Aparência", description: "Tema e cores do calendário", icon: Palette },
  { key: "voice", title: "Voz", description: "Experiência falada do Axon", icon: Volume2 },
  { key: "integrations", title: "Integrações", description: "Serviços conectados ao Axon", icon: Link2 },
];
const COLOR_OPTIONS: Array<{ key: CalendarColor; label: string; color: string }> = [
  { key: "purple", label: "Roxo AXON", color: "#a855f7" },
  { key: "lilac", label: "Lilás", color: "#c084fc" },
  { key: "mint", label: "Menta", color: "#14b8a6" },
  { key: "cyan", label: "Ciano", color: "#0891b2" },
  { key: "amber", label: "Amarelo", color: "#f59e0b" },
  { key: "rose", label: "Rosa", color: "#e11d48" },
  { key: "blue", label: "Azul", color: "#2563eb" },
];
const DEFAULT_CALENDAR_COLORS: CalendarColors = {
  task: "purple",
  event: "blue",
  routine: "mint",
};
const WEEK_DAYS: Array<{ key: WeekDayKey; label: string; fullLabel: string }> = [
  { key: "seg", label: "S", fullLabel: "Segunda" },
  { key: "ter", label: "T", fullLabel: "Terça" },
  { key: "qua", label: "Q", fullLabel: "Quarta" },
  { key: "qui", label: "Q", fullLabel: "Quinta" },
  { key: "sex", label: "S", fullLabel: "Sexta" },
  { key: "sab", label: "S", fullLabel: "Sábado" },
  { key: "dom", label: "D", fullLabel: "Domingo" },
];
function createFixedRoutineEntry(): FixedRoutineEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    activity: "",
    days: [],
    startTime: "",
    endTime: "",
  };
}
const CHRONOTYPE_TO_KEY: Record<string, ChronotypeResultKey> = {
  Matutino: "Matutino",
  Vespertino: "Vespertino",
  Noturno: "Noturno",
  Misto: "Misto",
  Bimodal: "Bimodal",
  morning: "Matutino",
  evening: "Vespertino",
  night: "Noturno",
  intermediate: "Misto",
};
function loadCalendarColors(): CalendarColors {
  try {
    const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
    return raw
      ? { ...DEFAULT_CALENDAR_COLORS, ...JSON.parse(raw) }
      : DEFAULT_CALENDAR_COLORS;
  } catch {
    return DEFAULT_CALENDAR_COLORS;
  }
}
export default function Settings() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("organization");

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [calendarColors, setCalendarColors] = useState<CalendarColors>(loadCalendarColors);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!api.isLoggedIn()) {
      navigate("/login");
      return;
    }
    api
      .getProfile()
      .then((data) => {
        setProfile(data);
        setGoogleConnected(data.google_connected);
      })
      .catch(() => setProfile(null));
  }, [navigate]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const resultKey = useMemo<ChronotypeResultKey>(() => {
    if (profile?.chronotype && CHRONOTYPE_TO_KEY[profile.chronotype]) {
      return CHRONOTYPE_TO_KEY[profile.chronotype];
    }
    return "Misto";
  }, [profile?.chronotype]);
  const result = results[resultKey];
  const scheduleType: ScheduleType = profile?.schedule_type === "fixed" ? "fixed" : "flexible";
  async function updateSchedule(next: ScheduleType) {
    setProfile((current) =>
      current ? ({ ...current, schedule_type: next } as ProfileData) : current
    );
    try {
      const payload = { schedule_type: next } as unknown as Parameters<typeof api.updateProfile>[0];
      const updated = await api.updateProfile(payload);
      setProfile((current) =>
        ({
          ...(current ?? {}),
          ...updated,
          schedule_type: next,
        }) as ProfileData
      );
      setToast("Estilo de rotina atualizado");
    } catch {
      setToast("A alteração será sincronizada quando possível");
    }
  }
  function updateCalendarColor(kind: CalendarKind, color: CalendarColor) {
    const next = { ...calendarColors, [kind]: color };
    setCalendarColors(next);
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CALENDAR_UPDATED_EVENT));
    setToast("Cores do calendário atualizadas");
  }
  async function connectGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const { auth_url } = await api.connectGoogleCalendar();
      await openAuthUrl(auth_url, { markPlatform: false });
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : "Não foi possível conectar o Google Agenda.");
    } finally {
      setGoogleBusy(false);
    }
  }
  async function disconnectGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const updated = await api.disconnectGoogleCalendar();
      setGoogleConnected(updated.google_connected);
      setToast("Google Agenda desconectado");
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : "Não foi possível desconectar o Google Agenda.");
    } finally {
      setGoogleBusy(false);
    }
  }
  const sections: Record<SettingsSectionKey, ReactNode> = {
    organization: (
      <OrganizationSection
        scheduleType={scheduleType}
        onScheduleChange={updateSchedule}
      />
    ),
    appearance: (
      <AppearanceSection
        calendarColors={calendarColors}
        onCalendarColorChange={updateCalendarColor}
      />
    ),
    voice: <VoiceSection />,
    integrations: (
      <IntegrationsSection
        connected={googleConnected}
        busy={googleBusy}
        error={googleError}
        onConnect={connectGoogle}
        onDisconnect={disconnectGoogle}
      />
    ),
  };
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fa] text-slate-950 dark:bg-[#11111a] dark:text-white">
      <style>{`
        .settings-inline-compact button {
          min-height: 2.5rem !important;
          border-radius: 0.75rem !important;
          padding: 0.5rem 0.75rem !important;
          font-size: 0.75rem !important;
        }
        .settings-inline-compact [class*="p-4"] {
          padding: 0.75rem !important;
        }
        .settings-inline-compact [class*="gap-4"] {
          gap: 0.5rem !important;
        }
        .settings-inline-compact [class*="text-lg"] {
          font-size: 0.875rem !important;
          line-height: 1.25rem !important;
        }
      `}</style>
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[430px] px-4 pb-8 pt-5 lg:hidden">
        <TopBar onBack={() => navigate("/profile")} />
        <div className="mb-5 px-1">
          <h1 className="text-[1.75rem] font-black tracking-[-0.05em]">Configurações</h1>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-white/45">
            Ajuste a organização e a experiência do Axon.
          </p>
        </div>
        <div className="grid gap-4">
          {SETTINGS_SECTIONS.map((section) => (
            <div key={section.key}>{sections[section.key]}</div>
          ))}
        </div>
      </div>
      <div className="relative z-10 hidden min-h-screen p-3 lg:block">
        <div className="mx-auto grid h-[calc(100vh-1.5rem)] max-w-[1500px] grid-cols-[286px_minmax(0,1fr)] gap-3">
          <aside className="flex min-h-0 flex-col rounded-[1.5rem] border border-slate-200/90 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-card">
            <button type="button" onClick={() => navigate("/profile")} className="mb-4 flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200/90 px-3 text-sm font-bold text-slate-600 transition active:scale-[0.98] dark:border-white/10 dark:text-white/60">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao perfil
            </button>
            <nav className="space-y-2">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.key;
                return (
                  <button key={section.key} type="button" onClick={() => setActiveSection(section.key)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98] ${active ? "border-[#6d28d9]/20 bg-[#6d28d9]/[0.08] text-[#6d28d9] dark:bg-[#6d28d9]/20 dark:text-purple-200" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-white/45 dark:hover:border-white/10 dark:hover:bg-white/[0.04]"}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/[0.06]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black">{section.title}</span>
                      <span className="mt-0.5 block truncate text-[0.65rem] opacity-65">{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
          <section className="flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-card">
            <header className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
              <div>
                <h1 className="text-2xl font-black tracking-[-0.05em]">{SETTINGS_SECTIONS.find((item) => item.key === activeSection)?.title}</h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-white/40">{SETTINGS_SECTIONS.find((item) => item.key === activeSection)?.description}</p>
              </div>
              
            </header>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-[900px]">{sections[activeSection]}</div>
            </div>
          </section>
        </div>
      </div>
      
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[130] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-lg dark:border-white/10 dark:bg-[#1a1924] dark:text-white/75">
            <Check className="h-4 w-4 text-[#6d28d9]" />
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="mb-5 flex items-center justify-between">
      <IconButton label="Voltar ao perfil" onClick={onBack}><ArrowLeft className="h-5 w-5" /></IconButton>
      
    </header>
  );
}
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-[0_8px_22px_rgba(15,23,42,0.07)] transition active:scale-[0.96] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65 dark:shadow-card" aria-label={label} title={label}>
      {children}
    </button>
  );
}
function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200/90 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-card lg:p-5">
      <h2 className="text-lg font-black tracking-[-0.04em]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/42">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
function OrganizationSection({
  scheduleType,
  onScheduleChange,
}: {
  scheduleType: ScheduleType;
  onScheduleChange: (value: ScheduleType) => void;
}) {
  const [fixedRoutines, setFixedRoutines] = useState<FixedRoutineEntry[]>([
    createFixedRoutineEntry(),
  ]);
  function updateFixedRoutine(
    id: string,
    field: "activity" | "startTime" | "endTime",
    value: string,
  ) {
    setFixedRoutines((current) =>
      current.map((routine) =>
        routine.id === id ? { ...routine, [field]: value } : routine,
      ),
    );
  }
  function toggleRoutineDay(id: string, day: WeekDayKey) {
    setFixedRoutines((current) =>
      current.map((routine) =>
        routine.id === id
          ? {
              ...routine,
              days: routine.days.includes(day)
                ? routine.days.filter((currentDay) => currentDay !== day)
                : [...routine.days, day],
            }
          : routine,
      ),
    );
  }
  const routineControl = (
    <div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-black/20">
        {(["flexible", "fixed"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onScheduleChange(value)}
            className={`min-h-10 rounded-xl text-xs font-black transition ${
              scheduleType === value
                ? "bg-[#6d28d9] text-white shadow-sm"
                : "text-slate-500 dark:text-white/45"
            }`}
          >
            {value === "flexible" ? "Flexível" : "Horários fixos"}
          </button>
        ))}
      </div>
      {scheduleType === "fixed" && (
        <div className="mt-4 grid gap-3">
          <p className="text-xs leading-5 text-slate-500 dark:text-white/45">
            Cadastre cada compromisso fixo com seus dias e horários.
          </p>
          {fixedRoutines.map((routine, index) => (
            <FixedRoutineEditor
              key={routine.id}
              routine={routine}
              index={index}
              canRemove={fixedRoutines.length > 1}
              onRemove={() =>
                setFixedRoutines((current) =>
                  current.filter((item) => item.id !== routine.id),
                )
              }
              onChange={(field, value) =>
                updateFixedRoutine(routine.id, field, value)
              }
              onToggleDay={(day) => toggleRoutineDay(routine.id, day)}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              setFixedRoutines((current) => [
                ...current,
                createFixedRoutineEntry(),
              ])
            }
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-dashed border-[#6d28d9]/30 bg-[#6d28d9]/[0.05] px-4 text-xs font-black text-[#6d28d9] transition active:scale-[0.98] dark:bg-[#6d28d9]/10 dark:text-purple-300"
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar outra rotina
          </button>
        </div>
      )}
    </div>
  );
  return (
    <>
      <div className="grid gap-2 rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] lg:hidden">
        <MobileExpandableRow
          icon={CalendarClock}
          title="Estilo de rotina"
          description="Defina se seus horários são flexíveis ou fixos."
        >
          {routineControl}
        </MobileExpandableRow>
        <MobileExpandableRow icon={Tags} title="Categorias" description="Personalize as opções usadas no seu registro diário.">
          <TagEditorSheet inline isOpen onClose={() => undefined} />
        </MobileExpandableRow>
        <MobileExpandableRow icon={SettingsIcon} title="Tags de tarefas" description="Crie marcadores para agrupar tarefas parecidas.">
          <TaskTagsSheet inline isOpen onClose={() => undefined} />
        </MobileExpandableRow>
      </div>
      <div className="hidden lg:block">
        <SettingsCard
          title="Organização"
          description="Defina o estilo da rotina, as categorias e as tags usadas pelo Axon."
        >
          <div className="space-y-5">
            <div>
              <SettingTitle icon={CalendarClock} title="Estilo de rotina" />
              <div className="mt-3">{routineControl}</div>
            </div>
            <div className="grid gap-2 border-t border-slate-200 pt-5 dark:border-white/10">
              <MobileExpandableRow icon={Tags} title="Categorias" description="Personalize as opções usadas no seu registro diário.">
                <TagEditorSheet inline isOpen onClose={() => undefined} />
              </MobileExpandableRow>
              <MobileExpandableRow icon={SettingsIcon} title="Tags de tarefas" description="Crie marcadores para agrupar tarefas parecidas.">
                <TaskTagsSheet inline isOpen onClose={() => undefined} />
              </MobileExpandableRow>
            </div>
          </div>
        </SettingsCard>
      </div>
    </>
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
  routine: FixedRoutineEntry;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (field: "activity" | "startTime" | "endTime", value: string) => void;
  onToggleDay: (day: WeekDayKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-white/35">
          Rotina {index + 1}
        </p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition active:scale-[0.94] dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300"
            aria-label="Remover rotina"
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
          value={routine.startTime}
          onChange={(value) => onChange("startTime", value)}
        />
        <ScheduleInput
          label="Fim"
          type="time"
          value={routine.endTime}
          onChange={(value) => onChange("endTime", value)}
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
function AppearanceSection({
  calendarColors,
  onCalendarColorChange,
}: {
  calendarColors: CalendarColors;
  onCalendarColorChange: (kind: CalendarKind, color: CalendarColor) => void;
}) {
  const calendarColorControl = (
    <div className="space-y-3">
      {([["task", "Tarefas"], ["event", "Eventos"], ["routine", "Rotinas"]] as const).map(
        ([kind, label]) => (
          <div key={kind} className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600 dark:text-white/60 sm:text-sm">
              {label}
            </span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onCalendarColorChange(kind, option.key)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition active:scale-[0.92] ${
                    calendarColors[kind] === option.key
                      ? "border-slate-900 dark:border-white"
                      : "border-transparent"
                  }`}
                  aria-label={`${label}: ${option.label}`}
                  title={option.label}
                >
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: option.color }} />
                </button>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
  return (
    <>
      <div className="grid gap-2 rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] lg:hidden">
        <MobileExpandableRow icon={Palette} title="Tema do aplicativo" description="Escolha entre a aparência clara e escura.">
          <div className="settings-inline-compact">
            <ThemeToggle showHeader={false} />
          </div>
        </MobileExpandableRow>
        <MobileExpandableRow icon={CalendarDays} title="Cores do calendário" description="Diferencie tarefas, eventos e rotinas por cor.">
          {calendarColorControl}
        </MobileExpandableRow>
      </div>
      <div className="hidden gap-4 lg:grid">
        <SettingsCard title="Tema do aplicativo" description="Escolha o tema visual usado pelo Axon.">
          <ThemeToggle showHeader={false} />
        </SettingsCard>
        <SettingsCard title="Cores do calendário" description="Personalize a identificação visual de tarefas, eventos e rotinas.">
          {calendarColorControl}
        </SettingsCard>
      </div>
    </>
  );
}
function VoiceSection() {
  return (
    <>
      <div className="rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] lg:hidden">
        <MobileExpandableRow icon={Volume2} title="Voz do Axon" description="Configure leitura, reprodução e experiência falada.">
          <div className="settings-inline-compact">
            <VoiceLab />
          </div>
        </MobileExpandableRow>
      </div>
      <div className="hidden lg:block">
        <SettingsCard title="Voz do Axon" description="Configure a experiência falada e os recursos de leitura.">
          <VoiceLab />
        </SettingsCard>
      </div>
    </>
  );
}
function IntegrationsSection({ connected, busy, error, onConnect, onDisconnect }: { connected: boolean | null; busy: boolean; error: string | null; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <SettingsCard title="Integrações" description="Conecte serviços externos ao planejamento do Axon.">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#6d28d9]/10 text-[#6d28d9]"><Link2 className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">Google Agenda</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-white/42">{connected === null ? "Verificando conexão" : connected ? "Conta conectada" : "Nenhuma conta conectada"}</p>
        </div>
        <button type="button" disabled={busy || connected === null} onClick={connected ? onDisconnect : onConnect} className={`min-h-10 rounded-xl px-3 text-xs font-black transition active:scale-[0.96] disabled:opacity-50 ${connected ? "border border-slate-200 text-slate-600 dark:border-white/10 dark:text-white/60" : "bg-[#6d28d9] text-white"}`}>
          {busy ? "Aguarde" : connected ? "Desconectar" : "Conectar"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    </SettingsCard>
  );
}
function SettingTitle({ icon: Icon, title }: { icon: ElementType; title: string }) {
  return <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#6d28d9]" /><p className="text-sm font-black">{title}</p></div>;
}
function MobileExpandableRow({ icon: Icon, title, description, children }: { icon: ElementType; title: string; description: string; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 shrink-0 text-[#6d28d9]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{title}</span>
          <span className="mt-0.5 block text-[0.7rem] leading-4 text-slate-500 dark:text-white/40">{description}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mx-2 mb-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 dark:border-white/10 dark:bg-black/15">
        {children}
      </div>
    </details>
  );
}
