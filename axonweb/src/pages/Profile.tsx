import {

  useEffect,

  useMemo,

  useRef,

  useState,

  type ChangeEvent,

  type ElementType,

  type ReactNode,

  type RefObject,

} from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";

import {

  Bell,
  Brain,

  Briefcase,

  CalendarClock,

  CalendarDays,

  Camera,

  Check,

  ChevronDown,

  ChevronRight,

  Edit3,

  FileText,

  ListTodo,

  Loader2,

  Mail,

  Menu,

  MessageCircle,

  Plus,

  RefreshCcw,

  Repeat,

  Sparkles,

  Tag,

  Tags,

  Trash2,

  User,

  Download,
  Link2,
  LogOut,
  Moon,
  Palette,
  Settings as SettingsIcon,
  Shield,
  Volume2,
  Workflow,

  X,

} from "lucide-react";



import { results, type ChronotypeResultKey } from "../data/results";

import Sidebar from "../components/layout/Sidebar";

import TagEditorSheet from "../components/settings/TagEditorSheet";

import TaskTagsSheet from "../components/settings/TaskTagsSheet";

import * as api from "../lib/api";
import * as push from "../lib/push";
import { openAuthUrl } from "../lib/nativeAuth";

import type { ProfileData } from "../lib/api";

import AppBackground from "../components/layout/AppBackground";

import PageHeader from "../components/layout/PageHeader";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import VoiceLab from "../components/settings/VoiceLab";



// ===========================================================================

// MAPEAMENTOS DO PERFIL

// ===========================================================================



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



const validKeys: ChronotypeResultKey[] = [

  "Matutino",

  "Vespertino",

  "Noturno",

  "Misto",

  "Bimodal",

];



type ScheduleType = "flexible" | "fixed";



const SCHEDULE_TYPE_LABEL: Record<string, string> = {

  flexible: "Flexível",

  fixed: "Fixo",

};



// ===========================================================================

// PÁGINA DE PERFIL

// ===========================================================================




type ProfileSectionKey =
  | "overview"
  | "personal"
  | "rhythm"
  | "memories"
  | "notifications"
  | "appearance"
  | "integrations"
  | "account"
  | "privacy";

type DesktopCalendarKind = "task" | "event" | "routine";
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
}[] = [
  {
    key: "purple",
    label: "Roxo AXON",
    hex: "#a855f7",
    iconColor: "#7e22ce",
    iconBackground: "rgba(168,85,247,0.16)",
    iconBorder: "rgba(168,85,247,0.34)",
  },
  {
    key: "lilac",
    label: "Lilás",
    hex: "#c084fc",
    iconColor: "#9333ea",
    iconBackground: "rgba(192,132,252,0.18)",
    iconBorder: "rgba(192,132,252,0.4)",
  },
  {
    key: "mint",
    label: "Menta",
    hex: "#14b8a6",
    iconColor: "#0f766e",
    iconBackground: "rgba(20,184,166,0.16)",
    iconBorder: "rgba(20,184,166,0.36)",
  },
  {
    key: "cyan",
    label: "Ciano",
    hex: "#0891b2",
    iconColor: "#0e7490",
    iconBackground: "rgba(8,145,178,0.15)",
    iconBorder: "rgba(8,145,178,0.34)",
  },
  {
    key: "amber",
    label: "Amarelo",
    hex: "#f59e0b",
    iconColor: "#b45309",
    iconBackground: "rgba(245,158,11,0.16)",
    iconBorder: "rgba(245,158,11,0.36)",
  },
  {
    key: "rose",
    label: "Rosa",
    hex: "#e11d48",
    iconColor: "#be123c",
    iconBackground: "rgba(225,29,72,0.12)",
    iconBorder: "rgba(225,29,72,0.3)",
  },
  {
    key: "blue",
    label: "Azul",
    hex: "#2563eb",
    iconColor: "#1d4ed8",
    iconBackground: "rgba(37,99,235,0.12)",
    iconBorder: "rgba(37,99,235,0.32)",
  },
];

type SettingRowProps = {
  icon: ElementType;
  title: string;
  description: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
};

