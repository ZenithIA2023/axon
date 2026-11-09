// ===========================================================================
// ESTADO DO ONBOARDING
// ===========================================================================
// Funções puras + persistência local. Nada aqui fala com a rede: o que chama
// o backend mora em lib/onboarding.ts. Isso deixa as regras testáveis com
// `npx tsx src/lib/onboardingState.test.ts`.
//
// As respostas ficam no localStorage só até o cadastro. A pessoa responde
// quase sempre no SITE e instala o app depois, então tudo vai para a conta
// em /classify/save — o navegador é só a ponte até lá.

import {
  CURVE_OPTIONS,
  OTHER_ID,
  SLEEP_TEXT_ID,
  STEPS,
  type ChoiceStep,
  type ChoiceTarget,
  type Step,
} from "../data/onboardingSteps";
import type { ClassifyPayload, ClassifyResponse, EnergySegment } from "./api";
import { commitmentsFromDrafts, newDraft, type CommitmentDraft } from "./fixedCommitments";

export const ONBOARDING_PROGRESS_KEY = "axon_onboarding_v2";
// Progresso do questionário antigo. O formato é incompatível com o novo; só é
// apagado para não ficar lixo no navegador.
export const LEGACY_PROGRESS_KEY = "axon_questionnaire_progress_v1";

export type Origin =
  | "new" // visitante sem conta (landing)
  | "account" // logado sem cronotipo (cadastro avulso, login, Google)
  | "retake"; // "Refazer o teste" no Perfil

export type OnboardingAnswers = {
  // Em ordem de importância; pode conter OTHER_ID (texto em *_other).
  pains: string[];
  pains_other: string;
  goals: string[];
  goals_other: string;
  schedule_type?: "flexible" | "fixed";
  commitments: CommitmentDraft[];
  workday_sleep?: string;
  workday_wake?: string;
  freeday_sleep?: string;
  freeday_wake?: string;
  // Perguntas pontuadas (P1, P2, P3, P4, P7, P10, P12, P17).
  respostas: Record<string, string>;
  qualidade_sono?: string;
  // Só com a opção "quero escrever" da qualidade do sono. Opcional porque
  // progresso salvo antes de existir este campo continua válido.
  sleep_other?: string;
  current_focus_time?: string;
};

export type OnboardingResult = Pick<
  ClassifyResponse,
  "cronotipo" | "jet_lag_social_min" | "energia" | "segmentos"
>;

export type OnboardingProgress = {
  version: 2;
  stepId: string;
  origin: Origin;
  anonId: string;
  answers: OnboardingAnswers;
  // Resultado da análise (tela 22). Calculado antes do cadastro pela rota
  // pública e recalculado ao gravar.
  result?: OnboardingResult;
  // Já gravado na conta (/classify/save). Daqui em diante só o resultado.
  saved?: boolean;
  updatedAt: number;
};

export function emptyAnswers(): OnboardingAnswers {
  return {
    pains: [],
    pains_other: "",
    goals: [],
    goals_other: "",
    commitments: [newDraft()],
    respostas: {},
  };
}

