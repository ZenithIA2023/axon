/**
 * Cliente da transcrição ao vivo: fala com `/voice/realtime` no nosso backend.
 *
 * A conexão é com o NOSSO servidor, não com a OpenAI: a chave fica no backend,
 * a cota por usuário continua contando e o vocabulário do usuário entra na
 * sessão. Ver `backend/services/stt_realtime.py`.
 *
 * Isto é sempre uma melhoria opcional. Se o WebSocket não abrir, cair no meio
 * ou o servidor responder que não há streaming, quem chama segue gravando
 * normalmente e envia o áudio inteiro no fim — a pessoa perde o texto ao vivo,
 * nunca a funcionalidade.
 */

import { getAuthToken } from "../api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Sem isto, uma rede que aceita a conexão mas nunca responde travaria a fala. */
const TIMEOUT_CONEXAO_MS = 4_000;

export interface LiveTranscriptionEvents {
  /**
   * Texto acumulado do turno, atualizado a cada delta. Já vem montado (trechos
   * fechados + o parcial em andamento) para a tela só precisar exibir.
   */
  onPartial?: (textoAcumulado: string) => void;
  /** Um trecho fechou: recebe o texto acumulado, já com ele incluído. */
  onFinal?: (textoAcumulado: string) => void;
  /** A sessão morreu. Quem chama deve cair para o envio do áudio completo. */
  onError?: (mensagem: string) => void;
}

export interface LiveTranscription {
  /** Manda um pedaço de PCM 16-bit mono 24kHz. */
  sendAudio(pcm: ArrayBuffer): void;
  /** Pausa detectada: fecha o trecho e pede a transcrição dele. */
  commit(): void;
  /** Fim da fala. Resolve com o texto completo acumulado. */
  finish(): Promise<string>;
  /** Encerra sem esperar nada (cancelamento). */
  cancel(): void;
  readonly ok: boolean;
}

function paraWs(url: string): string {
  return url.replace(/^http/, "ws");
}

/**
 * Abre a sessão. Resolve com `null` quando a transcrição ao vivo não está
 * disponível — nunca lança, porque isto é opcional e quem chama não deveria
 * precisar de try/catch para uma melhoria.
 */
export async function startLiveTranscription(
  events: LiveTranscriptionEvents,
): Promise<LiveTranscription | null> {
  const token = getAuthToken();
  if (!token || typeof WebSocket === "undefined") return null;

  let ws: WebSocket;
  try {
    ws = new WebSocket(`${paraWs(BASE_URL)}/voice/realtime`);
  } catch {
    return null;
  }

  const aberto = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), TIMEOUT_CONEXAO_MS);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
  });

  if (!aberto) {
    try {
      ws.close();
    } catch {
      // Já fechado.
    }
    return null;
  }

  // Autenticação vai na primeira mensagem: a API de WebSocket do navegador não
  // permite cabeçalhos no handshake.
  ws.send(JSON.stringify({ token }));

  // Trechos já fechados + o parcial em andamento. Separados porque o parcial é
  // substituído quando o trecho fecha, e concatenar os dois cegamente
  // duplicaria o texto na tela.
  const trechos: string[] = [];
  let parcial = "";
  let vivo = true;
  let erro: string | null = null;
  let aoFechar: (() => void) | null = null;

  const textoCompleto = () => [...trechos, parcial].filter(Boolean).join(" ").trim();

  ws.onmessage = (e: MessageEvent) => {
    let msg: { partial?: string; final?: string; error?: string };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }

    if (msg.partial) {
      parcial += msg.partial;
      events.onPartial?.(textoCompleto());
    } else if (typeof msg.final === "string") {
      trechos.push(msg.final);
      // O final substitui o parcial do MESMO trecho — sem zerar, o texto
      // apareceria duas vezes.
      parcial = "";
      events.onFinal?.(textoCompleto());
    } else if (msg.error) {
      erro = msg.error;
      vivo = false;
      events.onError?.(msg.error);
    }
  };

  ws.onclose = () => {
    vivo = false;
    aoFechar?.();
  };
  ws.onerror = () => {
    vivo = false;
  };

  const fechar = () => {
    vivo = false;
    try {
      ws.close();
    } catch {
      // Já fechado.
    }
  };

  return {
    get ok() {
      return vivo && !erro;
    },

    sendAudio(pcm: ArrayBuffer) {
      if (!vivo || ws.readyState !== WebSocket.OPEN) return;
      // O backend espera base64; `btoa` sobre a string binária é o caminho
      // curto e é o que o Safari também aceita.
      let bin = "";
      const bytes = new Uint8Array(pcm);
      const PEDACO = 8192; // acima disso, `String.fromCharCode(...)` estoura a pilha
      for (let i = 0; i < bytes.length; i += PEDACO) {
        bin += String.fromCharCode(...bytes.subarray(i, i + PEDACO));
      }
      ws.send(JSON.stringify({ audio: btoa(bin) }));
    },

    commit() {
      if (!vivo || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ commit: true }));
    },

    async finish() {
      if (!vivo || ws.readyState !== WebSocket.OPEN) return textoCompleto();

      ws.send(JSON.stringify({ done: true }));
      // O servidor manda o último trecho e fecha. Se demorar demais, seguimos
      // com o que já temos em vez de deixar a pessoa esperando.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3_000);
        aoFechar = () => {
          clearTimeout(timer);
          resolve();
        };
      });

      fechar();
      return textoCompleto();
    },

    cancel() {
      fechar();
    },
  };
}
