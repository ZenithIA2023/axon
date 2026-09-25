import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
} from "lucide-react";

import GoogleAuthButton from "../components/auth/GoogleAuthButton";
import AuthGlow from "../components/auth/AuthGlow";
import * as api from "../lib/api";
import { isNative } from "../lib/nativeAuth";

// Na web, as páginas legais saem do próprio site (assim o link funciona também
// no dev e no preview, antes do deploy). No app, a WebView serve o bundle em
// localhost e abriria a página por cima do cadastro; lá vai o endereço público.
const LEGAL_BASE = isNative() ? "https://axonapp.tech" : "";

// ===========================================================================
// CAMPOS DO FORMULÁRIO
// ===========================================================================

type InputFieldProps = {
  icon: React.ElementType;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function InputField({
  icon: Icon,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.62rem] font-black text-[#5b21b6] dark:text-white/78">
        {label}
      </span>

      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 dark:border-white/10 dark:bg-[#191722] text-[#5b21b6] dark:text-white/78 transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:focus-within:border-[#a855f7]/45 dark:focus-within:bg-[#211c2d]">
        <Icon className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]/85" />

        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          className="auth-input w-full bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/42 dark:text-white/82 dark:placeholder:text-white/38"
        />
      </div>
    </label>
  );
}

type PasswordFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

function PasswordField({
  label,
  placeholder,
  value,
  onChange,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

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
          className="auth-input w-full bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/42 dark:text-white/82 dark:placeholder:text-white/38"
        />

        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#7b2cbf] dark:text-[#d8b4fe]/70 transition hover:bg-[#7b2cbf]/10 hover:text-[#6d28d9] dark:text-[#d8b4fe] active:scale-[0.96]"
          aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
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

// ===========================================================================
// PÁGINA DE CADASTRO
// ===========================================================================

export default function Signup() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (!acceptedTerms) {
      setError(
        "Você precisa aceitar os Termos de Uso e a Política de Privacidade."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await api.register(name, email, password);
      api.saveSession(res);
      void api.syncChronotypeFromProfile();
      navigate("/questionnaire-intro");
    } catch (err: unknown) {
      setError(
        (err as Error).message ?? "Erro ao criar conta. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#2d0850] px-4 py-8 text-white">
      <AuthGlow />

      <div className="relative z-10 w-full max-w-[340px]">
        <SignupLogo />

        <motion.section
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: "easeOut" }}
          className="overflow-hidden rounded-[1.65rem] border border-white/90 bg-white dark:border-white/10 dark:bg-[#11101a]/94 px-5 pb-7 pt-6 text-[#4c1d95] dark:text-white shadow-[0_28px_90px_rgba(0,0,0,0.26)] dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        >
          <div className="mb-6 text-center">
            <h1 className="mx-auto max-w-[15rem] text-[1.55rem] font-black leading-[0.95] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
              Crie seu assistente pessoal Inteligente
            </h1>

            <p className="mx-auto mt-3 max-w-[16.5rem] text-[0.68rem] font-medium leading-5 text-[#6d28d9] dark:text-[#d8b4fe]/62 dark:text-white/62">
              Seja bem-vindo ao AXON
            </p>
          </div>

          <form className="space-y-2.5" onSubmit={handleSubmit}>
            <InputField
              icon={User}
              label="Nome"
              type="text"
              placeholder="Como devemos te chamar?"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <InputField
              icon={Mail}
              label="E-mail"
              type="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <PasswordField
              label="Senha"
              placeholder="Crie uma senha segura"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
            />

            <PasswordField
              label="Confirmar senha"
              placeholder="Repita sua senha"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
            />

            <label className="flex cursor-pointer items-start gap-2 pt-1">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAcceptedTerms(e.target.checked)
                }
                className="peer sr-only"
              />

              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.35rem] border border-[#7b2cbf]/30 bg-white dark:border-white/16 dark:bg-[#191722] transition peer-checked:border-[#7b2cbf] peer-checked:bg-[#7b2cbf]" />

              <span className="text-[0.62rem] leading-4 text-[#6d28d9] dark:text-[#d8b4fe]/68 dark:text-white/62">
                Li e concordo com os{" "}
                <a
                  href={`${LEGAL_BASE}/legal/termos.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black text-[#6d28d9] dark:text-[#d8b4fe] hover:text-[#7b2cbf] dark:text-[#d8b4fe]"
                >
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a
                  href={`${LEGAL_BASE}/legal/privacidade.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black text-[#6d28d9] dark:text-[#d8b4fe] hover:text-[#7b2cbf] dark:text-[#d8b4fe]"
                >
                  Política de Privacidade
                </a>
                .
              </span>
            </label>

            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-400/20 dark:border-red-300/20 bg-red-500/10 dark:bg-red-500/14 px-4 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-200" />
                <p className="text-xs text-red-600 dark:text-red-200">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] dark:bg-[#a855f7] dark:hover:bg-[#b968ff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Criando conta..." : "Criar conta"}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </button>

            <div className="py-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#7b2cbf]/28 dark:bg-white/18" />
                <span className="text-[0.68rem] font-medium text-[#6d28d9] dark:text-[#d8b4fe]/62 dark:text-white/62">
                  ou
                </span>
                <div className="h-px flex-1 bg-[#7b2cbf]/28 dark:bg-white/18" />
              </div>
            </div>

            <GoogleAuthButton label="Continuar com o Google" />
          </form>

          <p className="mt-6 text-center text-[0.68rem] text-[#6d28d9] dark:text-[#d8b4fe]/62 dark:text-white/62">
            Já tem uma conta?{" "}
            <Link
              to="/login"
              className="font-black text-[#6d28d9] dark:text-[#d8b4fe] transition hover:text-[#7b2cbf] dark:text-[#d8b4fe]"
            >
              Entrar
            </Link>
          </p>
        </motion.section>
      </div>
    </main>
  );
}

// ===========================================================================
// ELEMENTOS VISUAIS
// ===========================================================================

function SignupLogo() {
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