// UUID v4. `crypto.randomUUID` só existe em contexto seguro; o fallback cobre
// http local e WebViews antigas sem mudar o formato que o backend valida.
export function newAnonId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newProgress(origin: Origin): OnboardingProgress {
  return {
    version: 2,
    stepId: firstStepId(origin !== "new"),
    origin,
    anonId: newAnonId(),
    answers: emptyAnswers(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

export function loadProgress(): OnboardingProgress | null {
  try {
    localStorage.removeItem(LEGACY_PROGRESS_KEY);
    const raw = localStorage.getItem(ONBOARDING_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingProgress;
    // Versão 1 (sequência anterior, nunca publicada) é descartada: os campos
    // e as telas mudaram.
    if (
      parsed?.version !== 2 ||
      typeof parsed.anonId !== "string" ||
      !STEPS.some((s) => s.id === parsed.stepId) ||
      typeof parsed.answers !== "object"
    ) {
      localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
      return null;
    }
    return parsed;
  } catch {
    // JSON corrompido ou storage bloqueado: recomeça do zero, sem quebrar a tela.
    localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
    return null;
  }
}

export function saveProgress(progress: OnboardingProgress): void {
  try {
    localStorage.setItem(
      ONBOARDING_PROGRESS_KEY,
      JSON.stringify({ ...progress, updatedAt: Date.now() })
    );
  } catch {
    // Storage cheio ou bloqueado (aba anônima): o fluxo segue em memória; só
    // perde a retomada se a pessoa fechar a aba.
  }
}

export function clearProgress(): void {
  localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
}

// ---------------------------------------------------------------------------
// Sequência
// ---------------------------------------------------------------------------

// Telas que esta pessoa vê. Logado pula a abertura e o cadastro.
export function visibleSteps(loggedIn: boolean): Step[] {
  return STEPS.filter((s) => !(loggedIn && s.onlyLoggedOut));
}

export function firstStepId(loggedIn: boolean): string {
  return visibleSteps(loggedIn)[0].id;
}

/**
 * Posição válida para retomar. Se a tela salva não existe para esta pessoa
 * (ex.: parou no cadastro e depois logou pelo Google sem conseguir gravar),
 * volta para a tela visível mais próxima ANTES dela — nunca pula uma pergunta.
 */
export function resumeIndex(stepId: string, loggedIn: boolean): number {
  const steps = visibleSteps(loggedIn);
  const exact = steps.findIndex((s) => s.id === stepId);
  if (exact >= 0) return exact;

  const fullIndex = STEPS.findIndex((s) => s.id === stepId);
  for (let i = fullIndex - 1; i >= 0; i--) {
    const idx = steps.findIndex((s) => s.id === STEPS[i].id);
    if (idx >= 0) return idx;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Respostas de escolha
// ---------------------------------------------------------------------------

export function readChoice(answers: OnboardingAnswers, target: ChoiceTarget): string[] {
  switch (target.type) {
    case "ranked":
      return answers[target.field];
    case "focus_time":
      return answers.current_focus_time ? [answers.current_focus_time] : [];
    case "sleep_quality":
      return answers.qualidade_sono ? [answers.qualidade_sono] : [];
    case "resposta": {
      const v = answers.respostas[target.key];
      return v ? [v] : [];
    }
  }
}

/**
 * Toque numa opção. Escolha única troca. Lista ordenada: tocar numa marcada
 * tira e as de baixo sobem; tocar numa nova entra no fim — se a lista já está
 * cheia, nada muda (trocar a última em silêncio estragaria a ordem que a
 * pessoa montou; a tela avisa que é preciso desmarcar uma).
 */
export function toggleChoice(current: string[], step: ChoiceStep, optionId: string): string[] {
  if (!step.maxRanked) return [optionId];
  if (current.includes(optionId)) return current.filter((id) => id !== optionId);
  if (current.length >= step.maxRanked) return current;
  return [...current, optionId];
}

export function writeChoice(
  answers: OnboardingAnswers,
  target: ChoiceTarget,
  values: string[]
): OnboardingAnswers {
  switch (target.type) {
    case "ranked":
      return target.field === "pains" ? { ...answers, pains: values } : { ...answers, goals: values };
    case "focus_time":
      return { ...answers, current_focus_time: values[0] };
    case "sleep_quality":
      return { ...answers, qualidade_sono: values[0] };
    case "resposta":
      return { ...answers, respostas: { ...answers.respostas, [target.key]: values[0] } };
  }
}

function otherText(a: OnboardingAnswers, field: "pains" | "goals"): string {
  return (field === "pains" ? a.pains_other : a.goals_other).trim();
}

function sleepText(a: OnboardingAnswers): string {
  return (a.sleep_other ?? "").trim();
}

// ---------------------------------------------------------------------------
// Validação por tela
// ---------------------------------------------------------------------------

export function isStepComplete(step: Step, a: OnboardingAnswers): boolean {
  switch (step.kind) {
    case "choice": {
      const values = readChoice(a, step.target);
      if (values.length === 0) return false;
      // "Outro" marcado exige o texto.
      if (step.target.type === "ranked" && values.includes(OTHER_ID)) {
        return otherText(a, step.target.field).length > 0;
      }
      if (step.target.type === "sleep_quality" && values[0] === SLEEP_TEXT_ID) {
        return sleepText(a).length > 0;
      }
      return true;
    }
    case "schedule": {
      if (a.schedule_type === "flexible") return true;
      if (a.schedule_type !== "fixed") return false;
      const { commitments, error } = commitmentsFromDrafts(a.commitments);
      return !error && commitments.length > 0;
    }
    case "sleep_times":
      return step.day === "workday"
        ? !!a.workday_sleep && !!a.workday_wake
        : !!a.freeday_sleep && !!a.freeday_wake;
    case "curves":
      return !!a.respostas.P17;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Corpo do /classify
// ---------------------------------------------------------------------------

function horarios(a: OnboardingAnswers): ClassifyPayload["horarios"] {
  if (!a.workday_sleep || !a.workday_wake || !a.freeday_sleep || !a.freeday_wake) {
    return undefined;
  }
  return {
    workday_sleep: a.workday_sleep,
    workday_wake: a.workday_wake,
    freeday_sleep: a.freeday_sleep,
    freeday_wake: a.freeday_wake,
  };
}

export function buildPayload(
  progress: Pick<OnboardingProgress, "answers" | "anonId">,
  flowVersion: string
): ClassifyPayload {
  const a = progress.answers;
  const fixed = a.schedule_type === "fixed";
  const pains = a.pains.filter((id) => id !== OTHER_ID);
  const goals = a.goals.filter((id) => id !== OTHER_ID);
  return {
    respostas: a.respostas,
    // "F" ("nenhuma dessas") quando faltar: é o mesmo padrão do questionário antigo.
    qualidade_sono: a.qualidade_sono ?? "F",
    schedule_type: a.schedule_type,
    horarios: horarios(a),
    // Flexível não manda a lista: o backend guarda a antiga sem mexer.
    fixed_commitments: fixed ? commitmentsFromDrafts(a.commitments).commitments : undefined,
    onboarding: {
      pains,
      // O texto do "outro" só vai se a opção continua marcada.
      pains_other: a.pains.includes(OTHER_ID) ? otherText(a, "pains") || undefined : undefined,
      goals,
      goals_other: a.goals.includes(OTHER_ID) ? otherText(a, "goals") || undefined : undefined,
      sleep_other: a.qualidade_sono === SLEEP_TEXT_ID ? sleepText(a) || undefined : undefined,
      current_focus_time: a.current_focus_time,
      flow_version: flowVersion,
    },
    anon_id: progress.anonId,
  };
}

// ---------------------------------------------------------------------------
// Tela de confirmação
// ---------------------------------------------------------------------------

export type ReviewRow = { stepId: string; label: string; value: string };

function optionLabels(step: ChoiceStep, a: OnboardingAnswers): string {
  const target = step.target;
  return readChoice(a, target)
    .map((id) => {
      if (id === OTHER_ID && target.type === "ranked") return otherText(a, target.field);
      if (id === SLEEP_TEXT_ID && target.type === "sleep_quality") return sleepText(a);
      return step.options.find((o) => o.id === id)?.label ?? "";
    })
    .filter(Boolean)
    .join(", ");
}

function scheduleText(a: OnboardingAnswers): string {
  if (a.schedule_type === "flexible") return "Horários flexíveis";
  const fixed = commitmentsFromDrafts(a.commitments).commitments;
  return fixed.length > 0 ? fixed.map((c) => c.activity).join(", ") : "Horários fixos";
}

/** Uma linha por resposta, na ordem das perguntas. O toque leva à tela `stepId`. */
export function reviewRows(a: OnboardingAnswers): ReviewRow[] {
  return STEPS.flatMap((step): ReviewRow[] => {
    const base = { stepId: step.id };
    switch (step.kind) {
      case "choice":
        return [{ ...base, label: step.reviewLabel, value: optionLabels(step, a) }];
      case "schedule":
        return [{ ...base, label: "Sua rotina", value: scheduleText(a) }];
      case "sleep_times": {
        const [dorme, acorda] =
          step.day === "workday" ? [a.workday_sleep, a.workday_wake] : [a.freeday_sleep, a.freeday_wake];
        return [{
          ...base,
          label: step.day === "workday" ? "Sono em dias de trabalho" : "Sono em dias livres",
          value: dorme && acorda ? `${dorme} às ${acorda}` : "",
        }];
      }
      case "curves":
        return [{
          ...base,
          label: "Energia no dia",
          value: CURVE_OPTIONS.find((c) => c.id === a.respostas.P17)?.label ?? "",
        }];
      default:
        return [];
    }
  });
}

// ---------------------------------------------------------------------------
// Leituras para as telas de texto
// ---------------------------------------------------------------------------

/**
 * O que as 4 perguntas da manhã (P1, P2, P3, P4) sugerem, para a pausa no meio
 * do questionário. É só um termômetro de texto — o cronotipo é calculado no
 * backend com todas as respostas e pesos.
 */
export function morningSignal(respostas: Record<string, string>): "early" | "late" | "mixed" {
  const cedo = new Set(["A", "B"]);
  const tarde: Record<string, string[]> = { P1: ["D", "E"], P2: ["C", "D"], P3: ["C", "D"], P4: ["C", "D"] };
  let saldo = 0;
  for (const q of ["P1", "P2", "P3", "P4"]) {
    const v = respostas[q];
    if (!v) continue;
    if (cedo.has(v)) saldo++;
    else if (tarde[q].includes(v)) saldo--;
  }
  if (saldo >= 2) return "early";
  if (saldo <= -2) return "late";
  return "mixed";
}

export type DayPeriod = "morning" | "afternoon" | "night";

export const periodOfHour = (h: number): DayPeriod => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "night");

/**
 * Períodos do dia em que a curva está no auge (energia a até 5 pontos do
 * máximo). Bimodal devolve dois; o resto, normalmente um.
 */
export function peakPeriods(energia: number[] | undefined): DayPeriod[] {
  if (!energia || energia.length !== 24) return [];
  const max = Math.max(...energia);
  const periods = new Set<DayPeriod>();
  energia.forEach((v, h) => {
    if (v >= max - 5) periods.add(periodOfHour(h));
  });
  return (["morning", "afternoon", "night"] as DayPeriod[]).filter((p) => periods.has(p));
}

// ---------------------------------------------------------------------------
// Barra do dia (tela "o que fazer em cada parte")
// ---------------------------------------------------------------------------

export type DayPiece = { from: number; to: number; segment: EnergySegment };

const hhmmToMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Pedaços da barra das 00h às 24h, em ordem, como a curva da tela anterior. O
 * trecho que atravessa a meia-noite (sono das 22h30 às 06h) vira dois pedaços,
 * um em cada ponta, ligados ao mesmo trecho.
 */
export function dayBarPieces(segmentos: EnergySegment[]): DayPiece[] {
  const DIA = 24 * 60;
  return segmentos
    .flatMap((segment): DayPiece[] => {
      const a = hhmmToMin(segment.start);
      const b = hhmmToMin(segment.end);
      if (a < b) return [{ from: a, to: b, segment }];
      const pieces: DayPiece[] = [{ from: a, to: DIA, segment }];
      // Fim às 00:00 acaba junto com o dia: não sobra pedaço no começo.
      if (b > 0) pieces.push({ from: 0, to: b, segment });
      return pieces;
    })
    .sort((x, y) => x.from - y.from);
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** 100 → "1h40"; 45 → "45 min"; 120 → "2h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h${String(rest).padStart(2, "0")}` : `${h}h`;
}

/** "O que mais *atrapalha*?" → [["O que mais ", false], ["atrapalha", true], ["?", false]]. */
export function splitHighlight(text: string): [string, boolean][] {
  return text
    .split("*")
    .map((part, i) => [part, i % 2 === 1] as [string, boolean])
    .filter(([part]) => part.length > 0);
}

/** ["Agenda", "Lista", "Pomodoro"] → "agenda, lista e pomodoro". */
export function joinLabels(labels: string[]): string {
  const lower = labels.map((l) => l.charAt(0).toLowerCase() + l.slice(1));
  if (lower.length <= 1) return lower[0] ?? "";
  return `${lower.slice(0, -1).join(", ")} e ${lower[lower.length - 1]}`;
}

// Id de opção para o funil: o backend aceita só [a-z0-9_]. As alternativas do
// questionário são maiúsculas ("A"); a lista ordenada vira "study_work".
export function eventOptionId(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const id = values.join("_").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return id ? id.slice(0, 40) : undefined;
}
