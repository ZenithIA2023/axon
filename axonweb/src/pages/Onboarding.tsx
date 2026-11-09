import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import AuthGlow from "../components/auth/AuthGlow";
import { CardFrame, STEP_MOTION, SectionProgress } from "../components/onboarding/OnboardingUI";
import {
  ChoiceQuestion,
  CurvesStep,
  HowAxonHelpsStep,
  HowItWorksStep,
  MorningSignalsStep,
  ReviewStep,
  RhythmIntroStep,
  ScheduleStep,
  SleepTimesStep,
  WelcomeStep,
  type StepProps,
} from "../components/onboarding/QuestionSteps";
import {
  CurveStep,
  MeaningStep,
  RevealStep,
  SegmentsStep,
  SignupStep,
  StrengthsStep,
  AxonPlanStep,
  YourAnswersStep,
} from "../components/onboarding/ResultSteps";
import AnalyzingStep from "../components/onboarding/AnalyzingStep";
import { FIRST_RESULT_STEP_ID, FLOW_VERSION, type Step } from "../data/onboardingSteps";
import * as api from "../lib/api";
import { useNativeBackHandler } from "../lib/nativeBack";
import {
  createOnboardingTracker,
  finishOnboarding,
  saveOnboarding,
  useLeaveQuestionnaireIfAnswered,
} from "../lib/onboarding";
import {
  buildPayload,
  eventOptionId,
  isStepComplete,
  loadProgress,
  newProgress,
  readChoice,
  resumeIndex,
  saveProgress,
  visibleSteps,
  type OnboardingProgress,
} from "../lib/onboardingState";

// ===========================================================================
// ONBOARDING
// ===========================================================================
// Substitui QuestionnaireIntro + Questionnaire + Analyzing + Result (nov/2026).
// O conteúdo de cada tela está em data/onboardingSteps.ts; aqui só a
// navegação, a gravação e o funil.
//
// Três entradas:
//   - visitante (landing)       → abertura, perguntas, cadastro, resultado;
//   - logado sem cronotipo      → começa nas perguntas, grava na análise;
//   - "Refazer o teste" (Perfil, ?refazer=1) → idem, volta ao Perfil no fim.

