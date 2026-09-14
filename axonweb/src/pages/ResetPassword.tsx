import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import AuthGlow from "../components/auth/AuthGlow";

// ===========================================================================
// PÁGINA — REDEFINIR SENHA
// ===========================================================================

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!password.trim() || !confirmPassword.trim()) {
      setError("Preencha os dois campos para continuar.");
      return;
    }

    if (password.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      // Exemplo futuro: await api.resetPassword({ token, password });
      await new Promise((resolve) => setTimeout(resolve, 900));

      setSuccess(true);
    } catch {
      setError("Não foi possível alterar sua senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#2d0850] px-4 py-8 text-white">
      <AuthGlow />

      <div className="relative z-10 w-full max-w-[340px]">
        <AuthLogoMark />

        <section className="overflow-hidden rounded-[1.65rem] border border-white/90 bg-white dark:border-white/10 dark:bg-[#11101a]/94 px-5 pb-7 pt-6 text-[#4c1d95] dark:text-white shadow-[0_28px_90px_rgba(0,0,0,0.26)] dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]">
          {!success ? (
            <ResetPasswordForm
              password={password}
              confirmPassword={confirmPassword}
              showPassword={showPassword}
              showConfirmPassword={showConfirmPassword}
              loading={loading}
              error={error}
              onSubmit={handleSubmit}
              onPasswordChange={setPassword}
              onConfirmPasswordChange={setConfirmPassword}
              onTogglePassword={() => setShowPassword((prev) => !prev)}
              onToggleConfirmPassword={() =>
                setShowConfirmPassword((prev) => !prev)
              }
            />
          ) : (
            <ResetPasswordSuccess onGoToLogin={() => navigate("/login")} />
          )}
        </section>
      </div>
    </main>
  );
}

// ===========================================================================
// ESTADOS VISUAIS
// ===========================================================================

function ResetPasswordForm({
  password,
  confirmPassword,
  showPassword,
  showConfirmPassword,
  loading,
  error,
  onSubmit,
  onPasswordChange,
  onConfirmPasswordChange,
  onTogglePassword,
  onToggleConfirmPassword,
}: {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  loading: boolean;
  error: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
}) {
  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="mx-auto max-w-[15rem] text-[1.6rem] font-black leading-[0.96] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Crie uma nova senha
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-[#d8b4fe]/62 dark:text-white/62">
          Escolha uma senha segura para recuperar seu acesso ao Axon.
        </p>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        <PasswordField
          label="Nova senha"
          placeholder="Digite sua nova senha"
          value={password}
          showPassword={showPassword}
          onToggleVisibility={onTogglePassword}
          onChange={(event) => onPasswordChange(event.target.value)}
        />

        <PasswordField
          label="Confirmar nova senha"
          placeholder="Repita sua nova senha"
          value={confirmPassword}
          showPassword={showConfirmPassword}
          onToggleVisibility={onToggleConfirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
        />

        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] dark:bg-[#a855f7] dark:hover:bg-[#b968ff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Salvar nova senha"}
          {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
        </button>
      </form>

      <Link
        to="/login"
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-6 dark:border-white/10 dark:bg-[#191722] text-[0.74rem] font-medium text-[#6d28d9] dark:text-[#d8b4fe] transition hover:bg-white active:scale-[0.98] dark:hover:bg-[#211c2d]"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar para login
      </Link>
    </>
  );
}

function ResetPasswordSuccess({
  onGoToLogin,
}: {
  onGoToLogin: () => void;
}) {
  return (
    <>
      <div className="mb-7 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#7b2cbf]/20 bg-[#7b2cbf]/10 text-[#7b2cbf] dark:text-[#d8b4fe]">
          <CheckCircle2 className="h-6 w-6" />
        </div>

        <h1 className="mx-auto max-w-[15rem] text-[1.6rem] font-black leading-[0.96] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Seu acesso foi recuperado
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-[#d8b4fe]/62 dark:text-white/62">
          Sua senha foi redefinida com sucesso. Agora você já pode entrar
          novamente no Axon.
        </p>
      </div>

      <button
        type="button"
        onClick={onGoToLogin}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] dark:bg-[#a855f7] dark:hover:bg-[#b968ff] active:scale-[0.98]"
      >
        Ir para login
        <ArrowRight className="ml-2 h-4 w-4" />
      </button>
    </>
  );
}

// ===========================================================================
// COMPONENTES INTERNOS
// ===========================================================================

type PasswordFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  showPassword: boolean;
  onToggleVisibility: () => void;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

function PasswordField({
  label,
  placeholder,
  value,
  showPassword,
  onToggleVisibility,
  onChange,
}: PasswordFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.62rem] font-black text-[#5b21b6] dark:text-white/78">
        {label}
      </span>

      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 dark:border-white/10 dark:bg-[#191722] text-[#5b21b6] dark:text-white/78 transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:focus-within:border-[#a855f7]/45 dark:focus-within:bg-[#211c2d]">
        <Lock className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]/85" />

        <input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          className="auth-input w-full bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/42 dark:text-white/82 dark:placeholder:text-white/38"
        />

        <button
          type="button"
          onClick={onToggleVisibility}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#7b2cbf] dark:text-[#d8b4fe]/70 transition hover:bg-[#7b2cbf]/10 hover:text-[#6d28d9] dark:text-[#d8b4fe] active:scale-[0.96]"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </label>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-red-400/20 dark:border-red-300/20 bg-red-500/10 dark:bg-red-500/14 px-4 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-200" />
      <p className="text-xs leading-5 text-red-600 dark:text-red-200">{message}</p>
    </div>
  );
}

function AuthLogoMark() {
  return (
    <div className="mb-6 flex justify-center">
      <Link
        to="/"
        aria-label="Voltar para a landing page"
        className="flex h-12 w-12 rotate-45 items-center justify-center rounded-2xl border border-white/18 bg-white/10 shadow-[0_20px_60px_rgba(168,85,247,0.35)] backdrop-blur-2xl transition active:scale-[0.96]"
      >
        <img
          src="/axon-logo.svg"
          alt="Axon"
          className="h-12 w-12 -rotate-45 object-contain"
        />
      </Link>
    </div>
  );
}
