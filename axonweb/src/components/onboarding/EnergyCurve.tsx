import type { EnergySegment, FixedCommitment } from "../../lib/api";
import { daysText } from "../../lib/fixedCommitments";

// ===========================================================================
// CURVA DE ENERGIA (resultado do onboarding)
// ===========================================================================
// Energia de 0h a 24h do cronotipo (vem do backend: chronotype.ENERGY_LEVELS),
// com o sono da pessoa e os compromissos fixos dela por cima. SVG à mão em
// vez de Recharts: são 24 pontos e duas faixas, e assim o desenho segue o
// tema sem configurar o gráfico.

// Cores por nível de bloco — as mesmas usadas na lista de trechos.
export const LEVEL_STYLE: Record<EnergySegment["level"], { color: string }> = {
  pico: { color: "#7b2cbf" },
  foco_profundo: { color: "#a855f7" },
  foco_moderado: { color: "#c084fc" },
  foco_leve: { color: "#ddd6fe" },
  recuperacao: { color: "#94a3b8" },
  sono: { color: "#475569" },
};

const W = 320;
const H = 150;
const TOP = 14;
const BOTTOM = 24; // espaço para os rótulos de hora
// Compromissos: faixa âmbar por cima da curva, com o nome dentro.
const COMMIT_FILL = "fill-amber-400/[0.18] dark:fill-amber-300/[0.14]";
const COMMIT_EDGE = "stroke-amber-500/60 dark:stroke-amber-300/50";
const CHAR_W = 4.6; // largura média de um caractere a 8px, para cortar o nome

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const x = (minutes: number) => (minutes / (24 * 60)) * W;

/** Faixas [início, fim] em minutos; um intervalo que passa da meia-noite vira dois. */
function ranges(start: string, end: string): [number, number][] {
  const a = toMin(start);
  const b = toMin(end);
  return a < b ? [[a, b]] : [[a, 24 * 60], [0, b]];
}