function initialProgress(loggedIn: boolean, retake: boolean): OnboardingProgress {
  const saved = loadProgress();

  if (retake) {
    // Retoma um "refazer" interrompido; senão começa um novo, sem misturar com
    // respostas de outro fluxo.
    return saved?.origin === "retake" ? saved : newProgress("retake");
  }
  if (saved && saved.origin !== "retake") {
    // Visitante que se cadastrou no meio do caminho continua de onde parou.
    return loggedIn && saved.origin === "new" ? { ...saved, origin: "account" } : saved;
  }
  return newProgress(loggedIn ? "account" : "new");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Chegou aqui redirecionado, mas já respondeu em outro aparelho: volta.
  useLeaveQuestionnaireIfAnswered();

  const retake = params.get("refazer") === "1";
  // Estado, não constante: o cadastro acontece DENTRO do fluxo, e a partir
  // dele a tela de cadastro some da sequência.
  const [loggedIn, setLoggedIn] = useState(() => api.isLoggedIn());

  const [progress, setProgress] = useState<OnboardingProgress>(() => initialProgress(api.isLoggedIn(), retake));
  const steps = useMemo(() => visibleSteps(loggedIn), [loggedIn]);
  const [index, setIndex] = useState(() => resumeIndex(progress.stepId, api.isLoggedIn()));
  const step = steps[index];
  const firstResultIndex = steps.findIndex((s) => s.id === FIRST_RESULT_STEP_ID);
  const reviewIndex = steps.findIndex((s) => s.kind === "review");
  // Veio da tela de confirmação para mudar uma resposta: ao terminar, volta
  // para lá em vez de seguir pelas perguntas seguintes.
  const [editing, setEditing] = useState(false);
  // Fica aqui, não na tela: ao voltar de uma edição a lista continua aberta.
  const [reviewListOpen, setReviewListOpen] = useState(false);

  // Persistência a cada mudança: fechar a aba no meio retoma na mesma tela.
  useEffect(() => {
    saveProgress({ ...progress, stepId: step.id });
  }, [progress, step.id]);

  // Ref para que gravar e registrar o funil usem sempre o estado mais recente
  // (o avanço automático da análise dispara logo depois de um setProgress).
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // ------------------------------------------------------------------------
  // Funil
  // ------------------------------------------------------------------------
  const tracker = useMemo(() => createOnboardingTracker(progress.anonId), [progress.anonId]);

  useEffect(() => {
    tracker.track({ step: step.id, event: "view" });
    tracker.flush();
  }, [tracker, step.id]);

  // O último lote sai mesmo se a pessoa fechar a aba (fetch com keepalive).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") tracker.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [tracker]);

  // ------------------------------------------------------------------------
  // Navegação
  // ------------------------------------------------------------------------
  const update = useCallback((fn: (p: OnboardingProgress) => OnboardingProgress) => setProgress(fn), []);

  const goNext = useCallback(() => {
    const current = steps[index];
    const answers = progressRef.current.answers;
    if (current.kind === "choice") {
      tracker.track({ step: current.id, event: "answer", option_id: eventOptionId(readChoice(answers, current.target)) });
    } else if (current.kind === "curves") {
      tracker.track({ step: current.id, event: "answer", option_id: eventOptionId([answers.respostas.P17 ?? ""]) });
    } else if (current.kind === "schedule") {
      tracker.track({ step: current.id, event: "answer", option_id: answers.schedule_type });
    } else {
      // Nome, horários e textos "outro": só que respondeu, nunca o que foi digitado.
      tracker.track({ step: current.id, event: "answer" });
    }
    setEditing(false);
    if (!editing) setReviewListOpen(false);
    setIndex((i) => (editing ? reviewIndex : Math.min(i + 1, steps.length - 1)));
  }, [editing, index, reviewIndex, steps, tracker]);

  const goBack = useCallback(() => {
    tracker.track({ step: steps[index].id, event: "back" });
    if (steps[index].kind === "review" && reviewListOpen) {
      setReviewListOpen(false);
      return;
    }
    if (editing) {
      setEditing(false);
      setIndex(reviewIndex);
      return;
    }
    setIndex((i) => {
      let prev = i - 1;
      // A análise não se repete ao voltar: o resultado já existe.
      while (prev > 0 && steps[prev].kind === "analyzing") prev--;
      return Math.max(prev, 0);
    });
  }, [editing, index, reviewIndex, reviewListOpen, steps, tracker]);

  const editAnswer = useCallback(
    (stepId: string) => {
      const target = steps.findIndex((s) => s.id === stepId);
      if (target < 0) return;
      setEditing(true);
      setIndex(target);
    },
    [steps]
  );

  // Depois de gravado não se volta para antes do resultado: as perguntas já
  // estão na conta, e mudá-las ali não mudaria nada.
  const canBack =
    index > 0 && step.kind !== "analyzing" && !(progress.saved && index <= firstResultIndex);

  // Botão voltar do Android: uma tela para trás, como a seta. Na primeira tela
  // ele sai do onboarding, como em qualquer outra página.
  useNativeBackHandler(() => {
    if (!canBack) return false;
    goBack();
    return true;
  });

  // ------------------------------------------------------------------------
  // Gravação e conclusão
  // ------------------------------------------------------------------------

  // Tela de análise. Logado: grava na conta. Visitante: só calcula (rota
  // pública) para guardar o resultado; grava depois do cadastro.
  const analyze = useCallback(async () => {
    const current = progressRef.current;
    try {
      if (api.isLoggedIn()) {
        const saved = await saveOnboarding(current);
        setProgress(saved);
        tracker.track({ step: "t22_analisando", event: "complete" });
      } else {
        const res = await api.classify(buildPayload(current, FLOW_VERSION));
        setProgress((p) => ({
          ...p,
          result: {
            cronotipo: res.cronotipo,
            jet_lag_social_min: res.jet_lag_social_min,
            energia: res.energia,
            segmentos: res.segmentos,
          },
        }));
      }
    } catch (err) {
      tracker.track({ step: "t22_analisando", event: "error" });
      throw err;
    }
  }, [tracker]);

  // Visitante que acabou de criar conta por e-mail na tela de cadastro.
  async function handleRegistered() {
    tracker.track({ step: step.id, event: "complete" });
    tracker.flush();
    const nowSteps = visibleSteps(true);
    try {
      const saved = await saveOnboarding({ ...progressRef.current, origin: "account" });
      setProgress(saved);
      setLoggedIn(true);
      setIndex(nowSteps.findIndex((s) => s.id === FIRST_RESULT_STEP_ID));
    } catch {
      // A conta existe, mas gravar falhou: volta à análise, que (agora
      // logada) tenta gravar de novo e mostra o erro se continuar falhando.
      setProgress((p) => ({ ...p, origin: "account" }));
      setLoggedIn(true);
      setIndex(nowSteps.findIndex((s) => s.kind === "analyzing"));
    }
  }

  function handleFinish() {
    tracker.track({ step: step.id, event: "complete" });
    tracker.flush();
    navigate(finishOnboarding(progressRef.current), { replace: true });
  }

  const props: StepProps = {
    progress,
    update,
    canBack,
    canNext: isStepComplete(step, progress.answers),
    onBack: goBack,
    onNext: goNext,
  };

  return (
    /* O conteúdo PREENCHE o <main> (flex-1) em vez de medir `100vh - 40px`:
       no app o `.is-native main` troca o padding pelos insets do sistema
       (mesmo motivo do questionário antigo, 23/10/2026). */
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#2d0850] px-4 py-5 text-white">
      <AuthGlow />

      <div className="relative z-10 mx-auto flex w-full max-w-[430px] flex-1 flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/axon-logo-inverted.svg" alt="Axon" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold tracking-[-0.02em] text-white">AXON</span>
          </div>

          {progress.origin === "retake" && !progress.saved && (
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="min-h-9 rounded-2xl border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white/78 backdrop-blur-2xl transition hover:bg-white/16 hover:text-white active:scale-[0.98]"
            >
              Cancelar
            </button>
          )}
        </header>

        <section className="flex flex-1 flex-col justify-center py-6">
          <CardFrame>
            {step.kind !== "welcome" && step.kind !== "analyzing" && (
              <SectionProgress section={step.section} progress={((index + 1) / steps.length) * 100} />
            )}

            <AnimatePresence mode="wait">
              <motion.div key={step.id} {...STEP_MOTION}>
                <StepView
                  step={step}
                  props={props}
                  analyze={analyze}
                  reviewListOpen={reviewListOpen}
                  onOpenReviewList={() => setReviewListOpen(true)}
                  onEdit={editAnswer}
                  onRegistered={handleRegistered}
                  onFinish={handleFinish}
                />
              </motion.div>
            </AnimatePresence>
          </CardFrame>
        </section>
      </div>
    </main>
  );
}

