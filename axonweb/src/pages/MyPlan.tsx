
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crown,
  Sparkles,
  CreditCard,
} from "lucide-react";

import AppBackground from "../components/layout/AppBackground";

export default function MyPlan() {
  const navigate = useNavigate();

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f7f8fa] text-slate-950 dark:bg-[#0d0b15] dark:text-white">
      <div className="pointer-events-none absolute inset-0 hidden dark:block">
        <AppBackground />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[800px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
        <header className="mb-7 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            aria-label="Voltar ao perfil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-2xl font-black tracking-[-0.05em]">
              Meu plano
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
              Gerencie sua experiência AXON.
            </p>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-400/20 dark:bg-white/[0.045] sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-[#6d28d9] dark:bg-violet-500/15 dark:text-violet-300">
              <Crown className="h-6 w-6" />
            </div>

            <span className="rounded-full bg-violet-100 px-3 py-1.5 text-[11px] font-bold text-[#6d28d9] dark:bg-violet-400/15 dark:text-violet-200">
              Em testes
            </span>
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.14em] text-[#6d28d9] dark:text-violet-300">
            Seu acesso atual
          </p>

          <h2 className="mt-1 text-2xl font-black tracking-tight">
            AXON Beta
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-white/55">
            Aproveite os recursos disponíveis enquanto
            continuamos desenvolvendo o AXON.
          </p>

          <div className="my-5 h-px bg-slate-100 dark:bg-white/10" />

          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#6d28d9]" />
            <span className="text-sm font-medium">
              Acesso à versão de testes
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 shrink-0 text-[#6d28d9]" />
            <span className="text-sm font-medium">
              Recursos disponíveis durante o Beta
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate("/plans")}
            className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6d28d9] px-5 text-sm font-bold text-white transition hover:bg-[#5b21b6] active:scale-[0.98]"
          >
            Ver outros planos
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section className="mt-4 flex gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.045]">
          <CreditCard className="h-5 w-5 shrink-0 text-[#6d28d9]" />

          <div>
            <h3 className="text-sm font-black">
              Assinatura e cobrança
            </h3>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-white/50">
              Você está utilizando a versão de teste.
              Quando as assinaturas estiverem disponíveis,
              poderá acompanhar seu plano e gerenciar a
              cobrança por aqui.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
