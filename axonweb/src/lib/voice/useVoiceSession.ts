/**
 * Orquestra o ciclo de vida de uma gravação por voz: pressionar, gravar,
 * soltar (envia) ou cancelar (descarta). Não fala com o backend — só entrega
 * o áudio pronto via `onRecordingReady`; quem manda para `/voice/message` é
 * quem usa o hook (mesma divisão que o chat de texto já tem entre estado da
 * tela e chamada de API).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createVoiceRecorder,
  type VoiceRecorder,
  type VoiceRecording,
} from "./recorder";
import { canRecordVoice, MIC_ERROR_MESSAGES } from "./permission";
import { startPcmCapture, type PcmCapture } from "./pcmCapture";
import { startLiveTranscription, type LiveTranscription } from "./liveTranscription";

export type VoiceSessionStatus = "idle" | "recording" | "processing";

export interface UseVoiceSessionOptions {
  /** Gravação pronta para enviar — nunca chamado se o usuário cancelou. */
  onRecordingReady: (recording: VoiceRecording) => void;
  /** Erro de permissão/gravação, com mensagem já em português. */
  onError?: (message: string) => void;
  /**
   * Liga a transcrição ao vivo. Desligado por padrão: só a página de voz a usa,
   * e o botão do chat de texto não deve abrir WebSocket nenhum.
   */
  live?: boolean;
  /** Texto parcial enquanto a pessoa fala. Só chamado com `live`. */
  onLiveText?: (texto: string) => void;
  /**
   * Transcrição pronta pelo caminho ao vivo — quem recebe isto deve mandar o
   * TEXTO para o agente em vez do áudio, evitando transcrever (e pagar) duas
   * vezes. Não é chamado quando o streaming falhou: aí vale o `onRecordingReady`.
   */
  onLiveTranscript?: (texto: string) => void;
}