type ToggleRowProps = {
  icon: ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

const PROFILE_SECTION_OPTIONS: Array<{
  key: ProfileSectionKey;
  label: string;
  description: string;
  icon: ElementType;
}> = [
  {
    key: "overview",
    label: "Visão geral",
    description: "Resumo do perfil",
    icon: User,
  },
  {
    key: "personal",
    label: "Perfil pessoal",
    description: "Avatar, nome e e-mail",
    icon: User,
  },
  {
    key: "rhythm",
    label: "Ritmo e preferências",
    description: "Cronotipo, rotina e tags",
    icon: Brain,
  },
  {
    key: "memories",
    label: "Memórias do Axon",
    description: "Contexto salvo e relatórios",
    icon: Sparkles,
  },
  {
    key: "notifications",
    label: "Notificações",
    description: "Alertas e push",
    icon: Bell,
  },
  {
    key: "appearance",
    label: "Aparência e voz",
    description: "Tema visual e leitura",
    icon: Palette,
  },
  {
    key: "integrations",
    label: "Integrações",
    description: "Google Agenda",
    icon: Link2,
  },
  {
    key: "account",
    label: "Conta e segurança",
    description: "E-mail, senha e acesso",
    icon: Shield,
  },
  {
    key: "privacy",
    label: "Dados e privacidade",
    description: "Exportação e exclusão",
    icon: Download,
  },
];

function normalizeProfileSection(value: string | null): ProfileSectionKey {
  const key = value as ProfileSectionKey | null;
  return PROFILE_SECTION_OPTIONS.some((section) => section.key === key)
    ? (key as ProfileSectionKey)
    : "overview";
}

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [taskTagsOpen, setTaskTagsOpen] = useState(false);
  const [calendarColorsOpen, setCalendarColorsOpen] = useState(false);
  const [calendarColors, setCalendarColors] =
    useState<DesktopCalendarColorPrefs>(() => getDesktopCalendarColorPrefs());

  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteFirstModal, setShowDeleteFirstModal] = useState(false);
  const [showDeleteFinalModal, setShowDeleteFinalModal] = useState(false);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [showDisconnectGoogleModal, setShowDisconnectGoogleModal] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const [silentMode, setSilentMode] = useState(true);
  const [dailyPlanningNotifications, setDailyPlanningNotifications] =
    useState(true);
  const [dailyReviewNotifications, setDailyReviewNotifications] =
    useState(true);
  const [weeklyReviewNotifications, setWeeklyReviewNotifications] =
    useState(true);
  const [axonSuggestionNotifications, setAxonSuggestionNotifications] =
    useState(true);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBlocked, setPushBlocked] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDiag, setPushDiag] = useState("");

  const activeSection = normalizeProfileSection(searchParams.get("section"));

  useEffect(() => {
    if (!api.isLoggedIn()) {
      navigate("/login");
      return;
    }

    api
      .getProfile()
      .then((loadedProfile) => {
        setProfile(loadedProfile);
        setGoogleConnected(loadedProfile.google_connected);
      })
      .catch(() => setProfile(null));
  }, [navigate]);

  useEffect(() => {
    void push.getStatus().then((status) => {
      setPushSupported(status.supported);
      setPushEnabled(status.registered);
      setPushBlocked(status.permission === "denied");
      setPushDiag(status.diagnostic ?? "");
    });
  }, []);

  useEffect(() => {
    function syncCalendarColors() {
      setCalendarColors(getDesktopCalendarColorPrefs());
    }

    window.addEventListener(
      DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
      syncCalendarColors
    );

    return () => {
      window.removeEventListener(
        DESKTOP_CALENDAR_COLORS_UPDATED_EVENT,
        syncCalendarColors
      );
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const resultKey = useMemo<ChronotypeResultKey>(() => {
    const fromBackend = profile?.chronotype
      ? CHRONOTYPE_TO_KEY[profile.chronotype]
      : undefined;

    if (fromBackend) return fromBackend;

    const stored = localStorage.getItem("axon_chronotype");

    if (stored && validKeys.includes(stored as ChronotypeResultKey)) {
      return stored as ChronotypeResultKey;
    }

    return "Misto";
  }, [profile]);

  const result = results[resultKey];
  const hasChronotype = Boolean(profile?.chronotype);
  const userName = profile?.name || "Usuário";
  const userEmail = profile?.email || "";
  const scheduleType: ScheduleType =
    profile?.schedule_type === "fixed" || profile?.schedule_type === "flexible"
      ? profile.schedule_type
      : "flexible";
  const scheduleLabel = SCHEDULE_TYPE_LABEL[scheduleType];
  const activeOption = PROFILE_SECTION_OPTIONS.find(
    (section) => section.key === activeSection
  );

  function setActiveSection(section: ProfileSectionKey) {
    setSearchParams({ section });
  }

  function openResult() {
    if (!hasChronotype) {
      navigate("/questionnaire-intro");
      return;
    }

    navigate(`/result-report?chronotype=${resultKey}`);
  }

  async function handleScheduleTypeSave(nextScheduleType: ScheduleType) {
    setProfile((prev) =>
      prev ? ({ ...prev, schedule_type: nextScheduleType } as ProfileData) : prev
    );

    setScheduleModalOpen(false);

    try {
      const payload = {
        schedule_type: nextScheduleType,
      } as unknown as Parameters<typeof api.updateProfile>[0];

      const updated = await api.updateProfile(payload);
      setProfile(updated);
    } catch {
      // Mantém a alteração visual até o backend receber esse campo.
    }
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }

  function handleSaveCalendarColors(nextColors: DesktopCalendarColorPrefs) {
    const normalized = normalizeDesktopCalendarColorPrefs(nextColors);
    saveDesktopCalendarColorPrefs(normalized);
    setCalendarColors(normalized);
    window.dispatchEvent(new Event(DESKTOP_CALENDAR_COLORS_UPDATED_EVENT));
    setCalendarColorsOpen(false);
    showToast("Cores do calendário atualizadas");
  }

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);

    try {
      if (pushEnabled) {
        await push.disable();
        setPushEnabled(false);
      } else {
        const ok = await push.requestPermissionAndRegister();
        setPushEnabled(ok);
        const nextStatus = await push.getStatus();
        setPushDiag(nextStatus.diagnostic ?? "");
        if (!ok) {
          const status = await push.getStatus();
          setPushBlocked(status.permission === "denied");
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleConnectGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);

    try {
      const { auth_url } = await api.connectGoogleCalendar();
      await openAuthUrl(auth_url, { markPlatform: false });
    } catch (error) {
      setGoogleError(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a conexão com o Google Agenda."
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleDisconnectGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);

    try {
      const updated = await api.disconnectGoogleCalendar();
      setGoogleConnected(updated.google_connected);
      setShowDisconnectGoogleModal(false);
      showToast("Google Agenda desconectado");
    } catch (error) {
      setShowDisconnectGoogleModal(false);
      setGoogleError(
        error instanceof Error
          ? error.message
          : "Não foi possível desconectar o Google Agenda."
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  function handleLogout() {
    api.logout();
    setShowLogoutModal(false);
    navigate("/");
  }

  async function handleDeleteAccount() {
    try {
      await api.deleteAccount();
      api.logout();
      setShowDeleteFinalModal(false);
      navigate("/");
    } catch (error) {
      console.error("Erro ao excluir conta:", error);
    }
  }

  function renderSection() {
    switch (activeSection) {
      case "personal":
        return (
          <PersonalProfileSettings
            userName={userName}
            userEmail={userEmail}
            avatarUrl={profile?.avatar_url}
            onEditProfile={() => setIsEditOpen(true)}
            onOpenAccount={() => setAccountModalOpen(true)}
          />
        );
      case "rhythm":
        return (
          <div className="grid min-w-0 gap-3">
            <ProductiveProfileCard
              hasChronotype={hasChronotype}
              result={result}
              resultKey={resultKey}
              onOpenResult={openResult}
              onQuestionnaire={() => navigate("/questionnaire-intro")}
            />
            <UnifiedSettingsPanel
              title="Preferências do Axon"
              description="Ajustes que ajudam o Axon a organizar sua rotina de forma mais pessoal."
            >
              <PreferencesCard
                scheduleLabel={scheduleLabel}
                onEditSchedule={() => setScheduleModalOpen(true)}
                calendarColors={calendarColors}
                onEditCalendarColors={() => setCalendarColorsOpen(true)}
                onEditTags={() => setTagEditorOpen(true)}
                onEditTaskTags={() => setTaskTagsOpen(true)}
              />
            </UnifiedSettingsPanel>
          </div>
        );
      case "memories":
        return (
          <div className="grid min-w-0 gap-3">
            <AxonMemories />
            <ReportsHistory />
          </div>
        );
      case "notifications":
        return (
          <NotificationsSettingsSection
            pushSupported={pushSupported}
            pushEnabled={pushEnabled}
            pushBlocked={pushBlocked}
            pushBusy={pushBusy}
            pushDiag={pushDiag}
            silentMode={silentMode}
            dailyPlanningEnabled={dailyPlanningNotifications}
            dailyReviewEnabled={dailyReviewNotifications}
            weeklyReviewEnabled={weeklyReviewNotifications}
            axonSuggestionEnabled={axonSuggestionNotifications}
            onTogglePush={handleTogglePush}
            onToggleSilent={() => setSilentMode((prev) => !prev)}
            onToggleDailyPlanning={() =>
              setDailyPlanningNotifications((prev) => !prev)
            }
            onToggleDailyReview={() =>
              setDailyReviewNotifications((prev) => !prev)
            }
            onToggleWeeklyReview={() =>
              setWeeklyReviewNotifications((prev) => !prev)
            }
            onToggleAxonSuggestion={() =>
              setAxonSuggestionNotifications((prev) => !prev)
            }
            onOpenAdvanced={() => setNotifSettingsOpen(true)}
          />
        );
      case "appearance":
        return (
          <AppearanceVoiceSection
            onOpenAppearance={() => setAppearanceModalOpen(true)}
            onOpenVoice={() => setVoiceModalOpen(true)}
          />
        );
      case "integrations":
        return (
          <IntegrationsSettingsSection
            googleConnected={googleConnected}
            googleBusy={googleBusy}
            googleError={googleError}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={() => setShowDisconnectGoogleModal(true)}
          />
        );
      case "account":
        return (
          <AccountSecuritySection
            userEmail={userEmail}
            onOpenAccount={() => setAccountModalOpen(true)}
            onLogout={() => setShowLogoutModal(true)}
          />
        );
      case "privacy":
        return (
          <DataPrivacySection
            userEmail={userEmail}
            onDeleteAccount={() => setShowDeleteFirstModal(true)}
          />
        );
      case "overview":
      default:
        return (
          <OverviewProfileSection
            hasChronotype={hasChronotype}
            result={result}
            resultKey={resultKey}
            scheduleLabel={scheduleLabel}
            googleConnected={googleConnected}
            pushEnabled={pushEnabled}
            onOpenResult={openResult}
            onQuestionnaire={() => navigate("/questionnaire-intro")}
            onEditSchedule={() => setScheduleModalOpen(true)}
            onOpenMemories={() => setActiveSection("memories")}
            onOpenNotifications={() => setActiveSection("notifications")}
          />
        );
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-app text-primary">
      <AppBackground />

      <section className="relative z-10 hidden min-h-screen w-full px-3 py-2 lg:block">
        <div className="mx-auto grid h-[calc(100vh-1rem)] max-w-[1500px] grid-cols-[286px_minmax(0,1fr)] gap-2.5">
          <ProfileAccountSidebar
            userName={userName}
            userEmail={userEmail}
            avatarUrl={profile?.avatar_url}
            activeSection={activeSection}
            onChangeSection={setActiveSection}
          />

          <section className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white/[0.86] shadow-[0_24px_90px_rgba(93,64,126,0.14)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-3 dark:border-white/8">
              <div className="min-w-0">
                <h1 className="text-[1.65rem] font-black leading-none tracking-[-0.055em] text-slate-950 dark:text-white">
                  {activeOption?.label ?? "Perfil"}
                </h1>

                <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-white/36">
                  {activeOption?.description ??
                    "Seu ritmo, conta e preferências do Axon"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:text-[#7e22ce] active:scale-[0.96] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/60"
                  aria-label="Abrir menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
              <div className="mx-auto w-full max-w-[980px]">
                {renderSection()}
              </div>
            </div>
          </section>
        </div>
      </section>

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden px-4 pb-6 pt-5 lg:hidden">
        <PageHeader
          title="Perfil"
          subtitle="Conta, ritmo e preferências"
          onBack={() => navigate("/dashboard")}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        <ProfileHeader
          userName={userName}
          userEmail={userEmail}
          avatarUrl={profile?.avatar_url}
          onEditProfile={() => setIsEditOpen(true)}
        />

        <MobileProfileSectionTabs
          activeSection={activeSection}
          onChangeSection={setActiveSection}
        />

        <div className="mt-5">{renderSection()}</div>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chronotypeLabel={result.label}
        energyPeak={result.energyPeak}
        userName={userName}
        userEmail={userEmail}
      />

      <EditProfileModal
        isOpen={isEditOpen}
        currentName={userName}
        avatarUrl={profile?.avatar_url}
        onAvatarUpdate={(updated) => setProfile(updated)}
        onClose={() => setIsEditOpen(false)}
        onSaveName={(newName) => {
          setProfile((prev) => (prev ? { ...prev, name: newName } : prev));
          setIsEditOpen(false);
        }}
      />

      <ScheduleStyleModal
        isOpen={scheduleModalOpen}
        currentValue={scheduleType}
        onClose={() => setScheduleModalOpen(false)}
        onSave={handleScheduleTypeSave}
      />

      <TagEditorSheet
        isOpen={tagEditorOpen}
        onClose={() => setTagEditorOpen(false)}
      />

      <TaskTagsSheet
        isOpen={taskTagsOpen}
        onClose={() => setTaskTagsOpen(false)}
      />

      <CalendarColorSettingsModal
        isOpen={calendarColorsOpen}
        value={calendarColors}
        onClose={() => setCalendarColorsOpen(false)}
        onSave={handleSaveCalendarColors}
      />

      <UnifiedSettingsModal
        isOpen={voiceModalOpen}
        title="Voz do Axon"
        description="Ouça as vozes deste aparelho e escolha a que o Axon vai usar."
        icon={Volume2}
        onClose={() => setVoiceModalOpen(false)}
      >
        <VoiceLab />
      </UnifiedSettingsModal>

      <AppearanceModal
        isOpen={appearanceModalOpen}
        onClose={() => setAppearanceModalOpen(false)}
      />

      <AccountModal
        isOpen={accountModalOpen}
        userName={userName}
        userEmail={userEmail}
        onClose={() => setAccountModalOpen(false)}
      />

      <NotificationsModal
        isOpen={notifSettingsOpen}
        dailyPlanningEnabled={dailyPlanningNotifications}
        dailyReviewEnabled={dailyReviewNotifications}
        weeklyReviewEnabled={weeklyReviewNotifications}
        axonSuggestionEnabled={axonSuggestionNotifications}
        onToggleDailyPlanning={() =>
          setDailyPlanningNotifications((prev) => !prev)
        }
        onToggleDailyReview={() =>
          setDailyReviewNotifications((prev) => !prev)
        }
        onToggleWeeklyReview={() =>
          setWeeklyReviewNotifications((prev) => !prev)
        }
        onToggleAxonSuggestion={() =>
          setAxonSuggestionNotifications((prev) => !prev)
        }
        onClose={() => setNotifSettingsOpen(false)}
      />

      <ConfirmDialog
        isOpen={showLogoutModal}
        title="Deseja sair da sua conta?"
        description="Você será desconectado do Axon e precisará fazer login novamente para acessar seu ambiente."
        confirmLabel="Sair"
        variant="danger"
        icon={LogOut}
        onConfirm={handleLogout}
        onClose={() => setShowLogoutModal(false)}
      />

      <ConfirmDialog
        isOpen={showDisconnectGoogleModal}
        title="Desconectar o Google Agenda?"
        description="O Axon deixará de criar e atualizar eventos na sua agenda. Os eventos já criados permanecem no Google Agenda."
        confirmLabel="Desconectar"
        variant="danger"
        icon={Link2}
        loading={googleBusy}
        onConfirm={handleDisconnectGoogle}
        onClose={() => setShowDisconnectGoogleModal(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteFirstModal}
        title="Excluir sua conta?"
        description="Essa ação é permanente e removerá seu acesso ao Axon."
        confirmLabel="Continuar"
        variant="danger"
        icon={Trash2}
        onConfirm={() => {
          setShowDeleteFirstModal(false);
          setShowDeleteFinalModal(true);
        }}
        onClose={() => setShowDeleteFirstModal(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteFinalModal}
        title="Confirmação final"
        description={
          <>
            <p>
              O e-mail abaixo não poderá ser usado para criar outra conta no
              Axon pelos próximos{" "}
              <span className="font-semibold text-primary">60 dias</span>.
            </p>

            <div className="mt-5 flex items-center gap-3 rounded-[1.35rem] border border-soft bg-surface-muted p-3 text-left">
              <Mail className="h-4 w-4 shrink-0 text-red-600 dark:text-red-200" />
              <p className="min-w-0 truncate text-sm font-semibold text-secondary">
                {userEmail || "E-mail da conta"}
              </p>
            </div>
          </>
        }
        confirmLabel="Sim, excluir"
        variant="danger"
        icon={Trash2}
        onConfirm={handleDeleteAccount}
        onClose={() => setShowDeleteFinalModal(false)}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-soft bg-surface-elevated px-4 py-2.5 text-sm font-medium text-primary shadow-soft backdrop-blur-xl">
            <Check className="h-4 w-4 text-accent" />
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

// ===========================================================================

// CARDS PRINCIPAIS DO PERFIL

// ===========================================================================




function ProfileAccountSidebar({
  activeSection,
  onChangeSection,
}: {
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  activeSection: ProfileSectionKey;
  onChangeSection: (section: ProfileSectionKey) => void;
}) {
  return (
    <aside className="relative flex min-h-0 flex-col overflow-hidden rounded-[1.45rem] border border-slate-200/80 bg-white/[0.84] p-2.5 shadow-[0_24px_90px_rgba(93,64,126,0.14)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)]">
      <nav className="min-h-0 flex-1">
        <div className="space-y-1.5">
          {PROFILE_SECTION_OPTIONS.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;

            return (
              <button
                key={section.key}
                type="button"
                onClick={() => onChangeSection(section.key)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98] ${
                  active
                    ? "border-[#a855f7]/24 bg-[#7b2cbf]/14 text-[#7e22ce] dark:border-[#a855f7]/18 dark:bg-[#7b2cbf]/18 dark:text-[#d8b4fe]"
                    : "border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-slate-50/80 dark:text-white/44 dark:hover:border-white/8 dark:hover:bg-white/[0.035]"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    active
                      ? "border-[#a855f7]/24 bg-[#f3e8ff]/70 dark:border-[#a855f7]/18 dark:bg-[#7b2cbf]/18"
                      : "border-slate-200/80 bg-white/70 dark:border-white/8 dark:bg-white/[0.035]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">
                    {section.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.64rem] font-semibold opacity-60">
                    {section.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function MobileProfileSectionTabs({
  activeSection,
  onChangeSection,
}: {
  activeSection: ProfileSectionKey;
  onChangeSection: (section: ProfileSectionKey) => void;
}) {
  return (
    <div className="custom-scrollbar -mx-4 mt-5 overflow-x-auto px-4 pb-1">
      <div className="flex w-max gap-2">
        {PROFILE_SECTION_OPTIONS.map((section) => {
          const active = activeSection === section.key;

          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onChangeSection(section.key)}
              className={`rounded-full border px-3.5 py-2 text-xs font-black transition active:scale-[0.96] ${
                active
                  ? "border-accent-soft bg-[var(--accent-strong)] text-white shadow-card"
                  : "border-soft bg-surface-muted text-muted"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewProfileSection({
  hasChronotype,
  result,
  resultKey,
  scheduleLabel,
  googleConnected,
  pushEnabled,
  onOpenResult,
  onQuestionnaire,
  onEditSchedule,
  onOpenMemories,
  onOpenNotifications,
}: {
  hasChronotype: boolean;
  result: (typeof results)[ChronotypeResultKey];
  resultKey: ChronotypeResultKey;
  scheduleLabel: string;
  googleConnected: boolean | null;
  pushEnabled: boolean;
  onOpenResult: () => void;
  onQuestionnaire: () => void;
  onEditSchedule: () => void;
  onOpenMemories: () => void;
  onOpenNotifications: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <ProductiveProfileCard
        hasChronotype={hasChronotype}
        result={result}
        resultKey={resultKey}
        onOpenResult={onOpenResult}
        onQuestionnaire={onQuestionnaire}
      />

      <UnifiedSettingsPanel
        title="Central pessoal"
        description="Atalhos rápidos para manter o Axon alinhado com sua rotina real."
      >
        <div className="divide-y divide-[var(--border-soft)]">
          <UnifiedSettingRow
            icon={CalendarClock}
            title="Estilo de rotina"
            description="Horários fixos ou rotina flexível."
            value={scheduleLabel}
            onClick={onEditSchedule}
          />

          <UnifiedSettingRow
            icon={Link2}
            title="Google Agenda"
            description="Sincronização de eventos e compromissos."
            value={
              googleConnected === null
                ? "Verificando"
                : googleConnected
                  ? "Conectado"
                  : "Não conectado"
            }
          />

          <UnifiedSettingRow
            icon={Bell}
            title="Notificações"
            description="Alertas, revisão do dia e lembretes inteligentes."
            value={pushEnabled ? "Ativas" : "Configurar"}
            onClick={onOpenNotifications}
          />

          <UnifiedSettingRow
            icon={Brain}
            title="Memórias do Axon"
            description="Contextos que o Axon usa para personalizar respostas."
            value="Ver memórias"
            onClick={onOpenMemories}
          />

          <UnifiedSettingRow
            icon={RefreshCcw}
            title="Recalibrar Axon"
            description="Refaça o questionário quando sua rotina mudar bastante."
            value="Atualizar perfil"
            onClick={onQuestionnaire}
          />
        </div>
      </UnifiedSettingsPanel>

      <AxonMemories />
      <ReportsHistory />
    </div>
  );
}

function OverviewMetricCard({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  icon: ElementType;
  onClick?: () => void;
}) {
  const TagName = onClick ? "button" : "div";

  return (
    <TagName
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-[1.4rem] border border-soft bg-surface-muted px-4 py-3 text-left shadow-card transition active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.62rem] font-black uppercase tracking-[0.12em] text-soft">
          {label}
        </span>
        <span className="mt-1 block truncate text-sm font-black text-primary">
          {value}
        </span>
      </span>
    </TagName>
  );
}

function PersonalProfileSettings({
  userName,
  userEmail,
  avatarUrl,
  onEditProfile,
  onOpenAccount,
}: {
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  onEditProfile: () => void;
  onOpenAccount: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <UnifiedSettingsPanel
        title="Perfil pessoal"
        description="Foto, nome público, e-mail e credenciais da sua conta."
      >
        <div className="mb-4 flex items-center gap-4">
          <AvatarDisplay avatarUrl={avatarUrl} userName={userName} />

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black tracking-[-0.05em] text-primary">
              {userName}
            </h2>

            {userEmail && (
              <p className="mt-1 truncate text-sm font-semibold text-muted">
                {userEmail}
              </p>
            )}

            <button
              type="button"
              onClick={onEditProfile}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-xs font-black text-white shadow-card transition active:scale-[0.98]"
            >
              Editar foto e nome
              <Edit3 className="ml-2 h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)] pt-1">
          <UnifiedSettingRow
            icon={Mail}
            title="E-mail"
            description="Endereço usado para login e recuperação de conta."
            value={userEmail || "Não encontrado"}
            onClick={onOpenAccount}
          />

          <UnifiedSettingRow
            icon={Shield}
            title="Senha e segurança"
            description="Alterar senha e proteger o acesso ao Axon."
            value="Gerenciar"
            onClick={onOpenAccount}
          />
        </div>
      </UnifiedSettingsPanel>
    </div>
  );
}

function NotificationsSettingsSection({
  pushSupported,
  pushEnabled,
  pushBlocked,
  pushBusy,
  pushDiag,
  silentMode,
  dailyPlanningEnabled,
  dailyReviewEnabled,
  weeklyReviewEnabled,
  axonSuggestionEnabled,
  onTogglePush,
  onToggleSilent,
  onToggleDailyPlanning,
  onToggleDailyReview,
  onToggleWeeklyReview,
  onToggleAxonSuggestion,
  onOpenAdvanced,
}: {
  pushSupported: boolean;
  pushEnabled: boolean;
  pushBlocked: boolean;
  pushBusy: boolean;
  pushDiag: string;
  silentMode: boolean;
  dailyPlanningEnabled: boolean;
  dailyReviewEnabled: boolean;
  weeklyReviewEnabled: boolean;
  axonSuggestionEnabled: boolean;
  onTogglePush: () => void;
  onToggleSilent: () => void;
  onToggleDailyPlanning: () => void;
  onToggleDailyReview: () => void;
  onToggleWeeklyReview: () => void;
  onToggleAxonSuggestion: () => void;
  onOpenAdvanced: () => void;
}) {
  return (
    <UnifiedSettingsPanel
      title="Notificações"
      description="Controle quando o Axon pode chamar sua atenção."
    >
      <div className="divide-y divide-[var(--border-soft)]">
        {pushSupported && (
          <UnifiedToggleRow
            icon={Bell}
            title="Notificações no aparelho"
            description={
              pushBlocked
                ? "Bloqueado no Android. Libere em Ajustes > Apps > Axon > Notificações."
                : pushDiag || "Receber alertas do Axon mesmo com o app fechado."
            }
            enabled={pushEnabled}
            disabled={pushBusy}
            onToggle={onTogglePush}
          />
        )}

        <UnifiedToggleRow
          icon={Moon}
          title="Modo silencioso automático"
          description="Reduz interrupções durante foco ou descanso."
          enabled={silentMode}
          onToggle={onToggleSilent}
        />

        <UnifiedToggleRow
          icon={Bell}
          title="Planejamento diário"
          description="Lembrete para organizar o dia."
          enabled={dailyPlanningEnabled}
          onToggle={onToggleDailyPlanning}
        />

        <UnifiedToggleRow
          icon={Moon}
          title="Revisão do dia"
          description="Lembrete para fechar o dia e registrar como foi."
          enabled={dailyReviewEnabled}
          onToggle={onToggleDailyReview}
        />

        <UnifiedToggleRow
          icon={SettingsIcon}
          title="Revisão semanal"
          description="Resumo de padrões, progresso e pontos de atenção."
          enabled={weeklyReviewEnabled}
          onToggle={onToggleWeeklyReview}
        />

        <UnifiedToggleRow
          icon={Sparkles}
          title="Sugestões do Axon"
          description="Alertas quando o Axon identificar um ajuste útil."
          enabled={axonSuggestionEnabled}
          onToggle={onToggleAxonSuggestion}
        />

        <button
          type="button"
          onClick={onOpenAdvanced}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"
        >
          Ajustes avançados
          <ChevronRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </UnifiedSettingsPanel>
  );
}

function AppearanceVoiceSection({
  onOpenAppearance,
  onOpenVoice,
}: {
  onOpenAppearance: () => void;
  onOpenVoice: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <UnifiedSettingsPanel
        title="Aparência"
        description="Controle como a interface do Axon aparece para você."
      >
        <ThemeToggle showHeader={false} />
        <button
          type="button"
          onClick={onOpenAppearance}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"
        >
          Abrir em modal
          <ChevronRight className="ml-2 h-4 w-4" />
        </button>
      </UnifiedSettingsPanel>

      <UnifiedSettingsPanel
        title="Voz do Axon"
        description="Escolha a voz que lê respostas em voz alta."
      >
        <UnifiedSettingRow
          icon={Volume2}
          title="Laboratório de voz"
          description="Teste vozes disponíveis neste aparelho."
          value="Configurar"
          onClick={onOpenVoice}
        />
      </UnifiedSettingsPanel>
    </div>
  );
}

function IntegrationsSettingsSection({
  googleConnected,
  googleBusy,
  googleError,
  onConnectGoogle,
  onDisconnectGoogle,
}: {
  googleConnected: boolean | null;
  googleBusy: boolean;
  googleError: string | null;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
}) {
  const value =
    googleConnected === null
      ? "Verificando"
      : googleConnected
        ? "Conectado"
        : "Não conectado";

  return (
    <UnifiedSettingsPanel
      title="Integrações"
      description="Conecte serviços externos para o Axon organizar melhor sua rotina."
    >
      <UnifiedSettingRow
        icon={Link2}
        title="Google Agenda"
        description="Suas tarefas podem virar eventos na sua agenda."
        value={googleBusy ? "Aguarde" : value}
        onClick={
          googleConnected === null || googleBusy
            ? undefined
            : googleConnected
              ? onDisconnectGoogle
              : onConnectGoogle
        }
      />

      {googleError && (
        <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-600 dark:text-red-300">
          {googleError}
        </p>
      )}
    </UnifiedSettingsPanel>
  );
}

function AccountSecuritySection({
  userEmail,
  onOpenAccount,
  onLogout,
}: {
  userEmail: string;
  onOpenAccount: () => void;
  onLogout: () => void;
}) {
  return (
    <UnifiedSettingsPanel
      title="Conta e segurança"
      description="Gerencie acesso, senha e sessão ativa."
    >
      <div className="divide-y divide-[var(--border-soft)]">
        <UnifiedSettingRow
          icon={Mail}
          title="E-mail atual"
          description="Endereço usado para login e notificações de conta."
          value={userEmail || "Não encontrado"}
          onClick={onOpenAccount}
        />

        <UnifiedSettingRow
          icon={Shield}
          title="Senha"
          description="Alterar senha e confirmar dados sensíveis."
          value="Gerenciar"
          onClick={onOpenAccount}
        />

        <UnifiedSettingRow
          icon={LogOut}
          title="Sair da conta"
          description="Encerrar sua sessão neste dispositivo."
          danger
          onClick={onLogout}
        />
      </div>
    </UnifiedSettingsPanel>
  );
}

function DataPrivacySection({
  userEmail,
  onDeleteAccount,
}: {
  userEmail: string;
  onDeleteAccount: () => void;
}) {
  return (
    <UnifiedSettingsPanel
      title="Dados e privacidade"
      description="Ações sensíveis da conta e informações usadas pelo Axon."
    >
      <div className="divide-y divide-[var(--border-soft)]">
        <div className="rounded-[1.35rem] border border-soft bg-surface-muted p-4">
          <p className="text-xs font-semibold text-muted">Conta atual</p>
          <p className="mt-1 truncate text-sm font-black text-primary">
            {userEmail || "E-mail da conta"}
          </p>
        </div>

        <UnifiedSettingRow
          icon={Trash2}
          title="Excluir conta"
          description="Excluir permanentemente sua conta e dados."
          danger
          onClick={onDeleteAccount}
        />
      </div>
    </UnifiedSettingsPanel>
  );
}

function UnifiedSettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[1.55rem] border border-soft bg-surface-elevated p-4 shadow-card backdrop-blur-2xl lg:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black tracking-[-0.05em] text-primary">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        )}
      </div>

      {children}
    </section>
  );
}

function UnifiedSettingRow({
  icon: Icon,
  title,
  description,
  value,
  onClick,
  danger = false,
}: SettingRowProps) {
  const content = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
          danger
            ? "border-red-300/25 bg-red-500/10 text-red-600 dark:text-red-100"
            : "border-accent-soft bg-accent-soft text-accent"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-black ${
            danger ? "text-red-600 dark:text-red-100" : "text-primary"
          }`}
        >
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        {value && (
          <p
            className={`mt-1.5 truncate text-xs font-semibold ${
              danger
                ? "text-red-600/75 dark:text-red-100/70"
                : "text-accent"
            }`}
          >
            {value}
          </p>
        )}
      </div>

      {onClick && (
        <ChevronRight
          className={`h-4.5 w-4.5 shrink-0 ${
            danger ? "text-red-500/40 dark:text-red-100/35" : "text-soft"
          }`}
        />
      )}
    </>
  );

  const className = `flex w-full items-center gap-3 px-0 py-3 text-left transition active:scale-[0.99] ${
    danger ? "text-red-600" : ""
  }`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function UnifiedToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  disabled = false,
}: ToggleRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-0 py-3 text-left transition active:scale-[0.99] disabled:opacity-60"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Icon className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-primary">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>

      <div
        className={`flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition ${
          enabled
            ? "justify-end border-accent-soft bg-accent-soft"
            : "justify-start border-soft bg-surface-muted"
        }`}
      >
        <div
          className={`h-5 w-5 rounded-full shadow-card transition ${
            enabled ? "bg-[var(--accent)]" : "bg-[var(--text-soft)]"
          }`}
        />
      </div>
    </button>
  );
}

function AppearanceModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <UnifiedSettingsModal
      isOpen={isOpen}
      title="Aparência"
      description="Escolha como a interface do Axon deve aparecer para você."
      icon={Palette}
      onClose={onClose}
    >
      <ThemeToggle showHeader={false} />
    </UnifiedSettingsModal>
  );
}

function AccountModal({
  isOpen,
  userEmail,
  onClose,
}: {
  isOpen: boolean;
  userName: string;
  userEmail: string;
  onClose: () => void;
}) {
  const [nextEmail, setNextEmail] = useState(userEmail);
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch =
    nextPassword.length === 0 ||
    confirmPassword.length === 0 ||
    nextPassword === confirmPassword;

  useEffect(() => {
    if (!isOpen) return;

    setNextEmail(userEmail);
    setEmailPassword("");
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
  }, [isOpen, userEmail]);

  return (
    <UnifiedSettingsModal
      isOpen={isOpen}
      title="Conta"
      description="Gerencie e-mail, senha e segurança de acesso."
      icon={User}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="rounded-[1.5rem] border border-soft bg-surface-muted p-4">
          <p className="text-xs font-semibold text-muted">E-mail atual</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-accent" />
            <p className="min-w-0 truncate text-sm font-black text-primary">
              {userEmail || "E-mail não encontrado"}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-[1.5rem] border border-soft bg-surface-muted p-4">
          <div>
            <p className="text-sm font-black text-primary">Alterar e-mail</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Use um e-mail válido e confirme com sua senha atual.
            </p>
          </div>

          <SettingsInput
            label="Novo e-mail"
            value={nextEmail}
            onChange={setNextEmail}
            placeholder="seuemail@exemplo.com"
            type="email"
          />

          <SettingsInput
            label="Senha atual"
            value={emailPassword}
            onChange={setEmailPassword}
            placeholder="Confirme sua senha"
            type="password"
          />
        </div>

        <div className="space-y-3 rounded-[1.5rem] border border-soft bg-surface-muted p-4">
          <div>
            <p className="text-sm font-black text-primary">Alterar senha</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Informe sua senha atual e escolha uma nova senha segura.
            </p>
          </div>

          <SettingsInput
            label="Senha atual"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Digite sua senha atual"
            type="password"
          />

          <SettingsInput
            label="Nova senha"
            value={nextPassword}
            onChange={setNextPassword}
            placeholder="Digite uma nova senha"
            type="password"
          />

          <SettingsInput
            label="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repita a nova senha"
            type="password"
          />

          {!passwordsMatch && (
            <p className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-[0.7rem] leading-5 text-red-600 dark:text-red-300">
              As senhas não coincidem.
            </p>
          )}
        </div>

        <p className="rounded-[1.25rem] border border-accent-soft bg-accent-soft px-4 py-3 text-[0.7rem] leading-5 text-muted">
          A interface já está preparada. O salvamento real será conectado quando
          o backend disponibilizar as rotas de alteração de e-mail e senha.
        </p>

        <button
          type="button"
          onClick={onClose}
          disabled={!passwordsMatch}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-50"
        >
          <Check className="mr-2 h-4 w-4" />
          Salvar alterações
        </button>
      </div>
    </UnifiedSettingsModal>
  );
}

function NotificationsModal({
  isOpen,
  dailyPlanningEnabled,
  dailyReviewEnabled,
  weeklyReviewEnabled,
  axonSuggestionEnabled,
  onToggleDailyPlanning,
  onToggleDailyReview,
  onToggleWeeklyReview,
  onToggleAxonSuggestion,
  onClose,
}: {
  isOpen: boolean;
  dailyPlanningEnabled: boolean;
  dailyReviewEnabled: boolean;
  weeklyReviewEnabled: boolean;
  axonSuggestionEnabled: boolean;
  onToggleDailyPlanning: () => void;
  onToggleDailyReview: () => void;
  onToggleWeeklyReview: () => void;
  onToggleAxonSuggestion: () => void;
  onClose: () => void;
}) {
  return (
    <UnifiedSettingsModal
      isOpen={isOpen}
      title="Lembretes inteligentes"
      description="Escolha quais alertas o Axon pode enviar para você."
      icon={Bell}
      onClose={onClose}
    >
      <div className="divide-y divide-[var(--border-soft)]">
        <UnifiedToggleRow
          icon={Bell}
          title="Planejamento diário"
          description="Lembrete para organizar o dia."
          enabled={dailyPlanningEnabled}
          onToggle={onToggleDailyPlanning}
        />

        <UnifiedToggleRow
          icon={Moon}
          title="Revisão do dia"
          description="Lembrete para fechar o dia e registrar como foi."
          enabled={dailyReviewEnabled}
          onToggle={onToggleDailyReview}
        />

        <UnifiedToggleRow
          icon={SettingsIcon}
          title="Revisão semanal"
          description="Resumo de padrões, progresso e pontos de atenção."
          enabled={weeklyReviewEnabled}
          onToggle={onToggleWeeklyReview}
        />

        <UnifiedToggleRow
          icon={Sparkles}
          title="Sugestões do Axon"
          description="Alertas quando o Axon identificar um ajuste útil."
          enabled={axonSuggestionEnabled}
          onToggle={onToggleAxonSuggestion}
        />

        <p className="pt-2 text-[0.68rem] leading-5 text-muted">
          Essas preferências estão prontas na interface. A persistência pode ser
          conectada depois ao backend de notificações.
        </p>
      </div>
    </UnifiedSettingsModal>
  );
}

function UnifiedSettingsModal({
  isOpen,
  title,
  description,
  icon: Icon,
  children,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  icon: ElementType;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="custom-scrollbar max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-[2rem] border border-soft bg-surface-elevated p-5 text-primary shadow-soft backdrop-blur-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-black text-primary">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "email" | "password";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-muted">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-soft bg-surface-elevated px-4 py-3 text-sm font-medium text-primary outline-none transition placeholder:text-soft focus:border-accent-soft"
      />
    </label>
  );
}

function DesktopProfileSidebar({

  userName,

  userEmail,

  avatarUrl,

  hasChronotype,

  result,

  resultKey,

  onEditProfile,

  onOpenResult,

  onQuestionnaire,

}: {

  userName: string;

  userEmail: string;

  avatarUrl?: string;

  hasChronotype: boolean;

  result: (typeof results)[ChronotypeResultKey];

  resultKey: ChronotypeResultKey;

  onEditProfile: () => void;

  onOpenResult: () => void;

  onQuestionnaire: () => void;

}) {

  return (

    <aside className="relative flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-[1.45rem] border border-slate-200/80 bg-white/[0.84] p-2.5 shadow-[0_24px_90px_rgba(93,64,126,0.14)] backdrop-blur-2xl dark:border-white/8 dark:bg-white/[0.035] dark:shadow-[0_24px_90px_rgba(0,0,0,0.26)]">

      <section className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/82 p-3.5 shadow-[0_18px_46px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">

        <div className="flex items-center gap-3">

          <DesktopProfileAvatar avatarUrl={avatarUrl} userName={userName} />



          <div className="min-w-0 flex-1">

            <h2 className="truncate text-base font-black leading-5 tracking-[-0.04em] text-slate-950 dark:text-white">

              {userName}

            </h2>



            {userEmail && (

              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.68rem] font-semibold text-slate-500 dark:text-white/38">

                <Mail className="h-3 w-3 shrink-0 text-[#7e22ce] dark:text-[#d8b4fe]" />

                <span className="truncate">{userEmail}</span>

              </div>

            )}

          </div>

        </div>



        <button

          type="button"

          onClick={onEditProfile}

          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-xs font-black text-white shadow-[0_16px_32px_rgba(123,44,191,0.22)] transition active:scale-[0.96]"

        >

          Editar perfil

          <Edit3 className="ml-2 h-3.5 w-3.5" />

        </button>

      </section>



      <section className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/82 p-3.5 shadow-[0_16px_45px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">

        <div className="mb-3 flex items-start justify-between gap-3">

          <div className="min-w-0">

            <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">

              Seu ritmo

            </p>

            <h3 className="mt-1 truncate text-[1.25rem] font-black leading-none tracking-[-0.045em] text-slate-950 dark:text-white">

              {hasChronotype ? result.label : "Não definido"}

            </h3>

          </div>



          <span className="shrink-0 rounded-full border border-[#a855f7]/22 bg-[#f3e8ff]/70 px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-[0.08em] text-[#7e22ce] dark:border-[#a855f7]/16 dark:bg-[#7b2cbf]/12 dark:text-[#d8b4fe]">

            {resultKey}

          </span>

        </div>



        <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-600 dark:text-white/44">

          {hasChronotype

            ? result.subtitle

            : "Responda o questionário para o Axon entender seus horários de energia e foco."}

        </p>



        <div className="mt-3 grid grid-cols-2 gap-2">

          <DesktopProfileStat label="Energia" value={result.energyPeak} />

          <DesktopProfileStat label="Foco" value={result.focusWindow} />

        </div>



        <div className="mt-3 grid grid-cols-2 gap-2">

          <button

            type="button"

            onClick={onOpenResult}

            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[#a855f7]/22 bg-[#f3e8ff]/70 px-3 text-xs font-black text-[#7e22ce] transition active:scale-[0.97] dark:border-[#a855f7]/16 dark:bg-[#7b2cbf]/12 dark:text-[#d8b4fe]"

          >

            Relatório

          </button>



          <button

            type="button"

            onClick={onQuestionnaire}

            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-3 text-xs font-black text-slate-600 transition active:scale-[0.97] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/52"

          >

            Recalibrar

          </button>

        </div>

      </section>



      <section className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/82 p-3.5 shadow-[0_16px_45px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">

        <div className="mb-3 flex items-center justify-between gap-3">

          <div>

            <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">

              Resumo

            </p>

            <h3 className="mt-1 text-[1.05rem] font-black leading-none tracking-[-0.04em] text-slate-950 dark:text-white">

              Personalização

            </h3>

          </div>



          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 text-[#7e22ce] shadow-[0_10px_24px_rgba(71,85,105,0.08)] dark:border-white/8 dark:bg-white/[0.045] dark:text-[#d8b4fe]">

            <Workflow className="h-4 w-4" />

          </div>

        </div>



        <div className="divide-y divide-[var(--border-soft)]">

          <DesktopMiniProfileRow label="Memórias" value="Contexto salvo pelo chat" />

          <DesktopMiniProfileRow label="Preferências" value="Rotina, tags e categorias" />

          <DesktopMiniProfileRow label="Relatórios" value="Histórico semanal e mensal" />

        </div>

      </section>

    </aside>

  );

}



function DesktopProfileAvatar({

  avatarUrl,

  userName,

}: {

  avatarUrl?: string;

  userName: string;

}) {

  const initial = userName.trim().charAt(0).toUpperCase() || "A";



  return (

    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#a855f7]/24 bg-[#7b2cbf]/12 text-xl font-black text-[#7e22ce] shadow-[0_14px_32px_rgba(123,44,191,0.14)] dark:border-[#a855f7]/18 dark:bg-[#7b2cbf]/14 dark:text-[#d8b4fe]">

      {avatarUrl ? (

        <img

          src={avatarUrl}

          alt={userName}

          className="h-full w-full object-cover"

        />

      ) : (

        <span>{initial}</span>

      )}

    </div>

  );

}



function DesktopMiniProfileRow({

  label,

  value,

}: {

  label: string;

  value: string;

}) {

  return (

    <div className="rounded-2xl border border-slate-200/80 bg-white/68 px-3 py-2.5 dark:border-white/8 dark:bg-black/12">

      <p className="text-[0.56rem] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/24">

        {label}

      </p>

      <p className="mt-1 truncate text-xs font-black text-slate-950 dark:text-white/62">

        {value}

      </p>

    </div>

  );

}



function DesktopProfileStat({

  label,

  value,

}: {

  label: string;

  value: string;

}) {

  return (

    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/68 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/8 dark:bg-black/12">

      <p className="truncate text-[0.56rem] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-white/24">

        {label}

      </p>

      <p className="mt-1 truncate text-xs font-black text-slate-950 dark:text-white/72">

        {value}

      </p>

    </div>

  );

}



function DesktopProfilePanel({

  title,

  children,

}: {

  title: string;

  children: ReactNode;

}) {

  return (

    <section className="min-w-0">

      <p className="mb-2 px-1 text-[0.62rem] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-white/28">

        {title}

      </p>



      <div className="min-w-0">{children}</div>

    </section>

  );

}




function DesktopProfileHelpCard({

  onOpenChat,

  onQuestionnaire,

}: {

  onOpenChat: () => void;

  onQuestionnaire: () => void;

}) {

  return (

    <section className="min-w-0 rounded-[1.45rem] border border-slate-200/80 bg-slate-50/82 p-4 shadow-[0_16px_45px_rgba(71,85,105,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.035]">

      <div className="mb-3 flex items-center justify-between gap-3">

        <div>

          <p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-white/32">

            Ajustes rápidos

          </p>

          <h3 className="mt-1 text-[1.05rem] font-black leading-none tracking-[-0.04em] text-slate-950 dark:text-white">

            Manter o Axon alinhado

          </h3>

        </div>



        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 text-[#7e22ce] shadow-[0_10px_24px_rgba(71,85,105,0.08)] dark:border-white/8 dark:bg-white/[0.045] dark:text-[#d8b4fe]">

          <Sparkles className="h-4 w-4" />

        </div>

      </div>



      <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-white/38">

        Use o chat para corrigir informações salvas ou recalibre seu cronotipo quando sua rotina mudar bastante.

      </p>



      <div className="mt-3 grid grid-cols-2 gap-2">

        <button

          type="button"

          onClick={onOpenChat}

          className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-3 text-xs font-black text-white transition active:scale-[0.97]"

        >

          Conversar

        </button>



        <button

          type="button"

          onClick={onQuestionnaire}

          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-3 text-xs font-black text-slate-600 transition active:scale-[0.97] dark:border-white/8 dark:bg-white/[0.045] dark:text-white/52"

        >

          Recalibrar

        </button>

      </div>

    </section>

  );

}



function ProfileHeader({

  userName,

  userEmail,

  avatarUrl,

  onEditProfile,

}: {

  userName: string;

  userEmail: string;

  avatarUrl?: string;

  onEditProfile: () => void;

}) {

  return (

    <section className="mt-5">

      <div className="relative overflow-hidden rounded-[2.15rem] border border-soft bg-surface-elevated px-5 pb-5 pt-7 text-center shadow-card backdrop-blur-2xl lg:p-7">

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_58%)]" />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[var(--accent-muted)] to-transparent" />



        <div className="relative mx-auto flex w-fit items-center justify-center">

          <div className="absolute h-44 w-44 rounded-full bg-[var(--accent)]/28 blur-[48px]" />

          <AvatarDisplay avatarUrl={avatarUrl} userName={userName} />

        </div>



        <div className="relative mx-auto mt-5 max-w-[20rem]">

          <h1 className="truncate text-2xl font-black leading-none tracking-[-0.05em] text-primary">

            {userName}

          </h1>



          {userEmail && (

            <div className="mx-auto mt-2 flex min-w-0 max-w-[18rem] items-center justify-center gap-1.5 text-[0.72rem] font-medium text-muted">

              <Mail className="h-3 w-3 shrink-0 text-accent" />

              <span className="truncate">{userEmail}</span>

            </div>

          )}



        </div>



        <button

          type="button"

          onClick={onEditProfile}

          className="relative mx-auto mt-5 inline-flex min-h-11 w-full max-w-[17rem] items-center justify-center rounded-2xl border border-soft bg-surface-muted px-5 text-sm font-semibold text-secondary transition hover:border-accent-soft hover:text-primary active:scale-[0.98]"

        >

          Editar perfil

          <Edit3 className="ml-2 h-4 w-4" />

        </button>

      </div>

    </section>

  );

}



function AvatarDisplay({

  avatarUrl,

  userName,

}: {

  avatarUrl?: string;

  userName: string;

}) {

  const initial = userName.trim().charAt(0).toUpperCase() || "A";



  return (

    <div className="relative z-10 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-3xl font-black text-accent shadow-[0_24px_80px_rgba(123,44,191,0.34)] ring-4 ring-white/6 dark:shadow-[0_28px_90px_rgba(168,85,247,0.32)]">

      {avatarUrl ? (

        <img

          src={avatarUrl}

          alt={userName}

          className="h-full w-full object-cover"

        />

      ) : (

        <span>{initial}</span>

      )}

    </div>

  );

}



function ProfileSection({

  title,

  children,

}: {

  title: string;

  children: ReactNode;

}) {

  return (

    <section className="mb-5 min-w-0">

      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-soft">

        {title}

      </p>



      <div className="space-y-3">{children}</div>

    </section>

  );

}



function ProductiveProfileCard({

  hasChronotype,

  result,

  resultKey,

  onOpenResult,

  onQuestionnaire,

}: {

  hasChronotype: boolean;

  result: (typeof results)[ChronotypeResultKey];

  resultKey: ChronotypeResultKey;

  onOpenResult: () => void;

  onQuestionnaire: () => void;

}) {

  return (

    <article className="relative w-full min-w-0 overflow-hidden rounded-[1.95rem] border border-accent-soft bg-accent-soft p-5 text-primary shadow-card backdrop-blur-2xl">

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_50%)]" />

      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[var(--accent)]/18 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-20 left-[-4rem] h-44 w-44 rounded-full bg-[var(--accent)]/10 blur-3xl" />



      <div className="relative">

        <div className="mb-4 flex items-start justify-between gap-4">

          <div className="min-w-0">

            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-surface-elevated px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.1em] text-accent">

              <Brain className="h-3.5 w-3.5" />

              Seu ritmo atual

            </div>



            <h2 className="text-[1.85rem] font-black leading-[0.95] tracking-[-0.06em] text-primary">

              {hasChronotype ? result.label : "Cronotipo não definido"}

            </h2>

          </div>



          <span className="shrink-0 rounded-full border border-accent-soft bg-surface-elevated px-2.5 py-1 text-[0.58rem] font-black uppercase tracking-[0.08em] text-accent">

            {resultKey}

          </span>

        </div>



        <p className="max-w-[21rem] text-sm leading-6 text-muted">

          {hasChronotype

            ? result.subtitle

            : "Responda o questionário para o Axon entender seus horários de energia, foco e descanso."}

        </p>



        <div className="mt-5 grid grid-cols-2 gap-2">

          <ProductiveMetric label="Pico de energia" value={result.energyPeak} />

          <ProductiveMetric label="Melhor foco" value={result.focusWindow} />

        </div>



        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">

          <button

            type="button"

            onClick={onOpenResult}

            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-black text-white shadow-card transition active:scale-[0.98]"

          >

            Ver relatório completo

            <ChevronRight className="ml-2 h-4 w-4" />

          </button>



          <button

            type="button"

            onClick={onQuestionnaire}

            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-accent-soft bg-surface-elevated px-4 text-sm font-black text-accent transition active:scale-[0.98] sm:w-auto"

          >

            <RefreshCcw className="mr-2 h-4 w-4" />

            Recalibrar

          </button>

        </div>



        <p className="mt-3 text-[0.68rem] leading-5 text-muted">

          Sua rotina mudou? Recalibre para o Axon ajustar melhor suas sugestões.

        </p>

      </div>

    </article>

  );

}



function ProductiveMetric({

  label,

  value,

}: {

  label: string;

  value: string;

}) {

  return (

    <div className="min-w-0 rounded-[1.35rem] border border-accent-soft bg-surface-elevated px-3 py-3">

      <p className="truncate text-[0.62rem] font-black uppercase tracking-[0.08em] text-soft">

        {label}

      </p>

      <p className="mt-1 truncate text-xs font-black text-primary">{value}</p>

    </div>

  );

}



function PreferencesCard({

  scheduleLabel,

  calendarColors,

  onEditSchedule,

  onEditCalendarColors,

  onEditTags,

  onEditTaskTags,

}: {

  scheduleLabel: string;

  calendarColors: DesktopCalendarColorPrefs;

  onEditSchedule: () => void;

  onEditCalendarColors: () => void;

  onEditTags: () => void;

  onEditTaskTags: () => void;

}) {

  return (

    <div className="grid min-w-0 gap-2">

      <PreferenceRow

        icon={CalendarClock}

        title="Estilo de rotina"

        description="Horários fixos ou rotina flexível."

        value={scheduleLabel}

        onClick={onEditSchedule}

      />



      <CalendarColorsPreferenceRow
        colors={calendarColors}
        onClick={onEditCalendarColors}
      />

      <PreferenceRow

        icon={Tag}

        title="Tags da revisão"

        description="Categorias usadas para registrar seu dia."

        value="Editar"

        onClick={onEditTags}

      />



      {/* Conjunto SEPARADO do de cima: aquele é do registro diário, este é das

          tarefas e serve para o Axon agrupar trabalho parecido. */}

      <PreferenceRow

        icon={Tags}

        title="Categorias das tarefas"

        description="Usadas para agrupar tarefas parecidas."

        value="Editar"

        onClick={onEditTaskTags}

      />

    </div>

  );

}



function CalendarColorsPreferenceRow({
  colors,
  onClick,
}: {
  colors: DesktopCalendarColorPrefs;
  onClick: () => void;
}) {
  const rows: { kind: DesktopCalendarKind; label: string; icon: ElementType }[] = [
    { kind: "task", label: "Tarefas", icon: ListTodo },
    { kind: "event", label: "Eventos", icon: CalendarDays },
    { kind: "routine", label: "Rotinas", icon: Repeat },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full min-w-0 items-center gap-3 rounded-[1.55rem] border border-soft bg-surface-elevated px-4 py-3 text-left shadow-card backdrop-blur-2xl transition active:scale-[0.98]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Palette className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-primary">
          Cores do calendário
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          Tarefas, eventos e rotinas na agenda.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {rows.map((row) => {
            const color = getDesktopCalendarColorOption(colors[row.kind]);
            const Icon = row.icon;

            return (
              <span
                key={row.kind}
                className="flex min-w-0 items-center gap-2 rounded-2xl border border-soft bg-surface-muted px-2.5 py-2"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: color.iconBackground,
                    borderColor: color.iconBorder,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: color.iconColor }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.62rem] font-black text-primary">
                    {row.label}
                  </span>
                  <span className="mt-0.5 block h-1.5 w-8 rounded-full" style={{ backgroundColor: color.hex }} />
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-soft" />
    </button>
  );
}

function CalendarColorSettingsModal({
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

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="relative flex max-h-[88dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-[2rem] border border-soft bg-surface-elevated text-primary shadow-soft backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_50%)]" />

        <div className="relative border-b border-[var(--border-soft)] px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
                <Palette className="h-3.5 w-3.5" />
                Calendário
              </div>
              <h2 className="text-[1.65rem] font-black leading-[1.02] tracking-[-0.055em] text-primary">
                Cores das categorias
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Escolha cores bem diferentes para identificar tarefas, eventos e rotinas rapidamente.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {rows.map((row) => {
              const color = getDesktopCalendarColorOption(draft[row.kind]);
              const Icon = row.icon;

              return (
                <div
                  key={row.kind}
                  className="rounded-[1.45rem] border border-soft bg-surface-muted p-3.5"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                      style={{
                        backgroundColor: color.iconBackground,
                        borderColor: color.iconBorder,
                      }}
                    >
                      <Icon className="h-4.5 w-4.5" style={{ color: color.iconColor }} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-primary">{row.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">
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
                              ? "border-medium bg-surface-elevated shadow-card"
                              : unavailable
                                ? "cursor-not-allowed border-soft bg-surface-muted opacity-30"
                                : "border-soft bg-surface-elevated hover:border-accent-soft"
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
        </div>

        <div className="relative border-t border-[var(--border-soft)] bg-surface-elevated px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_DESKTOP_CALENDAR_COLORS)}
              className="min-h-12 rounded-2xl border border-soft bg-surface-muted px-4 text-sm font-semibold text-secondary transition active:scale-[0.98]"
            >
              Restaurar
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-12 flex-1 rounded-2xl border border-soft bg-surface-muted px-4 text-sm font-semibold text-secondary transition active:scale-[0.98]"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => onSave(draft)}
              className="min-h-12 flex-1 rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-black text-white shadow-card transition active:scale-[0.98]"
            >
              Salvar cores
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

function PreferenceRow({

  icon: Icon,

  title,

  description,

  value,

  onClick,

}: {

  icon: ElementType;

  title: string;

  description: string;

  value: string;

  onClick?: () => void;

}) {

  const content = (

    <>

      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">

        <Icon className="h-5 w-5" />

      </div>



      <div className="min-w-0 flex-1">

        <p className="truncate text-sm font-black text-primary">{title}</p>

        <p className="mt-0.5 truncate text-xs text-muted">{description}</p>

      </div>



      <div className="flex shrink-0 items-center gap-2">

        <span className="rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">

          {value}

        </span>



        {onClick && <ChevronRight className="h-4 w-4 text-soft" />}

      </div>

    </>

  );



  const className =

    "group flex w-full min-w-0 items-center gap-3 rounded-[1.55rem] border border-soft bg-surface-elevated px-4 py-3 text-left shadow-card backdrop-blur-2xl transition active:scale-[0.98]";



  if (onClick) {

    return (

      <button type="button" onClick={onClick} className={className}>

        {content}

      </button>

    );

  }



  return <div className={className}>{content}</div>;

}



// ===========================================================================

// MEMÓRIAS DO AXON

// ===========================================================================



function AxonMemories() {

  const [memories, setMemories] = useState<api.UserMemory[]>([]);

  const [loading, setLoading] = useState(true);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);



  const visibleMemories = memories.slice(0, 2);



  useEffect(() => {

    api

      .getMemories()

      .then(setMemories)

      .catch(() => setMemories([]))

      .finally(() => setLoading(false));

  }, []);



  async function handleDelete(id: string) {

    setDeletingId(id);



    try {

      await api.deleteMemory(id);

      setMemories((prev) => prev.filter((memory) => memory.id !== id));

      setConfirmingId(null);

    } catch {

      // Mantém a memória na lista em caso de erro.

    } finally {

      setDeletingId(null);

    }

  }



  return (

    <>

      <ProfileSection title="Memórias do Axon">

        <div className="relative min-w-0 overflow-hidden rounded-[1.95rem] border border-soft bg-surface-elevated p-5 shadow-card backdrop-blur-2xl lg:p-6">

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_58%)]" />

          <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-[var(--accent)]/12 blur-3xl" />



          <div className="relative">

            <div className="mb-4 flex items-start gap-3">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">

                <Brain className="h-5 w-5" />

              </div>



              <div className="min-w-0 flex-1">

                <div className="flex min-w-0 items-center justify-between gap-3">

                  <p className="truncate text-sm font-black text-primary">

                    O que torna o Axon mais pessoal

                  </p>



                  <span className="shrink-0 rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">

                    {memories.length}

                  </span>

                </div>



                <p className="mt-1 text-xs leading-5 text-muted">

                  Informações salvas pelo chat para adaptar respostas,

                  planejamento e recomendações ao seu contexto real.

                </p>

              </div>

            </div>



            <div className="divide-y divide-[var(--border-soft)]">

              {loading ? (

                <div className="flex items-center gap-2 rounded-[1.35rem] border border-soft bg-surface-muted px-4 py-5 text-xs text-muted">

                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />

                  Carregando memórias…

                </div>

              ) : memories.length === 0 ? (

                <div className="rounded-[1.35rem] border border-dashed border-soft bg-surface-muted px-4 py-6 text-center">

                  <p className="text-sm font-black text-primary">

                    Nenhuma memória registrada

                  </p>

                  <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-muted">

                    Quando o Axon aprender algo importante sobre você, aparecerá aqui.

                  </p>

                </div>

              ) : (

                visibleMemories.map((memory) => (

                  <p

                    key={memory.id}

                    className="line-clamp-2 rounded-[1.25rem] border border-soft bg-surface-muted px-4 py-3 text-xs leading-5 text-secondary"

                  >

                    {memory.content}

                  </p>

                ))

              )}

            </div>



            <button

              type="button"

              onClick={() => setIsModalOpen(true)}

              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"

            >

              Ver memórias salvas

              <ChevronRight className="ml-2 h-4 w-4" />

            </button>

          </div>

        </div>

      </ProfileSection>



      <MemoriesModal

        isOpen={isModalOpen}

        memories={memories}

        confirmingId={confirmingId}

        deletingId={deletingId}

        onClose={() => setIsModalOpen(false)}

        onAskConfirm={setConfirmingId}

        onCancelConfirm={() => setConfirmingId(null)}

        onDelete={handleDelete}

      />

    </>

  );

}



function MemoriesModal({

  isOpen,

  memories,

  confirmingId,

  deletingId,

  onClose,

  onAskConfirm,

  onCancelConfirm,

  onDelete,

}: {

  isOpen: boolean;

  memories: api.UserMemory[];

  confirmingId: string | null;

  deletingId: string | null;

  onClose: () => void;

  onAskConfirm: (id: string) => void;

  onCancelConfirm: () => void;

  onDelete: (id: string) => void;

}) {

  return (

    <AnimatePresence>

      {isOpen && (

        <motion.div

          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"

          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          onClick={(event) => event.target === event.currentTarget && onClose()}

        >

          <motion.div

            initial={{ opacity: 0, y: 24, scale: 0.97 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: 24, scale: 0.97 }}

            transition={{ duration: 0.22, ease: "easeOut" }}

            className="custom-scrollbar max-h-[86dvh] w-full max-w-[430px] overflow-y-auto rounded-[2rem] border border-soft bg-surface-elevated p-5 text-primary shadow-soft backdrop-blur-2xl"

          >

            <div className="mb-5 flex items-center justify-between">

              <div>

                <p className="text-sm font-black text-primary">

                  Memórias do Axon

                </p>

                <p className="mt-1 text-xs leading-5 text-muted">

                  Informações salvas a partir das conversas.

                </p>

              </div>



              <button

                type="button"

                onClick={onClose}

                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"

                aria-label="Fechar"

              >

                <X className="h-4 w-4" />

              </button>

            </div>



            {memories.length === 0 ? (

              <div className="rounded-[1.35rem] border border-dashed border-soft bg-surface-muted px-4 py-8 text-center">

                <p className="text-sm font-black text-primary">

                  Nenhuma memória ainda

                </p>

                <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-muted">

                  Quando o chat salvar informações importantes, elas aparecem aqui.

                </p>

              </div>

            ) : (

              <div className="space-y-2">

                {memories.map((memory) => (

                  <div

                    key={memory.id}

                    className="rounded-[1.35rem] border border-soft bg-surface-muted px-4 py-3"

                  >

                    <div className="flex items-start gap-3">

                      <p className="min-w-0 flex-1 break-words text-xs leading-5 text-secondary">

                        {memory.content}

                      </p>



                      {confirmingId !== memory.id && (

                        <button

                          type="button"

                          onClick={() => onAskConfirm(memory.id)}

                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-muted transition active:scale-[0.94]"

                          aria-label="Remover memória"

                        >

                          <Trash2 className="h-3.5 w-3.5" />

                        </button>

                      )}

                    </div>



                    {confirmingId === memory.id && (

                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3">

                        <p className="text-[0.7rem] leading-4 text-muted">

                          Remover esta memória permanentemente?

                        </p>



                        <div className="flex shrink-0 items-center gap-2">

                          <button

                            type="button"

                            onClick={onCancelConfirm}

                            disabled={deletingId === memory.id}

                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-muted active:scale-[0.94] disabled:opacity-50"

                            aria-label="Cancelar"

                          >

                            <X className="h-3.5 w-3.5" />

                          </button>



                          <button

                            type="button"

                            onClick={() => onDelete(memory.id)}

                            disabled={deletingId === memory.id}

                            className="flex h-8 items-center gap-1.5 rounded-xl bg-rose-500/90 px-3 text-xs font-semibold text-white active:scale-[0.96] disabled:opacity-60"

                          >

                            {deletingId === memory.id ? (

                              <Loader2 className="h-3.5 w-3.5 animate-spin" />

                            ) : (

                              <Trash2 className="h-3.5 w-3.5" />

                            )}

                            Remover

                          </button>

                        </div>

                      </div>

                    )}

                  </div>

                ))}

              </div>

            )}

          </motion.div>

        </motion.div>

      )}

    </AnimatePresence>

  );

}



// ===========================================================================

// HISTÓRICO DE RELATÓRIOS

// ===========================================================================



// Formata "2026-07-27" + "2026-08-02" como "27 jul – 2 ago".

function formatReportRange(start: string, end: string) {

  const fmt = (iso: string) =>

    new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {

      day: "numeric",

      month: "short",

    });

  return `${fmt(start)} – ${fmt(end)}`;

}



function ReportsHistory() {

  const [reports, setReports] = useState<api.PeriodReport[]>([]);

  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [filter, setFilter] = useState<"all" | "weekly" | "monthly">("all");



  useEffect(() => {

    api

      .getReportsHistory()

      .then(setReports)

      .catch(() => setReports([]))

      .finally(() => setLoading(false));

  }, []);



  const visible =

    filter === "all" ? reports : reports.filter((r) => r.period_type === filter);

  const preview = reports.slice(0, 2);



  return (

    <>

      <ProfileSection title="Relatórios do Axon">

        <div className="relative min-w-0 overflow-hidden rounded-[1.95rem] border border-soft bg-surface-elevated p-5 shadow-card backdrop-blur-2xl lg:p-6">

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_58%)]" />



          <div className="relative">

            <div className="mb-4 flex items-start gap-3">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">

                <FileText className="h-5 w-5" />

              </div>



              <div className="min-w-0 flex-1">

                <div className="flex min-w-0 items-center justify-between gap-3">

                  <p className="truncate text-sm font-black text-primary">

                    Seus resumos de semana e mês

                  </p>



                  <span className="shrink-0 rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">

                    {reports.length}

                  </span>

                </div>



                <p className="mt-1 text-xs leading-5 text-muted">

                  Todo relatório que o Axon já escreveu fica guardado aqui para

                  você comparar períodos.

                </p>

              </div>

            </div>



            <div className="space-y-2">

              {loading ? (

                <div className="flex items-center gap-2 rounded-[1.35rem] border border-soft bg-surface-muted px-4 py-5 text-xs text-muted">

                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />

                  Carregando relatórios…

                </div>

              ) : reports.length === 0 ? (

                <div className="rounded-[1.35rem] border border-dashed border-soft bg-surface-muted px-4 py-6 text-center">

                  <p className="text-sm font-black text-primary">

                    Nenhum relatório ainda

                  </p>

                  <p className="mx-auto mt-2 max-w-[18rem] text-xs leading-5 text-muted">

                    O Axon escreve um resumo ao fim de cada semana e de cada mês.

                    O primeiro aparece aqui assim que o período fechar.

                  </p>

                </div>

              ) : (

                preview.map((report) => (

                  <div

                    key={report.id}

                    className="rounded-[1.25rem] border border-soft bg-surface-muted px-4 py-3"

                  >

                    <div className="mb-1 flex items-center justify-between gap-2">

                      <span className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-accent">

                        {report.period_type === "weekly" ? "Semana" : "Mês"}

                      </span>

                      <span className="shrink-0 text-[0.62rem] text-muted">

                        {formatReportRange(report.period_start, report.period_end)}

                      </span>

                    </div>

                    <p className="line-clamp-2 text-xs leading-5 text-secondary">

                      {report.narrative}

                    </p>

                  </div>

                ))

              )}

            </div>



            {reports.length > 0 && (

              <button

                type="button"

                onClick={() => setIsModalOpen(true)}

                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"

              >

                Ver todos os relatórios

                <ChevronRight className="ml-2 h-4 w-4" />

              </button>

            )}

          </div>

        </div>

      </ProfileSection>



      <ReportsHistoryModal

        isOpen={isModalOpen}

        reports={visible}

        filter={filter}

        onFilterChange={setFilter}

        onClose={() => setIsModalOpen(false)}

      />

    </>

  );

}



function ReportsHistoryModal({

  isOpen,

  reports,

  filter,

  onFilterChange,

  onClose,

}: {

  isOpen: boolean;

  reports: api.PeriodReport[];

  filter: "all" | "weekly" | "monthly";

  onFilterChange: (value: "all" | "weekly" | "monthly") => void;

  onClose: () => void;

}) {

  const filters: { key: "all" | "weekly" | "monthly"; label: string }[] = [

    { key: "all", label: "Todos" },

    { key: "weekly", label: "Semanais" },

    { key: "monthly", label: "Mensais" },

  ];



  // O relatório abre em tela cheia (/relatorio/:id), não em pop-up: as 3

  // seções não cabiam confortavelmente num modal.

  const navigate = useNavigate();



  return (

    <AnimatePresence>

      {isOpen && (

        <motion.div

          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          onClick={onClose}

          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center"

        >

          <motion.div

            initial={{ y: "100%", opacity: 0.6 }}

            animate={{ y: 0, opacity: 1 }}

            exit={{ y: "100%", opacity: 0.6 }}

            transition={{ type: "spring", stiffness: 260, damping: 30 }}

            onClick={(e) => e.stopPropagation()}

            className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-soft bg-surface-elevated p-5 text-primary shadow-soft sm:rounded-[2rem]"

          >

            <div className="mb-4 flex items-start justify-between gap-3">

              <div>

                <p className="text-lg font-black text-primary">

                  Relatórios do Axon

                </p>

                <p className="mt-1 text-xs text-muted">

                  Compare como foram suas semanas e meses.

                </p>

              </div>



              <button

                type="button"

                onClick={onClose}

                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"

                aria-label="Fechar"

              >

                <X className="h-4 w-4" />

              </button>

            </div>



            <div className="mb-4 flex gap-2">

              {filters.map((f) => (

                <button

                  key={f.key}

                  type="button"

                  onClick={() => onFilterChange(f.key)}

                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.96] ${

                    filter === f.key

                      ? "border-accent-soft bg-accent-soft text-accent"

                      : "border-soft bg-surface-muted text-muted"

                  }`}

                >

                  {f.label}

                </button>

              ))}

            </div>



            {reports.length === 0 ? (

              <div className="rounded-[1.35rem] border border-dashed border-soft bg-surface-muted px-4 py-8 text-center">

                <p className="text-sm text-muted">

                  Nenhum relatório neste filtro.

                </p>

              </div>

            ) : (

              <div className="space-y-3">

                {reports.map((report) => (

                  <article

                    key={report.id}

                    role="button"

                    tabIndex={0}

                    onClick={() => navigate(`/relatorio/${report.id}`)}

                    onKeyDown={(e) => {

                      if (e.key === "Enter" || e.key === " ") {

                        e.preventDefault();

                        navigate(`/relatorio/${report.id}`);

                      }

                    }}

                    className="cursor-pointer rounded-[1.5rem] border border-soft bg-surface-muted p-4 transition active:scale-[0.99]"

                  >

                    <div className="mb-2 flex items-center justify-between gap-2">

                      <span className="rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">

                        {report.period_type === "weekly" ? "Semana" : "Mês"}

                      </span>

                      <span className="shrink-0 text-[0.65rem] text-muted">

                        {formatReportRange(

                          report.period_start,

                          report.period_end

                        )}

                      </span>

                    </div>



                    <p className="text-xs leading-6 text-secondary">

                      {report.narrative}

                    </p>



                    {/* Números do período: é o que permite comparar entre si. */}

                    <div className="mt-3 flex flex-wrap gap-2">

                      <span className="rounded-full border border-accent-soft bg-accent-soft px-3 py-1 text-[0.65rem] font-semibold text-accent">

                        {report.data.avg_completion_rate}% de conclusão média

                      </span>



                      {report.data.most_productive_day && (

                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-100">

                          Melhor dia:{" "}

                          {report.data.most_productive_day.completion_rate}%

                        </span>

                      )}



                      {report.data.key_tasks.defined > 0 && (

                        <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[0.65rem] font-semibold text-amber-700 dark:text-amber-100">

                          {report.data.key_tasks.done}/

                          {report.data.key_tasks.defined} tarefas-chave

                        </span>

                      )}

                    </div>

                  </article>

                ))}

              </div>

            )}

          </motion.div>

        </motion.div>

      )}

    </AnimatePresence>

  );

}



// ===========================================================================

// MODAL DE ESTILO DE ROTINA

// ===========================================================================



type WeekDayKey = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";



type FixedRoutineEntry = {

  id: string;

  activity: string;

  days: WeekDayKey[];

  startTime: string;

  endTime: string;

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



function ScheduleStyleModal({

  isOpen,

  currentValue,

  onClose,

  onSave,

}: {

  isOpen: boolean;

  currentValue: ScheduleType;

  onClose: () => void;

  onSave: (value: ScheduleType) => void;

}) {

  const [selected, setSelected] = useState<ScheduleType>(currentValue);

  const [fixedRoutines, setFixedRoutines] = useState<FixedRoutineEntry[]>([

    createFixedRoutineEntry(),

  ]);



  useEffect(() => {

    if (!isOpen) return;



    setSelected(currentValue);

    setFixedRoutines([createFixedRoutineEntry()]);

  }, [isOpen, currentValue]);



  function updateFixedRoutine(

    id: string,

    field: "activity" | "startTime" | "endTime",

    value: string

  ) {

    setFixedRoutines((current) =>

      current.map((routine) =>

        routine.id === id ? { ...routine, [field]: value } : routine

      )

    );

  }



  function toggleRoutineDay(id: string, day: WeekDayKey) {

    setFixedRoutines((current) =>

      current.map((routine) => {

        if (routine.id !== id) return routine;



        const nextDays = routine.days.includes(day)

          ? routine.days.filter((currentDay) => currentDay !== day)

          : [...routine.days, day];



        return {

          ...routine,

          days: nextDays,

        };

      })

    );

  }



  function addFixedRoutine() {

    setFixedRoutines((current) => [...current, createFixedRoutineEntry()]);

  }



  function removeFixedRoutine(id: string) {

    setFixedRoutines((current) => {

      if (current.length === 1) return current;



      return current.filter((routine) => routine.id !== id);

    });

  }



  return (

    <AnimatePresence>

      {isOpen && (

        <motion.div

          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"

          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          onClick={(event) => event.target === event.currentTarget && onClose()}

        >

          <motion.div

            initial={{ opacity: 0, y: 18, scale: 0.97 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: 18, scale: 0.97 }}

            transition={{ duration: 0.22, ease: "easeOut" }}

            className="custom-scrollbar max-h-[88dvh] w-full max-w-[460px] overflow-y-auto rounded-[2rem] border border-soft bg-surface-elevated p-5 text-primary shadow-soft backdrop-blur-2xl"

          >

            <div className="mb-5 flex items-center justify-between gap-4">

              <div>

                <p className="text-sm font-black text-primary">

                  Estilo de rotina

                </p>

                <p className="mt-1 text-xs leading-5 text-muted">

                  Configure seus horários fixos sem precisar digitar os dias.

                </p>

              </div>



              <button

                type="button"

                onClick={onClose}

                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"

                aria-label="Fechar"

              >

                <X className="h-4 w-4" />

              </button>

            </div>



            <div className="grid gap-2">

              <ScheduleOption

                active={selected === "flexible"}

                icon={Sparkles}

                title="Rotina flexível"

                description="Meus horários mudam bastante ou organizo o dia livremente."

                onClick={() => setSelected("flexible")}

              />



              <ScheduleOption

                active={selected === "fixed"}

                icon={Briefcase}

                title="Rotina fixa"

                description="Tenho trabalho, estudo ou compromissos em horários definidos."

                onClick={() => setSelected("fixed")}

              />

            </div>



            {selected === "fixed" && (

              <div className="mt-4 space-y-3">

                <div className="rounded-[1.5rem] border border-accent-soft bg-accent-soft p-4">

                  <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">

                    Rotinas fixas

                  </p>



                  <p className="mt-1 text-xs leading-5 text-muted">

                    Adicione uma rotina para cada bloco fixo do seu dia. Assim,

                    se algum dia tiver horário diferente, basta criar outro

                    bloco com dias e horários próprios.

                  </p>

                </div>



                {fixedRoutines.map((routine, index) => (

                  <FixedRoutineCard

                    key={routine.id}

                    routine={routine}

                    index={index}

                    canRemove={fixedRoutines.length > 1}

                    onRemove={() => removeFixedRoutine(routine.id)}

                    onChange={(field, value) =>

                      updateFixedRoutine(routine.id, field, value)

                    }

                    onToggleDay={(day) => toggleRoutineDay(routine.id, day)}

                  />

                ))}



                <button

                  type="button"

                  onClick={addFixedRoutine}

                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"

                >

                  <Plus className="mr-2 h-4 w-4" />

                  Adicionar outra rotina

                </button>

              </div>

            )}



            <div className="mt-5 grid grid-cols-2 gap-3">

              <button

                type="button"

                onClick={onClose}

                className="min-h-12 rounded-2xl border border-soft bg-surface-muted px-4 text-sm font-semibold text-secondary transition active:scale-[0.98]"

              >

                Cancelar

              </button>



              <button

                type="button"

                onClick={() => onSave(selected)}

                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-card transition active:scale-[0.98]"

              >

                Salvar

              </button>

            </div>

          </motion.div>

        </motion.div>

      )}

    </AnimatePresence>

  );

}



function ScheduleOption({

  active,

  icon: Icon,

  title,

  description,

  onClick,

}: {

  active: boolean;

  icon: ElementType;

  title: string;

  description: string;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      className={`flex w-full items-start gap-3 rounded-[1.45rem] border p-3 text-left transition active:scale-[0.98] ${

        active

          ? "border-accent-soft bg-accent-soft"

          : "border-soft bg-surface-muted"

      }`}

    >

      <div

        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${

          active

            ? "border-accent-soft bg-surface-elevated text-accent"

            : "border-soft bg-surface-elevated text-muted"

        }`}

      >

        <Icon className="h-4 w-4" />

      </div>



      <div className="min-w-0 flex-1">

        <p className="text-sm font-black text-primary">{title}</p>

        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>

      </div>



      {active && <Check className="h-4 w-4 shrink-0 text-accent" />}

    </button>

  );

}



function FixedRoutineCard({

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

  onChange: (

    field: "activity" | "startTime" | "endTime",

    value: string

  ) => void;

  onToggleDay: (day: WeekDayKey) => void;

}) {

  return (

    <div className="rounded-[1.5rem] border border-soft bg-surface-muted p-4">

      <div className="mb-3 flex items-center justify-between gap-3">

        <p className="text-xs font-black uppercase tracking-[0.12em] text-soft">

          Rotina {index + 1}

        </p>



        {canRemove && (

          <button

            type="button"

            onClick={onRemove}

            className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 text-red-600 transition active:scale-[0.94] dark:text-red-300"

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

        <p className="mb-2 text-xs font-semibold text-muted">

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

                    ? "border-accent-soft bg-[var(--accent-strong)] text-white"

                    : "border-soft bg-surface-elevated text-muted"

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

          placeholder="08:00"

          value={routine.startTime}

          onChange={(value) => onChange("startTime", value)}

        />



        <ScheduleInput

          label="Fim"

          type="time"

          placeholder="18:00"

          value={routine.endTime}

          onChange={(value) => onChange("endTime", value)}

        />

      </div>

    </div>

  );

}



function ScheduleInput({

  label,

  placeholder,

  value,

  onChange,

  type = "text",

}: {

  label: string;

  placeholder: string;

  value: string;

  onChange: (value: string) => void;

  type?: "text" | "time";

}) {

  return (

    <label className="block">

      <span className="mb-2 block text-xs font-semibold text-muted">

        {label}

      </span>



      <input

        type={type}

        value={value}

        onChange={(event) => onChange(event.target.value)}

        placeholder={placeholder}

        className="w-full rounded-2xl border border-soft bg-surface-elevated px-4 py-3 text-sm font-medium text-primary outline-none transition placeholder:text-soft focus:border-accent-soft"

      />

    </label>

  );

}



// ===========================================================================

// AVATAR DO PERFIL

// ===========================================================================



function AvatarUpload({

  avatarUrl,

  onUpdate,

}: {

  avatarUrl?: string;

  onUpdate: (profile: ProfileData) => void;

}) {

  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);



  // Estado local do upload, menu e erro visual.

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [showMenu, setShowMenu] = useState(false);



  // Fecha o menu de avatar ao clicar fora dele.

  useEffect(() => {

    if (!showMenu) return;



    function handleClick(e: MouseEvent) {

      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {

        setShowMenu(false);

      }

    }



    document.addEventListener("mousedown", handleClick);



    return () => {

      document.removeEventListener("mousedown", handleClick);

    };

  }, [showMenu]);



  // Envia a nova imagem e atualiza o perfil retornado pelo backend.

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {

    const file = e.target.files?.[0];



    if (!file) return;



    setShowMenu(false);

    setError(null);

    setLoading(true);



    try {

      const updated = await api.uploadAvatar(file);

      onUpdate(updated);

    } catch (err: unknown) {

      setError(err instanceof Error ? err.message : "Erro ao enviar imagem.");

    } finally {

      setLoading(false);



      // Permite selecionar o mesmo arquivo novamente depois de um envio.

      if (fileInputRef.current) {

        fileInputRef.current.value = "";

      }

    }

  }



  // Remove a foto atual e sincroniza o card com o perfil atualizado.

  async function handleDelete() {

    setShowMenu(false);

    setLoading(true);

    setError(null);



    try {

      const updated = await api.deleteAvatar();

      onUpdate(updated);

    } catch (err: unknown) {

      setError(err instanceof Error ? err.message : "Erro ao remover imagem.");

    } finally {

      setLoading(false);

    }

  }



  return (

    <div className="relative shrink-0 overflow-visible" ref={menuRef}>

      {/* Input fica oculto; o clique acontece pelo avatar. */}

      <input

        ref={fileInputRef}

        type="file"

        accept="image/jpeg,image/png,image/webp"

        className="hidden"

        onChange={handleFileChange}

      />



      <button

        type="button"

        onClick={() =>

          avatarUrl ? setShowMenu((value) => !value) : fileInputRef.current?.click()

        }

        disabled={loading}

        className="group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-visible rounded-full text-3xl font-black text-accent transition active:scale-[0.97] disabled:opacity-60"

        aria-label="Foto de perfil"

      >

        <span className="absolute inset-0 overflow-hidden rounded-full bg-accent-soft shadow-[0_24px_80px_rgba(123,44,191,0.34)] ring-4 ring-white/6 dark:shadow-[0_28px_90px_rgba(168,85,247,0.32)]">

          {loading ? (

            <span className="flex h-full w-full items-center justify-center">

              <Loader2 className="h-7 w-7 animate-spin text-accent" />

            </span>

          ) : avatarUrl ? (

            <img

              src={avatarUrl}

              alt="Avatar"

              className="h-full w-full object-cover"

            />

          ) : (

            <span className="flex h-full w-full items-center justify-center">

              <User className="h-10 w-10" />

            </span>

          )}

        </span>



        {!loading && (

          <span className="absolute -bottom-1 -right-1 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--surface-elevated)] bg-[var(--accent-strong)] text-white shadow-card transition group-active:scale-[0.94]">

            <Camera className="h-3.5 w-3.5" />

          </span>

        )}

      </button>



      {/* Menu aparece apenas quando já existe uma foto cadastrada. */}

      <AnimatePresence>

        {showMenu && (

          <motion.div

            initial={{ opacity: 0, scale: 0.92, y: -4 }}

            animate={{ opacity: 1, scale: 1, y: 0 }}

            exit={{ opacity: 0, scale: 0.92, y: -4 }}

            transition={{ duration: 0.15, ease: "easeOut" }}

            className="absolute left-1/2 top-[calc(100%+12px)] z-50 min-w-[180px] -translate-x-1/2 overflow-hidden rounded-2xl border border-soft bg-surface-elevated py-1 text-primary shadow-soft backdrop-blur-2xl"

          >

            <button

              type="button"

              onClick={() => {

                setShowMenu(false);

                fileInputRef.current?.click();

              }}

              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-secondary transition hover:bg-surface-muted active:bg-surface-muted"

            >

              <Camera className="h-4 w-4 text-accent" />

              Trocar foto

            </button>



            <button

              type="button"

              onClick={handleDelete}

              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-600 transition hover:bg-red-500/10 active:bg-red-500/10 dark:text-red-400"

            >

              <Trash2 className="h-4 w-4" />

              Remover foto

            </button>

          </motion.div>

        )}

      </AnimatePresence>



      {error && (

        <p className="absolute left-1/2 top-[calc(100%+42px)] z-50 w-52 -translate-x-1/2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[0.7rem] leading-5 text-red-600 dark:text-red-400">

          {error}

        </p>

      )}

    </div>

  );

}



// ===========================================================================

// MODAL DE EDIÇÃO DE NOME

// ===========================================================================



function EditProfileModal({

  isOpen,

  currentName,

  avatarUrl,

  onAvatarUpdate,

  onClose,

  onSaveName,

}: {

  isOpen: boolean;

  currentName: string;

  avatarUrl?: string;

  onAvatarUpdate: (profile: ProfileData) => void;

  onClose: () => void;

  onSaveName: (name: string) => void;

}) {

  const inputRef = useRef<HTMLInputElement>(null);



  const [nameValue, setNameValue] = useState(currentName);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    if (isOpen) {

      setNameValue(currentName);

      setError(null);

      setTimeout(() => inputRef.current?.focus(), 120);

    }

  }, [isOpen, currentName]);



  async function handleSave() {

    const trimmedName = nameValue.trim();



    if (!trimmedName) {

      setError("O nome não pode ser vazio.");

      return;

    }



    setSaving(true);

    setError(null);



    try {

      await api.updateProfile({ name: trimmedName });

      onSaveName(trimmedName);

    } catch (e: unknown) {

      setError(e instanceof Error ? e.message : "Erro ao salvar.");

    } finally {

      setSaving(false);

    }

  }



  return (

    <AnimatePresence>

      {isOpen && (

        <motion.div

          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"

          initial={{ opacity: 0 }}

          animate={{ opacity: 1 }}

          exit={{ opacity: 0 }}

          onClick={(event) => event.target === event.currentTarget && onClose()}

        >

          <motion.div

            initial={{ opacity: 0, y: 24, scale: 0.97 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: 24, scale: 0.97 }}

            transition={{ duration: 0.22, ease: "easeOut" }}

            className="custom-scrollbar max-h-[86dvh] w-full max-w-[430px] overflow-y-auto rounded-[2rem] border border-soft bg-surface-elevated p-5 text-primary shadow-soft backdrop-blur-2xl"

          >

            <div className="mb-5 flex items-center justify-between">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">

                  <Edit3 className="h-4 w-4" />

                </div>



                <div>

                  <p className="text-sm font-black text-primary">

                    Editar perfil

                  </p>

                  <p className="text-xs text-muted">

                    Foto e nome do perfil

                  </p>

                </div>

              </div>



              <button

                type="button"

                onClick={onClose}

                className="flex h-9 w-9 items-center justify-center rounded-xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96]"

                aria-label="Fechar"

              >

                <X className="h-4 w-4" />

              </button>

            </div>



            <div className="mb-5 flex flex-col items-center text-center">

              <AvatarUpload avatarUrl={avatarUrl} onUpdate={onAvatarUpdate} />



            </div>



            <div className="space-y-3">

              <ProfileEditField

                inputRef={inputRef}

                icon={User}

                label="Nome"

                value={nameValue}

                onChange={setNameValue}

                placeholder="Seu nome"

              />



            </div>



            {error && (

              <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">

                {error}

              </p>

            )}



            <div className="mt-5 grid grid-cols-2 gap-3">

              <button

                type="button"

                onClick={onClose}

                disabled={saving}

                className="min-h-12 rounded-2xl border border-soft bg-surface-muted px-4 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-50"

              >

                Cancelar

              </button>



              <button

                type="button"

                onClick={handleSave}

                disabled={saving || !nameValue.trim()}

                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-50"

              >

                {saving ? (

                  <Loader2 className="h-4 w-4 animate-spin" />

                ) : (

                  <Check className="h-4 w-4" />

                )}

                Salvar

              </button>

            </div>

          </motion.div>

        </motion.div>

      )}

    </AnimatePresence>

  );

}



function ProfileEditField({

  inputRef,

  icon: Icon,

  label,

  value,

  onChange,

  placeholder,

  disabled = false,

  helper,

}: {

  inputRef?: RefObject<HTMLInputElement | null>;

  icon: ElementType;

  label: string;

  value: string;

  onChange: (value: string) => void;

  placeholder?: string;

  disabled?: boolean;

  helper?: string;

}) {

  return (

    <label className="block">

      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-soft">

        {label}

      </span>



      <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-soft bg-surface-muted px-4 transition focus-within:border-accent-soft">

        <Icon className="h-4 w-4 shrink-0 text-accent" />



        <input

          ref={inputRef}

          type="text"

          value={value}

          onChange={(event) => onChange(event.target.value)}

          disabled={disabled}

          placeholder={placeholder}

          className="w-full bg-transparent text-sm font-medium text-primary outline-none placeholder:text-soft disabled:cursor-not-allowed disabled:text-muted"

        />

      </div>



      {helper && <p className="mt-2 px-1 text-xs text-muted">{helper}</p>}

    </label>

  );

}