import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Flame, Trophy, X } from "lucide-react";
import axonHappy from "../../assets/axon/axon-head-happy.png";
import axonSad from "../../assets/axon/axon-head-sad.png";

export type StreakDay = {
  label: string;
  completed: boolean;
  isToday?: boolean;
};

export type StreakModalProps = {
  isOpen: boolean;
  onClose: () => void;
  variant?: "default" | "warning";
  streakDays: number;
  longestStreak?: number;
  weekDays?: StreakDay[];
  /** Data YYYY-MM-DD do registro pendente; usada para destacar o dia em risco. */
  pendingDate?: string | null;
  onSaveStreak?: () => void;
  onForfeitStreak?: () => void;
};

const LABELS = ["S", "T", "Q", "Q", "S", "S", "D"];

function localISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeek(pendingDate?: string | null) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  // Se o dia pendente foi domingo e hoje já é segunda, mostra a semana
  // do registro pendente, em vez de destacar um dia incorreto.
  if (pendingDate && /^\d{4}-\d{2}-\d{2}$/.test(pendingDate)) {
    const parsed = new Date(`${pendingDate}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      first.setTime(parsed.getTime());
      first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    }
  }

  return LABELS.map((label, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return { label, iso: localISO(date), day: date.getDate() };
  });
}

export default function StreakModal({
  isOpen,
  onClose,
  variant = "default",
  streakDays,
  longestStreak,
  weekDays,
  pendingDate,
  onSaveStreak,
  onForfeitStreak,
}: StreakModalProps) {
  const reduceMotion = useReducedMotion();
  const warning = variant === "warning";
  const count = Math.max(0, Math.floor(Number.isFinite(streakDays) ? streakDays : 0));
  const record = longestStreak == null ? null : Math.max(count, Math.floor(longestStreak));
  const week = useMemo(() => getWeek(warning ? pendingDate : null), [warning, pendingDate]);
  const validWeekDays = weekDays?.length === 7 ? weekDays : null;

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;

  const heading = warning
    ? `Sua ofensiva de ${count} ${count === 1 ? "dia" : "dias"} está em risco`
    : count === 0
      ? "Sua jornada começa aqui"
      : `${count} ${count === 1 ? "dia" : "dias"} de ofensiva!`;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/65 px-4 py-5 backdrop-blur-[6px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="axon-streak-title"
            aria-describedby="axon-streak-description"
            className="relative my-auto w-full max-w-[400px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#1b1725] dark:text-white"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92, y: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.95, y: reduceMotion ? 0 : 12 }}
            transition={{ type: "spring", stiffness: 310, damping: 28, duration: reduceMotion ? 0 : undefined }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b to-transparent ${warning ? "from-rose-100/80 dark:from-rose-500/10" : "from-violet-100/80 dark:from-violet-500/10"}`} />
            <div className="relative z-10 flex justify-end px-5 pt-5">
              <button type="button" onClick={onClose} aria-label="Fechar modal de ofensiva" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-col items-center px-6 text-center">
              <div className="relative flex h-36 w-40 items-center justify-center">
                <motion.div aria-hidden className={`absolute h-24 w-24 rounded-full blur-3xl ${warning ? "bg-rose-400/20" : "bg-purple-500/20"}`} animate={reduceMotion ? {} : { scale: [1, 1.2, 1] }} transition={{ duration: 3, repeat: Infinity }} />
                <motion.img
                  src={warning ? axonSad : axonHappy}
                  alt={warning ? "AXON preocupado" : "AXON feliz"}
                  className="relative z-10 h-32 w-32 object-contain drop-shadow-[0_18px_30px_rgba(50,20,80,0.18)] dark:drop-shadow-[0_18px_30px_rgba(0,0,0,0.4)]"
                  initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.8 }}
                  animate={{ opacity: 1, scale: 1, y: reduceMotion ? 0 : [0, -5, 0] }}
                  transition={{ opacity: { duration: 0.25 }, scale: { duration: 0.35 }, y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
                />
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: reduceMotion ? 0 : 0.2 }} className={`absolute bottom-0 right-2 z-20 flex h-11 w-11 items-center justify-center rounded-2xl border ${warning ? "border-rose-200 bg-rose-100 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300" : "border-purple-200 bg-purple-100 text-[#6d28d9] dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-300"}`}>
                  {warning ? <AlertTriangle className="h-5 w-5" /> : <Flame className="h-6 w-6" />}
                </motion.div>
              </div>

              <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${warning ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300" : "border-purple-200 bg-purple-50 text-[#6d28d9] dark:border-purple-400/20 dark:bg-purple-500/10 dark:text-purple-300"}`}>
                {warning && <AlertTriangle className="h-3.5 w-3.5" />}
                {warning ? "Ofensiva em risco" : "Sua ofensiva"}
              </div>

              <h2 id="axon-streak-title" className="mt-3 max-w-[330px] text-[1.7rem] font-black leading-tight tracking-[-0.045em]">{heading}</h2>
              <p id="axon-streak-description" className="mt-2 max-w-[315px] text-sm leading-6 text-slate-500 dark:text-white/55">
                {warning
                  ? "Você ainda tem um registro pendente. Faça o registro para tentar preservar sua sequência, ou escolha desistir dela."
                  : count === 0
                    ? "Comece a construir sua consistência, um dia de cada vez."
                    : "Cada dia conta. Continue construindo seu ritmo com o AXON."}
              </p>
            </div>

            <div className="relative mt-6 px-6">
              <div className="grid grid-cols-7 gap-1.5">
                {week.map((item, index) => {
                  const day = validWeekDays?.[index];
                  const completed = day?.completed ?? false;
                  const atRisk = warning && !!pendingDate && item.iso === pendingDate;
                  const current = day?.isToday ?? item.iso === localISO(new Date());
                  return (
                    <motion.div key={item.iso} className="flex min-w-0 flex-col items-center gap-2" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.055 }}>
                      <span className="text-[0.65rem] font-semibold text-slate-400 dark:text-white/40">{day?.label ?? item.label}</span>
                      <div title={atRisk ? "Registro pendente" : completed ? "Registro concluído" : "Sem confirmação de registro"} aria-label={`${item.iso}: ${atRisk ? "registro pendente" : completed ? "concluído" : "não confirmado"}`} className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold ${atRisk ? "border-rose-500 bg-rose-500 text-white shadow-[0_0_0_3px_rgba(244,63,94,0.12)]" : completed ? "border-[#6d28d9] bg-[#6d28d9] text-white" : current ? "border-[#6d28d9] bg-purple-50 text-[#6d28d9] dark:bg-purple-500/10 dark:text-purple-300" : "border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/40"}`}>
                        {atRisk ? <AlertTriangle className="h-4 w-4" /> : completed ? <Check className="h-4 w-4" strokeWidth={3} /> : item.day}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {record !== null && <div className="mx-6 mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-[#f7f8fa] px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <span className="flex items-center gap-2 text-xs font-semibold"><Trophy className="h-4 w-4 text-[#6d28d9]" /> Seu recorde</span>
              <span className="font-black tabular-nums text-[#6d28d9] dark:text-purple-300">{record}d</span>
            </div>}

            <div className="relative flex flex-col gap-2 px-6 pb-6 pt-6">
              {warning ? (
                <>
                  <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={onSaveStreak} disabled={!onSaveStreak} className="min-h-12 w-full rounded-2xl bg-[#6d28d9] px-4 text-sm font-bold text-white transition hover:bg-[#5b21b6] disabled:opacity-50">Salvar minha ofensiva</motion.button>
                  <button type="button" onClick={onForfeitStreak} disabled={!onForfeitStreak} className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60 dark:hover:bg-rose-500/10 dark:hover:text-rose-300">Perder ofensiva</button>
                </>
              ) : (
                <motion.button whileTap={{ scale: 0.98 }} type="button" onClick={onClose} className="min-h-12 w-full rounded-2xl bg-[#6d28d9] px-4 text-sm font-bold text-white transition hover:bg-[#5b21b6]">Continuar minha jornada</motion.button>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
