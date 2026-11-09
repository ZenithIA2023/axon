import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Moon,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import axonHappy from "../../assets/axon/axon-happy.webp";
import SignupForm from "../auth/SignupForm";
import * as api from "../../lib/api";
import { results, type ChronotypeResultKey } from "../../data/results";
import { ENERGY_DIP_SHORT, GOAL_OPTIONS, OTHER_ID } from "../../data/onboardingSteps";
import { commitmentsFromDrafts } from "../../lib/fixedCommitments";
import { dayBarPieces, formatDuration, peakPeriods, periodOfHour, type DayPeriod } from "../../lib/onboardingState";
import { ErrorNote, StepFooter } from "./OnboardingUI";
import type { StepProps } from "./QuestionSteps";
import EnergyCurve, { LEVEL_STYLE } from "./EnergyCurve";

const VALID_KEYS: ChronotypeResultKey[] = ["Matutino", "Vespertino", "Noturno", "Misto", "Bimodal"];

function resultKey(cronotipo?: string): ChronotypeResultKey {
  return VALID_KEYS.includes(cronotipo as ChronotypeResultKey) ? (cronotipo as ChronotypeResultKey) : "Misto";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[0.66rem] font-black uppercase tracking-[0.08em] text-[#6d28d9]/72 dark:text-white/56">
      {children}
    </p>
  );
}

// ===========================================================================
// CADASTRO (antes de mostrar o cronotipo)
// ===========================================================================