export interface UseVoiceSession {
  status: VoiceSessionStatus;
  /** Nível do microfone, 0 a 1, para o medidor visual. */
  level: number;
  /** False quando o navegador/aparelho não oferece gravação. */
  available: boolean;
  /** Início do toque no botão. */
  press: () => void;
  /** Fim do toque. `shouldCancel` vem do gesto de deslizar. */
  release: (shouldCancel: boolean) => void;
  /** Cancela no meio do gesto (ex.: dedo saiu longe demais da área do botão). */
  cancelNow: () => void;
  /** Chamar quando o backend terminou de responder (sucesso ou erro). */
  finishProcessing: () => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSession {
  const [status, setStatus] = useState<VoiceSessionStatus>("idle");
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const pcmRef = useRef<PcmCapture | null>(null);
  const liveRef = useRef<LiveTranscription | null>(null);
  // release() pode chegar ANTES de start() terminar de pedir permissão — este
  // flag garante que a gravação é cancelada assim que (se) ela começar.
  const pendingCancelRef = useRef(false);
  const statusRef = useRef<VoiceSessionStatus>("idle");
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const available = canRecordVoice();

  const setStatusBoth = useCallback((s: VoiceSessionStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  /** Desliga a captura PCM e o WebSocket. Seguro chamar mais de uma vez. */
  const pararLive = useCallback(() => {
    pcmRef.current?.stop();
    pcmRef.current = null;
    liveRef.current?.cancel();
    liveRef.current = null;
  }, []);

  /**
   * Liga a transcrição ao vivo em cima da gravação que já está rodando.
   *
   * Roda em paralelo e nunca bloqueia: se o WebSocket não abrir, a gravação
   * segue igual e o áudio completo é enviado no fim, como antes.
   */
  const iniciarLive = useCallback(async (recorder: VoiceRecorder) => {
    const stream = recorder.stream;
    if (!stream) return;

    const live = await startLiveTranscription({
      // Os dois eventos trazem o texto do turno inteiro, já montado.
      onPartial: (texto) => optionsRef.current.onLiveText?.(texto),
      onFinal: (texto) => optionsRef.current.onLiveText?.(texto),
      onError: () => {
        // Cai para o caminho normal sem incomodar a pessoa: ela continua
        // falando e o áudio inteiro será transcrito no fim.
        pararLive();
      },
    });

    // A pessoa pode ter soltado o botão enquanto o WebSocket abria.
    if (!live) return;
    if (!recorder.isRecording) {
      live.cancel();
      return;
    }
    liveRef.current = live;

    try {
      pcmRef.current = await startPcmCapture(stream, {
        onChunk: (pcm) => live.sendAudio(pcm),
        onPause: () => live.commit(),
        // O nível já vem do `recorder`; medir duas vezes só faria a orb
        // tremer entre dois valores levemente diferentes.
      });
    } catch {
      // Sem AudioWorklet (navegador antigo): segue sem texto ao vivo.
      live.cancel();
      liveRef.current = null;
    }
  }, [pararLive]);

  const ensureRecorder = useCallback((): VoiceRecorder => {
    if (recorderRef.current) return recorderRef.current;
    const recorder = createVoiceRecorder({
      onLevel: setLevel,
      onAutoStop: (recording) => {
        setStatusBoth("processing");
        setLevel(0);
        pcmRef.current?.stop();
        pcmRef.current = null;
        const live = liveRef.current;
        liveRef.current = null;
        if (!live) {
          optionsRef.current.onRecordingReady(recording);
          return;
        }
        void live.finish().then((texto) => {
          const limpo = texto.trim();
          if (limpo) optionsRef.current.onLiveTranscript?.(limpo);
          else optionsRef.current.onRecordingReady(recording);
        });
      },
    });
    recorderRef.current = recorder;
    return recorder;
  }, [setStatusBoth]);

  const press = useCallback(() => {
    if (!available) {
      optionsRef.current.onError?.(MIC_ERROR_MESSAGES.unsupported);
      return;
    }
    if (statusRef.current === "processing") return;

    pendingCancelRef.current = false;
    // Limpa o texto da fala anterior: sem isto ele reaparece por um instante
    // antes do primeiro parcial desta chegar.
    optionsRef.current.onLiveText?.("");
    const recorder = ensureRecorder();
    // Otimista: assume que vai gravar. Se falhar ou for cancelada antes de
    // começar, volta para "idle" nos ramos abaixo.
    setStatusBoth("recording");

    recorder
      .start()
      .then(() => {
        if (pendingCancelRef.current) {
          recorder.cancel();
          setStatusBoth("idle");
          setLevel(0);
          return;
        }
        // Só depois de gravar de fato: antes disso não há stream para derivar.
        if (optionsRef.current.live) void iniciarLive(recorder);
      })
      .catch((err: unknown) => {
        setStatusBoth("idle");
        setLevel(0);
        optionsRef.current.onError?.(err instanceof Error ? err.message : MIC_ERROR_MESSAGES.unknown);
      });
  }, [available, ensureRecorder, iniciarLive, setStatusBoth]);

  const release = useCallback(
    (shouldCancel: boolean) => {
      const recorder = recorderRef.current;

      if (!recorder || !recorder.isRecording) {
        // Ainda aguardando permissão — marca para cancelar quando (se) iniciar.
        pendingCancelRef.current = true;
        setStatusBoth("idle");
        setLevel(0);
        return;
      }

      if (shouldCancel) {
        pararLive();
        recorder.cancel();
        setStatusBoth("idle");
        setLevel(0);
        return;
      }

      setStatusBoth("processing");
      setLevel(0);

      // A captura PCM para agora; o WebSocket ainda não, porque falta receber a
      // transcrição do último trecho.
      pcmRef.current?.stop();
      pcmRef.current = null;
      const live = liveRef.current;
      liveRef.current = null;

      recorder
        .stop()
        .then(async (recording) => {
          if (live) {
            const texto = (await live.finish()).trim();
            if (texto) {
              // Já temos o texto: mandar o áudio de novo seria transcrever e
              // pagar duas vezes, e somar ~1s antes de o Axon responder.
              optionsRef.current.onLiveTranscript?.(texto);
              return;
            }
          }
          optionsRef.current.onRecordingReady(recording);
        })
        .catch(() => {
          live?.cancel();
          setStatusBoth("idle");
        });
    },
    [pararLive, setStatusBoth]
  );

  const cancelNow = useCallback(() => {
    pendingCancelRef.current = true;
    pararLive();
    recorderRef.current?.cancel();
    setStatusBoth("idle");
    setLevel(0);
  }, [pararLive, setStatusBoth]);

  const finishProcessing = useCallback(() => {
    setStatusBoth("idle");
  }, [setStatusBoth]);

  // Troca de tela / desmonte com gravação em andamento: cancela, não deixa o
  // microfone ligado nem uma gravação órfã sendo processada.
  useEffect(() => {
    return () => {
      pcmRef.current?.stop();
      liveRef.current?.cancel();
      recorderRef.current?.cancel();
    };
  }, []);

  // Minimizar o app no meio de uma fala tem que soltar o microfone. Sem isto o
  // ícone de gravação fica aceso em segundo plano e a sessão de transcrição
  // segue aberta — no celular, onde minimizar é um gesto comum, isso é o
  // suficiente para o app parecer que está espionando. Mesmo tratamento que o
  // `useSpeech` já dá à fala.
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") cancelNow();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", cancelNow);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", cancelNow);
    };
  }, [cancelNow]);

  return { status, level, available, press, release, cancelNow, finishProcessing };
}
