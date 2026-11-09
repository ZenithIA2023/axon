import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Brain,
  CalendarClock,
  Clock3,
  ListChecks,
  MessageCircleQuestion,
  Moon,
  Pencil,
  Sparkles,
  Sun,
  Sunrise,
  type LucideIcon,
} from "lucide-react";

import axonHappyWave from "../../assets/axon/axon-happy-wave.webp";
import FixedCommitmentsEditor from "../schedule/FixedCommitmentsEditor";
import {
  CURVE_OPTIONS,
  ESTIMATED_MINUTES,
  GOAL_OPTIONS,
  OTHER_ID,
  PAIN_OPTIONS,
  RHYTHM_QUESTION_COUNT,
  SLEEP_TEXT_ID,
  type ChoiceStep,
} from "../../data/onboardingSteps";
import {
  joinLabels,
  reviewRows,
  morningSignal,
  readChoice,
  toggleChoice,
  writeChoice,
  type OnboardingAnswers,
  type OnboardingProgress,
} from "../../lib/onboardingState";
import {
  HighlightTitle,
  MiniCurve,
  OptionButton,
  StepFooter,
  StepHeading,
  TimeField,
  WhyNote,
} from "./OnboardingUI";

export type StepProps = {
  progress: OnboardingProgress;
  update: (fn: (p: OnboardingProgress) => OnboardingProgress) => void;
  canBack: boolean;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
};

function setAnswers(update: StepProps["update"], fn: (a: OnboardingAnswers) => OnboardingAnswers) {
  update((p) => ({ ...p, answers: fn(p.answers) }));
}

function footerProps({ canBack, canNext, onBack, onNext }: StepProps) {
  return { canBack, onBack, onNext, nextDisabled: !canNext };
}

// ===========================================================================
// ABERTURA
// ===========================================================================

export function WelcomeStep({ onNext }: StepProps) {
  return (
    <div className="text-center">
      <p className="mt-1 text-[0.66rem] font-black uppercase tracking-[0.08em] text-[#6d28d9]/72 dark:text-white/56">
        Seu cronotipo em {ESTIMATED_MINUTES} minutos
      </p>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.45rem] font-black leading-[0.98] tracking-[-0.045em] text-[#4c1d95] dark:text-white">
        Seu dia tem horários de ouro. Vamos encontrar os seus.
      </h1>

      <p className="mx-auto mt-3 max-w-[17.5rem] text-[0.74rem] font-medium leading-5 text-[#6d28d9]/72 dark:text-white/62">
        Ninguém rende igual o dia todo. O Axon descobre seu cronotipo e mostra em que horas sua energia e seu foco estão no auge, e quando é melhor pegar leve.
      </p>

      <div className="relative mx-auto mt-4 flex h-[12.5rem] items-center justify-center">
        <div className="absolute left-1/2 top-1/2 h-[11rem] w-[11rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7b2cbf]/10 blur-2xl dark:bg-[#7b2cbf]/20" />
        <motion.img
          src={axonHappyWave}
          alt="Mascote Axon acenando"
          animate={{ y: [-5, 5, -5] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10 h-full w-auto object-contain drop-shadow-[0_28px_52px_rgba(45,8,80,0.18)]"
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#7b2cbf] px-6 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:bg-[#8d31dd] active:scale-[0.98] dark:bg-[#a855f7] dark:hover:bg-[#b968ff]"
      >
        Descobrir meu cronotipo
      </button>

      <p className="mt-4 text-[0.7rem] text-[#6d28d9] dark:text-white/62">
        Já tem uma conta?{" "}
        <Link to="/login" className="font-black text-[#6d28d9] hover:text-[#7b2cbf] dark:text-[#d8b4fe]">
          Entrar
        </Link>
      </p>
    </div>
  );
}

const HOW_IT_WORKS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircleQuestion,
    title: "Você conta como é o seu dia",
    text: "O que atrapalha, o que você quer conquistar e quais horários são fixos.",
  },
  {
    icon: Moon,
    title: "O Axon descobre seu cronotipo",
    text: "Perguntas da cronobiologia revelam quando seu corpo pede foco e quando pede pausa.",
  },
  {
    icon: ListChecks,
    title: "Seu dia ganha um plano",
    text: "As tarefas importantes vão para os seus melhores horários, e o plano se ajusta conforme você usa.",
  },
];

