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

import { useNavigate } from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";

import {

  ArrowLeft,

  Brain,

  Camera,

  Check,

  ChevronDown,

  ChevronRight,

  Edit3,

  FileText,

  Loader2,

  LogOut,

  Mail,

  Menu,

  RefreshCcw,

  Settings as SettingsIcon,

  Shield,

  Trash2,

  User,

  X,

} from "lucide-react";



import Sidebar from "../components/layout/Sidebar";

import AppBackground from "../components/layout/AppBackground";

import ConfirmDialog from "../components/ui/ConfirmDialog";

import { results, type ChronotypeResultKey } from "../data/results";

import * as api from "../lib/api";

import type { ProfileData } from "../lib/api";







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



function ProfileLightThemeStyles() {

  return (

    <style>{`

      /* O Profile precisa de uma superfície escura explícita: classes claras
         do Tailwind não devem prevalecer quando o tema escuro está ativo. */
      .dark .profile-light-theme {
        background-color: #0d0b15 !important;
        color: var(--text-primary, #f8fafc);
      }

      /* Elementos originalmente brancos/cinza-claro: no dark usam superfícies
         discretas, sem alterar os gradientes e cartões escuros existentes. */
      .dark .profile-light-theme .bg-white,
      .dark .profile-light-theme .bg-slate-50 {
        background-color: rgba(255, 255, 255, 0.045) !important;
      }

      /* O conteúdo não deve manter o branco da página no dark theme. */
      .dark .profile-light-theme .bg-\[\#f7f8fa\] {
        background-color: #0d0b15 !important;
      }

      html:not(.dark) body:not(.dark) .profile-light-theme {

        --bg-app: #f7f8fa;

        --surface-elevated: #ffffff;

        --surface-muted: #f7f8fa;

        --border-soft: #e2e8f0;

        --border-medium: #cbd5e1;

        --text-primary: #0f172a;

        --text-secondary: #475569;

        --text-muted: #64748b;

        --text-soft: #94a3b8;

        --accent: #6d28d9;

        --accent-strong: #6d28d9;

        --accent-soft: rgba(109, 40, 217, 0.12);

        --accent-muted: rgba(109, 40, 217, 0.07);

      }

    `}</style>

  );

}







type SettingRowProps = {

  icon: ElementType;

  title: string;

  description: string;

  value?: string;

  onClick?: () => void;

  danger?: boolean;

};



// ===========================================================================

// PÁGINA DE PERFIL

// ===========================================================================