export default function EnergyCurve({
  energia,
  segmentos,
  sleep,
  commitments,
}: {
  energia: number[];
  segmentos: EnergySegment[];
  sleep: { start: string; end: string } | null;
  commitments: FixedCommitment[];
}) {
  if (energia.length !== 24) return null;

  const plotH = H - TOP - BOTTOM;
  // Um ponto por hora, no meio dela; repete as pontas para a curva ir de 0h a 24h.
  const pts: [number, number][] = [
    [0, energia[0]],
    ...energia.map((v, h) => [h * 60 + 30, v] as [number, number]),
    [24 * 60, energia[23]],
  ].map(([m, v]) => [x(m), TOP + plotH - (v / 100) * plotH]);

  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${d} L ${W} ${TOP + plotH} L 0 ${TOP + plotH} Z`;

  const peakHour = energia.indexOf(Math.max(...energia));
  const peakX = x(peakHour * 60 + 30);
  const peakY = TOP + plotH - (energia[peakHour] / 100) * plotH;
  const bandY = TOP + plotH + 2;

  // Um rótulo por faixa de compromisso. Dois compromissos no mesmo horário
  // (ex.: faculdade seg a qua, trabalho qui e sex) empilham o nome uma linha
  // acima, em vez de escrever um por cima do outro.
  const placed: { a: number; b: number; row: number }[] = [];
  const commitLabels = commitments.flatMap((c, i) =>
    ranges(c.start, c.end).map(([a, b]) => {
      const row = placed.filter((p) => p.a < b && a < p.b).reduce((m, p) => Math.max(m, p.row + 1), 0);
      placed.push({ a, b, row });
      const width = x(b) - x(a);
      const maxChars = Math.floor((width - 6) / CHAR_W);
      const name = c.activity.length > maxChars ? `${c.activity.slice(0, Math.max(0, maxChars - 1))}…` : c.activity;
      return { key: `c${i}-${a}`, a, b, row, name: maxChars >= 3 ? name : "" };
    })
  );

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Curva de energia ao longo do dia, com pico por volta das ${peakHour}h`}>
        <defs>
          <linearGradient id="curva-energia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Linhas de 6 em 6 horas */}
        {[6, 12, 18].map((h) => (
          <line key={h} x1={x(h * 60)} x2={x(h * 60)} y1={TOP} y2={TOP + plotH} className="stroke-[#7b2cbf]/12 dark:stroke-white/10" strokeDasharray="3 4" />
        ))}

        {/* Sono da pessoa (dia útil), atrás da curva */}
        {sleep &&
          ranges(sleep.start, sleep.end).map(([a, b]) => (
            <rect key={`s${a}`} x={x(a)} y={TOP} width={x(b) - x(a)} height={plotH} className="fill-[#475569]/12 dark:fill-white/[0.06]" />
          ))}

        {/* Compromissos fixos: a coluna inteira, para ver qual parte da curva eles ocupam */}
        {commitLabels.map((c) => (
          <rect key={c.key} x={x(c.a)} y={TOP} width={x(c.b) - x(c.a)} height={plotH} className={COMMIT_FILL} />
        ))}

        <path d={area} fill="url(#curva-energia)" />
        <path d={d} fill="none" strokeWidth={2.6} strokeLinecap="round" className="stroke-[#7b2cbf] dark:stroke-[#d8b4fe]" />

        {/* Pico */}
        <circle cx={peakX} cy={peakY} r={4} className="fill-[#7b2cbf] dark:fill-[#d8b4fe]" />
        <text x={Math.min(Math.max(peakX, 28), W - 28)} y={peakY - 7} textAnchor="middle" className="fill-[#4c1d95] text-[9px] font-black dark:fill-white">
          Seu pico
        </text>

        {/* Faixa dos trechos do dia (cor por nível) */}
        {segmentos.flatMap((s) =>
          ranges(s.start, s.end).map(([a, b]) => (
            <rect key={`g${s.start}-${a}`} x={x(a)} y={bandY} width={x(b) - x(a)} height={4} fill={LEVEL_STYLE[s.level].color} />
          ))
        )}

        {/* Bordas e nomes dos compromissos, por cima da curva */}
        {commitLabels.map((c) => (
          <g key={`${c.key}-l`}>
            <line x1={x(c.a)} x2={x(c.a)} y1={TOP} y2={TOP + plotH} strokeWidth={1} className={COMMIT_EDGE} />
            <line x1={x(c.b)} x2={x(c.b)} y1={TOP} y2={TOP + plotH} strokeWidth={1} className={COMMIT_EDGE} />
            {c.name && (
              <text x={x(c.a) + 3} y={TOP + plotH - 4 - c.row * 10} className="fill-amber-700 text-[8px] font-black dark:fill-amber-200">
                {c.name}
              </text>
            )}
          </g>
        ))}

        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={Math.min(Math.max(x(h * 60), 8), W - 8)} y={H - 3} textAnchor="middle" className="fill-[#6d28d9]/60 text-[9px] font-semibold dark:fill-white/45">
            {h}h
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[0.6rem] font-semibold text-[#6d28d9]/72 dark:text-white/56">
        {sleep && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#475569]/30 dark:bg-white/20" aria-hidden="true" /> Seu sono
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_STYLE.pico.color }} aria-hidden="true" /> Pico
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_STYLE.foco_moderado.color }} aria-hidden="true" /> Foco
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_STYLE.sono.color }} aria-hidden="true" /> Descanso
        </span>
      </figcaption>

      {commitments.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {commitments.map((c, i) => (
            <li
              key={`${c.activity}-${i}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-400/[0.08] px-2.5 py-1.5 text-[0.64rem] font-semibold text-[#4c1d95] dark:border-amber-300/20 dark:bg-amber-300/[0.06] dark:text-white/80"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-amber-400/80" aria-hidden="true" />
                <span className="truncate font-black">{c.activity}</span>
              </span>
              <span className="shrink-0 text-[#6d28d9]/72 dark:text-white/56">
                {daysText(c.days)} · {c.start}–{c.end}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
