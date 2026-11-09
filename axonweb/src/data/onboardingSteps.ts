// ===========================================================================
// CONTEÚDO DO ONBOARDING
// ===========================================================================
// A sequência inteira mora aqui, como dados: reordenar telas, trocar um texto
// ou uma opção é editar esta lista, sem mexer nos componentes.
//
// Os ids das opções são o CONTRATO com o backend (models/schemas.py:
// OnboardingProfile e as alternativas da tabela de pontos em
// services/chronotype.py). Valor fora da lista é recusado com 422.
//
// Os ids das telas (`t01_...`) vão para o funil (onboarding_events). Mudar um
// id quebra a comparação com os dados antigos: mude só se a tela mudou de fato.

import type { ElementType } from "react";
import { Brain, Clock3, Coffee, Moon, Sunrise, Target, Zap } from "lucide-react";

// Versão do fluxo gravada em cada evento do funil. Suba quando a sequência
// mudar o bastante para que os números antigos não sejam comparáveis.
export const FLOW_VERSION = "v1";

// Tempo prometido na tela 1 (e na landing: LandingPage.jsx e LandingFinalCTA.jsx).
// Estimativa tela a tela até a revelação do cronotipo, em 09/11/2026: ~5,5 min
// com horário flexível, ~7 min com compromissos fixos — vale o caso mais lento.
// Ajuste depois de medir no funil (onboarding_events, da 1ª visualização à
// t24_cronotipo): a promessa tem que bater com a realidade, senão vira motivo
// de desistência.
export const ESTIMATED_MINUTES = 7;

export type Section = "voce" | "ritmo" | "resultado";

export const SECTION_LABELS: Record<Section, string> = {
  voce: "Você",
  ritmo: "Ritmo",
  resultado: "Resultado",
};

export type Option = { id: string; label: string };

// Opção "escrever o meu" das listas ordenadas. Não vai para o backend como id:
// o texto vai em `pains_other` / `goals_other`.
export const OTHER_ID = "other";

// Opção da qualidade do sono que abre o campo de texto. Essa continua indo como
// `qualidade_sono` ("não detalhada" para o chat); o texto vai em `sleep_other`.
export const SLEEP_TEXT_ID = "F";

// Onde a resposta de uma pergunta de escolha é guardada.
export type ChoiceTarget =
  | { type: "ranked"; field: "pains" | "goals" } // até 3, em ordem
  | { type: "focus_time" } // current_focus_time
  | { type: "resposta"; key: string } // pergunta pontuada (P1, P17…)
  | { type: "sleep_quality" }; // P9: vai em `qualidade_sono`, não pontua

type StepBase = {
  id: string;
  section: Section;
  // Telas que só existem para quem ainda não tem conta (abertura e cadastro).
  // Quem já está logado começa direto nas perguntas.
  onlyLoggedOut?: boolean;
};

export type ChoiceStep = StepBase & {
  kind: "choice";
  category: string;
  icon: ElementType;
  // "*palavra*" aparece em destaque (roxo).
  title: string;
  // Rótulo curto na tela de confirmação das respostas.
  reviewLabel: string;
  hint?: string;
  why?: string; // "Por que perguntamos" (para pergunta que parece estranha)
  target: ChoiceTarget;
  options: Option[];
  // Lista ordenada: até quantas. Ausente = escolha única.
  maxRanked?: number;
  // Rótulo do campo de texto quando a opção "outro" está marcada.
  otherPlaceholder?: string;
};

export type ResultStepKind = "reveal" | "meaning" | "strengths" | "your_answers" | "curve" | "segments" | "axon_plan";

export type Step =
  | (StepBase & { kind: "welcome" })
  | (StepBase & { kind: "how_it_works" })
  | ChoiceStep
  | (StepBase & { kind: "how_axon_helps" })
  | (StepBase & { kind: "schedule" })
  | (StepBase & { kind: "rhythm_intro" })
  | (StepBase & { kind: "sleep_times"; day: "workday" | "freeday" })
  | (StepBase & { kind: "morning_signals" })
  | (StepBase & { kind: "curves" })
  | (StepBase & { kind: "review" })
  | (StepBase & { kind: "analyzing" })
  | (StepBase & { kind: "signup" })
  | (StepBase & { kind: ResultStepKind });