export function SignupStep({
  progress,
  canBack,
  onBack,
  onRegistered,
}: StepProps & { onRegistered: () => Promise<void> }) {
  return (
    <div>
      <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="mt-4 text-center">
        <Eyebrow>Seu cronotipo está pronto</Eyebrow>
      </div>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-center text-[1.25rem] font-black leading-[1.02] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
        Crie sua conta para ver seu resultado.
      </h1>
      <p className="mx-auto mt-2 mb-5 max-w-[17rem] text-center text-[0.7rem] font-medium leading-5 text-[#6d28d9]/72 dark:text-white/60">
        Seu cronotipo, sua curva de energia e o que fazer em cada parte do dia ficam salvos na sua conta, no site e no app.
      </p>

      {/* Google e Apple saem da página e voltam por /auth/callback; as
          respostas já estão salvas neste navegador, e o AuthCallback grava
          tudo na conta (finishPendingOnboarding). */}
      <SignupForm onRegistered={onRegistered} />

      <p className="mt-5 text-center text-[0.68rem] text-[#6d28d9] dark:text-white/62">
        Já tem uma conta?{" "}
        <Link to="/login" className="font-black text-[#6d28d9] hover:text-[#7b2cbf] dark:text-[#d8b4fe]">
          Entrar
        </Link>
      </p>

      {canBack && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-[0.68rem] font-black text-[#6d28d9]/70 hover:text-[#7b2cbf] dark:text-white/52"
          >
            Voltar às perguntas
          </button>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// SEU CRONOTIPO
// ===========================================================================

export function RevealStep(props: StepProps) {
  const { progress } = props;
  const key = resultKey(progress.result?.cronotipo);
  const result = results[key];
  // Vem da conta: o nome é digitado no cadastro (ou vem do Google/Apple).
  const first = firstName(api.getStoredUserName());
  const [share, setShare] = useState<number | null>(null);

  // Prova social com dado real: o backend só devolve a porcentagem quando a
  // base passa do mínimo (AMOSTRA_MINIMA). Abaixo disso a linha não aparece.
  useEffect(() => {
    let active = true;
    api
      .getChronotypeDistribution()
      .then((d) => {
        if (active && d.disponivel && typeof d.porcentagens[key] === "number") setShare(d.porcentagens[key]);
      })
      .catch(() => {
        // Sem a linha de prova social a tela continua completa; não vale avisar.
      });
    return () => {
      active = false;
    };
  }, [key]);

  return (
    <div className="text-center">
      <div className="relative mx-auto mt-2 flex h-[9.5rem] items-center justify-center">
        <div className="absolute left-1/2 top-1/2 h-[9rem] w-[9rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7b2cbf]/12 blur-2xl dark:bg-[#7b2cbf]/24" />
        <motion.img
          src={axonHappy}
          alt="Mascote Axon comemorando"
          initial={{ opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 h-full w-auto object-contain"
        />
      </div>

      <div className="mt-2">
        <Eyebrow>{result.label}</Eyebrow>
      </div>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.45rem] font-black leading-[1] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
        {first ? `${first}, seu cronotipo é ` : "Seu cronotipo é "}
        <span className="text-[#7b2cbf] dark:text-[#c084fc]">{key}</span>.
      </h1>
      <p className="mx-auto mt-3 max-w-[17.5rem] text-[0.8rem] font-black leading-5 text-[#4c1d95] dark:text-white/86">
        {result.title}
      </p>
      <p className="mx-auto mt-1 max-w-[17.5rem] text-[0.72rem] font-medium leading-5 text-[#6d28d9]/76 dark:text-white/62">
        {result.subtitle}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {result.profileTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[#7b2cbf]/20 bg-[#fbf8ff] px-2.5 py-1 text-[0.62rem] font-black text-[#6d28d9] dark:border-white/10 dark:bg-[#191722] dark:text-white/72"
          >
            {tag}
          </span>
        ))}
      </div>

      {share !== null && (
        <p className="mx-auto mt-4 flex max-w-[17rem] items-center justify-center gap-2 rounded-xl border border-[#7b2cbf]/16 bg-[#fbf8ff] px-3 py-2 text-[0.66rem] font-semibold text-[#6d28d9]/80 dark:border-white/10 dark:bg-[#191722] dark:text-white/62">
          <Users className="h-4 w-4 shrink-0" />
          Entre quem já fez o teste no Axon, {share}% têm o seu perfil.
        </p>
      )}

      <StepFooter canBack={props.canBack} onBack={props.onBack} onNext={props.onNext} nextLabel="Entender meu resultado" />
    </div>
  );
}

// ===========================================================================
// O QUE ISSO SIGNIFICA
// ===========================================================================

export function MeaningStep(props: StepProps) {
  const key = resultKey(props.progress.result?.cronotipo);
  const result = results[key];

  return (
    <div>
      <div className="mt-5 text-center">
        <Eyebrow>O que isso significa</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-[17.5rem] text-[1.2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
          Como funciona o cronotipo <span className="text-[#7b2cbf] dark:text-[#c084fc]">{key}</span>
        </h1>
      </div>

      <p className="mt-3 text-[0.78rem] font-medium leading-5 text-[#6d28d9]/80 dark:text-white/66">{result.description}</p>

      <div className="mt-4 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-3.5 dark:border-white/10 dark:bg-[#191722]">
        <p className="flex items-center gap-1.5 text-[0.72rem] font-black text-[#4c1d95] dark:text-white">
          <Sparkles className="h-4 w-4 text-[#7b2cbf] dark:text-[#d8b4fe]" />
          Seu próximo passo
        </p>
        <p className="mt-1.5 text-[0.72rem] font-medium leading-[1.1rem] text-[#6d28d9]/80 dark:text-white/62">{result.recommendation}</p>
      </div>

      <StepFooter canBack={props.canBack} onBack={props.onBack} onNext={props.onNext} />
    </div>
  );
}

export function StrengthsStep(props: StepProps) {
  const key = resultKey(props.progress.result?.cronotipo);
  const result = results[key];

  return (
    <div>
      <div className="mt-5 text-center">
        <Eyebrow>Seu ritmo na prática</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-[17.5rem] text-[1.2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
          O que funciona para você
        </h1>
      </div>

      <ListCard icon={CheckCircle2} title="Onde você brilha" items={result.bestActivities} tone="good" />
      <ListCard icon={AlertTriangle} title="Cuidado com" items={result.avoid} tone="warn" />

      <StepFooter canBack={props.canBack} onBack={props.onBack} onNext={props.onNext} />
    </div>
  );
}

function ListCard({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  tone: "good" | "warn" | "axon";
}) {
  return (
    <div className="mt-3 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-3 dark:border-white/10 dark:bg-[#191722]">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-black text-[#4c1d95] dark:text-white">
        <Icon
          className={`h-4 w-4 ${
            tone === "good" ? "text-[var(--success)]" : tone === "warn" ? "text-amber-500" : "text-[#7b2cbf] dark:text-[#d8b4fe]"
          }`}
        />
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[0.68rem] font-medium leading-4 text-[#6d28d9]/80 dark:text-white/62">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===========================================================================
// O QUE SUAS RESPOSTAS MOSTRAM
// ===========================================================================

const PERIOD_TEXT: Record<DayPeriod, string> = { morning: "de manhã", afternoon: "à tarde", night: "à noite" };

function joinPeriods(periods: DayPeriod[]): string {
  const t = periods.map((p) => PERIOD_TEXT[p]);
  return t.length <= 1 ? (t[0] ?? "") : `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

type Insight = { icon: LucideIcon; title: string; text: string };

/** O trecho passa por alguma hora desse período do dia? */
function touchesPeriod(s: api.EnergySegment, period: DayPeriod): boolean {
  const start = Number(s.start.slice(0, 2));
  const hours = Math.max(1, Math.ceil(durationMin(s) / 60));
  return Array.from({ length: hours }, (_, k) => (start + k) % 24).some((h) => periodOfHour(h) === period);
}

/**
 * Trechos de pico → "das 07:30 às 12:00" ou "das 10:30 às 12:00 e das 16:30 às 18:00".
 * Com `period`, só os picos daquele período (o Misto que trabalha de manhã
 * não precisa ouvir do pico da tarde nessa frase); sem nenhum, todos.
 */
function peakWindowsText(segmentos: api.EnergySegment[], period?: DayPeriod): string {
  const picos = segmentos.filter((s) => s.level === "pico");
  const doPeriodo = period ? picos.filter((s) => touchesPeriod(s, period)) : [];
  const parts = (doPeriodo.length > 0 ? doPeriodo : picos).map((s) => `das ${s.start} às ${s.end}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

// Cada frase cita uma resposta da pessoa e o que ela significa. Sem afirmar
// diagnóstico (ex.: jet lag): mostra a diferença e o efeito comum dela.
export function yourAnswersInsights(progress: StepProps["progress"]): Insight[] {
  const a = progress.answers;
  const r = progress.result;
  const out: Insight[] = [];

  const jl = r?.jet_lag_social_min;
  if (typeof jl === "number") {
    out.push({
      icon: Moon,
      title: "Seu sono entre dias úteis e livres",
      text:
        jl >= 60
          ? `Nos dias livres, o meio do seu sono se desloca ${formatDuration(jl)}. Uma diferença assim costuma deixar o começo da semana mais pesado, como uma pequena mudança de fuso.`
          : jl >= 30
            ? `Seu sono muda ${formatDuration(jl)} entre dias úteis e livres. É uma diferença pequena, que ajuda seu relógio a se manter estável.`
            : "Seus dias úteis e livres têm quase o mesmo horário de sono. Essa regularidade ajuda seu relógio biológico a funcionar no ritmo certo.",
    });
  }

  const dip = a.respostas.P12;
  if (dip) {
    out.push({
      icon: Zap,
      title: "Sua queda de energia",
      text:
        dip === "A"
          ? "Você diz não sentir uma queda clara durante o dia. Mesmo assim, a energia varia: o Axon vai usar seus registros para encontrar os vales que passam despercebidos."
          : `Você sente a energia cair ${ENERGY_DIP_SHORT[dip] ?? "em algum momento do dia"}. Esse é o horário ideal para tarefas leves, pausas e o que não exige raciocínio.`,
    });
  }

  const peaks = peakPeriods(r?.energia);
  const cur = a.current_focus_time;
  if (peaks.length > 0 && cur) {
    // Horário concreto do pico ("das 07:30 às 12:00") em vez de só o período:
    // é o que a pessoa consegue levar para a agenda.
    const segs = r?.segmentos ?? [];
    const peakHours = peakWindowsText(segs) || joinPeriods(peaks);
    let text: string;
    if (cur === "early_morning") {
      // "Bem cedo" só bate com um pico que começa antes das 9h: o pico das
      // 10h30 do Misto também é "de manhã", mas não é esse horário.
      const earlyPeak = segs.some((s) => s.level === "pico" && toMin(s.start) >= 5 * 60 && toMin(s.start) < 9 * 60);
      text = earlyPeak
        ? `Você contou que faz sua tarefa mais importante bem cedo. Ótima escolha: é quando sua energia está no auge (${peakWindowsText(segs, "morning")}). Vale manter esse horário reservado para ela.`
        : `Você contou que faz sua tarefa mais importante bem cedo, mas sua energia está no auge ${peakHours}. Levar essa tarefa para o pico é o primeiro ajuste que vale testar.`;
    } else if (cur === "morning" || cur === "afternoon" || cur === "night") {
      text = peaks.includes(cur)
        ? `Você contou que faz sua tarefa mais importante ${PERIOD_TEXT[cur]}. Ótima escolha: é quando sua energia está no auge (${peakWindowsText(segs, cur) || PERIOD_TEXT[cur]}). Vale manter esse horário reservado para ela.`
        : `Você contou que faz sua tarefa mais importante ${PERIOD_TEXT[cur]}, mas sua energia está no auge ${peakHours}. Levar essa tarefa para o pico é o primeiro ajuste que vale testar.`;
    } else if (cur === "leftover") {
      text = `Você contou que sua tarefa mais importante fica para quando sobra tempo. Seu pico de energia é ${peakHours}: reservar esse horário para ela é o primeiro ajuste que vale testar.`;
    } else {
      text = `Você contou que o horário da sua tarefa mais importante varia muito. Dar a ela um horário fixo no seu pico, ${peakHours}, ajuda a criar constância.`;
    }
    out.push({ icon: Target, title: "Sua tarefa mais importante", text });
  }

  return out;
}

export function YourAnswersStep(props: StepProps) {
  const insights = yourAnswersInsights(props.progress);

  return (
    <div>
      <div className="mt-5 text-center">
        <Eyebrow>O que suas respostas mostram</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
          O que o Axon já sabe sobre você
        </h1>
      </div>

      <div className="mt-4 space-y-2.5">
        {insights.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-3 dark:border-white/10 dark:bg-[#191722]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[0.72rem] font-black text-[#4c1d95] dark:text-white">{title}</p>
              <p className="mt-0.5 text-[0.68rem] font-medium leading-4 text-[#6d28d9]/78 dark:text-white/62">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <StepFooter canBack={props.canBack} onBack={props.onBack} onNext={props.onNext} />
    </div>
  );
}

// ===========================================================================
// SUA CURVA DE ENERGIA
// ===========================================================================

export function CurveStep(props: StepProps) {
  const { progress } = props;
  const a = progress.answers;
  const key = resultKey(progress.result?.cronotipo);
  // Os mesmos que foram gravados na conta: só os completos (cartão pela metade
  // não chega aqui, a tela de horários não deixa avançar com ele).
  const commitments = a.schedule_type === "fixed" ? commitmentsFromDrafts(a.commitments).commitments : [];

  return (
    <div>
      <div className="mt-5 text-center">
        <Eyebrow>Sua curva de energia</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
          Como sua energia varia ao longo do dia
        </h1>
        <p className="mx-auto mt-2 max-w-[17.5rem] text-[0.68rem] font-medium leading-4 text-[#6d28d9]/72 dark:text-white/58">
          {commitments.length > 0
            ? `A curva típica do cronotipo ${key} num dia útil, com o seu sono e os seus horários fixos.`
            : `A curva típica do cronotipo ${key} num dia útil, com o seu sono.`}
        </p>
      </div>

      <EnergyCurve
        energia={progress.result?.energia ?? []}
        segmentos={progress.result?.segmentos ?? []}
        sleep={a.workday_sleep && a.workday_wake ? { start: a.workday_sleep, end: a.workday_wake } : null}
        commitments={commitments}
      />

      <StepFooter canBack={props.canBack} onBack={props.onBack} onNext={props.onNext} nextLabel="O que fazer em cada parte" />
    </div>
  );
}

// ===========================================================================
// CADA TRECHO DA CURVA
// ===========================================================================

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function durationMin(s: api.EnergySegment): number {
  const d = toMin(s.end) - toMin(s.start);
  return d > 0 ? d : d + 24 * 60;
}

// Refeita em nov/2026: a lista com todos os trechos e o texto de cada um
// passava de 12 cartões (Misto) e esticava a tela. Agora o dia é uma barra das
// 00h às 24h, na mesma sequência de cores da curva, e só o trecho escolhido
// mostra o texto. As setas andam pela barra, pedaço a pedaço.
export function SegmentsStep({ progress, canBack, onBack, onNext }: StepProps) {
  const pieces = useMemo(() => dayBarPieces(progress.result?.segmentos ?? []), [progress.result?.segmentos]);
  // Abre no primeiro pico: é o trecho que mais interessa a quem acabou de ver a curva.
  const [selected, setSelected] = useState(() => Math.max(0, pieces.findIndex((p) => p.segment.level === "pico")));
  const current = pieces[selected]?.segment;

  return (
    <div>
      <div className="mt-5 text-center">
        <Eyebrow>Cada parte do seu dia</Eyebrow>
        <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.2rem] font-black leading-[1.05] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
          O que fazer em cada parte do dia
        </h1>
        <p className="mx-auto mt-2 max-w-[17rem] text-[0.68rem] font-medium leading-4 text-[#6d28d9]/72 dark:text-white/58">
          Toque num trecho da barra para ver como aproveitar cada momento.
        </p>
      </div>

      {current && (
        <>
          <div className="mt-5 flex h-9 gap-[3px]" role="tablist" aria-label="Trechos do seu dia">
            {pieces.map((piece, i) => {
              // As duas pontas do sono são o mesmo trecho: acendem juntas.
              const active = piece.segment.start === current.start;
              return (
                <button
                  key={`${piece.segment.start}-${piece.from}`}
                  type="button"
                  role="tab"
                  aria-selected={i === selected}
                  aria-label={`${piece.segment.label}, ${piece.segment.start} às ${piece.segment.end}`}
                  onClick={() => setSelected(i)}
                  className={`min-w-[14px] rounded-lg transition ${
                    active
                      ? "scale-y-110 ring-2 ring-[#4c1d95] ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-[#120f1a]"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  style={{ flexGrow: piece.to - piece.from, flexBasis: 0, background: LEVEL_STYLE[piece.segment.level].color }}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[0.6rem] font-semibold text-[#6d28d9]/60 dark:text-white/45">
            <span>00h</span>
            <span>24h</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={current.start}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mt-4 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-4 dark:border-white/10 dark:bg-[#191722]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[0.8rem] font-black text-[#4c1d95] dark:text-white">
                  <span className="h-3 w-3 rounded-full" style={{ background: LEVEL_STYLE[current.level].color }} aria-hidden="true" />
                  {current.label}
                </span>
                <span className="text-[0.7rem] font-black text-[#6d28d9]/80 dark:text-white/66">
                  {current.start}–{current.end}
                </span>
              </div>
              <p className="mt-2 min-h-[4rem] text-[0.72rem] font-medium leading-[1.15rem] text-[#6d28d9]/82 dark:text-white/68">
                {current.text}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelected((i) => Math.max(0, i - 1))}
              disabled={selected === 0}
              aria-label="Trecho anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#7b2cbf]/20 text-[#7b2cbf] transition active:scale-[0.96] disabled:opacity-30 dark:border-white/15 dark:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[0.62rem] font-semibold text-[#6d28d9]/64 dark:text-white/50">
              {selected + 1} de {pieces.length}
            </span>
            <button
              type="button"
              onClick={() => setSelected((i) => Math.min(pieces.length - 1, i + 1))}
              disabled={selected === pieces.length - 1}
              aria-label="Próximo trecho"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#7b2cbf]/20 text-[#7b2cbf] transition active:scale-[0.96] disabled:opacity-30 dark:border-white/15 dark:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      <StepFooter canBack={canBack} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ===========================================================================
// COMO O AXON VAI TE AJUDAR (última tela)
// ===========================================================================
// Fecha o onboarding com o que o Axon FAZ com o resultado e leva ao Dashboard.
// Cada item precisa existir no código (ver o comentário de `axonSetup` em
// data/results.ts). Compromissos fixos ficam de fora até o "Axon decide"
// respeitá-los.

export function AxonPlanStep({
  progress,
  canBack,
  onBack,
  onFinish,
}: StepProps & { onFinish: () => void }) {
  const key = resultKey(progress.result?.cronotipo);
  const result = results[key];
  const segs = progress.result?.segmentos ?? [];
  const picos = segs.filter((s) => s.level === "pico").length;
  const peak = peakWindowsText(segs);
  const retake = progress.origin === "retake";

  const items: { icon: LucideIcon; text: string }[] = [
    {
      icon: Target,
      text: peak
        ? `Quando o Axon escolher o horário, suas tarefas mais importantes vão para ${picos > 1 ? `os horários ${peak}, os seus picos` : `o horário ${peak}, o seu pico`}.`
        : result.axonSetup[0],
    },
    { icon: Bell, text: result.axonSetup[1] },
    { icon: TrendingUp, text: result.axonSetup[2] },
  ];

  return (
    <div className="text-center">
      <div className="relative mx-auto mt-1 flex h-[7.5rem] items-center justify-center">
        <div className="absolute left-1/2 top-1/2 h-[7rem] w-[7rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7b2cbf]/12 blur-2xl dark:bg-[#7b2cbf]/24" />
        <motion.img
          src={axonHappy}
          alt="Mascote Axon"
          initial={{ opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative z-10 h-full w-auto object-contain"
        />
      </div>

      <div className="mt-2">
        <Eyebrow>Próximo passo</Eyebrow>
      </div>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.35rem] font-black leading-[1.02] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
        Seu Axon já está <span className="text-[#7b2cbf] dark:text-[#c084fc]">pronto</span>
      </h1>
      <p className="mx-auto mt-2 max-w-[17.5rem] text-[0.7rem] font-medium leading-4 text-[#6d28d9]/72 dark:text-white/58">
        A partir de agora, ele organiza seu dia com base no seu cronotipo.
      </p>

      <ul className="mt-4 space-y-2 text-left">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-3 dark:border-white/10 dark:bg-[#191722]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
              <Icon className="h-4 w-4" />
            </div>
            <p className="self-center text-[0.68rem] font-medium leading-4 text-[#4c1d95]/90 dark:text-white/72">{text}</p>
          </li>
        ))}
      </ul>

      {!retake && (
        <p className="mx-auto mt-4 max-w-[17.5rem] text-[0.7rem] font-black leading-4 text-[#4c1d95] dark:text-white/86">
          No seu Dashboard você já vê em que momento de energia está agora e qual vem a seguir.
        </p>
      )}

      <StepFooter
        canBack={canBack}
        onBack={onBack}
        onNext={onFinish}
        nextLabel={retake ? "Voltar ao perfil" : "Ir para o meu Dashboard"}
      />
    </div>
  );
}
