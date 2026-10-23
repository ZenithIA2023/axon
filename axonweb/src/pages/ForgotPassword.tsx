
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Mail,
} from "lucide-react";

import AuthGlow from "../components/auth/AuthGlow";
import * as api from "../lib/api";

// ===========================================================================
// PÁGINA — ESQUECI MINHA SENHA
// ===========================================================================

export default function ForgotPassword() {
  const reducedMotion = useReducedMotion();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (loading) return;

    if (!email.trim()) {
      setError("Digite seu e-mail para continuar.");
      return;
    }

    setLoading(true);

    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch {
      // Não revela se o endereço está cadastrado.
      setError(
        "Não foi possível enviar o link agora. Aguarde alguns minutos e tente novamente."
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
          {!sent ? (
            <RecoveryFormState
              email={email}
              loading={loading}
              error={error}
              onEmailChange={setEmail}
              onSubmit={handleSubmit}
            />
          ) : (
            <SentConfirmationState
              email={email}
              onUseAnotherEmail={() => {
                setSent(false);
                setError("");
              }}
            />
          )}
        </motion.section>
      </div>
    </main>
  );
}

// ===========================================================================
// FORMULÁRIO DE RECUPERAÇÃO
// ===========================================================================

type RecoveryFormProps = {
  email: string;
  loading: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function RecoveryFormState({
  email,
  loading,
  error,
  onEmailChange,
  onSubmit,
}: RecoveryFormProps) {
  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Esqueceu sua senha?
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-white/60">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        <EmailField
          label="E-mail"
          placeholder="seuemail@exemplo.com"
          value={email}
          onChange={(event) =>
            onEmailChange(event.target.value)
          }
        />

        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
        >
          {loading ? "Enviando..." : "Enviar link"}
        </button>
      </form>

      <BackToLogin />
    </>
  );
}

// ===========================================================================
// CONFIRMAÇÃO DE ENVIO
// ===========================================================================

type SentConfirmationProps = {
  email: string;
  onUseAnotherEmail: () => void;
};

function SentConfirmationState({
  email,
  onUseAnotherEmail,
}: SentConfirmationProps) {
  return (
    <>
      <div className="mb-7 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#7b2cbf]/20 bg-[#7b2cbf]/10 text-[#7b2cbf] dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>

        <h1 className="text-[1.65rem] font-black leading-tight tracking-[-0.045em] text-[#4c1d95] dark:text-white">
          Confira seu e-mail
        </h1>

        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-medium leading-5 text-[#6d28d9] dark:text-white/60">
          Se o endereço estiver cadastrado no AXON,
          você receberá um link para redefinir sua senha.
        </p>

        <div className="mt-5 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] p-4 dark:border-white/10 dark:bg-[#191722]">
          <p className="break-words text-[0.68rem] leading-5 text-[#6d28d9] dark:text-white/65">
            Verifique a caixa de entrada de{" "}
            <span className="font-black text-[#5b21b6] dark:text-[#d8b4fe]">
              {email}
            </span>
            , incluindo as pastas de spam e promoções.
            O link tem validade limitada.
          </p>
        </div>
      </div>

      <Link
        to="/login"
        className="flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
      >
        Voltar para login
      </Link>

      <button
        type="button"
        onClick={onUseAnotherEmail}
        className="mt-3 flex min-h-10 w-full items-center justify-center rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-6 text-[0.74rem] font-medium text-[#6d28d9] transition hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-[#191722] dark:text-[#d8b4fe] dark:hover:bg-[#211c2d]"
      >
        Usar outro e-mail
      </button>
    </>
  );
}

// ===========================================================================
// COMPONENTES INTERNOS
// ===========================================================================

type EmailFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function EmailField({
  label,
  placeholder,
  value,
  onChange,
}: EmailFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.62rem] font-black text-[#5b21b6] dark:text-white/80">
        {label}
      </span>

      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 text-[#5b21b6] transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:border-white/10 dark:bg-[#191722] dark:text-white/80 dark:focus-within:border-[#a855f7]/45 dark:focus-within:bg-[#211c2d]">
        <Mail className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]/85" />

        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          className="auth-input w-full min-w-0 bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/45 dark:text-white/85 dark:placeholder:text-white/40"
        />
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
