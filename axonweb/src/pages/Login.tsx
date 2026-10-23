import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Capacitor } from "@capacitor/core";

import AppleAuthButton from "../components/auth/AppleAuthButton";
import GoogleAuthButton from "../components/auth/GoogleAuthButton";
import AuthGlow from "../components/auth/AuthGlow";
import InputField from "../components/auth/InputField";
import * as api from "../lib/api";
import { BUILD_COMMIT } from "../lib/buildInfo";

type PasswordFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

function PasswordField({ label, placeholder, value, onChange }: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <div className="flex min-h-10 items-center gap-3 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 text-[#5b21b6] transition focus-within:border-[#7b2cbf]/45 focus-within:bg-white dark:border-white/10 dark:bg-[#211a2b] dark:text-white/80 dark:focus-within:border-[#a855f7]/50 dark:focus-within:bg-[#292035]">
        <Lock className="h-4 w-4 shrink-0 text-[#7b2cbf] dark:text-[#d8b4fe]" />
        <input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          autoComplete="current-password"
          className="auth-input w-full bg-transparent text-[0.72rem] font-medium text-[#4c1d95] outline-none placeholder:text-[#7b2cbf]/45 dark:text-white/85 dark:placeholder:text-white/40"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#7b2cbf] transition hover:bg-[#7b2cbf]/10 dark:text-[#d8b4fe] dark:hover:bg-white/10"
          aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(urlError);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      api.saveSession(res, rememberMe);
      void api.syncChronotypeFromProfile();
      navigate(res.has_chronotype ? "/app-loading" : "/questionnaire-intro");
    } catch (err: unknown) {
      setError((err as Error).message ?? "Erro ao entrar. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#2d0850] px-4 py-8 text-white">
      <AuthGlow />
      <div className="relative z-10 w-full max-w-[340px]">
        <motion.section
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: "easeOut" }}
          className="overflow-hidden rounded-[1.65rem] border border-white/90 bg-white px-5 pb-7 pt-6 text-[#30124b] shadow-[0_28px_90px_rgba(0,0,0,0.26)] dark:border-white/10 dark:bg-[#16111f] dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]"
        >
          <div className="mb-7 text-center">
            <h1 className="text-[1.65rem] font-black leading-none tracking-[-0.045em] text-[#4c1d95] dark:text-white">Login</h1>
            <p className="mx-auto mt-4 max-w-[16.5rem] text-[0.68rem] font-medium leading-5 text-[#6d28d9] dark:text-white/62">
              Acesse seu ambiente inteligente<br />de produtividade e foco
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <InputField
              icon={Mail}
              label="E-mail"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField
              label="Senha"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="flex items-center justify-between gap-3 pt-1">
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="peer sr-only"
                />
                <span aria-hidden="true" className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[#7b2cbf]/40 bg-white text-white transition peer-checked:border-[#7b2cbf] peer-checked:bg-[#7b2cbf] peer-focus-visible:ring-2 peer-focus-visible:ring-[#a855f7] peer-focus-visible:ring-offset-2 dark:border-white/25 dark:bg-[#211a2b] dark:peer-checked:border-[#a855f7] dark:peer-checked:bg-[#9333ea] dark:peer-focus-visible:ring-offset-[#16111f]">
                  {rememberMe && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </span>
                <span className="truncate text-[0.64rem] font-medium text-[#6d28d9] dark:text-white/65">Manter-me conectado</span>
              </label>
              <Link to="/forgotpassword" className="shrink-0 text-[0.64rem] font-black text-[#6d28d9] transition hover:text-[#7b2cbf] dark:text-[#d8b4fe] dark:hover:text-white">
                Esqueci minha senha
              </Link>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 dark:border-red-300/20">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-200" />
                <p className="text-xs text-red-600 dark:text-red-200">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-medium text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#9142d4] dark:hover:bg-[#a855f7]">
              {loading ? "Entrando..." : "Login"}
              {!loading && Capacitor.isNativePlatform() && (
                <span className="ml-2 font-mono text-[0.6rem] font-normal text-white/55">{BUILD_COMMIT}</span>
              )}
            </button>

            <div className="py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#7b2cbf]/25 dark:bg-white/15" />
                <span className="text-[0.68rem] font-medium text-[#6d28d9] dark:text-white/60">ou</span>
                <div className="h-px flex-1 bg-[#7b2cbf]/25 dark:bg-white/15" />
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <GoogleAuthButton label="Continuar com o Google" />
              <AppleAuthButton label="Continuar com a Apple" />
            </div>
          </form>
          <p className="mt-7 text-center text-[0.68rem] text-[#6d28d9] dark:text-white/65">
            Ainda não tem conta?{" "}
            <Link to="/signup" className="font-black text-[#6d28d9] transition hover:text-[#7b2cbf] dark:text-[#d8b4fe] dark:hover:text-white">Criar conta</Link>
          </p>
        </motion.section>
      </div>
    </main>
  );
}
