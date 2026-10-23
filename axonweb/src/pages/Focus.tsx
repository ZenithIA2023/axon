import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Clock3, Pause, Play, RotateCcw, Target, X, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import * as api from "../lib/api";
import type { Task, TaskStatus } from "../lib/api";
import axonHead from "../assets/axon/axon-head-happy.png";

type FocusStatus = "ready" | "running" | "paused";
const PRESETS = [25, 45, 90];
const IMMERSIVE_DELAY_MS = 4200;

function localISO(date: Date) { return date.toLocaleDateString("sv-SE"); }
function minutesOf(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function durationOf(task: Task | null) {
  if (!task) return null;
  const start = minutesOf(task.start_time), end = minutesOf(task.end_time);
  return start !== null && end !== null && end > start ? end - start : null;
}
function taskForToday(task: Task, today: string) {
  if (task.status === "done") return false;
  const date = (task.scheduled_date ?? "").slice(0, 10);
  return date === today;
}
function formatSeconds(value: number) {
  const minutes = Math.floor(Math.max(value, 0) / 60);
  const seconds = Math.max(value, 0) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Focus() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskError, setTaskError] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [freeFocus, setFreeFocus] = useState(false);
  const [lockedTaskId, setLockedTaskId] = useState<string | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(45);
  const [secondsLeft, setSecondsLeft] = useState(45 * 60);
  const [status, setStatus] = useState<FocusStatus>("ready");
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef(45 * 60);
  const audioRef = useRef<AudioContext | null>(null);
  const lastTaskRef = useRef<string | null>(null);
  const immersiveTimerRef = useRef<number | null>(null);
  const [immersive, setImmersive] = useState(false);

  const today = localISO(now);
  const todayTasks = useMemo(() => tasks.filter(t => taskForToday(t, today)).sort((a,b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99")), [tasks, today]);
  // Só é "do momento" quando o relógio está dentro da janela agendada.
  const momentTask = useMemo(() => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return todayTasks.find(t => {
      const start = minutesOf(t.start_time), end = minutesOf(t.end_time);
      return start !== null && start <= currentMinutes &&
        (end === null ? currentMinutes < start + 30 : (end <= start ? currentMinutes < end + 1440 : currentMinutes < end));
    }) ?? null;
  }, [todayTasks, now]);
  const suggestedTask = momentTask ?? todayTasks[0] ?? null;
  const currentTask = freeFocus ? null : (tasks.find(t => t.id === (lockedTaskId ?? selectedTaskId)) ?? (selectedTaskId === null ? suggestedTask : null));
  const fixedDuration = durationOf(currentTask);
  const durationLocked = fixedDuration !== null;
  const isMomentTask = Boolean(momentTask && currentTask?.id === momentTask.id);
  const progress = selectedMinutes > 0 ? Math.min(100, Math.max(0, 100 - secondsLeft / (selectedMinutes * 60) * 100)) : 0;
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const canChoose = !isRunning;

  useEffect(() => {
    api.getTasks().then(setTasks).catch(() => setTaskError(true));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (isRunning || isPaused) return;
    const id = currentTask?.id ?? null;
    if (id === lastTaskRef.current) return;
    lastTaskRef.current = id;
    const duration = durationOf(currentTask ?? null);
    const normalized = duration !== null ? Math.max(1, duration) : 45;
    setSelectedMinutes(normalized);
    setSecondsLeft(normalized * 60);
    remainingRef.current = normalized * 60;
  }, [currentTask?.id, isRunning, isPaused]);
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      const remaining = deadlineRef.current ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)) : remainingRef.current;
      remainingRef.current = remaining;
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setStatus("ready");
        deadlineRef.current = null;
        setFinished(true);
        try {
          const ctx = audioRef.current;
          if (ctx) {
            void ctx.resume();
            [659.25, 783.99, 987.77].forEach((frequency, i) => {
              const osc = ctx.createOscillator(), gain = ctx.createGain();
              const at = ctx.currentTime + 0.05 + i * 0.16;
              osc.frequency.value = frequency;
              gain.gain.setValueAtTime(0.0001, at);
              gain.gain.exponentialRampToValueAtTime(0.10, at + 0.025);
              gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(at); osc.stop(at + 0.36);
            });
          }
          navigator.vibrate?.([90, 45, 90]);
        } catch { /* áudio é opcional */ }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [isRunning]);
  // O modo imersivo só entra depois de alguns segundos de foco ativo.
  // Toque/clique reexibe os controles e reinicia a contagem de inatividade.
  useEffect(() => {
    if (immersiveTimerRef.current !== null) window.clearTimeout(immersiveTimerRef.current);
    immersiveTimerRef.current = null;
    if (status === "running" && !taskPickerOpen && !completeOpen) {
      immersiveTimerRef.current = window.setTimeout(() => setImmersive(true), IMMERSIVE_DELAY_MS);
    } else {
      setImmersive(false);
    }
    return () => {
      if (immersiveTimerRef.current !== null) window.clearTimeout(immersiveTimerRef.current);
      immersiveTimerRef.current = null;
    };
  }, [status, taskPickerOpen, completeOpen]);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  function revealControls() {
    if (!isRunning || taskPickerOpen || completeOpen) return;
    setImmersive(false);
    if (immersiveTimerRef.current !== null) window.clearTimeout(immersiveTimerRef.current);
    immersiveTimerRef.current = window.setTimeout(() => setImmersive(true), IMMERSIVE_DELAY_MS);
  }


  function selectTask(id: string) {
    if (isRunning) return;
    setFreeFocus(false); setSelectedTaskId(id); setLockedTaskId(null); setTaskPickerOpen(false); setFinished(false);
    const task = tasks.find(t => t.id === id) ?? null;
    const duration = durationOf(task);
    // Ao trocar de tarefa, o timer recebe imediatamente sua duração prevista.
    const minutes = duration !== null ? Math.max(1, duration) : 45;
    setSelectedMinutes(minutes); setSecondsLeft(minutes * 60); remainingRef.current = minutes * 60;
    setStatus("ready");
  }
  function selectFreeFocus() {
    if (isRunning) return;
    setFreeFocus(true); setSelectedTaskId(null); setLockedTaskId(null);
    setTaskPickerOpen(false); setFinished(false); setStatus("ready");
    setSelectedMinutes(45); setSecondsLeft(45 * 60); remainingRef.current = 45 * 60;
  }
  function changeDuration(value: number) {
    if (isRunning || durationLocked) return;
    const minutes = Math.min(180, Math.max(1, value));
    setSelectedMinutes(minutes); setSecondsLeft(minutes * 60); remainingRef.current = minutes * 60;
    setStatus("ready"); setFinished(false);
  }
  function startPause() {
    if (isRunning) {
      remainingRef.current = deadlineRef.current ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)) : secondsLeft;
      setSecondsLeft(remainingRef.current); deadlineRef.current = null; setStatus("paused"); setImmersive(false); return;
    }
    if (!currentTask && !freeFocus) { setTaskPickerOpen(true); return; }
    if (secondsLeft <= 0) { changeDuration(selectedMinutes); return; }
    if (!audioRef.current && typeof window !== "undefined") {
      try { audioRef.current = new AudioContext(); void audioRef.current.resume(); } catch { /* sem áudio */ }
    }
    setLockedTaskId(currentTask?.id ?? null); setFinished(false);
    deadlineRef.current = Date.now() + secondsLeft * 1000;
    setStatus("running");
    setImmersive(false);
  }
  function reset() {
    deadlineRef.current = null; remainingRef.current = selectedMinutes * 60;
    setSecondsLeft(selectedMinutes * 60); setStatus("ready"); setLockedTaskId(null); setFinished(false); setImmersive(false);
  }
  async function completeTask() {
    if (!currentTask || saving) return;
    setSaving(true); setError("");
    try {
      await api.updateTask(currentTask.id, { status: "done" as TaskStatus, progress: 100 });
      setTasks(prev => prev.map(t => t.id === currentTask.id ? { ...t, status: "done" as TaskStatus, progress: 100 } : t));
      setSelectedTaskId(null); setLockedTaskId(null); setCompleteOpen(false); reset();
      navigator.vibrate?.([35,18,35]);
    } catch { setError("Não foi possível concluir. Tente novamente."); }
    finally { setSaving(false); }
  }

  return (
    <main
      className={`relative min-h-[100dvh] text-slate-900 transition-colors duration-700 dark:text-white ${immersive ? "flex min-h-[100dvh] items-center justify-center bg-[#270d35] text-white pb-0" : "bg-[#f7f8fa] dark:bg-[#080711] pb-28 lg:pb-12"}`}
      onPointerDown={revealControls}
      onKeyDown={revealControls}
    >
      {immersive && <style>{`[data-bottom-nav] { visibility: hidden !important; pointer-events: none !important; }`}</style>}
      {/* Fundo abstrato 100% CSS: não depende de nenhuma imagem externa. */}
      <style>{`
        @keyframes axon-focus-aurora-one {
          0%, 100% { transform: translate3d(-3%, 2%, 0) rotate(-13deg) scale(1.04); }
          50% { transform: translate3d(5%, -5%, 0) rotate(-6deg) scale(1.13); }
        }
        @keyframes axon-focus-aurora-two {
          0%, 100% { transform: translate3d(4%, -3%, 0) rotate(17deg) scale(1.1); }
          50% { transform: translate3d(-5%, 4%, 0) rotate(7deg) scale(1.02); }
        }
        @keyframes axon-focus-pattern-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1.05); }
          50% { transform: translate3d(-1.5%, 1.5%, 0) scale(1.08); }
        }
        .axon-focus-aurora-one { animation: axon-focus-aurora-one 35s ease-in-out infinite; }
        .axon-focus-aurora-two { animation: axon-focus-aurora-two 43s ease-in-out infinite; }
        .axon-focus-pattern { animation: axon-focus-pattern-drift 50s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .axon-focus-aurora-one, .axon-focus-aurora-two, .axon-focus-pattern {
            animation: none !important;
          }
        }
      `}</style>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-[1300ms] ease-in-out ${immersive ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: "#16091f" }}
      >
        {/* Ondas de cor, amplas e desfocadas, em tons de ameixa e violeta. */}
        <div
          className="axon-focus-aurora-one absolute -inset-[35%] opacity-90 will-change-transform"
          style={{
            background: "radial-gradient(ellipse 47% 34% at 25% 35%, rgba(124,37,147,0.65), transparent 78%), radial-gradient(ellipse 44% 30% at 79% 72%, rgba(103,28,127,0.58), transparent 82%)",
            filter: "blur(55px)",
          }}
        />
        <div
          className="axon-focus-aurora-two absolute -inset-[32%] opacity-85 will-change-transform"
          style={{
            background: "radial-gradient(ellipse 35% 55% at 69% 23%, rgba(70,19,103,0.65), transparent 80%), radial-gradient(ellipse 43% 40% at 29% 81%, rgba(150,48,139,0.36), transparent 80%)",
            filter: "blur(62px)",
          }}
        />
        {/* Padrão de linhas curvas concêntricas quase imperceptíveis. */}
        <div
          className="axon-focus-pattern absolute -inset-[12%] opacity-40 will-change-transform"
          style={{
            backgroundImage: "repeating-radial-gradient(ellipse 65% 80% at 76% 42%, transparent 0px, transparent 47px, rgba(225,158,241,0.12) 49px, transparent 51px)",
            maskImage: "linear-gradient(110deg, transparent 3%, black 46%, black 85%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(110deg, transparent 3%, black 46%, black 85%, transparent 100%)",
          }}
        />
        <div className="absolute inset-0 bg-[#0d0416]/25" />
      </div>
      <div className={`relative mx-auto w-full max-w-5xl px-4 sm:px-7 ${immersive ? "py-8" : "pt-7 lg:pt-10"}`}>
        {!immersive && <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#6d28d9] dark:text-violet-300">AXON · Modo foco</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.06em] sm:text-4xl">Hora de focar.</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Uma tarefa de cada vez, no seu ritmo.</p>
          </div>
          <img src={axonHead} alt="AXON" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
        </header>}

        <div className={immersive ? "mx-auto w-full max-w-xl" : "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-7"}>
          <section className={`min-w-0 p-5 sm:p-8 ${immersive ? "text-center" : "rounded-[2rem] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.035)] dark:border-white/10 dark:bg-[#181522]"}`} aria-label="Cronômetro de foco">
            {!immersive && <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse bg-emerald-500" : isPaused ? "bg-amber-500" : "bg-[#6d28d9]"}`} />{isRunning ? "Sessão em andamento" : isPaused ? "Sessão pausada" : finished ? "Tempo concluído" : "Pronto para começar"}</span>
              <span className="text-xs font-semibold text-slate-400">{selectedMinutes} min planejados</span>
            </div>}
            {immersive && <div className="mb-5 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/70">Em foco agora</p><p className="mt-2 break-words text-lg font-extrabold">{currentTask?.title ?? "Foco livre"}</p></div>}
            <div className="relative mx-auto my-7 flex h-[260px] w-[260px] items-center justify-center sm:my-10 sm:h-[310px] sm:w-[310px]">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 300 300" aria-hidden="true">
                <circle cx="150" cy="150" r="135" fill="none" stroke="currentColor" strokeWidth="7" className={immersive ? "text-white/25" : "text-slate-100 dark:text-white/10"} />
                <motion.circle cx="150" cy="150" r="135" fill="none" stroke={immersive ? "#ffffff" : "#6d28d9"} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 135} animate={{ strokeDashoffset: (2 * Math.PI * 135) * (1 - progress / 100) }} transition={{ duration: 0.35, ease: "linear" }} />
              </svg>
              <div className="text-center">
                <div className="text-[4.1rem] font-black leading-none tracking-[-0.075em] tabular-nums sm:text-[4.9rem]">{formatSeconds(secondsLeft)}</div>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{isRunning ? "Mantenha o ritmo" : isPaused ? "Respire e retome" : finished ? "Muito bem!" : "Seu tempo de foco"}</p>
              </div>
            </div>
            <div className="mx-auto flex max-w-[360px] items-center gap-2.5">
              <button type="button" onClick={startPause} disabled={!currentTask && !freeFocus && !isRunning} className={`flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${immersive ? "bg-violet-100 text-[#291544] hover:bg-white" : "bg-[#6d28d9] text-white hover:bg-[#5b21b6]"}`}>
                {isRunning ? <><Pause className="h-5 w-5" /> Pausar</> : isPaused ? <><Play className="h-5 w-5 fill-current" /> Retomar</> : <><Play className="h-5 w-5 fill-current" /> Iniciar foco</>}
              </button>
              {!immersive && <button type="button" onClick={reset} title="Reiniciar cronômetro" aria-label="Reiniciar cronômetro" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><RotateCcw className="h-5 w-5" /></button>}
            </div>
            {!immersive && !currentTask && !freeFocus && <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Selecione uma tarefa abaixo para liberar o cronômetro.</p>}
            {currentTask && <button type="button" onClick={() => setCompleteOpen(true)} className={`mx-auto mt-4 flex items-center gap-2 text-xs font-semibold hover:underline ${immersive ? "text-violet-200" : "text-[#6d28d9] dark:text-violet-300"}`}><CheckCircle2 className="h-4 w-4" /> Concluir: <span className="max-w-[240px] truncate">{currentTask.title}</span></button>}
          </section>

          {!immersive && <aside className="space-y-5">
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.035)] dark:border-white/10 dark:bg-[#181522]">
              <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-[#6d28d9]" /><h2 className="text-sm font-extrabold">1. O que vamos fazer?</h2></div>
              <button type="button" disabled={!canChoose} onClick={() => setTaskPickerOpen(true)} className="flex min-h-[74px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-[#f7f8fa] px-4 text-left transition hover:border-violet-300 active:scale-[0.99] disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-500/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-[#6d28d9] dark:bg-violet-500/15 dark:text-violet-300"><Target className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{currentTask?.title ?? (freeFocus ? "Foco livre" : "Escolher uma tarefa")}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{currentTask ? (isMomentTask ? "Em andamento neste horário · Toque para trocar" : "Toque para alterar a tarefa") : freeFocus ? "Sessão sem tarefa vinculada" : "Selecione do planejamento de hoje"}</span></span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {isMomentTask && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#6d28d9] dark:text-violet-300"><Sparkles className="h-3.5 w-3.5" /> Sugerida para agora</p>}
              {taskError && <p className="mt-2 text-xs text-rose-600">Não foi possível carregar as tarefas.</p>}
              {!taskError && todayTasks.length === 0 && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Nenhuma tarefa pendente no planejamento de hoje.</p>}
            </section>
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.035)] dark:border-white/10 dark:bg-[#181522]">
              <div className="mb-1 flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#6d28d9]" /><h2 className="text-sm font-extrabold">2. Por quanto tempo?</h2></div>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{durationLocked ? `Duração definida no planejamento: ${fixedDuration} min. Para alterar, edite a tarefa no Planejamento.` : "Escolha um tempo confortável para você."}</p>
              <div className="grid grid-cols-3 gap-2">{PRESETS.map(m => <button key={m} type="button" disabled={isRunning || durationLocked} onClick={() => changeDuration(m)} className={`min-h-11 rounded-xl border text-sm font-bold transition active:scale-95 disabled:opacity-50 ${selectedMinutes === m ? "border-[#6d28d9] bg-[#6d28d9] text-white" : "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"}`}>{m} min</button>)}</div>
              <div className="mt-4 flex items-center gap-3"><input aria-label="Duração personalizada" type="range" min="5" max="180" step="5" value={selectedMinutes} disabled={isRunning || durationLocked} onChange={e => changeDuration(Number(e.target.value))} className="w-full accent-[#6d28d9] disabled:opacity-50" /><span className="w-14 shrink-0 text-right text-sm font-extrabold tabular-nums">{selectedMinutes}min</span></div>
            </section>
            <div className="flex items-start gap-2 px-1 text-xs leading-5 text-slate-500 dark:text-slate-400"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#6d28d9]" /><p>{momentTask ? `O AXON selecionou automaticamente “${momentTask.title}” porque está no horário agendado.` : freeFocus ? "Foco livre: use o cronômetro sem vincular a sessão a uma tarefa." : "Escolha uma tarefa para iniciar seu momento de foco."}</p></div>
          </aside>}
        </div>
      </div>

      <AnimatePresence>
        {taskPickerOpen && <motion.div className="fixed inset-0 z-[180] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e => { if(e.target===e.currentTarget)setTaskPickerOpen(false); }}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="focus-select-title" className="w-full max-w-[460px] rounded-t-[2rem] border border-slate-200 bg-white p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl dark:border-white/10 dark:bg-[#181522] sm:rounded-[2rem]" initial={{y:30,opacity:0}} animate={{y:0,opacity:1}} exit={{y:20,opacity:0}}>
            <div className="flex items-start justify-between gap-4"><div><h2 id="focus-select-title" className="text-xl font-black">Escolha sua tarefa</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tarefas pendentes no planejamento de hoje</p></div><button aria-label="Fechar" onClick={() => setTaskPickerOpen(false)} className="rounded-xl p-2 text-slate-500 dark:text-slate-300"><X /></button></div>
            <div className="mt-5 max-h-[55dvh] space-y-2 overflow-y-auto"><button type="button" onClick={selectFreeFocus} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-violet-400 ${freeFocus ? "border-violet-400 bg-violet-50 dark:bg-violet-500/10" : "border-slate-200 dark:border-white/10"}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-[#6d28d9] dark:bg-violet-500/15"><Clock3 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Sem tarefa · Foco livre</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Use o cronômetro sem selecionar uma tarefa.</span></span>{freeFocus && <Check className="h-5 w-5 text-[#6d28d9]" />}</button>{todayTasks.length ? todayTasks.map(task => <button key={task.id} type="button" onClick={() => selectTask(task.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-violet-400 ${momentTask?.id === task.id ? "border-violet-400 bg-violet-50 dark:border-violet-400/50 dark:bg-violet-500/10" : "border-slate-200 dark:border-white/10"}`}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{task.title}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{task.start_time ? `Agendada às ${task.start_time}` : "Sem horário definido"}{durationOf(task) ? ` · ${durationOf(task)} min` : ""}</span>{momentTask?.id === task.id && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#6d28d9] dark:text-violet-300"><Sparkles className="h-3 w-3" /> Tarefa do momento</span>}</span>{currentTask?.id === task.id ? <Check className="h-5 w-5 text-[#6d28d9]" /> : <Target className="h-4 w-4 text-slate-400" />}</button>) : <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-white/5">Nenhuma tarefa pendente para hoje.</p>}</div>
          </motion.section>
        </motion.div>}
        {completeOpen && <motion.div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="focus-complete-title" className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#181522]" initial={{scale:0.95,y:16}} animate={{scale:1,y:0}} exit={{scale:0.96,y:10}}>
            <div className="flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-[#6d28d9] dark:bg-violet-500/15"><CheckCircle2 /></div><button aria-label="Fechar" onClick={() => {setCompleteOpen(false);setError("");}} className="p-2 text-slate-500"><X /></button></div>
            <h2 id="focus-complete-title" className="mt-4 text-xl font-black">Concluir tarefa?</h2><p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-900 dark:bg-white/5 dark:text-white">{currentTask?.title}</p><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Esta tarefa será marcada como concluída também no Planejamento.</p>
            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            <button disabled={saving} onClick={() => void completeTask()} className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#6d28d9] text-sm font-bold text-white disabled:opacity-50">{saving ? "Salvando..." : "Sim, concluir tarefa"}</button><button onClick={() => {setCompleteOpen(false);setError("");}} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-semibold text-slate-500">Cancelar</button>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
    </main>
  );
}
