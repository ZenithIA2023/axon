import { useEffect, useMemo, useState, type ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Clock3, Moon, Sparkles, Target, Zap, type LucideIcon } from "lucide-react";

import { ENERGY_DIP_SHORT, GOAL_OPTIONS, OTHER_ID } from "../../data/onboardingSteps";
import { ErrorNote } from "./OnboardingUI";
import type { StepProps } from "./QuestionSteps";

// ===========================================================================
// ANALISANDO
// ===========================================================================
// Visual do Analyzing.tsx antigo (losango com o ícone no centro), com as frases
// citando as respostas da pessoa. Não avança sozinha: quando o cálculo termina,
// o ícone vira o certinho e o botão libera.

// Duração mínima da análise. A conta leva milissegundos; a espera existe para
// a pessoa VER o que foi cruzado — sem isso o resultado parece genérico.
const ANALYSIS_MS = 6200;

export default function AnalyzingStep({
  progress,
  onNext,
  analyze,
}: StepProps & { analyze: () => Promise<void> }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const a = progress.answers;

  const lines = useMemo(() => {
    const goal = a.goals[0] === OTHER_ID ? a.goals_other.trim() : GOAL_OPTIONS.find((o) => o.id === a.goals[0])?.label;
    const dip = ENERGY_DIP_SHORT[a.respostas.P12 ?? ""];
    const items: { icon: LucideIcon; title: string; text: string }[] = [
      { icon: Clock3, title: "Lendo seus horários", text: "Dias de trabalho e dias livres, lado a lado." },
      { icon: Zap, title: "Mapeando sua energia", text: dip ? `Sua queda aparece ${dip}.` : "Procurando seus picos e quedas." },
      { icon: Target, title: "Cruzando com seu objetivo", text: goal ? `${goal}.` : "Ligando seu ritmo ao que você quer alcançar." },
      { icon: Moon, title: "Comparando ritmos", text: "Suas respostas diante dos 5 perfis do Axon." },
      { icon: Sparkles, title: "Preparando seu resultado", text: "Montando sua configuração inicial no Axon." },
    ];
    return items;
  }, [a.goals, a.goals_other, a.respostas.P12]);

  // Relógio da animação. Recomeça a cada nova tentativa.
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const e = Date.now() - startedAt;
      setElapsed(e);
      if (e >= ANALYSIS_MS) window.clearInterval(timer);
    }, 80);
    return () => window.clearInterval(timer);
  }, [attempt]);

  // A análise roda em paralelo à animação. Quem já tem conta grava aqui;
  // visitante só calcula (rota pública) e grava depois do cadastro.
  useEffect(() => {
    let active = true;
    setError("");
    setDone(false);
    analyze()
      .then(() => {
        if (active) setDone(true);
      })
      .catch(() => {
        if (active) setError("Não conseguimos calcular seu resultado agora. Confira sua conexão e tente de novo.");
      });
    return () => {
      active = false;
    };
    // Uma análise por tentativa; as respostas não mudam nesta tela.
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // O certinho só aparece com o cálculo pronto: rede lenta segura em 99%.
  const finished = elapsed >= ANALYSIS_MS && done;
  const pct = finished ? 100 : Math.min(99, Math.round((elapsed / ANALYSIS_MS) * 100));
  const active = Math.min(lines.length - 1, Math.floor((elapsed / ANALYSIS_MS) * lines.length));
  const line = finished
    ? { icon: Check, title: "Cronotipo identificado", text: "Sua análise terminou e seu resultado está pronto." }
    : lines[active];

  return (
    <div className="relative -mt-1 text-center">
      <div className="pointer-events-none absolute -inset-x-5 -top-6 bottom-0 bg-[radial-gradient(circle_at_top,rgba(123,44,191,0.08),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.14),transparent_55%)]" />

      <div className="relative">
        <div className="mx-auto mb-6 inline-flex rounded-full border border-[#7b2cbf]/16 bg-[#fbf8ff] px-3 py-1 text-[0.62rem] font-semibold text-[#6d28d9]/68 dark:border-white/10 dark:bg-[#191722] dark:text-white/58">
          {finished ? "Análise concluída" : "Processando respostas"}
        </div>

        <AnalysisVisual CurrentIcon={line.icon} iconKey={line.title} />

        <div className="mt-6 flex h-[122px] items-start justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={line.title}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="w-full"
            >
              <h1 className="mx-auto flex min-h-[60px] max-w-[15rem] items-center justify-center text-[1.6rem] font-black leading-[0.98] tracking-[-0.05em] text-[#4c1d95] dark:text-white">
                {line.title}
              </h1>
              <p className="mx-auto mt-2 flex min-h-[40px] max-w-[17rem] items-start justify-center text-[0.72rem] font-medium leading-5 text-[#6d28d9]/68 dark:text-white/62">
                {line.text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.62rem] font-semibold text-[#6d28d9]/58 dark:text-white/52">
              {finished ? "Análise finalizada" : "Análise em andamento"}
            </p>
            <span className="rounded-full border border-[#7b2cbf]/16 bg-[#fbf8ff] px-2 py-0.5 text-[0.58rem] font-black text-[#6d28d9]/72 dark:border-white/10 dark:bg-[#191722] dark:text-white/58">
              {pct}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#7b2cbf]/14 dark:bg-white/12">
            <motion.div
              className="h-full rounded-full bg-[#7b2cbf] shadow-[0_0_18px_rgba(123,44,191,0.28)] dark:bg-[#a855f7]"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            />
          </div>
        </div>

        {error ? (
          <>
            <ErrorNote message={error} />
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-semibold text-white transition hover:bg-[#8d31dd] active:scale-[0.98] dark:bg-[#a855f7]"
            >
              Tentar de novo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!finished}
            className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#7b2cbf]/28 disabled:text-white/48 disabled:shadow-none dark:bg-[#a855f7] dark:hover:bg-[#b968ff] dark:disabled:bg-white/10"
          >
            {finished ? "Descobrir meu cronotipo" : "Calculando resultados"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AnalysisVisual({ CurrentIcon, iconKey }: { CurrentIcon: ElementType; iconKey: string }) {
  return (
    <div className="relative mx-auto flex h-[132px] w-[132px] items-center justify-center">
      {/* Glow suave atrás do símbolo */}
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.62, 0.35] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute h-[116px] w-[116px] rounded-[2rem] bg-[#7b2cbf]/10 blur-xl dark:bg-[#a855f7]/14"
      />

      {/* Losango base, sem rotação contínua */}
      <div className="absolute h-[92px] w-[92px] rotate-45 rounded-[1.65rem] border border-[#7b2cbf]/12 bg-[#7b2cbf]/6 shadow-[0_18px_50px_rgba(123,44,191,0.1)] dark:border-white/10 dark:bg-white/[0.05] dark:shadow-[0_20px_52px_rgba(0,0,0,0.28)]" />

      {/* Losango interno sutil */}
      <motion.div
        animate={{ scale: [1, 0.94, 1], opacity: [0.55, 0.82, 0.55] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute h-[68px] w-[68px] rotate-45 rounded-[1.35rem] border border-[#7b2cbf]/10 bg-white/25 dark:border-white/8 dark:bg-white/[0.035]"
      />

      {/* Ícone central */}
      <div className="relative flex h-[74px] w-[74px] items-center justify-center text-[#7b2cbf] dark:text-white/78">
        <AnimatePresence mode="wait">
          <motion.div
            key={iconKey}
            initial={{ opacity: 0, scale: 0.82, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.82, y: -4 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <CurrentIcon className="h-9 w-9" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pontos decorativos bem discretos */}
      <motion.span
        animate={{ opacity: [0.25, 0.75, 0.25] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-5 top-6 h-2 w-2 rounded-full bg-[#7b2cbf]/22 dark:bg-white/18"
      />
      <motion.span
        animate={{ opacity: [0.75, 0.25, 0.75] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-6 right-5 h-2.5 w-2.5 rounded-full bg-[#7b2cbf]/16 dark:bg-white/14"
      />
    </div>
  );
}
