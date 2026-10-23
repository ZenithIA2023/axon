
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Crown,
  Gem,
  Sparkles,
  Zap,
} from "lucide-react";

import AuthGlow from "../components/auth/AuthGlow";

type Plan = {
  id: "free" | "plus" | "pro";
  name: string;
  subtitle: string;
  icon: typeof Zap;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    subtitle: "O essencial para começar.",
    icon: Zap,
  },
  {
    id: "plus",
    name: "Plus",
    subtitle: "Uma experiência ampliada.",
    icon: Crown,
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "Para aproveitar ainda mais o AXON.",
    icon: Gem,
  },
];

export default function Plans() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#2d0850] text-white">
      {/* Mesmo fundo utilizado no Login */}
      <div className="pointer-events-none absolute inset-0">
        <AuthGlow />
      </div>

      {/* Profundidade discreta, sem esconder o AuthGlow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#2d0850]/10 to-[#18052d]/45"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
        {/* Cabeçalho */}
        <header className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/my-plan")}
            aria-label="Voltar ao meu plano"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/15 active:scale-[0.97]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-xl font-black tracking-[-0.05em] sm:text-2xl">
              Escolha seu plano
            </h1>
            <p className="mt-1 text-xs text-white/65">
              Conheça as opções do AXON.
            </p>
          </div>
        </header>

        {/* Cards */}
        <section className="mx-auto grid max-w-[520px] gap-4 lg:max-w-none lg:grid-cols-3 lg:items-stretch">
          {PLANS.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={index}
              reduceMotion={!!reduceMotion}
            />
          ))}
        </section>

        {/* Aviso discreto */}
        <p className="mx-auto mt-8 max-w-[540px] text-center text-xs leading-6 text-white/65">
          O AXON está em fase de testes. Os benefícios e valores dos
          planos serão apresentados quando as assinaturas estiverem disponíveis.
        </p>
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  index,
  reduceMotion,
}: {
  plan: Plan;
  index: number;
  reduceMotion: boolean;
}) {
  const Icon = plan.icon;

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.08,
      }}
      className={`flex flex-col overflow-hidden rounded-[1.7rem] border bg-white text-[#271337] shadow-[0_18px_50px_rgba(14,0,31,0.16)] dark:bg-[#1e142a] dark:text-white ${
        plan.featured
          ? "border-[#d7b0ff] ring-2 ring-[#c084fc]/45 dark:border-violet-400/60"
          : "border-white/70 dark:border-white/15"
      }`}
    >
      {plan.featured && (
        <div className="flex min-h-10 items-center justify-between bg-gradient-to-r from-[#7b2cbf] to-[#974de0] px-5 text-white">
          <span className="text-[11px] font-black uppercase tracking-[0.13em]">
            Recomendado
          </span>
          <Sparkles className="h-4 w-4" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-[-0.055em]">
              AXON {plan.name}
            </h2>

            <p className="mt-2 text-sm text-[#7b6c85] dark:text-white/55">
              {plan.subtitle}
            </p>
          </div>

          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              plan.featured
                ? "bg-[#7b2cbf] text-white"
                : "bg-[#f2e8ff] text-[#7b2cbf] dark:bg-violet-400/15 dark:text-violet-200"
            }`}
          >
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </div>
        </div>

        <div className="my-5 h-px bg-[#eee8f2] dark:bg-white/10" />

        <div className="space-y-3">
          <Feature>Benefícios em definição</Feature>
          <Feature>Detalhes no lançamento</Feature>
        </div>

        <div className="mt-auto pt-7">
          <div
            className={`flex min-h-12 w-full items-center justify-center rounded-2xl border px-4 text-xs font-black uppercase tracking-[0.06em] ${
              plan.featured
                ? "border-violet-200 bg-violet-50 text-[#7b2cbf] dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200"
                : "border-[#eae1ef] bg-[#faf7fc] text-[#796987] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60"
            }`}
          >
            Em breve
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Check className="h-4 w-4 shrink-0 stroke-[2.5] text-[#7b2cbf] dark:text-violet-300" />
      <span className="text-sm text-[#5c4e66] dark:text-white/70">
        {children}
      </span>
    </div>
  );
}
