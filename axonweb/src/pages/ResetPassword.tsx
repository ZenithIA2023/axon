
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import AuthGlow from "../components/auth/AuthGlow";
import * as api from "../lib/api";

// ===========================================================================
// RECUPERAÇÃO DE SENHA
// ===========================================================================

type RecoveryLink =
  | { status: "ok"; token: string }
  | { status: "expired" }
  | { status: "missing" };

function readRecoveryLink(): RecoveryLink {
  const params = new URLSearchParams(window.location.hash.slice(1));

  if (params.get("error") || params.get("error_code")) {
    return { status: "expired" };
  }

  const token = params.get("access_token");

  if (token && params.get("type") === "recovery") {
    return { status: "ok", token };
  }

  return { status: "missing" };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Captura o token somente uma vez.
  // Não armazenamos o token em localStorage.
  const [recoveryLink] = useState<RecoveryLink>(readRecoveryLink);

  // Remove o token da URL após capturá-lo em memória.
  // Não altera hashes normais utilizados pelo HashRouter.
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));

    if (
      params.has("access_token") ||
      params.has("error") ||
      params.has("error_code")
    ) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (recoveryLink.status !== "ok" || loading) return;

    if (!password.trim() || !confirmPassword.trim()) {
      setError("Preencha os dois campos para continuar.");
      return;
    }

    if (password.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password.length > 72) {
      setError("A nova senha pode ter no máximo 72 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      await api.resetPassword(recoveryLink.token, password);
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível alterar sua senha. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#2d0850] px-4 py-8 text-white">
      <AuthGlow />

      <div className="relative z-10 w-full max-w-[340px]">
        <motion.section
          initial={
            reducedMotion
              ? false
              : { opacity: 0, y: 22, scale: 0.985 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: "easeOut" }}
          className="overflow-hidden rounded-[1.65rem] border border-white/90 bg-white px-5 pb-7 pt-7 text-[#4c1d95] shadow-[0_28px_90px_rgba(0,0,0,0.26)] dark:border-white/10 dark:bg-[#11101a] dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        >
          {success ? (
            <ResetPasswordSuccess
              onGoToLogin={() => navigate("/login")}
            />
          ) : recoveryLink.status !== "ok" ? (
            <InvalidLinkState
              expired={recoveryLink.status === "expired"}
            />
          ) : (
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
              onTogglePassword={() =>
                setShowPassword((prev) => !prev)
              }
              onToggleConfirmPassword={() =>
                setShowConfirmPassword((prev) => !prev)
              }
            />
          )}
        </motion.section>
      </div>
    </main>
  );
}

// ===========================================================================
// FORMULÁRIO
// ===========================================================================

type ResetPasswordFormProps = {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  loading: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
};

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
}: ResetPasswordFormProps) {
  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Crie uma nova senha
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-white/60">
          Escolha uma senha segura para recuperar seu acesso ao AXON.
        </p>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        <PasswordField
          label="Nova senha"
          placeholder="Digite sua nova senha"
          value={password}
          showPassword={showPassword}
          onToggleVisibility={onTogglePassword}
          onChange={(event) =>
            onPasswordChange(event.target.value)
          }
        />

        <PasswordField
          label="Confirmar nova senha"
          placeholder="Repita sua nova senha"
          value={confirmPassword}
          showPassword={showConfirmPassword}
          onToggleVisibility={onToggleConfirmPassword}
          onChange={(event) =>
            onConfirmPasswordChange(event.target.value)
          }
        />

        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
        >
          {loading ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>

      <BackToLogin />
    </>
  );
}

// ===========================================================================
// LINK INVÁLIDO OU EXPIRADO
// ===========================================================================

function InvalidLinkState({ expired }: { expired: boolean }) {
  return (
    <>
      <div className="mb-7 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 text-red-600 dark:border-red-300/20 dark:text-red-300">
          <AlertCircle className="h-6 w-6" />
        </div>

        <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          {expired ? "Este link expirou" : "Link inválido"}
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-white/60">
          {expired
            ? "O link expirou ou já foi utilizado. Solicite outro para redefinir sua senha."
            : "Abra o link de recuperação enviado ao seu e-mail ou solicite um novo."}
        </p>
      </div>

      <Link
        to="/forgot-password"
        className="flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
      >
        Pedir um novo link
      </Link>

      <BackToLogin />
    </>
  );
}

// ===========================================================================
// SUCESSO
// ===========================================================================

function ResetPasswordSuccess({
  onGoToLogin,
}: {
  onGoToLogin: () => void;
}) {
  return (
    <>
      <div className="mb-7 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#7b2cbf]/20 bg-[#7b2cbf]/10 text-[#7b2cbf] dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>

        <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Senha redefinida!
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-white/60">
          Sua senha foi alterada com sucesso. Entre novamente
          utilizando sua nova senha.
        </p>
      </div>

      <button
        type="button"
        onClick={onGoToLogin}
        className="flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
      >
        Ir para login
      </button>
    </>
  );
}

// ===========================================================================
// COMPONENTES COMPARTILHADOS INTERNAMENTE
// ===========================================================================

type PasswordFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  showPassword: boolean;
  onToggleVisibility: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
      <span className="mb-1.5 block text-[0.62rem] font-black text-[#5b21b6] dark:text-white/80">
        {label}
      </span>

      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 text-[#5b21b6] transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:border-white/10 dark:bg-[#191722] dark:text-white/80 dark:focus-within:border-[#a855f7]/45 dark:focus-within:bg-[#211c2d]">
        <Lock className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]/85" />

        <input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          minLength={6}
          maxLength={72}
          autoComplete="new-password"
          className="auth-input w-full min-w-0 bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/45 dark:text-white/85 dark:placeholder:text-white/40"
        />

        <button
          type="button"
          onClick={onToggleVisibility}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#7b2cbf] transition hover:bg-[#7b2cbf]/10 active:scale-[0.96] dark:text-[#d8b4fe]"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={showPassword}
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
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 dark:border-red-300/20"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />

      <p className="text-xs leading-5 text-red-600 dark:text-red-300">
        {message}
      </p>
    </div>
  );
}

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-5 text-[0.74rem] font-medium text-[#6d28d9] transition hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-[#191722] dark:text-[#d8b4fe] dark:hover:bg-[#211c2d]"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para login
    </Link>
  );
}
