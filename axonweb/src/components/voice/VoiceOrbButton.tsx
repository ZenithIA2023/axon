/**
 * Botão de gravação da página de voz: um círculo grande, com gradiente e anel
 * que pulsa enquanto grava.
 *
 * É TOGGLE, não push-to-talk (decidido em 02/10/2026): um toque começa a
 * gravar, outro encerra e envia. O gesto de "deslizar para cancelar" morreu
 * junto com o segurar — quem cancela agora é o botão à esquerda do microfone,
 * que vira um X enquanto a gravação acontece (ver `VoiceChat.tsx`).
 *
 * Como o dedo não fica no botão, o estado precisa ser inequívoco: o anel
 * pulsante e o ícone de quadrado ("parar") existem para isso.
 */

import { useCallback } from "react";
import { Loader2, Mic, Square } from "lucide-react";

import type { UseVoiceSession } from "../../lib/voice/useVoiceSession";

interface VoiceOrbButtonProps {
  session: UseVoiceSession;
  /** Chamado no toque (gesto real do usuário) para destravar o áudio. */
  onWarmup?: () => void;
  disabled?: boolean;
}

export function VoiceOrbButton({ session, onWarmup, disabled }: VoiceOrbButtonProps) {
  const recording = session.status === "recording";
  const processing = session.status === "processing";

  const handleClick = useCallback(() => {
    if (disabled || processing) return;

    if (recording) {
      // `false`: encerrar NÃO é cancelar — este toque envia o áudio.
      session.release(false);
      return;
    }

    // Precisa acontecer dentro do gesto real: fora dele o navegador bloqueia o
    // autoplay e a primeira resposta sai muda, sem erro nenhum.
    onWarmup?.();
    session.press();
  }, [disabled, onWarmup, processing, recording, session]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      style={{
        transform: `scale(${recording ? 1.06 : 1})`,
        background: processing
          ? "rgba(255,255,255,0.07)"
          : "linear-gradient(155deg, #f0abfc 0%, #a855f7 52%, #6d28d9 100%)",
        boxShadow: processing
          ? "none"
          : recording
          ? "0 16px 54px rgba(232, 121, 249, 0.62), inset 0 1px 0 rgba(255,255,255,0.5)"
          : "0 14px 44px rgba(168, 85, 247, 0.5), inset 0 1px 0 rgba(255,255,255,0.5)",
        transition: "transform 0.2s ease, box-shadow 0.3s ease, background 0.25s ease",
      }}
      className="relative grid h-[88px] w-[88px] select-none place-items-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-45"
      aria-label={
        processing
          ? "Processando fala"
          : recording
          ? "Toque para enviar"
          : "Toque para falar com o Axon"
      }
      aria-pressed={recording}
    >
      {/* Anel que se expande e some, marcando que o microfone está aberto. */}
      {recording && (
        <span
          aria-hidden="true"
          className="voice-mic-ring pointer-events-none absolute -inset-3 rounded-full"
        />
      )}

      <span className="relative">
        {processing ? (
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: "rgba(255,255,255,0.46)" }} />
        ) : recording ? (
          <Square className="h-6 w-6 fill-current" />
        ) : (
          <Mic className="h-7 w-7" />
        )}
      </span>
    </button>
  );
}
