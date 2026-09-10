/**
 * Relatório completo (semanal/mensal) — layout novo, baseado na referência
 * visual de 3 seções: Resumo, Progresso e Bem-estar.
 *
 * ETAPA ATUAL: alimentado por `REPORT_MOCK` (dados falsos) para aprovação do
 * visual. O backend ainda não calcula a maioria destes campos — ver
 * reportMock.ts. Cada seção já trata ausência de dado (null / lista vazia),
 * então ligar no backend real é trocar a origem do `data`.
 *
 * Na referência as 3 seções ficam lado a lado; aqui elas empilham no mobile e
 * viram colunas a partir de lg. O conteúdo é o mesmo nos dois casos.
 */

import { useId, type ReactNode } from "react";
import {
  Check,
  CalendarDays,
  Lightbulb,
  Moon,
  Share2,
  Smile,
  Star,
  Target,
  TrendingUp,
  Zap,
  BarChart3,
} from "lucide-react";

import {
  REPORT_MOCK,
  REPORT_MOCK_NARRATIVE,
  type ReportMockData,
  type ReportRoutineRow,
} from "./reportMock";

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

const WEEK_DAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"];

function formatLongRange(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const month = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" });

  return sameMonth
    ? `${s.getDate()}–${e.getDate()} de ${month(e)} de ${e.getFullYear()}`
    : `${s.getDate()} de ${month(s)} – ${e.getDate()} de ${month(e)} de ${e.getFullYear()}`;
}

function formatShortDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  });
}