// ---------------------------------------------------------------------------
// Dores e objetivos (até 3, em ordem)
// ---------------------------------------------------------------------------

export const PAIN_OPTIONS: Option[] = [
  { id: "procrastination", label: "Procrastino o que é importante" },
  { id: "distraction", label: "Me distraio com facilidade" },
  { id: "energy_swings", label: "Minha energia sobe e desce ao longo do dia" },
  { id: "prioritizing", label: "Não sei o que priorizar" },
  { id: "no_structure", label: "Meu dia não tem uma estrutura" },
  { id: "busy_no_progress", label: "Trabalho muito, mas sinto que não saio do lugar" },
  { id: "exhaustion", label: "Termino o dia sem energia nenhuma" },
  { id: OTHER_ID, label: "Outro motivo" },
];

export const GOAL_OPTIONS: Option[] = [
  { id: "stop_procrastinating", label: "Parar de procrastinar" },
  { id: "work", label: "Render mais no trabalho" },
  { id: "study", label: "Estudar com mais foco" },
  { id: "business", label: "Fazer meu negócio crescer" },
  { id: "projects", label: "Tirar projetos do papel" },
  { id: "energy", label: "Ter mais energia e disposição" },
  { id: "balance", label: "Equilibrar trabalho e vida pessoal" },
  { id: "routine", label: "Criar uma rotina que eu consiga manter" },
  { id: OTHER_ID, label: "Outro objetivo" },
];

// Rótulos curtos da P12 ("você sente a energia cair no início da tarde").
export const ENERGY_DIP_SHORT: Record<string, string> = {
  B: "no fim da manhã",
  C: "no início da tarde",
  D: "no meio da tarde",
  E: "no final da tarde",
  F: "no começo da noite",
  G: "de madrugada",
};

// Curvas da tela de ritmo do dia (P17). Energia de 0 a 1 em 7 pontos, da
// manhã para a noite; o componente desenha a área preenchida.
export const CURVE_OPTIONS: { id: string; label: string; points: number[] }[] = [
  { id: "A", label: "Alta de manhã, cai ao longo do dia", points: [0.55, 0.95, 0.85, 0.6, 0.4, 0.25, 0.15] },
  { id: "B", label: "Constante, com pequenos picos", points: [0.45, 0.65, 0.6, 0.62, 0.6, 0.55, 0.4] },
  { id: "C", label: "Baixa de manhã, sobe à tarde", points: [0.15, 0.25, 0.4, 0.65, 0.85, 0.8, 0.55] },
  { id: "D", label: "Acordo de verdade só à noite", points: [0.1, 0.15, 0.2, 0.3, 0.5, 0.85, 0.95] },
  { id: "E", label: "Dois picos: manhã e noite", points: [0.4, 0.9, 0.55, 0.35, 0.55, 0.9, 0.5] },
  // Gatilho do Misto irregular no backend (P17-F, ver chronotype.py).
  { id: "F", label: "Muda de um dia para o outro", points: [0.4, 0.75, 0.3, 0.8, 0.35, 0.7, 0.45] },
];

// ---------------------------------------------------------------------------
// Sequência
// ---------------------------------------------------------------------------

