import type { ElementType, ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { SECTION_LABELS, type Section } from "../../data/onboardingSteps";
import { splitHighlight } from "../../lib/onboardingState";

// ===========================================================================
// PEÇAS VISUAIS DO ONBOARDING
// ===========================================================================
// Mesmo visual do questionário antigo (card branco sobre o roxo #2d0850, pilha
// de cards atrás, opções em lista), agora reaproveitado por todos os tipos de
// tela. As classes vieram de lá sem mudança de valor.

// Transição do conteúdo da tela: a moldura fica parada, só o miolo desliza.
export const STEP_MOTION = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
  transition: { duration: 0.28, ease: "easeOut" },
} as const;

// Camadas que representam as próximas telas da sequência (pilha enfileirada).
// Ordem do array = ordem de pintura: do card mais distante para o mais próximo.
const UPCOMING_CARD_LAYERS = [
  "translate-x-[0.00rem] translate-y-[0.10rem] rotate-[5deg] scale-[1.02] border-white/42 bg-white/30 shadow-[0_16px_44px_rgba(45,8,80,0.16)] dark:border-white/10 dark:bg-[#11101a]/45 dark:shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
  "translate-x-[0.00rem] translate-y-[0.08rem] rotate-[3deg] scale-[1.01] border-white/62 bg-white/55 shadow-[0_18px_48px_rgba(45,8,80,0.18)] dark:border-white/14 dark:bg-[#11101a]/50 dark:shadow-[0_18px_48px_rgba(0,0,0,0.38)]",
];

