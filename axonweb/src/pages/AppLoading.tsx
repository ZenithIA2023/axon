import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const loadingMessages = [
  "Carregando seu ambiente",
  "Sincronizando sua rotina",
  "Abrindo seu Dashboard",
];

const TOTAL_DURATION = 2600;
const NAVIGATION_DELAY = 220;

export default function AppLoading() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [progress, setProgress] = useState(0);

  const activeMessageIndex = useMemo(() => {
    const index = Math.floor((progress / 100) * loadingMessages.length);
    return Math.min(index, loadingMessages.length - 1);
  }, [progress]);

  const currentMessage = loadingMessages[activeMessageIndex];

  useEffect(() => {
    const startedAt = performance.now();

    let progressTimer: number | undefined;
    let navigationTimer: number | undefined;
    let completed = false;

    progressTimer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const nextProgress = Math.min((elapsed / TOTAL_DURATION) * 100, 100);

      setProgress(nextProgress);

      if (nextProgress >= 100 && !completed) {
        completed = true;
        window.clearInterval(progressTimer);

        navigationTimer = window.setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, NAVIGATION_DELAY);
      }
    }, 40);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(navigationTimer);
    };
  }, [navigate]);

  return (
    <main className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#2d0850] px-5 text-white">
      <AppLoadingBackground />

      <section
        role="status"
        aria-label="Carregando o AXON"
        className="relative z-10 flex w-full max-w-[340px] flex-col items-center text-center"
      >
        <LogoVignette reduceMotion={!!reduceMotion} />

        <div className="mt-8 min-h-[76px] w-full">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentMessage}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: 8, filter: "blur(4px)" }
              }
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, filter: "blur(4px)" }
              }
              transition={{
                duration: reduceMotion ? 0.12 : 0.24,
                ease: "easeOut",
              }}
            >
              <h1 className="text-[1.55rem] font-black leading-[1.02] tracking-[-0.05em] text-white">
                {currentMessage}
              </h1>

              <p className="mx-auto mt-3 max-w-[17rem] text-[0.76rem] font-medium leading-5 text-white/58">
                O AXON está preparando sua experiência.
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 w-full max-w-[18rem]">
          <div
            className="relative h-[7px] overflow-hidden rounded-full bg-white/14"
            role="progressbar"
            aria-label="Progresso do carregamento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <motion.div
              className="relative h-full rounded-full bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#f5d0fe] shadow-[0_0_18px_rgba(192,132,252,0.38)]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function LogoVignette({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      animate={
        reduceMotion
          ? undefined
          : {
              scale: [1, 1.02, 1],
              y: [0, -2, 0],
            }
      }
      transition={{
        duration: 3.2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="relative flex h-[180px] w-[180px] items-center justify-center"
    >
      <div className="absolute h-[150px] w-[150px] rounded-full bg-[#a855f7]/14 blur-[42px]" />

      <div className="relative flex h-[116px] w-[116px] rotate-45 items-center justify-center rounded-[2rem] border border-white/14 bg-white/[0.10] shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div className="absolute inset-[12px] rounded-[1.45rem] bg-gradient-to-br from-[#a855f7] to-[#7b2cbf] shadow-[0_16px_36px_rgba(123,44,191,0.28)]" />

        <div className="pointer-events-none absolute inset-[12px] rounded-[1.45rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_55%)]" />

        <img
          src="/axon-logo.svg"
          alt="Axon"
          className="relative z-10 h-[76px] w-[76px] -rotate-45 object-contain"
          draggable={false}
        />
      </div>
    </motion.div>
  );
}

function AppLoadingBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-16rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#7b2cbf]/38 blur-[120px]" />
      <div className="absolute bottom-[-15rem] left-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#a855f7]/14 blur-[110px]" />
      <div className="absolute bottom-[-14rem] right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#6d28d9]/14 blur-[110px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_62%)]" />
    </div>
  );
}