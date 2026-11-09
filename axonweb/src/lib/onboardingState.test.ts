/**
 * Testes das regras puras do onboarding (lib/onboardingState.ts) e dos
 * compromissos fixos (lib/fixedCommitments.ts).
 *
 * Os pontos sensíveis: a retomada (quem logou no meio não pode pular pergunta
 * nem cair numa tela que não existe para ele), a lista ordenada (a ordem é a
 * prioridade da pessoa) e o corpo enviado ao /classify — um campo fora do
 * contrato do backend vira 422 e a pessoa perde o resultado na última tela.
 *
 * Sem runner configurado; roda direto:
 *
 *     cd axonweb && npx tsx src/lib/onboardingState.test.ts
 */

import { OTHER_ID, STEPS, type ChoiceStep } from "../data/onboardingSteps";
import { commitmentsFromDrafts, daysText, draftsFromCommitments, newDraft } from "./fixedCommitments";
import {
  buildPayload,
  dayBarPieces,
  emptyAnswers,
  eventOptionId,
  firstStepId,
  formatDuration,
  isStepComplete,
  joinLabels,
  morningSignal,
  newAnonId,
  peakPeriods,
  readChoice,
  resumeIndex,
  reviewRows,
  splitHighlight,
  toggleChoice,
  visibleSteps,
  writeChoice,
} from "./onboardingState";

let ok = 0;
let falhas = 0;

