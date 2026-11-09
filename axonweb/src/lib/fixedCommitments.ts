// ===========================================================================
// COMPROMISSOS FIXOS (Migration 39)
// ===========================================================================
// Regras compartilhadas pelo editor das Configurações e pela tela de horários
// do onboarding. O rascunho (`CommitmentDraft`) é o que a tela edita — pode
// estar incompleto; `commitmentsFromDrafts` decide o que vai para o backend.

import type { FixedCommitment, WeekDayKey } from "./api";

export type CommitmentDraft = {
  id: string;
  activity: string;
  days: WeekDayKey[];
  start: string;
  end: string;
};

export const WEEK_DAYS: Array<{ key: WeekDayKey; label: string; fullLabel: string }> = [
  { key: "seg", label: "S", fullLabel: "Segunda" },
  { key: "ter", label: "T", fullLabel: "Terça" },
  { key: "qua", label: "Q", fullLabel: "Quarta" },
  { key: "qui", label: "Q", fullLabel: "Quinta" },
  { key: "sex", label: "S", fullLabel: "Sexta" },
  { key: "sab", label: "S", fullLabel: "Sábado" },
  { key: "dom", label: "D", fullLabel: "Domingo" },
];

// O backend aceita até 10 (models/schemas.py).
export const MAX_COMMITMENTS = 10;

export function newDraft(partial: Partial<Omit<CommitmentDraft, "id">> = {}): CommitmentDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    activity: "",
    days: [],
    start: "",
    end: "",
    ...partial,
  };
}

export function draftsFromCommitments(list: FixedCommitment[] | undefined): CommitmentDraft[] {
  if (!list || list.length === 0) return [newDraft()];
  return list.map((c) => newDraft({ activity: c.activity, days: c.days, start: c.start, end: c.end }));
}

function isEmpty(d: CommitmentDraft): boolean {
  return !d.activity.trim() && d.days.length === 0 && !d.start && !d.end;
}

/**
 * Rascunhos → lista para gravar. Rascunho totalmente vazio é ignorado (é o
 * cartão em branco que a tela sempre mostra); rascunho pela metade é erro,
 * para a pessoa não achar que salvou algo que não salvou.
 */
export function commitmentsFromDrafts(
  drafts: CommitmentDraft[]
): { commitments: FixedCommitment[]; error: string | null } {
  const commitments: FixedCommitment[] = [];
  for (const [i, d] of drafts.entries()) {
    if (isEmpty(d)) continue;
    const n = i + 1;
    if (!d.activity.trim()) return { commitments: [], error: `Diga qual é o compromisso ${n} (ex.: trabalho, faculdade).` };
    if (d.days.length === 0) return { commitments: [], error: `Escolha os dias do compromisso ${n}.` };
    if (!d.start || !d.end) return { commitments: [], error: `Informe o início e o fim do compromisso ${n}.` };
    if (d.start === d.end) return { commitments: [], error: `O compromisso ${n} começa e termina no mesmo horário.` };
    commitments.push({
      activity: d.activity.trim().replace(/\s+/g, " ").slice(0, 60),
      days: WEEK_DAYS.map((w) => w.key).filter((k) => d.days.includes(k)),
      start: d.start,
      end: d.end,
    });
  }
  return { commitments: commitments.slice(0, MAX_COMMITMENTS), error: null };
}

const DAY_SHORT: Record<WeekDayKey, string> = {
  seg: "seg",
  ter: "ter",
  qua: "qua",
  qui: "qui",
  sex: "sex",
  sab: "sáb",
  dom: "dom",
};

/**
 * ["seg","ter","qua","qui","sex"] → "seg a sex"; dias soltos → "seg, qua e sex".
 * Mesma regra do `_dias_texto` do backend (services/prompts.py), para o
 * compromisso aparecer escrito igual na tela e no chat.
 */
export function daysText(days: WeekDayKey[]): string {
  const order = WEEK_DAYS.map((d) => d.key);
  const idx = [...new Set(days)].map((d) => order.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (idx.length === 0) return "";
  if (idx.length === 7) return "todos os dias";
  if (idx.length > 2 && idx[idx.length - 1] - idx[0] === idx.length - 1) {
    return `${DAY_SHORT[order[idx[0]]]} a ${DAY_SHORT[order[idx[idx.length - 1]]]}`;
  }
  const names = idx.map((i) => DAY_SHORT[order[i]]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