export const STEPS: Step[] = [
  // ABERTURA
  { id: "t01_boas_vindas", section: "voce", kind: "welcome", onlyLoggedOut: true },
  { id: "t02_como_funciona", section: "voce", kind: "how_it_works", onlyLoggedOut: true },

  // VOCÊ
  {
    id: "t04_dores",
    section: "voce",
    kind: "choice",
    category: "Seu dia hoje",
    icon: Zap,
    title: "O que mais atrapalha sua *produtividade* hoje?",
    reviewLabel: "O que atrapalha",
    hint: "Escolha até 3, na ordem: a primeira é a que mais pesa.",
    target: { type: "ranked", field: "pains" },
    options: PAIN_OPTIONS,
    maxRanked: 3,
    otherPlaceholder: "Conte em poucas palavras",
  },
  {
    id: "t05_objetivos",
    section: "voce",
    kind: "choice",
    category: "Seu objetivo",
    icon: Target,
    title: "O que você mais deseja *alcançar*?",
    reviewLabel: "O que deseja alcançar",
    hint: "Escolha até 3, começando pelo mais importante.",
    target: { type: "ranked", field: "goals" },
    options: GOAL_OPTIONS,
    maxRanked: 3,
    otherPlaceholder: "O que você deseja alcançar?",
  },
  { id: "t06_como_ajuda", section: "voce", kind: "how_axon_helps" },
  { id: "t07_horarios", section: "voce", kind: "schedule" },

  // RITMO
  { id: "t08_transicao", section: "ritmo", kind: "rhythm_intro" },
  { id: "t09_sono_util", section: "ritmo", kind: "sleep_times", day: "workday" },
  { id: "t10_sono_livre", section: "ritmo", kind: "sleep_times", day: "freeday" },
  {
    id: "t11_p1",
    section: "ritmo",
    kind: "choice",
    category: "Sono e despertar",
    icon: Sunrise,
    title: "Você acha fácil acordar pela manhã?",
    reviewLabel: "Acordar de manhã",
    target: { type: "resposta", key: "P1" },
    options: [
      { id: "A", label: "Muito fácil" },
      { id: "B", label: "Moderadamente fácil" },
      { id: "C", label: "Normal" },
      { id: "D", label: "Difícil" },
      { id: "E", label: "Muito difícil" },
    ],
  },
  {
    id: "t12_p4",
    section: "ritmo",
    kind: "choice",
    category: "Sono e despertar",
    icon: Clock3,
    title: "Pela manhã, você depende do despertador para acordar?",
    reviewLabel: "Despertador",
    target: { type: "resposta", key: "P4" },
    options: [
      { id: "A", label: "Não, acordo sem despertador" },
      { id: "B", label: "Sim, mas sem dificuldade" },
      { id: "C", label: "Sim, às vezes com dificuldade" },
      { id: "D", label: "Sim, preciso de vários alarmes" },
    ],
  },
  {
    id: "t13_p2",
    section: "ritmo",
    kind: "choice",
    category: "Sono e despertar",
    icon: Zap,
    title: "Na primeira meia hora depois de acordar, você se sente alerta?",
    reviewLabel: "Ao acordar",
    target: { type: "resposta", key: "P2" },
    options: [
      { id: "A", label: "Totalmente alerta" },
      { id: "B", label: "Moderadamente alerta" },
      { id: "C", label: "Pouco alerta" },
      { id: "D", label: "Nada alerta" },
    ],
  },
  {
    id: "t14_p3",
    section: "ritmo",
    kind: "choice",
    category: "Manhã",
    icon: Coffee,
    title: "Como é o seu apetite na primeira hora depois de acordar?",
    reviewLabel: "Apetite pela manhã",
    why: "O apetite da manhã acompanha o relógio biológico: é um dos sinais mais usados para identificar o cronotipo.",
    target: { type: "resposta", key: "P3" },
    options: [
      { id: "A", label: "Tenho bastante apetite" },
      { id: "B", label: "Apetite moderado" },
      { id: "C", label: "Pouco apetite" },
      { id: "D", label: "Sem apetite" },
    ],
  },
  // Pausa no meio das perguntas, montada com as 4 respostas acima.
  { id: "t15_sinais_manha", section: "ritmo", kind: "morning_signals" },
  {
    id: "t16_p9",
    section: "ritmo",
    kind: "choice",
    category: "Qualidade do sono",
    icon: Moon,
    title: "Como você descreveria a qualidade do seu sono hoje?",
    reviewLabel: "Qualidade do sono",
    hint: "Escolha a opção que mais combina com você. Se nenhuma combinar, escreva do seu jeito.",
    target: { type: "sleep_quality" },
    otherPlaceholder: "Como é o seu sono?",
    options: [
      { id: "A", label: "Durmo direto e acordo com energia" },
      { id: "B", label: "Acordo poucas vezes, mas levanto bem" },
      { id: "C", label: "Demoro a pegar no sono, depois durmo bem" },
      { id: "D", label: "Acordo várias vezes, tenho sono leve" },
      { id: "E", label: "Durmo bem, mas acordo sem energia" },
      { id: SLEEP_TEXT_ID, label: "Nenhuma dessas, quero escrever" },
    ],
  },
  {
    id: "t17_p10",
    section: "ritmo",
    kind: "choice",
    category: "Pico mental",
    icon: Brain,
    title: "Se você tivesse uma tarefa difícil e importante amanhã, em que horário escolheria fazer?",
    reviewLabel: "Horário para tarefa difícil",
    hint: "Escolha o horário em que você se sente mais apto para fazer uma tarefa difícil.",
    target: { type: "resposta", key: "P10" },
    options: [
      { id: "A9", label: "Até as 9h" },
      { id: "B9", label: "Entre 9h e 12h" },
      { id: "C", label: "Entre 13h30 e 16h" },
      { id: "D", label: "Entre 16h e 21h" },
      { id: "E", label: "Entre 21h e 00h" },
      { id: "F", label: "Depois da meia-noite" },
    ],
  },
  { id: "t18_p17_curvas", section: "ritmo", kind: "curves" },
  {
    id: "t19_p12",
    section: "ritmo",
    kind: "choice",
    category: "Queda de energia",
    icon: Zap,
    title: "Você sente uma queda de energia em algum momento do dia?",
    reviewLabel: "Queda de energia",
    target: { type: "resposta", key: "P12" },
    options: [
      { id: "A", label: "Não, tenho energia o dia todo" },
      { id: "B", label: "Sim, no fim da manhã (10h às 12h)" },
      { id: "C", label: "Sim, no início da tarde (12h às 15h)" },
      { id: "D", label: "Sim, no meio da tarde (15h às 17h)" },
      { id: "E", label: "Sim, no final da tarde (17h às 20h)" },
      { id: "F", label: "Sim, no começo da noite (20h às 23h)" },
      { id: "G", label: "Só de madrugada (depois das 23h)" },
    ],
  },
  {
    id: "t20_p7",
    section: "ritmo",
    kind: "choice",
    category: "Cansaço à noite",
    icon: Moon,
    title: "À noite, a que horas você costuma sentir sono?",
    reviewLabel: "Sono à noite",
    target: { type: "resposta", key: "P7" },
    options: [
      { id: "H1", label: "Antes das 21h" },
      { id: "H2", label: "Entre 21h e 22h30" },
      { id: "H3", label: "Entre 22h30 e 00h" },
      { id: "H4", label: "Entre 00h e 1h30" },
      { id: "H5", label: "Depois da 1h30" },
    ],
  },
  {
    id: "t21_foco_atual",
    section: "ritmo",
    kind: "choice",
    category: "Seu foco hoje",
    icon: Target,
    title: "Hoje, quando você costuma fazer sua tarefa mais importante?",
    reviewLabel: "Tarefa mais importante",
    target: { type: "focus_time" },
    options: [
      { id: "early_morning", label: "De manhã bem cedo (até as 9h)" },
      { id: "morning", label: "De manhã (das 9h às 12h)" },
      { id: "afternoon", label: "À tarde" },
      { id: "night", label: "À noite" },
      { id: "leftover", label: "Quando sobra tempo" },
      { id: "varies", label: "Varia muito de um dia para o outro" },
    ],
  },

  // Última chance de corrigir: depois da análise o resultado já foi calculado.
  { id: "t21b_confirmar", section: "ritmo", kind: "review" },

  // RESULTADO
  { id: "t22_analisando", section: "resultado", kind: "analyzing" },
  // Cadastro ANTES de mostrar o cronotipo (decisão de nov/2026): a pessoa já
  // investiu nas perguntas e a curiosidade está no máximo.
  { id: "t23_cadastro", section: "resultado", kind: "signup", onlyLoggedOut: true },
  { id: "t24_cronotipo", section: "resultado", kind: "reveal" },
  { id: "t25_significado", section: "resultado", kind: "meaning" },
  { id: "t25b_pontos_fortes", section: "resultado", kind: "strengths" },
  { id: "t26_suas_respostas", section: "resultado", kind: "your_answers" },
  { id: "t27_curva", section: "resultado", kind: "curve" },
  { id: "t28_trechos", section: "resultado", kind: "segments" },
  // Última tela: o que o Axon faz com o resultado e o gancho para o Dashboard.
  { id: "t29_axon_ajuda", section: "resultado", kind: "axon_plan" },
];

// Perguntas do bloco de ritmo, para a transição dizer quantas são.
export const RHYTHM_QUESTION_COUNT = STEPS.filter(
  (s) => s.section === "ritmo" && (s.kind === "choice" || s.kind === "sleep_times" || s.kind === "curves")
).length;

// Primeira tela do resultado: depois de gravado, não se volta para antes dela.
export const FIRST_RESULT_STEP_ID = "t24_cronotipo";
