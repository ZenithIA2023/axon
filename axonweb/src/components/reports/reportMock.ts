/**
 * Dados FALSOS do relatório — etapa de aprovação visual.
 *
 * O backend hoje entrega só 4 dos ~12 blocos do design novo
 * (avg_completion_rate, most_productive_day, routine_consistency, key_tasks).
 * Os demais campos abaixo ainda NÃO existem em `weekly_reports.data`; estão
 * aqui para fechar o layout antes de mexer no report_service.py.
 *
 * Quando o backend passar a calcular, este arquivo sai e o tipo real vira
 * `api.PeriodReportData` estendido. Ver `ReportFullView` para quais campos
 * cada seção consome.
 */

export type ReportRoutineRow = {
  routine_id: string;
  name: string;
  /** Um item por dia do período, na ordem. */
  days: ("done" | "missed" | "not_scheduled")[];
  days_done: number;
  days_total: number;
  percent: number;
};

export type ReportObjective = {
  id: string;
  title: string;
  progress: number;
  /** Variação em pontos percentuais dentro do período. */
  delta: number;
};

export type ReportPlanVsReal = {
  label: string;
  done: number;
  planned: number;
  /** Sufixo da unidade ("h" para horas); ausente = contagem. */
  unit?: string;
};

export type ReportWellbeingScore = {
  key: "mood" | "productivity" | "sleep_quality";
  label: string;
  /** 0–5, uma casa decimal. */
  value: number;
};

export type ReportMockData = {
  period_start: string;
  period_end: string;
  generated_at: string;

  avg_completion_rate: number;
  /** Variação em p.p. contra o período anterior; null = sem período anterior. */
  completion_delta: number | null;
  completed_items: number;
  total_items: number;

  /** Placeholder visual: métrica ainda sem fórmula validada. */
  time_saved_minutes: number | null;

  plan_vs_real: ReportPlanVsReal[];
  key_tasks: { defined: number; done: number };
  objectives: ReportObjective[];
  routines: ReportRoutineRow[];

  sleep: {
    avg_minutes: number;
    delta_minutes: number | null;
    avg_sleep_time: string;
    avg_wake_time: string;
  } | null;

  wellbeing: {
    scores: ReportWellbeingScore[];
    logs_count: number;
  } | null;

  discovery: string | null;
};

export const REPORT_MOCK: ReportMockData = {
  period_start: "2026-08-24",
  period_end: "2026-08-30",
  generated_at: "2026-08-31",

  avg_completion_rate: 75,
  completion_delta: 5,
  completed_items: 30,
  total_items: 40,

  time_saved_minutes: 120,

  plan_vs_real: [
    { label: "Horas registradas", done: 21.5, planned: 32, unit: "h" },
    { label: "Tarefas", done: 30, planned: 40 },
    { label: "Eventos", done: 4, planned: 5 },
  ],

  key_tasks: { defined: 7, done: 5 },

  objectives: [
    { id: "o1", title: "TCC · Capítulo 2", progress: 62, delta: 8 },
    { id: "o2", title: "Inglês", progress: 45, delta: 5 },
  ],

  routines: [
    {
      routine_id: "r1",
      name: "Revisar o dia",
      days: ["done", "done", "done", "missed", "done", "not_scheduled", "done"],
      days_done: 5,
      days_total: 6,
      percent: 83,
    },
    {
      routine_id: "r2",
      name: "Treinar",
      days: ["done", "done", "done", "done", "done", "missed", "not_scheduled"],
      days_done: 5,
      days_total: 6,
      percent: 83,
    },
    {
      routine_id: "r3",
      name: "Ler",
      days: ["done", "missed", "missed", "done", "done", "not_scheduled", "not_scheduled"],
      days_done: 3,
      days_total: 5,
      percent: 60,
    },
  ],

  sleep: {
    avg_minutes: 432,
    delta_minutes: 36,
    avg_sleep_time: "23:40",
    avg_wake_time: "06:52",
  },

  wellbeing: {
    scores: [
      { key: "mood", label: "Humor", value: 4 },
      { key: "productivity", label: "Produtividade", value: 3.8 },
      { key: "sleep_quality", label: "Qualidade do sono", value: 4.2 },
    ],
    logs_count: 6,
  },

  discovery:
    "Na sexta, sua agenda ficou mais cheia e menos tarefas foram concluídas. Experimente deixar mais espaço entre os compromissos.",
};

export const REPORT_MOCK_NARRATIVE =
  "Você concluiu 75% das tarefas e avançou nos dois objetivos que tinha em aberto, mantendo as prioridades em movimento. O sono também acompanhou: dormiu 36 minutos a mais por noite que na semana passada.";