/** 432 → "7h12"; 120 → "2h"; 45 → "45 min". */
function formatMinutes(total: number) {
  const minutes = Math.max(0, Math.round(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** "23:40" → "23h40" (padrão de hora usado no resto do app). */
function formatClock(value: string) {
  return value.replace(":", "h");
}

function formatAmount(value: number, unit?: string) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  if (unit !== "h") return String(rounded);
  const minutes = Math.max(0, Math.round(value * 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function percentOf(done: number, planned: number) {
  return planned > 0 ? Math.round((done / planned) * 100) : 0;
}

/* ------------------------------------------------------------------ */
/* Peças reutilizadas                                                  */
/* ------------------------------------------------------------------ */

function SectionTitle({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <p className="mb-3 text-xs font-medium tracking-[0.04em] text-[#bfb7d2]">
      {index} · {label}
    </p>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-purple-300/20 bg-[linear-gradient(135deg,#171522,#101019)] p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Star;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-purple-400/35 bg-purple-500/10 text-[#cf8aff]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black leading-tight text-white">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[#bfb7d2]">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Chip de variação: verde quando melhorou, neutro quando piorou ou empatou. */
function DeltaChip({ children, positive }: { children: ReactNode; positive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
        positive
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
          : "border-white/15 bg-[#12111c] text-[#bfb7d2]"
      }`}
    >
      {positive && <TrendingUp className="h-3 w-3" />}
      {children}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#39374d]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#9525f5] to-[#c15aff] transition-[width] duration-500"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 01 — Resumo                                                   */
/* ------------------------------------------------------------------ */

function SummarySection({
  data,
  narrative,
  periodLabel,
}: {
  data: ReportMockData;
  narrative: string;
  periodLabel: string;
}) {
  return (
    <section className="min-w-0">
      <SectionTitle index="01" label="Resumo" />

      <div className="mb-4">
        <div className="mb-5 flex items-center justify-between gap-3"><span className="text-xl font-semibold tracking-[-0.06em] text-white">AXON</span><p className="text-xs text-[#bfb7d2]">{periodLabel}</p></div>
        {/* O título é o próprio período; a data completa some daqui para não
            repetir a mesma informação duas vezes. */}
        <h2 className="mt-1 text-[2rem] sm:text-[2.5rem] font-black leading-[1.06] tracking-[-0.03em] text-white">
          {formatLongRange(data.period_start, data.period_end)}
        </h2>
        <p className="mt-1 text-[0.7rem] text-[#bfb7d2]">
          Gerado em {formatShortDay(data.generated_at)}
        </p>

        {/* Resumo do Axon: fica ENTRE o título e a porcentagem. Sem corte —
            a narrativa vem do Claude e aparece inteira; o tamanho é limitado
            no prompt do backend, não no CSS. */}
        <p className="mt-3 text-sm leading-6 text-[#e4dff1]">{narrative}</p>
      </div>

      {/* Destaque: taxa de conclusão + comparação com o período anterior.
          O mascote do AXON ficou de fora por ora — a composição com o robô
          dentro deste card não convenceu. */}
      <div className="relative isolate mb-3 overflow-hidden rounded-[1.5rem] border border-purple-400/60 bg-[radial-gradient(ellipse_at_85%_0%,#a431ff_0%,#6311d8_35%,#24105e_70%,#15102d_100%)] p-5 sm:p-6 shadow-[inset_0_1px_0_#ffffff30,0_12px_40px_#6000ff20]">
        <p className="text-[clamp(3rem,13vw,4.5rem)] font-black leading-none tracking-[-0.065em] text-white">
          {data.avg_completion_rate}%
        </p>
        <p className="mt-1.5 text-sm font-black text-white">
          das tarefas concluídas
        </p>

        {data.completion_delta !== null && (
          <div className="mt-3">
            <DeltaChip positive={data.completion_delta > 0}>
              {data.completion_delta > 0 ? "+" : ""}
              {data.completion_delta} p.p. vs. período anterior
            </DeltaChip>
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-[#e4dff1]">
          Você concluiu {data.completed_items} de {data.total_items} tarefas e
          avançou nas suas prioridades.
        </p>
      </div>

      {/* Tempo poupado: PLACEHOLDER VISUAL. A métrica não tem fórmula
          validada (completed_at marca quando o usuário marcou, não quando
          terminou), então o card é rotulado como estimativa. */}
      {data.time_saved_minutes !== null && (
        <div className="relative mb-3 flex items-center gap-4 overflow-hidden rounded-[1.5rem] border border-purple-400/70 bg-[radial-gradient(ellipse_at_top_right,#aa27fc,#4c099d_55%,#26094d)] p-5 shadow-[inset_0_1px_0_#ffffff30]">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-purple-400/35 bg-purple-500/10 text-[#cf8aff]">
            <Zap className="h-9 w-9 fill-current" />
          </div>
          <div className="min-w-0">
            <p className="text-5xl font-black leading-none tracking-tight text-white">
              {formatMinutes(data.time_saved_minutes)}
            </p>
            <p className="mt-1 text-xs font-semibold text-white">
              poupadas neste período
            </p>
            <p className="text-[0.68rem] text-[#bfb7d2]">
              Estimativa de tempo poupado com automações.
            </p>
          </div>
        </div>
      )}

      {/* O que foi marcado x o que foi feito. */}
      {data.plan_vs_real.length > 0 && (
        <Panel>
          <PanelHeader icon={Target} title="Planejado x realizado" />

          <div className="space-y-3">
            {data.plan_vs_real.map((row) => {
              const pct = percentOf(row.done, row.planned);
              return (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-xs text-[#e4dff1]">{row.label}</p>
                    <p className="shrink-0 text-xs font-black text-white">
                      {formatAmount(row.done, row.unit)}
                      <span className="font-semibold text-[#bfb7d2]">
                        {" "}
                        / {formatAmount(row.planned, row.unit)}
                      </span>
                    </p>
                  </div>
                  <ProgressBar percent={pct} />
                  <p className="mt-1 text-right text-[0.65rem] font-semibold text-[#bfb7d2]">
                    {pct}%
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 02 — Progresso                                                */
/* ------------------------------------------------------------------ */

/** Grade de bolinhas por dia: feita / não feita / não prevista. */
function RoutineDaysGrid({ routines }: { routines: ReportRoutineRow[] }) {
  const columns = routines[0]?.days.length ?? 0;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: columns > 7 ? `${96 + columns * 22}px` : "15rem" }}>
        <div
          className="mb-1.5 grid gap-1 pl-[6rem]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <span
              key={i}
              className="text-center text-[0.65rem] font-semibold text-[#bfb7d2]"
            >
              {columns === 7 ? WEEK_DAY_INITIALS[i] : i + 1}
            </span>
          ))}
        </div>

        {routines.map((routine) => (
          <div key={routine.routine_id} className="mb-1.5 flex items-center gap-1">
            <p className="w-[6rem] shrink-0 break-words pr-2 text-xs text-[#e4dff1]">
              {routine.name}
            </p>
            <div
              className="grid flex-1 gap-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {routine.days.map((state, i) => (
                <span
                  key={i}
                  title={
                    state === "done"
                      ? "Feita"
                      : state === "missed"
                        ? "Não feita"
                        : "Não prevista"
                  }
                  className={`h-5 rounded-md border ${
                    state === "done"
                      ? "border-purple-400/35 bg-gradient-to-r from-[#9525f5] to-[#c15aff]"
                      : state === "missed"
                        ? "border-white/15 bg-[#39374d]"
                        : "border-dashed border-white/15 bg-transparent"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.65rem] text-[#bfb7d2]">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-gradient-to-r from-[#9525f5] to-[#c15aff]" /> Feita
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md border border-white/15 bg-[#39374d]" />{" "}
            Não feita
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md border border-dashed border-white/15" />{" "}
            Não prevista
          </span>
        </div>
      </div>
    </div>
  );
}

function ProgressSection({ data }: { data: ReportMockData }) {
  const topRoutine = [...data.routines].sort((a, b) => b.percent - a.percent)[0];

  return (
    <section className="min-w-0">
      <SectionTitle index="02" label="Progresso" />

      <div className="space-y-3">
        {/* Tarefas-chave (prioridades do período). */}
        {data.key_tasks.defined > 0 && (
          <Panel>
            <PanelHeader icon={Star} title="Prioridades do período" />

            {/* As bolinhas NUNCA quebram de linha: a trilha encolhe cada uma
                (min 0.9rem) até caber na largura disponível, em vez de jogar
                as últimas para baixo em telas estreitas ou com muitas
                prioridades definidas. */}
            <div className="flex items-center justify-between gap-3">
              <p className="shrink-0 text-2xl font-black leading-none text-white">
                {data.key_tasks.done} de {data.key_tasks.defined}
              </p>

              <div className="flex min-w-0 flex-1 flex-nowrap justify-end gap-1 sm:gap-1.5">
                {Array.from({ length: data.key_tasks.defined }).map((_, i) => {
                  const done = i < data.key_tasks.done;
                  return (
                    <span
                      key={i}
                      className={`flex aspect-square min-w-[0.9rem] max-w-[1.5rem] flex-1 items-center justify-center rounded-full border ${
                        done
                          ? "border-purple-400/35 bg-gradient-to-r from-[#9525f5] to-[#c15aff]"
                          : "border-white/15 bg-[#39374d]"
                      }`}
                      aria-label={done ? "Prioridade concluída" : "Prioridade pendente"}
                    >
                      {done && (
                        <Check
                          className="h-2/3 w-2/3 text-white"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            <p className="mt-2 text-xs text-[#bfb7d2]">
              Você deu espaço ao que importa.
            </p>
          </Panel>
        )}

        {/* Objetivos: progresso atual + quanto avançou no período. */}
        {data.objectives.length > 0 && (
          <Panel>
            <PanelHeader icon={Target} title="Progresso dos seus objetivos" />

            <div className="space-y-3">
              {data.objectives.map((objective) => (
                <div key={objective.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="min-w-0 break-words text-sm text-[#e4dff1]">
                      {objective.title}
                    </p>
                    <p className="shrink-0 text-xs font-black text-white">
                      {objective.progress}%
                    </p>
                  </div>
                  <ProgressBar percent={objective.progress} />
                  {objective.delta > 0 && (
                    <p className="mt-1 text-right text-[0.65rem] font-semibold text-emerald-300">
                      +{objective.delta} p.p. no período
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Constância nas rotinas. */}
        {data.routines.length > 0 && (
          <Panel>
            <PanelHeader icon={CalendarDays} title="Suas rotinas" />

            <RoutineDaysGrid routines={data.routines} />

            {topRoutine && (
              <div className="mt-3 flex items-center gap-2.5 rounded-[1.1rem] border border-white/15 bg-[#39374d] p-3">
                <BarChart3 className="h-4 w-4 shrink-0 text-[#cf8aff]" />
                <p className="text-xs text-[#e4dff1]">
                  <span className="font-black text-white">
                    {topRoutine.name}
                  </span>{" "}
                  foi sua rotina mais constante.
                </p>
              </div>
            )}
          </Panel>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Seção 03 — Bem-estar                                                */
/* ------------------------------------------------------------------ */

/** Medidor 0–5 em 5 quadrados, com quadrado parcial para a fração. */
function ScoreMeter({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span
            key={i}
            className="h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[0.2rem] bg-[#39374d]"
          >
            <span
              className="block h-full bg-gradient-to-r from-[#9525f5] to-[#c15aff]"
              style={{ width: `${fill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Ambient sleep illustration; it does not represent measured sleep stages. */
function SleepIllustration() {
  const id = useId();
  return (
    <svg viewBox="0 0 360 85" className="mt-4 h-20 w-full" aria-hidden="true" focusable="false">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a12aff" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#a12aff" stopOpacity="0.03" />
      </linearGradient></defs>
      <path d="M8 68 C35 48 49 23 72 37 S112 86 153 70 S197 37 230 56 S267 67 289 61 S327 76 352 66 L352 82 L8 82Z" fill={`url(#${id})`} />
      <path d="M8 68 C35 48 49 23 72 37 S112 86 153 70 S197 37 230 56 S267 67 289 61 S327 76 352 66" fill="none" stroke="#d594ff" strokeWidth="2.5" />
      <path d="M8 16V82 M352 16V82" stroke="#c889ff" strokeDasharray="5 6" />
    </svg>
  );
}

function WellbeingSection({ data }: { data: ReportMockData }) {
  const scoreIcon = {
    mood: Smile,
    productivity: BarChart3,
    sleep_quality: Moon,
  } as const;

  return (
    <section className="min-w-0">
      <SectionTitle index="03" label="Bem-estar" />

      <div className="space-y-3">
        {/* Sono: média de horas + horários médios de dormir e acordar. */}
        {data.sleep && (
          <Panel>
            <PanelHeader icon={Moon} title="Sono" />

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-5xl font-black leading-none tracking-[-0.04em] text-white">
                  {formatMinutes(data.sleep.avg_minutes)}
                </p>
                <p className="mt-1 text-xs text-[#bfb7d2]">média de sono por noite</p>
              </div>

              {data.sleep.delta_minutes !== null && (
                <DeltaChip positive={data.sleep.delta_minutes > 0}>
                  {data.sleep.delta_minutes > 0 ? "+" : data.sleep.delta_minutes < 0 ? "−" : ""}
                  {formatMinutes(Math.abs(data.sleep.delta_minutes))} vs. período
                  anterior
                </DeltaChip>
              )}
            </div>

            <SleepIllustration />
            <div className="mt-1 flex items-start justify-between gap-3 border-t border-white/15 pt-3">
              <div>
                <p className="text-[0.68rem] text-[#bfb7d2]">
                  Horário médio de dormir
                </p>
                <p className="mt-0.5 text-lg font-black leading-none text-white">
                  {formatClock(data.sleep.avg_sleep_time)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[0.68rem] text-[#bfb7d2]">
                  Horário médio de acordar
                </p>
                <p className="mt-0.5 text-lg font-black leading-none text-white">
                  {formatClock(data.sleep.avg_wake_time)}
                </p>
              </div>
            </div>
          </Panel>
        )}

        {/* Médias de humor, produtividade e qualidade do sono. */}
        {data.wellbeing && data.wellbeing.scores.length > 0 && (
          <Panel>
            <div className="space-y-3">
              {data.wellbeing.scores.map((score) => {
                const Icon = scoreIcon[score.key];
                return (
                  <div key={score.key} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-[#cf8aff]" />
                    <p className="min-w-0 flex-1 text-xs text-[#e4dff1]">
                      {score.label}
                    </p>
                    <ScoreMeter value={score.value} />
                    <p className="w-12 shrink-0 text-right text-xs font-black text-white">
                      {score.value.toFixed(1).replace(".", ",")}
                      <span className="font-semibold text-[#bfb7d2]"> / 5</span>
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-right text-[0.65rem] text-[#bfb7d2]">
              Com base em {data.wellbeing.logs_count}{" "}
              {data.wellbeing.logs_count === 1 ? "registro" : "registros"}.
            </p>
          </Panel>
        )}

        {/* Descoberta do Axon. */}
        {data.discovery && (
          <div className="rounded-[1.5rem] border border-purple-400/35 bg-purple-500/10 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#cf8aff]" />
              <p className="text-xs font-black text-[#cf8aff]">
                Uma descoberta do Axon
              </p>
            </div>
            <p className="text-sm leading-6 text-white">{data.discovery}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export function ReportFullView({
  periodType,
  data = REPORT_MOCK,
  narrative = REPORT_MOCK_NARRATIVE,
  onShare,
}: {
  periodType: "weekly" | "monthly";
  data?: ReportMockData;
  narrative?: string;
  /** Sem handler, o botão de compartilhar não aparece. */
  onShare?: () => void;
}) {
  const periodLabel =
    periodType === "weekly" ? "Relatório semanal" : "Relatório mensal";

  return (
    <div className="rounded-3xl bg-[#0b0913] p-4 text-white sm:p-6">
      <div className="grid gap-8 xl:grid-cols-3 xl:gap-5">
        <SummarySection
          data={data}
          narrative={narrative}
          periodLabel={periodLabel}
        />
        <ProgressSection data={data} />

        <div>
          <WellbeingSection data={data} />

          {onShare && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#9525f5] to-[#c15aff] px-4 text-sm font-black text-white transition active:scale-[0.98]"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar resumo
              </button>
              <p className="mt-1.5 text-center text-[0.65rem] text-[#bfb7d2]">
                Escolha quais dados compartilhar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