function eq(nome: string, obtido: unknown, esperado: unknown): void {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`FALHA ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}

function step(id: string): ChoiceStep {
  const s = STEPS.find((x) => x.id === id);
  if (!s || s.kind !== "choice") throw new Error(`tela ${id} não é de escolha`);
  return s;
}
function anyStep(id: string) {
  const s = STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`tela ${id} não existe`);
  return s;
}

console.log("— sequência —");
eq("visitante começa na boas-vindas", firstStepId(false), "t01_boas_vindas");
eq("logado começa nas dores", firstStepId(true), "t04_dores");
eq("logado não vê o cadastro", visibleSteps(true).some((s) => s.kind === "signup"), false);
const doVisitante = visibleSteps(false).map((s) => s.kind);
eq("cadastro vem antes do cronotipo", doVisitante.indexOf("signup") < doVisitante.indexOf("reveal"), true);
eq("cadastro vem depois da análise", doVisitante.indexOf("analyzing") < doVisitante.indexOf("signup"), true);
eq("termina em como o Axon vai ajudar", doVisitante[doVisitante.length - 1], "axon_plan");
eq("ids únicos", new Set(STEPS.map((s) => s.id)).size, STEPS.length);
eq("ids no formato do funil", STEPS.every((s) => /^[a-z0-9_]{1,40}$/.test(s.id)), true);

eq("confirmação vem antes da análise", doVisitante.indexOf("review") === doVisitante.indexOf("analyzing") - 1, true);

console.log("\n— retomada —");
const logado = visibleSteps(true);
eq("tela existente retoma nela", logado[resumeIndex("t11_p1", true)].id, "t11_p1");
// Parou no cadastro, entrou pelo Google, mas gravar falhou: volta à análise.
eq("cadastro vira análise para quem logou", logado[resumeIndex("t23_cadastro", true)].id, "t22_analisando");
eq("abertura vira primeira tela do logado", logado[resumeIndex("t02_como_funciona", true)].id, "t04_dores");

console.log("\n— lista ordenada (até 3) —");
const dores = step("t04_dores");
eq("marca a primeira", toggleChoice([], dores, "procrastination"), ["procrastination"]);
eq("a ordem é a do toque", toggleChoice(["distraction"], dores, "procrastination"), ["distraction", "procrastination"]);
eq("cheia: a quarta não entra", toggleChoice(["a", "b", "c"], dores, "d"), ["a", "b", "c"]);
eq("desmarcar faz as de baixo subirem", toggleChoice(["a", "b", "c"], dores, "a"), ["b", "c"]);
const p1 = step("t11_p1");
eq("escolha única troca", toggleChoice(["A"], p1, "C"), ["C"]);

console.log("\n— gravar e ler respostas —");
let a = emptyAnswers();
a = writeChoice(a, p1.target, ["B"]);
a = writeChoice(a, dores.target, ["distraction", OTHER_ID]);
a = writeChoice(a, step("t16_p9").target, ["D"]);
a = writeChoice(a, step("t21_foco_atual").target, ["night"]);
eq("pergunta pontuada vai para respostas", a.respostas, { P1: "B" });
eq("lista ordenada preservada", a.pains, ["distraction", OTHER_ID]);
eq("P9 vai para qualidade_sono", a.qualidade_sono, "D");
eq("foco atual", a.current_focus_time, "night");
eq("leitura devolve o gravado", readChoice(a, dores.target), ["distraction", OTHER_ID]);

console.log("\n— telas completas —");
eq("'outro' marcado sem texto não avança", isStepComplete(dores, a), false);
eq("'outro' com texto avança", isStepComplete(dores, { ...a, pains_other: "reuniões" }), true);
eq("lista vazia não avança", isStepComplete(step("t05_objetivos"), a), false);
const horarios = anyStep("t07_horarios");
eq("sem escolher não avança", isStepComplete(horarios, a), false);
eq("flexível avança", isStepComplete(horarios, { ...a, schedule_type: "flexible" }), true);
eq("fixo com cartão vazio não avança", isStepComplete(horarios, { ...a, schedule_type: "fixed" }), false);
const trabalho = newDraft({ activity: "Trabalho", days: ["seg", "sex"], start: "09:00", end: "18:00" });
eq("fixo com compromisso avança", isStepComplete(horarios, { ...a, schedule_type: "fixed", commitments: [trabalho] }), true);
eq("fixo com compromisso pela metade não avança",
  isStepComplete(horarios, { ...a, schedule_type: "fixed", commitments: [trabalho, newDraft({ activity: "Aula" })] }), false);

const sono = step("t16_p9");
eq("sono 'quero escrever' sem texto não avança", isStepComplete(sono, { ...a, qualidade_sono: "F" }), false);
eq("sono 'quero escrever' com texto avança", isStepComplete(sono, { ...a, qualidade_sono: "F", sleep_other: "Durmo em dois turnos" }), true);
eq("sono com opção pronta avança", isStepComplete(sono, { ...a, qualidade_sono: "A" }), true);

console.log("\n— compromissos fixos —");
eq("cartão vazio é ignorado", commitmentsFromDrafts([newDraft()]).commitments, []);
eq("sem dia é erro", commitmentsFromDrafts([newDraft({ activity: "Aula", start: "08:00", end: "10:00" })]).error, "Escolha os dias do compromisso 1.");
eq("mesmo horário é erro", commitmentsFromDrafts([newDraft({ activity: "Aula", days: ["seg"], start: "08:00", end: "08:00" })]).error,
  "O compromisso 1 começa e termina no mesmo horário.");
eq("dias saem em ordem da semana",
  commitmentsFromDrafts([newDraft({ activity: "  Aula  ", days: ["sex", "seg"], start: "08:00", end: "10:00" })]).commitments,
  [{ activity: "Aula", days: ["seg", "sex"], start: "08:00", end: "10:00" }]);
eq("sem compromissos salvos começa com 1 cartão vazio", draftsFromCommitments([]).length, 1);
eq("ida e volta preserva os dados",
  commitmentsFromDrafts(draftsFromCommitments([{ activity: "Trabalho", days: ["seg"], start: "09:00", end: "18:00" }])).commitments,
  [{ activity: "Trabalho", days: ["seg"], start: "09:00", end: "18:00" }]);

eq("dias seguidos", daysText(["sex", "seg", "ter", "qua", "qui"]), "seg a sex");
eq("dias soltos", daysText(["seg", "qua", "sex"]), "seg, qua e sex");
eq("fim de semana", daysText(["sab", "dom"]), "sáb e dom");
eq("semana inteira", daysText(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]), "todos os dias");
eq("um dia", daysText(["ter"]), "ter");

console.log("\n— corpo do /classify —");
const completo = {
  ...a,
  pains_other: "  muitas reuniões ",
  goals: ["study", "work"],
  goals_other: "texto que sobrou de quando 'outro' estava marcado",
  schedule_type: "fixed" as const,
  commitments: [trabalho, newDraft()],
  workday_sleep: "23:00",
  workday_wake: "06:30",
  freeday_sleep: "01:00",
  freeday_wake: "09:00",
};
const corpo = buildPayload({ answers: completo, anonId: "x" }, "v1");
eq("'outro' não vai como id", corpo.onboarding?.pains, ["distraction"]);
eq("texto do 'outro' vai limpo", corpo.onboarding?.pains_other, "muitas reuniões");
eq("texto do 'outro' desmarcado não vai", corpo.onboarding?.goals_other, undefined);
eq("ordem dos objetivos preservada", corpo.onboarding?.goals, ["study", "work"]);
eq("fixo manda só os compromissos completos", corpo.fixed_commitments?.length, 1);
eq("flexível não manda compromissos",
  buildPayload({ answers: { ...completo, schedule_type: "flexible" }, anonId: "x" }, "v1").fixed_commitments, undefined);
eq("horários completos vão juntos", corpo.horarios?.freeday_sleep, "01:00");
eq("sem P9 manda 'F'", buildPayload({ answers: emptyAnswers(), anonId: "x" }, "v1").qualidade_sono, "F");
eq("horário faltando = sem horarios",
  buildPayload({ answers: { ...completo, freeday_wake: undefined }, anonId: "x" }, "v1").horarios, undefined);

eq("texto do sono vai limpo", buildPayload({ answers: { ...completo, qualidade_sono: "F", sleep_other: "  dois turnos " }, anonId: "x" }, "v1").onboarding?.sleep_other, "dois turnos");
eq("texto do sono só com a opção marcada", buildPayload({ answers: { ...completo, qualidade_sono: "A", sleep_other: "sobrou" }, anonId: "x" }, "v1").onboarding?.sleep_other, undefined);

console.log("\n— confirmação —");
const respondido = { ...completo, qualidade_sono: "F", sleep_other: "Durmo em dois turnos", current_focus_time: "varies", respostas: { P1: "B", P7: "H4", P10: "A9", P17: "F" } };
const linhas = reviewRows(respondido);
const linha = (id: string) => linhas.find((l) => l.stepId === id)?.value;
eq("uma linha por pergunta", linhas.length, 15);
eq("toda linha aponta para tela existente", linhas.every((l) => STEPS.some((s) => s.id === l.stepId)), true);
eq("'outro' aparece como o texto digitado", linha("t04_dores"), "Me distraio com facilidade, muitas reuniões");
eq("sono escrito aparece como texto", linha("t16_p9"), "Durmo em dois turnos");
eq("horários do sono", linha("t09_sono_util"), "23:00 às 06:30");
eq("compromissos pelo nome", linha("t07_horarios"), "Trabalho");
eq("flexível", reviewRows({ ...respondido, schedule_type: "flexible" }).find((l) => l.stepId === "t07_horarios")?.value, "Horários flexíveis");
eq("faixa nova do sono à noite", linha("t20_p7"), "Entre 00h e 1h30");
eq("faixa nova da tarefa difícil", linha("t17_p10"), "Até as 9h");
eq("curva", linha("t18_p17_curvas"), "Muda de um dia para o outro");
eq("sem resposta fica vazio, sem quebrar", reviewRows(emptyAnswers()).length, 15);

console.log("\n— leituras para o texto —");
eq("manhã adiantada", morningSignal({ P1: "A", P2: "A", P3: "B", P4: "C" }), "early");
eq("manhã atrasada", morningSignal({ P1: "E", P2: "D", P3: "C", P4: "D" }), "late");
eq("manhã misturada", morningSignal({ P1: "A", P2: "D", P3: "C", P4: "B" }), "mixed");
const matutino = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 10 ? 95 : 40));
eq("pico de manhã", peakPeriods(matutino), ["morning"]);
const bimodal = Array.from({ length: 24 }, (_, h) => (h === 9 || h === 17 ? 92 : 40));
eq("dois picos", peakPeriods(bimodal), ["morning", "afternoon"]);
eq("sem curva, sem pico", peakPeriods([]), []);

console.log("\n— barra do dia —");
const seg = (start: string, end: string) => ({ start, end, level: "pico" as const, label: "x", text: "y" });
const manha = dayBarPieces([seg("06:00", "12:00"), seg("12:00", "22:30"), seg("22:30", "06:00")]);
eq("sono que passa da meia-noite vira dois pedaços", manha.length, 4);
eq("começa às 00h", manha[0].from, 0);
eq("termina às 24h", manha[manha.length - 1].to, 1440);
eq("as duas pontas são o mesmo trecho", manha[0].segment.start, manha[3].segment.start);
eq("cobre as 24h sem buraco", manha.every((p, i) => i === 0 || p.from === manha[i - 1].to), true);
eq("fim às 00:00 não cria pedaço vazio", dayBarPieces([seg("00:00", "12:00"), seg("12:00", "00:00")]).length, 2);

console.log("\n— texto —");
eq("100 min", formatDuration(100), "1h40");
eq("45 min", formatDuration(45), "45 min");
eq("destaque em roxo", splitHighlight("Qual é o seu *objetivo*?"), [["Qual é o seu ", false], ["objetivo", true], ["?", false]]);
eq("lista de 3", joinLabels(["Procrastino", "Me distraio", "Não sei"]), "procrastino, me distraio e não sei");

console.log("\n— funil —");
eq("alternativa vira minúscula", eventOptionId(["A"]), "a");
eq("lista ordenada junta com _", eventOptionId(["study", "work"]), "study_work");
eq("vazio não manda", eventOptionId([]), undefined);
eq("anon_id é UUID v4", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(newAnonId()), true);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
// Sem @types/node no projeto: o `process` vem do globalThis, como no voice.test.ts.
if (falhas) (globalThis as { process?: { exit: (code: number) => void } }).process?.exit(1);