export default function Profile() {

  const navigate = useNavigate();



  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileData | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [showDeleteFirstModal, setShowDeleteFirstModal] = useState(false);

  const [showDeleteFinalModal, setShowDeleteFinalModal] = useState(false);



  useEffect(() => {

    if (!api.isLoggedIn()) {

      navigate("/login");

      return;

    }



    api

      .getProfile()

      .then((loadedProfile) => {

        setProfile(loadedProfile);

      })

      .catch(() => setProfile(null));

  }, [navigate]);



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



  function openResult() {

    if (!hasChronotype) {

      navigate("/questionnaire-intro");

      return;

    }



    navigate(`/result-report?chronotype=${resultKey}`);

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



  return (

    <main className="profile-light-theme relative min-h-screen overflow-hidden bg-[#f7f8fa] text-primary dark:bg-app">

      <ProfileLightThemeStyles />



      <div className="hidden dark:block">

        <AppBackground />

      </div>



      <section className="relative z-10 hidden min-h-screen w-full px-6 py-6 lg:block">

        <div className="mx-auto w-full max-w-[1120px]">

          <header className="mb-5 flex items-center justify-between">

            <button type="button" onClick={() => navigate("/dashboard")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65" aria-label="Voltar ao dashboard">

              <ArrowLeft className="h-5 w-5" />

            </button>

            <button type="button" onClick={() => setIsSidebarOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65" aria-label="Abrir menu">

              <Menu className="h-5 w-5" />

            </button>

          </header>



          <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">

            <div className="grid gap-4">

              <ProfileHeader userName={userName} userEmail={userEmail} avatarUrl={profile?.avatar_url} onEditProfile={() => setIsEditOpen(true)} />

              <ProductiveProfileCard hasChronotype={hasChronotype} result={result} resultKey={resultKey} onOpenResult={openResult} onQuestionnaire={() => navigate("/questionnaire-intro")} />

            </div>



            <div className="grid gap-4">

              <AxonMemories />

              <ReportsHistory />

              <div className="grid gap-2 rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-card">

                <AccountSecuritySection userEmail={userEmail} />

                <CompactProfileRow icon={SettingsIcon} title="Configurações" description="Organização, aparência, voz e notificações." onClick={() => navigate("/settings")} />

              </div>

              <CompactProfileRow icon={LogOut} title="Sair da conta" description="Encerre sua sessão neste dispositivo." onClick={() => setShowLogoutModal(true)} danger />

              <DataPrivacySection userEmail={userEmail} onDeleteAccount={() => setShowDeleteFirstModal(true)} />

            </div>

          </div>

        </div>

      </section>



      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[430px] overflow-x-hidden px-4 pb-8 pt-5 lg:hidden">

        <header className="mb-5 flex items-center justify-between">

          <button

            type="button"

            onClick={() => navigate("/dashboard")}

            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-[0_8px_22px_rgba(15,23,42,0.07)] transition active:scale-[0.96] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65 dark:shadow-card"

            aria-label="Voltar ao dashboard"

            title="Dashboard"

          >

            <ArrowLeft className="h-5 w-5" />

          </button>



          <button

            type="button"

            onClick={() => setIsSidebarOpen(true)}

            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-[0_8px_22px_rgba(15,23,42,0.07)] transition active:scale-[0.96] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/65 dark:shadow-card"

            aria-label="Abrir menu"

          >

            <Menu className="h-5 w-5" />

          </button>

        </header>



        <ProfileHeader

          userName={userName}

          userEmail={userEmail}

          avatarUrl={profile?.avatar_url}

          onEditProfile={() => setIsEditOpen(true)}

        />



        <div className="mt-4 grid min-w-0 gap-4">

          <ProductiveProfileCard

            hasChronotype={hasChronotype}

            result={result}

            resultKey={resultKey}

            onOpenResult={openResult}

            onQuestionnaire={() => navigate("/questionnaire-intro")}

          />



          <div className="grid gap-2 rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-card">

            <AxonMemories />

            <ReportsHistory />

          </div>



          <div className="grid gap-2 rounded-[1.4rem] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-card">

            <AccountSecuritySection userEmail={userEmail} />

            <CompactProfileRow icon={SettingsIcon} title="Configurações" description="Organização, aparência, voz e notificações." onClick={() => navigate("/settings")} />

          </div>



          <div className="grid gap-2">

            <CompactProfileRow icon={LogOut} title="Sair da conta" description="Encerre sua sessão neste dispositivo." onClick={() => setShowLogoutModal(true)} danger />

            <DataPrivacySection userEmail={userEmail} onDeleteAccount={() => setShowDeleteFirstModal(true)} />

          </div>

        </div>

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



    </main>

  );

}



// ===========================================================================



// CARDS PRINCIPAIS DO PERFIL



// ===========================================================================









function AccountSecuritySection({ userEmail }: { userEmail: string }) {

  return (

    <ProfileExpandableRow

      icon={Shield}

      title="Conta e segurança"

      description="Gerencie seu e-mail, senha e acesso à conta."

    >

      <AccountInlineContent userEmail={userEmail} />

    </ProfileExpandableRow>

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

    <>

      <div className="lg:hidden">

        <CompactProfileRow

          icon={Trash2}

          title="Excluir conta"

          description="Remova permanentemente sua conta e seus dados."

          onClick={onDeleteAccount}

          danger

        />

      </div>



      <div className="hidden lg:block">

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

      </div>

    </>

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



function AccountInlineContent({ userEmail }: { userEmail: string }) {

  const [nextEmail, setNextEmail] = useState(userEmail);

  const [emailPassword, setEmailPassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");

  const [nextPassword, setNextPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");



  const passwordsMatch =

    nextPassword.length === 0 ||

    confirmPassword.length === 0 ||

    nextPassword === confirmPassword;



  return (

    <div className="grid gap-3">

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">

        <p className="text-[0.65rem] font-semibold text-slate-400 dark:text-white/35">E-mail atual</p>

        <div className="mt-1.5 flex min-w-0 items-center gap-2">

          <Mail className="h-3.5 w-3.5 shrink-0 text-[#6d28d9]" />

          <p className="min-w-0 truncate text-xs font-black text-slate-700 dark:text-white/75">

            {userEmail || "E-mail não encontrado"}

          </p>

        </div>

      </div>



      <details className="group rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035]">

        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden dark:text-white/75">

          <Mail className="h-3.5 w-3.5 text-[#6d28d9]" />

          <span className="flex-1">Alterar e-mail</span>

          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />

        </summary>

        <div className="grid gap-2 border-t border-slate-200 p-3 dark:border-white/10">

          <SettingsInput label="Novo e-mail" value={nextEmail} onChange={setNextEmail} placeholder="seuemail@exemplo.com" type="email" />

          <SettingsInput label="Senha atual" value={emailPassword} onChange={setEmailPassword} placeholder="Confirme sua senha" type="password" />

        </div>

      </details>



      <details className="group rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.035]">

        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden dark:text-white/75">

          <Shield className="h-3.5 w-3.5 text-[#6d28d9]" />

          <span className="flex-1">Alterar senha</span>

          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />

        </summary>

        <div className="grid gap-2 border-t border-slate-200 p-3 dark:border-white/10">

          <SettingsInput label="Senha atual" value={currentPassword} onChange={setCurrentPassword} placeholder="Digite sua senha atual" type="password" />

          <SettingsInput label="Nova senha" value={nextPassword} onChange={setNextPassword} placeholder="Digite uma nova senha" type="password" />

          <SettingsInput label="Confirmar nova senha" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repita a nova senha" type="password" />

          {!passwordsMatch && (

            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[0.68rem] text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300">

              As senhas não coincidem.

            </p>

          )}

        </div>

      </details>



      <p className="text-[0.68rem] leading-5 text-slate-500 dark:text-white/40">

        O salvamento será ativado quando o backend disponibilizar as rotas de alteração de e-mail e senha.

      </p>

    </div>

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



    <section>



      <div className="relative overflow-hidden rounded-[1.75rem] border border-soft bg-surface-elevated px-4 pb-5 pt-5 text-center shadow-card dark:backdrop-blur-2xl lg:p-7">



        <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_58%)] dark:block" />



        <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-28 bg-gradient-to-b from-[var(--accent-muted)] to-transparent dark:block" />







        <div className="relative mx-auto flex w-fit items-center justify-center">



          <div className="absolute hidden h-44 w-44 rounded-full bg-[var(--accent)]/28 blur-[48px] dark:block" />



          <AvatarDisplay avatarUrl={avatarUrl} userName={userName} />



        </div>







        <div className="relative mx-auto mt-4 max-w-[20rem]">



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



          className="relative mx-auto mt-4 inline-flex min-h-11 w-full max-w-[17rem] items-center justify-center rounded-2xl border border-soft bg-surface-muted px-5 text-sm font-semibold text-secondary transition hover:border-accent-soft hover:text-primary active:scale-[0.98]"



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



    <div className="relative z-10 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-3xl font-black text-accent shadow-[0_12px_35px_rgba(15,23,42,0.10)] ring-4 ring-slate-200/80 dark:shadow-[0_28px_90px_rgba(168,85,247,0.32)] dark:ring-white/6">



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







function CompactProfileRow({

  icon: Icon,

  title,

  description,

  count,

  onClick,

  danger = false,

}: {

  icon: ElementType;

  title: string;

  description?: string;

  count?: number;

  onClick: () => void;

  danger?: boolean;

}) {

  return (

    <button

      type="button"

      onClick={onClick}

      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-white px-3.5 py-2.5 text-left shadow-[0_5px_16px_rgba(15,23,42,0.04)] transition active:scale-[0.98] dark:bg-white/[0.04] ${

        danger

          ? "border-red-200/90 text-red-600 dark:border-red-400/20 dark:text-red-300"

          : "border-slate-200/90 text-slate-950 dark:border-white/10 dark:text-white"

      }`}

    >

      <Icon className={`h-4 w-4 shrink-0 ${danger ? "text-red-500" : "text-[#6d28d9]"}`} />

      <span className="min-w-0 flex-1">

        <span className="block truncate text-sm font-black">{title}</span>

        {description && (

          <span className="mt-0.5 block text-[0.7rem] leading-4 text-slate-500 dark:text-white/40">{description}</span>

        )}

      </span>

      {typeof count === "number" && (

        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-black text-slate-500 dark:bg-white/[0.07] dark:text-white/45">{count}</span>

      )}

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-white/30" />

    </button>

  );

}



function ProfileExpandableRow({

  icon: Icon,

  title,

  description,

  count,

  children,

}: {

  icon: ElementType;

  title: string;

  description: string;

  count?: number;

  children: ReactNode;

}) {

  return (

    <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_5px_16px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04]">

      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 text-left [&::-webkit-details-marker]:hidden">

        <Icon className="h-4 w-4 shrink-0 text-[#6d28d9]" />

        <span className="min-w-0 flex-1">

          <span className="block truncate text-sm font-black text-slate-950 dark:text-white">{title}</span>

          <span className="mt-0.5 block text-[0.7rem] leading-4 text-slate-500 dark:text-white/40">{description}</span>

        </span>

        {typeof count === "number" && (

          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-black text-slate-500 dark:bg-white/[0.07] dark:text-white/45">{count}</span>

        )}

        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 dark:text-white/30" />

      </summary>

      <div className="mx-2 mb-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 dark:border-white/10 dark:bg-black/15">

        {children}

      </div>

    </details>

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

    <article className="w-full min-w-0 rounded-[1.6rem] border border-slate-200/90 bg-white p-4 text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:shadow-card sm:p-5">

      <div className="flex items-start gap-3">

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#6d28d9]/10 text-[#6d28d9] dark:bg-[#6d28d9]/20 dark:text-purple-300">

          <Brain className="h-5 w-5" />

        </span>



        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center justify-between gap-2">

            <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">

              Seu ritmo atual

            </p>

            {hasChronotype && (

              <span className="rounded-full bg-[#6d28d9]/[0.08] px-2.5 py-1 text-[0.6rem] font-black text-[#6d28d9] dark:bg-[#6d28d9]/20 dark:text-purple-300">

                {resultKey}

              </span>

            )}

          </div>



          <h2 className="mt-1 text-xl font-black tracking-[-0.045em] sm:text-2xl">

            {hasChronotype ? result.label : "Cronotipo não definido"}

          </h2>

          <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-white/45">

            {hasChronotype

              ? result.subtitle

              : "Responda o questionário para o Axon entender seus horários de energia, foco e descanso."}

          </p>

        </div>

      </div>



      <div className="mt-4 grid grid-cols-2 gap-2">

        <ProductiveMetric label="Pico de energia" value={result.energyPeak} />

        <ProductiveMetric label="Melhor foco" value={result.focusWindow} />

      </div>



      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">

        <button

          type="button"

          onClick={onOpenResult}

          className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-2xl bg-[#6d28d9] px-3 text-xs font-black text-white shadow-[0_6px_18px_rgba(109,40,217,0.18)] transition active:scale-[0.98] sm:text-sm"

        >

          Ver relatório

          <ChevronRight className="ml-1.5 h-4 w-4 shrink-0" />

        </button>



        <button

          type="button"

          onClick={onQuestionnaire}

          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 transition active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60 sm:px-4 sm:text-sm"

          aria-label="Recalibrar cronotipo"

        >

          <RefreshCcw className="mr-1.5 h-4 w-4 shrink-0" />

          Recalibrar

        </button>

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



    <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-black/15">



      <p className="truncate text-[0.6rem] font-black uppercase tracking-[0.08em] text-slate-400 dark:text-white/35">



        {label}



      </p>



      <p className="mt-1 truncate text-xs font-black text-slate-700 dark:text-white/75">{value}</p>



    </div>



  );



}







function AxonMemories() {

  const [memories, setMemories] = useState<api.UserMemory[]>([]);

  const [loading, setLoading] = useState(true);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);



  useEffect(() => {

    api.getMemories().then(setMemories).catch(() => setMemories([])).finally(() => setLoading(false));

  }, []);



  async function handleDelete(id: string) {

    setDeletingId(id);

    try {

      await api.deleteMemory(id);

      setMemories((current) => current.filter((memory) => memory.id !== id));

      setConfirmingId(null);

    } finally {

      setDeletingId(null);

    }

  }



  return (

    <ProfileExpandableRow

      icon={Brain}

      title="Memórias do Axon"

      description="Informações aprendidas nas conversas para personalizar o Axon."

      count={memories.length}

    >

      {loading ? (

        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-white/45">

          <Loader2 className="h-4 w-4 animate-spin text-[#6d28d9]" />

          Carregando memórias…

        </div>

      ) : memories.length === 0 ? (

        <p className="py-5 text-center text-xs leading-5 text-slate-500 dark:text-white/45">

          Nenhuma memória registrada ainda.

        </p>

      ) : (

        <div className="grid gap-2">

          {memories.map((memory) => (

            <div key={memory.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.035]">

              <div className="flex items-start gap-2">

                <p className="min-w-0 flex-1 break-words text-[0.72rem] leading-5 text-slate-600 dark:text-white/55">{memory.content}</p>

                {confirmingId !== memory.id && (

                  <button type="button" onClick={() => setConfirmingId(memory.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/[0.04]" aria-label="Remover memória">

                    <Trash2 className="h-3.5 w-3.5" />

                  </button>

                )}

              </div>

              {confirmingId === memory.id && (

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-white/10">

                  <p className="text-[0.65rem] text-slate-500 dark:text-white/40">Remover permanentemente?</p>

                  <div className="flex gap-1.5">

                    <button type="button" onClick={() => setConfirmingId(null)} className="h-8 rounded-lg border border-slate-200 px-2 text-[0.65rem] text-slate-500 dark:border-white/10 dark:text-white/45">Cancelar</button>

                    <button type="button" onClick={() => void handleDelete(memory.id)} disabled={deletingId === memory.id} className="inline-flex h-8 items-center rounded-lg bg-red-500 px-2.5 text-[0.65rem] font-bold text-white disabled:opacity-50">

                      {deletingId === memory.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}

                      Remover

                    </button>

                  </div>

                </div>

              )}

            </div>

          ))}

        </div>

      )}

    </ProfileExpandableRow>

  );

}



function formatReportRange(start: string, end: string) {



  const fmt = (iso: string) =>



    new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {



      day: "numeric",



      month: "short",



    });



  return `${fmt(start)} – ${fmt(end)}`;



}







function ReportsHistory() {

  const navigate = useNavigate();

  const [reports, setReports] = useState<api.PeriodReport[]>([]);

  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<"all" | "weekly" | "monthly">("all");



  useEffect(() => {

    api.getReportsHistory().then(setReports).catch(() => setReports([])).finally(() => setLoading(false));

  }, []);



  const visible = filter === "all" ? reports : reports.filter((report) => report.period_type === filter);

  const filters: Array<{ key: "all" | "weekly" | "monthly"; label: string }> = [

    { key: "all", label: "Todos" },

    { key: "weekly", label: "Semanais" },

    { key: "monthly", label: "Mensais" },

  ];



  return (

    <ProfileExpandableRow

      icon={FileText}

      title="Relatórios do Axon"

      description="Resumos semanais e mensais para acompanhar sua evolução."

      count={reports.length}

    >

      <div className="mb-3 flex gap-1.5">

        {filters.map((item) => (

          <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-bold transition ${filter === item.key ? "border-[#6d28d9]/25 bg-[#6d28d9]/10 text-[#6d28d9] dark:text-purple-300" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/40"}`}>

            {item.label}

          </button>

        ))}

      </div>



      {loading ? (

        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-white/45">

          <Loader2 className="h-4 w-4 animate-spin text-[#6d28d9]" />

          Carregando relatórios…

        </div>

      ) : visible.length === 0 ? (

        <p className="py-5 text-center text-xs leading-5 text-slate-500 dark:text-white/45">Nenhum relatório neste filtro.</p>

      ) : (

        <div className="grid gap-2">

          {visible.map((report) => (

            <button key={report.id} type="button" onClick={() => navigate(`/relatorio/${report.id}`)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.035]">

              <div className="flex items-center justify-between gap-2">

                <span className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-[#6d28d9] dark:text-purple-300">{report.period_type === "weekly" ? "Semana" : "Mês"}</span>

                <span className="text-[0.62rem] text-slate-400 dark:text-white/30">{formatReportRange(report.period_start, report.period_end)}</span>

              </div>

              <p className="mt-1.5 line-clamp-2 text-[0.72rem] leading-5 text-slate-600 dark:text-white/55">{report.narrative}</p>

            </button>

          ))}

        </div>

      )}

    </ProfileExpandableRow>

  );

}



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