export function HowItWorksStep(props: StepProps) {
  return (
    <div>
      <StepHeading title="Como o Axon trabalha por você" />

      <ol className="mt-6 space-y-3">
        {HOW_IT_WORKS.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] p-3 dark:border-white/10 dark:bg-[#191722]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[0.78rem] font-black text-[#4c1d95] dark:text-white">
                {i + 1}. {title}
              </p>
              <p className="mt-0.5 text-[0.68rem] font-medium leading-4 text-[#6d28d9]/72 dark:text-white/60">
                {text}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Autoridade, não prova social inventada: o questionário é inspirado
          no de Horne & Östberg (MEQ), mas adaptado — por isso "inspirado". */}
      <p className="mt-4 text-center text-[0.64rem] font-semibold leading-4 text-[#6d28d9]/66 dark:text-white/52">
        Inspirado no questionário de Horne & Östberg, referência em cronobiologia desde 1976.
      </p>

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// ===========================================================================
// PERGUNTAS DE ESCOLHA (única ou lista ordenada)
// ===========================================================================

export function ChoiceQuestion(props: StepProps & { step: ChoiceStep }) {
  const { step, progress, update } = props;
  const selected = readChoice(progress.answers, step.target);
  const ranked = !!step.maxRanked;
  const full = ranked && selected.length >= (step.maxRanked ?? 0);
  const target = step.target;
  // Campo de texto da opção "outro" (dores, objetivos) e "quero escrever" (sono).
  const textField =
    target.type === "ranked"
      ? target.field === "pains"
        ? ("pains_other" as const)
        : ("goals_other" as const)
      : target.type === "sleep_quality"
        ? ("sleep_other" as const)
        : null;
  const showText = !!textField && selected.includes(ranked ? OTHER_ID : SLEEP_TEXT_ID);

  function select(optionId: string) {
    setAnswers(update, (a) => writeChoice(a, target, toggleChoice(readChoice(a, target), step, optionId)));
  }

  return (
    <div>
      <StepHeading icon={step.icon} category={step.category} title={step.title} hint={step.hint} />

      <div className="mt-5 space-y-2" role={ranked ? "group" : "radiogroup"}>
        {step.options.map((option, i) => {
          const rank = selected.indexOf(option.id);
          return (
            <OptionButton
              key={option.id}
              label={option.label}
              // Lista ordenada mostra a posição (1, 2, 3); única, a letra.
              // Pela posição, não pelo id: nem todo id é uma letra (H1, morning…).
              marker={ranked ? "" : String.fromCharCode(65 + i)}
              rank={ranked && rank >= 0 ? rank + 1 : undefined}
              selected={rank >= 0}
              multi={ranked}
              dimmed={full && rank < 0}
              onSelect={() => select(option.id)}
            />
          );
        })}
      </div>

      {textField && showText && (
        <motion.input
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          type="text"
          maxLength={120}
          autoFocus
          placeholder={step.otherPlaceholder}
          aria-label={step.otherPlaceholder}
          value={progress.answers[textField] ?? ""}
          onChange={(e) => setAnswers(update, (a) => ({ ...a, [textField]: e.target.value }))}
          className="mt-3 min-h-11 w-full rounded-2xl border border-[#7b2cbf]/30 bg-white px-3.5 text-[0.8rem] font-medium text-[#4c1d95] outline-none transition placeholder:text-[#7b2cbf]/42 focus:border-[#7b2cbf]/55 dark:border-white/14 dark:bg-[#191722] dark:text-white dark:placeholder:text-white/38 dark:focus:border-[#a855f7]/45"
        />
      )}

      {full && (
        <p className="mt-3 text-center text-[0.66rem] font-semibold text-[#6d28d9]/72 dark:text-white/56">
          Você já escolheu {step.maxRanked}. Toque numa escolhida para trocar.
        </p>
      )}

      {step.why && <WhyNote text={step.why} />}

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// ===========================================================================
// COMO O AXON AJUDA (dor nº 1 + objetivo nº 1)
// ===========================================================================

// Um texto por dor principal. Sem estatística inventada: só o que a
// cronobiologia sustenta e o que o app de fato faz.
const PAIN_HELP: Record<string, { title: string; text: string }> = {
  procrastination: {
    title: "Procrastinar quase nunca é preguiça.",
    text: "Muitas vezes a tarefa difícil cai num horário em que sua energia está baixa, e o cérebro empurra para depois. O Axon coloca o que é importante nos seus horários de pico, quando começar custa menos.",
  },
  distraction: {
    title: "Foco também tem horário.",
    text: "Em alguns momentos do dia o cérebro filtra distrações com facilidade; em outros, qualquer notificação ganha. O Axon reserva seus melhores horários para o que pede atenção e deixa o resto para quando o foco naturalmente cai.",
  },
  energy_swings: {
    title: "Sua energia tem um ritmo, e dá para usar isso a seu favor.",
    text: "Altos e baixos ao longo do dia são normais: fazem parte do relógio biológico. Quando você sabe quando eles acontecem, para de lutar contra eles. O Axon planeja o dia em volta desses momentos.",
  },
  prioritizing: {
    title: "Prioridade também é questão de horário.",
    text: "Decidir o que vem primeiro fica mais fácil quando cada tarefa tem um lugar certo no dia. O Axon ajuda a escolher o que importa e encaixa isso no momento em que você tem mais energia para fazer bem feito.",
  },
  no_structure: {
    title: "Estrutura não precisa ser rígida.",
    text: "Um dia bom tem poucos pontos fixos, nos lugares certos. O Axon monta essa estrutura a partir do seu ritmo e dos seus compromissos, não de um modelo pronto.",
  },
  busy_no_progress: {
    title: "Estar ocupado não é o mesmo que avançar.",
    text: "Quando o importante fica para o fim do dia, ele disputa espaço com o cansaço e quase sempre perde. O Axon protege seus melhores horários para o que realmente move você para frente.",
  },
  exhaustion: {
    title: "Cansaço também pode ser sinal de horário errado.",
    text: "Fazer o trabalho pesado na hora em que o corpo pede pausa gasta mais energia do que deveria. O Axon organiza o dia respeitando seu ritmo, para o esforço render mais.",
  },
};

const FALLBACK_HELP = {
  title: "O Axon começa entendendo como você funciona.",
  text: "Antes de organizar qualquer coisa, o Axon descobre o seu ritmo. É isso que as próximas perguntas vão revelar.",
};

function label(options: { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export function HowAxonHelpsStep(props: StepProps) {
  const a = props.progress.answers;
  const mainPain = a.pains.find((id) => id !== OTHER_ID);
  const help = (mainPain && PAIN_HELP[mainPain]) || FALLBACK_HELP;
  const others = a.pains.filter((id) => id !== mainPain && id !== OTHER_ID).map((id) => label(PAIN_OPTIONS, id));
  const mainGoal = a.goals[0];
  const goalText =
    mainGoal === OTHER_ID
      ? a.goals_other.trim()
      : mainGoal
        ? label(GOAL_OPTIONS, mainGoal)
        : "";

  return (
    <div className="text-center">
      <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mt-4 text-[0.66rem] font-black uppercase tracking-[0.08em] text-[#6d28d9]/72 dark:text-white/56">
        Como o Axon ajuda
      </p>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.3rem] font-black leading-[1.02] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
        {help.title}
      </h1>
      <p className="mx-auto mt-3 max-w-[17.5rem] text-[0.76rem] font-medium leading-5 text-[#6d28d9]/76 dark:text-white/66">
        {help.text}
      </p>

      {goalText && (
        <div className="mt-4 rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] p-3 text-left dark:border-white/10 dark:bg-[#191722]">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-[#7b2cbf] dark:text-[#d8b4fe]">
            Seu objetivo
          </p>
          <p className="mt-1 text-[0.74rem] font-black text-[#4c1d95] dark:text-white">{goalText}</p>
          <p className="mt-1 text-[0.68rem] font-medium leading-4 text-[#6d28d9]/72 dark:text-white/60">
            O que aproxima você desse objetivo ganha os seus melhores horários, todos os dias.
          </p>
        </div>
      )}

      {others.length > 0 && (
        <p className="mx-auto mt-3 max-w-[17.5rem] text-[0.66rem] font-semibold leading-4 text-[#6d28d9]/66 dark:text-white/52">
          Também vamos cuidar de: {joinLabels(others)}.
        </p>
      )}

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// ===========================================================================
// HORÁRIOS DE TRABALHO E ESTUDO
// ===========================================================================

export function ScheduleStep(props: StepProps) {
  const { progress, update } = props;
  const a = progress.answers;

  function choose(type: "flexible" | "fixed") {
    setAnswers(update, (prev) => ({ ...prev, schedule_type: type }));
  }

  return (
    <div>
      <StepHeading icon={CalendarClock} category="Sua rotina" title="Como são seus horários de trabalho ou estudo?" />

      <div className="mt-5 space-y-2" role="radiogroup">
        <OptionButton
          label="Flexíveis: eu organizo meu dia"
          marker="A"
          selected={a.schedule_type === "flexible"}
          multi={false}
          onSelect={() => choose("flexible")}
        />
        <OptionButton
          label="Fixos: tenho compromissos com hora marcada"
          marker="B"
          selected={a.schedule_type === "fixed"}
          multi={false}
          onSelect={() => choose("fixed")}
        />
      </div>

      {a.schedule_type === "fixed" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-4"
        >
          <p className="mb-3 text-[0.68rem] font-semibold leading-4 text-[#6d28d9]/72 dark:text-white/60">
            Cadastre cada compromisso com os dias e os horários. Dá para mudar depois nas Configurações.
          </p>
          <FixedCommitmentsEditor
            drafts={a.commitments}
            onChange={(next) => setAnswers(update, (prev) => ({ ...prev, commitments: next }))}
          />
        </motion.div>
      )}

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// ===========================================================================
// RITMO
// ===========================================================================

export function RhythmIntroStep(props: StepProps) {
  return (
    <PauseLayout
      icon={Moon}
      eyebrow="Parte 2 de 3"
      title="Agora vamos descobrir o seu cronotipo."
      text={`São ${RHYTHM_QUESTION_COUNT} perguntas rápidas sobre sono e energia. O objetivo não é mudar quem você é, e sim entender como você funciona. Responda pensando nos seus dias reais: não existe resposta certa.`}
      footer={<StepFooter {...footerProps(props)} />}
    />
  );
}

export function SleepTimesStep(props: StepProps & { day: "workday" | "freeday" }) {
  const { day, progress, update } = props;
  const a = progress.answers;
  const workday = day === "workday";

  function set(field: "workday_sleep" | "workday_wake" | "freeday_sleep" | "freeday_wake", v: string) {
    setAnswers(update, (prev) => ({ ...prev, [field]: v }));
  }

  // Sem valor inicial de propósito: um horário pré-preenchido vira a resposta
  // de quem só aperta "avançar", e estes horários pesam no cronotipo.
  return (
    <div>
      <StepHeading
        icon={workday ? Clock3 : Sun}
        category={workday ? "Dias úteis" : "Dias livres"}
        title={workday ? "Em que horário você dorme e acorda nos dias de trabalho ou estudo?" : "E num dia livre, sem nenhum compromisso…"}
        hint={
          workday
            ? "Coloque os horários da sua rotina de hoje, mesmo que não sejam os ideais."
            : "Imagine um dia sem despertador. A que horas você acordaria naturalmente?"
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <TimeField
          label={workday ? "Vou dormir às" : "Que horas dormiria?"}
          value={workday ? a.workday_sleep : a.freeday_sleep}
          onChange={(v) => set(workday ? "workday_sleep" : "freeday_sleep", v)}
        />
        <TimeField
          label={workday ? "Acordo às" : "E acordaria?"}
          value={workday ? a.workday_wake : a.freeday_wake}
          onChange={(v) => set(workday ? "workday_wake" : "freeday_wake", v)}
        />
      </div>

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// Pausa no meio das perguntas, montada com as respostas da manhã (P1–P4).
// Fala de SINAIS, não de resultado: o cronotipo só sai no fim, com tudo.
const MORNING_TEXT = {
  early: {
    icon: Sunrise,
    title: "Suas manhãs dão sinais de quem rende cedo.",
    text: "Acordar sem tanto esforço, ficar alerta logo e sentir fome cedo são sinais de um relógio biológico adiantado. As próximas perguntas mostram até onde isso vai.",
  },
  late: {
    icon: Moon,
    title: "Suas manhãs dão sinais de um relógio que começa mais tarde.",
    text: "Quando acordar custa, a cabeça demora a ligar e o apetite só vem depois, o relógio biológico costuma estar atrasado em relação ao horário do dia. Não é preguiça: é biologia.",
  },
  mixed: {
    icon: Brain,
    title: "Suas manhãs mandam sinais misturados.",
    text: "Algumas respostas apontam para um relógio adiantado, outras para um atrasado. Isso é comum, e as próximas perguntas, sobre foco e energia, vão desempatar.",
  },
};

export function MorningSignalsStep(props: StepProps) {
  const c = MORNING_TEXT[morningSignal(props.progress.answers.respostas)];
  return (
    <PauseLayout
      icon={c.icon}
      eyebrow="O que suas manhãs dizem"
      title={c.title}
      text={c.text}
      footer={<StepFooter {...footerProps(props)} />}
    />
  );
}

export function CurvesStep(props: StepProps) {
  const { progress, update } = props;
  const selected = progress.answers.respostas.P17;

  return (
    <div>
      <StepHeading icon={Brain} category="Ritmo do dia" title="Qual curva parece mais com o seu dia?" />

      <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup">
        {CURVE_OPTIONS.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAnswers(update, (a) => ({ ...a, respostas: { ...a.respostas, P17: option.id } }))}
              className={`flex flex-col gap-1.5 rounded-2xl border p-2.5 text-left transition active:scale-[0.98] ${
                active
                  ? "border-[#7b2cbf]/60 bg-[#7b2cbf]/10 shadow-[0_12px_28px_rgba(123,44,191,0.12)] dark:border-[#a855f7]/60 dark:bg-[#a855f7]/14"
                  : "border-[#7b2cbf]/16 bg-[#fbf8ff] hover:border-[#7b2cbf]/30 dark:border-white/10 dark:bg-[#191722] dark:hover:border-white/18"
              }`}
            >
              <MiniCurve id={option.id} points={option.points} active={active} />
              <span className="text-[0.68rem] font-semibold leading-4 text-[#4c1d95] dark:text-white/82">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between px-1 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-[#6d28d9]/50 dark:text-white/36">
        <span>Manhã</span>
        <span>Tarde</span>
        <span>Noite</span>
      </div>

      <StepFooter {...footerProps(props)} />
    </div>
  );
}

// ===========================================================================
// LAYOUT DAS PAUSAS
// ===========================================================================

export function PauseLayout({
  icon: Icon,
  eyebrow,
  title,
  text,
  footer,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  text: string;
  footer: ReactNode;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
        <Icon className="h-7 w-7" />
      </div>
      <p className="mt-4 text-[0.66rem] font-black uppercase tracking-[0.08em] text-[#6d28d9]/72 dark:text-white/56">
        {eyebrow}
      </p>
      <h1 className="mx-auto mt-2 max-w-[17rem] text-[1.3rem] font-black leading-[1.02] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
        <HighlightTitle text={title} />
      </h1>
      <p className="mx-auto mt-3 max-w-[17.5rem] text-[0.76rem] font-medium leading-5 text-[#6d28d9]/76 dark:text-white/66">
        {text}
      </p>
      {footer}
    </div>
  );
}

// ===========================================================================
// CONFIRMAR RESPOSTAS
// ===========================================================================
// Depois daqui as respostas viram resultado e são gravadas. Cada linha leva à
// pergunta; ao avançar nela, a pessoa volta para cá (Onboarding.tsx).

export function ReviewStep(props: StepProps & { listOpen: boolean; onOpenList: () => void; onEdit: (stepId: string) => void }) {
  if (!props.listOpen) {
    return (
      <div className="text-center">
        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#7b2cbf]/10 text-[#7b2cbf] dark:bg-white/10 dark:text-[#d8b4fe]">
          <ListChecks className="h-7 w-7" />
        </div>
        <StepHeading
          title="Suas perguntas *terminaram*"
          hint="Agora vamos analisar suas respostas e chegar ao seu resultado. Seu cronotipo é o ponto de partida: com o tempo, seus registros ajudam o Axon a ajustar seus horários."
        />
        <StepFooter
          {...footerProps(props)}
          nextLabel="Confirmar respostas"
          secondary={
            <button
              type="button"
              onClick={props.onOpenList}
              className="min-h-10 w-full rounded-2xl border border-[#7b2cbf]/24 bg-[#fbf8ff] px-4 text-xs font-semibold text-[#6d28d9] transition hover:border-[#7b2cbf]/38 active:scale-[0.98] dark:border-white/10 dark:bg-[#191722] dark:text-white/76"
            >
              Revisar minhas respostas
            </button>
          }
        />
      </div>
    );
  }

  const rows = reviewRows(props.progress.answers);

  return (
    <div>
      <StepHeading title="Confira as *suas respostas*" hint="Toque na resposta que quiser mudar." />

      <ul className="mt-4 divide-y divide-[#7b2cbf]/10 rounded-2xl border border-[#7b2cbf]/16 bg-[#fbf8ff] dark:divide-white/8 dark:border-white/10 dark:bg-[#191722]">
        {rows.map((row) => (
          <li key={row.stepId}>
            <button
              type="button"
              onClick={() => props.onEdit(row.stepId)}
              aria-label={`Alterar: ${row.label}. Resposta atual: ${row.value}`}
              className="flex min-h-8 w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-[#7b2cbf]/5 active:scale-[0.99] dark:hover:bg-white/5"
            >
              <span className="w-[42%] shrink-0 text-[0.62rem] font-semibold leading-[0.85rem] text-[#6d28d9]/72 dark:text-white/56">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 break-words text-[0.66rem] font-bold leading-[0.85rem] text-[#4c1d95] dark:text-white/86">
                {row.value}
              </span>
              <Pencil className="h-3 w-3 shrink-0 text-[#7b2cbf]/50 dark:text-white/40" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <StepFooter {...footerProps(props)} nextLabel="Confirmar respostas" />
    </div>
  );
}