function StepView({
  step,
  props,
  analyze,
  reviewListOpen,
  onOpenReviewList,
  onEdit,
  onRegistered,
  onFinish,
}: {
  step: Step;
  props: StepProps;
  analyze: () => Promise<void>;
  reviewListOpen: boolean;
  onOpenReviewList: () => void;
  onEdit: (stepId: string) => void;
  onRegistered: () => Promise<void>;
  onFinish: () => void;
}) {
  switch (step.kind) {
    case "welcome":
      return <WelcomeStep {...props} />;
    case "how_it_works":
      return <HowItWorksStep {...props} />;
    case "choice":
      return <ChoiceQuestion {...props} step={step} />;
    case "how_axon_helps":
      return <HowAxonHelpsStep {...props} />;
    case "schedule":
      return <ScheduleStep {...props} />;
    case "rhythm_intro":
      return <RhythmIntroStep {...props} />;
    case "sleep_times":
      return <SleepTimesStep {...props} day={step.day} />;
    case "morning_signals":
      return <MorningSignalsStep {...props} />;
    case "curves":
      return <CurvesStep {...props} />;
    case "review":
      return <ReviewStep {...props} listOpen={reviewListOpen} onOpenList={onOpenReviewList} onEdit={onEdit} />;
    case "analyzing":
      return <AnalyzingStep {...props} analyze={analyze} />;
    case "signup":
      return <SignupStep {...props} onRegistered={onRegistered} />;
    case "reveal":
      return <RevealStep {...props} />;
    case "meaning":
      return <MeaningStep {...props} />;
    case "strengths":
      return <StrengthsStep {...props} />;
    case "your_answers":
      return <YourAnswersStep {...props} />;
    case "curve":
      return <CurveStep {...props} />;
    case "segments":
      return <SegmentsStep {...props} />;
    case "axon_plan":
      return <AxonPlanStep {...props} onFinish={onFinish} />;
  }
}