export function CardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[350px]">
      {UPCOMING_CARD_LAYERS.map((layer, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 rounded-[2.2rem] border ${layer}`}
        />
      ))}

      <div className="relative z-10 overflow-hidden rounded-[2.2rem] border border-white/90 bg-white px-5 pb-5 pt-6 text-[#4c1d95] shadow-[0_28px_90px_rgba(0,0,0,0.24)] dark:border-white/10 dark:bg-[#11101a]/94 dark:text-white dark:shadow-[0_28px_90px_rgba(0,0,0,0.48)]">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progresso: seções + barra
// ---------------------------------------------------------------------------

const SECTIONS: Section[] = ["voce", "ritmo", "resultado"];

export function SectionProgress({ section, progress }: { section: Section; progress: number }) {
  const current = SECTIONS.indexOf(section);

  return (
    <div>
      <ol className="mb-2 flex items-center justify-between gap-2" aria-label="Etapas">
        {SECTIONS.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? "step" : undefined}
            className={`flex items-center gap-1 text-[0.62rem] font-black ${
              i <= current ? "text-[#4c1d95] dark:text-white" : "text-[#6d28d9]/40 dark:text-white/34"
            }`}
          >
            {i < current && <Check className="h-3 w-3" aria-hidden="true" />}
            {SECTION_LABELS[s]}
          </li>
        ))}
      </ol>

      <div className="h-1.5 overflow-hidden rounded-full bg-[#7b2cbf]/14 dark:bg-white/12">
        <motion.div
          className="h-full rounded-full bg-[#7b2cbf] shadow-[0_0_18px_rgba(123,44,191,0.28)] dark:bg-[#a855f7]"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho da pergunta
// ---------------------------------------------------------------------------

export function StepHeading({
  icon: Icon,
  category,
  title,
  hint,
}: {
  icon?: ElementType;
  category?: string;
  title: string;
  hint?: string;
}) {
  return (
    <>
      {(Icon || category) && (
        <div className="mt-5 flex items-center justify-between gap-3">
          {Icon ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#7b2cbf]/20 bg-[#7b2cbf]/10 text-[#7b2cbf] dark:border-white/10 dark:bg-[#191722] dark:text-white/78">
              <Icon className="h-4 w-4" />
            </div>
          ) : (
            <span />
          )}
          {category && (
            <span className="rounded-xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3 py-1 text-[0.62rem] font-semibold text-[#6d28d9]/72 dark:border-white/10 dark:bg-[#191722] dark:text-white/62">
              {category}
            </span>
          )}
        </div>
      )}

      <h1 className="mx-auto mt-5 max-w-[17.5rem] text-center text-[1.25rem] font-black leading-[1.02] tracking-[-0.04em] text-[#4c1d95] dark:text-white">
        <HighlightTitle text={title} />
      </h1>

      {hint && (
        <p className="mt-2 text-center text-[0.68rem] font-semibold text-[#6d28d9]/66 dark:text-white/56">
          {hint}
        </p>
      )}
    </>
  );
}

// "*palavra*" no texto aparece em roxo (ex.: "seu *objetivo*").
export function HighlightTitle({ text }: { text: string }) {
  return (
    <>
      {splitHighlight(text).map(([part, highlight], i) =>
        highlight ? (
          <span key={i} className="text-[#7b2cbf] dark:text-[#c084fc]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function WhyNote({ text }: { text: string }) {
  return (
    <p className="mt-4 rounded-xl border border-[#7b2cbf]/16 bg-[#fbf8ff] px-3 py-2 text-[0.64rem] font-medium leading-4 text-[#6d28d9]/76 dark:border-white/10 dark:bg-[#191722] dark:text-white/60">
      <span className="font-black">Por que perguntamos: </span>
      {text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

export function OptionButton({
  label,
  marker,
  rank,
  selected,
  multi,
  dimmed = false,
  onSelect,
}: {
  label: string;
  marker: string;
  // Posição na lista ordenada (1, 2, 3). Mostrada no lugar do check.
  rank?: number;
  selected: boolean;
  multi: boolean;
  // Lista ordenada cheia: as não escolhidas ficam apagadas.
  dimmed?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-9 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] ${
        selected
          ? "border-[#7b2cbf]/48 bg-[#7b2cbf]/10 shadow-[0_12px_28px_rgba(123,44,191,0.1)] dark:border-[#a855f7]/55 dark:bg-[#a855f7]/14"
          : "border-[#7b2cbf]/18 bg-[#fbf8ff] hover:border-[#7b2cbf]/30 hover:bg-white dark:border-white/10 dark:bg-[#191722] dark:hover:border-white/18 dark:hover:bg-[#211c2d]"
      } ${dimmed ? "opacity-45" : ""}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[0.62rem] font-black transition ${
          multi ? "rounded-full" : "rounded-lg"
        } ${
          selected
            ? "border-[#7b2cbf] bg-[#7b2cbf] text-white dark:border-[#a855f7] dark:bg-[#a855f7]"
            : "border-[#7b2cbf]/20 bg-white text-[#6d28d9]/72 dark:border-white/12 dark:bg-[#11101a] dark:text-white/54"
        }`}
      >
        {rank ? rank : selected ? <Check className="h-3.5 w-3.5" /> : marker}
      </span>

      <span className="text-[0.76rem] font-medium leading-4 text-[#4c1d95] dark:text-white/82">
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Campo de horário
// ---------------------------------------------------------------------------

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.66rem] font-black text-[#5b21b6] dark:text-white/78">
        {label}
      </span>
      {/* type="time" abre o seletor nativo no celular e devolve sempre
          "HH:MM" em 24h, o formato que o backend valida. */}
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-2xl border border-[#7b2cbf]/20 bg-[#fbf8ff] px-3.5 text-[0.9rem] font-black text-[#4c1d95] outline-none transition focus:border-[#7b2cbf]/45 focus:bg-white dark:border-white/10 dark:bg-[#191722] dark:text-white dark:[color-scheme:dark] dark:focus:border-[#a855f7]/45 dark:focus:bg-[#211c2d]"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Curva de energia (tela 22)
// ---------------------------------------------------------------------------

// Área preenchida + linha suave. `id` dá um gradiente próprio a cada curva
// (ids de <linearGradient> repetidos na página se misturariam).
export function MiniCurve({ id, points, active }: { id: string; points: number[]; active: boolean }) {
  const w = 140;
  const h = 52;
  const pad = 4;
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, h - pad - p * (h - pad * 2)] as const);
  // Curva suave (Catmull-Rom → Bézier) para não parecer um gráfico de linha.
  let d = `M ${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[Math.max(0, i - 1)];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[Math.min(xy.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${d} L ${xy[xy.length - 1][0].toFixed(1)} ${h} L ${xy[0][0].toFixed(1)} ${h} Z`;
  const gid = `curva-${id}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity={active ? 0.45 : 0.22} />
          <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={d}
        fill="none"
        strokeWidth={2.4}
        strokeLinecap="round"
        className={active ? "stroke-[#7b2cbf] dark:stroke-[#d8b4fe]" : "stroke-[#7b2cbf]/55 dark:stroke-white/45"}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Rodapé
// ---------------------------------------------------------------------------

export function StepFooter({
  canBack,
  onBack,
  onNext,
  nextDisabled = false,
  loading = false,
  nextLabel,
  secondary,
}: {
  canBack: boolean;
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  loading?: boolean;
  // Com texto o botão vira largo; sem texto, a seta.
  nextLabel?: string;
  secondary?: ReactNode;
}) {
  return (
    <footer className="mt-6">
      <div className="flex items-center justify-between gap-3">
        {canBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            aria-label="Voltar"
            className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7b2cbf]/24 bg-[#fbf8ff] text-[#6d28d9] shadow-[0_12px_28px_rgba(45,8,80,0.08)] transition hover:-translate-y-0.5 hover:border-[#7b2cbf]/38 hover:bg-white active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-[#191722] dark:text-white/70 dark:hover:border-white/18 dark:hover:bg-[#211c2d] dark:hover:text-white"
          >
            <ChevronLeft className="h-5 w-5 transition group-hover:-translate-x-0.5" />
          </button>
        ) : nextLabel ? null : (
          // Só a seta de avançar precisa do espaço para ficar à direita; o
          // botão com texto ocupa a linha toda, e o espaço o tiraria do centro.
          <div className="h-11 w-11" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || loading}
          aria-label={nextLabel ?? "Avançar"}
          className={`group flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[#7b2cbf] text-white shadow-[0_18px_42px_rgba(123,44,191,0.22)] transition hover:-translate-y-0.5 hover:bg-[#8d31dd] active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-[#7b2cbf]/28 disabled:text-white/48 disabled:shadow-none dark:bg-[#a855f7] dark:hover:bg-[#b968ff] dark:disabled:bg-white/10 ${
            nextLabel ? "min-w-[9.6rem] flex-1 px-4 text-xs font-semibold" : "w-11"
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : nextLabel ? (
            nextLabel
          ) : (
            <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
          )}
        </button>
      </div>

      {secondary && <div className="mt-3 text-center">{secondary}</div>}
    </footer>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-center text-xs text-red-600 dark:border-red-300/20 dark:bg-red-500/14 dark:text-red-200"
    >
      {message}
    </p>
  );
}
