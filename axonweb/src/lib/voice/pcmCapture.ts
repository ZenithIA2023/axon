/**
 * Captura do microfone em PCM cru, para a transcrição ao vivo.
 *
 * Por que não reusar o `MediaRecorder` do `recorder.ts`: a API realtime da
 * OpenAI aceita **só** PCM de 16 bits a 24kHz. Sondamos os alternativos e todos
 * foram recusados na cara — `audio/webm` e `audio/opus` respondem "Supported
 * values are: 'audio/pcm', 'audio/pcmu', 'audio/pcma'", e 16000Hz responde
 * "integer below minimum value". Não há como converter Opus para PCM no
 * navegador sem decodificar, então a captura ao vivo é um caminho separado.
 *
 * Os dois caminhos rodam JUNTOS na mesma gravação, de propósito: este alimenta
 * o texto ao vivo, e o `MediaRecorder` continua guardando o áudio completo como
 * plano B, para o caso de o WebSocket cair no meio da fala.
 */

/** Único formato aceito pela API realtime. Não é configurável. */
export const PCM_SAMPLE_RATE = 24_000;

/**
 * Volume abaixo do qual consideramos pausa. Medido em RMS normalizado (0 a 1):
 * respiração e ruído de sala ficam abaixo disto, voz fica bem acima.
 */
const LIMIAR_SILENCIO = 0.012;

/**
 * Áudio mínimo antes de cortar num silêncio.
 *
 * A API transcreve por turno, e cada corte é uma transcrição separada — cortar
 * a cada respiração picotaria a frase e pioraria o texto, porque o modelo perde
 * o contexto do que veio antes. Dois segundos é o que separa "pausa para
 * respirar" de "terminei uma ideia".
 */
const MIN_SEGUNDOS_TRECHO = 2.0;

/** Silêncio contínuo que confirma a pausa (evita cortar entre duas sílabas). */
const SILENCIO_CONFIRMA_MS = 350;

/**
 * Teto de fala sem nenhum corte.
 *
 * Quem fala sem parar não gera pausa nenhuma, e sem este teto ficaria olhando
 * para a tela vazia até soltar o botão (o recorder só corta em 60s). Aqui o
 * corte cai numa palavra, o que é ruim — mas é o mal menor contra meio minuto
 * sem retorno nenhum, e só acontece em fala ininterrupta de verdade.
 */
const MAX_SEGUNDOS_TRECHO = 12;

/**
 * Quanto áudio juntar antes de mandar.
 *
 * O worklet entrega blocos de 128 amostras (5,3ms a 24kHz) — medido num
 * Chromium real. Mandar cada um viraria ~188 mensagens WebSocket por segundo,
 * cada uma com o seu JSON e base64 em volta de 256 bytes de áudio. Agrupar em
 * 100ms derruba isso para 10 mensagens por segundo sem atrasar nada de forma
 * perceptível.
 */
const ENVIO_MS = 100;

/**
 * Estado do detector de pausa entre um pedaço de áudio e o próximo.
 * Fora da captura para poder ser testado sem um navegador por perto.
 */
export interface EstadoPausa {
  segundosNoTrecho: number;
  silencioMs: number;
}

export const ESTADO_PAUSA_INICIAL: EstadoPausa = { segundosNoTrecho: 0, silencioMs: 0 };

/**
 * Decide se este pedaço de áudio fecha um trecho.
 *
 * Corta quando as duas condições se encontram: já há frase suficiente E a pessoa
 * realmente parou. Cortar só por tempo parte palavra ao meio (medido contra a
 * API: "uma tarefa" virou "uma tarefa." + "Efa para revisar"), e cortar a cada
 * silêncio picota a frase em pedaços curtos demais para o modelo entender o
 * contexto.
 *
 * A exceção é `MAX_SEGUNDOS_TRECHO`: em fala ininterrupta a pausa nunca chega, e
 * aí cortar numa palavra é melhor que deixar a tela vazia.
 */
export function avaliarPausa(
  estado: EstadoPausa,
  rms: number,
  duracaoS: number,
): { estado: EstadoPausa; cortar: boolean } {
  const segundosNoTrecho = estado.segundosNoTrecho + duracaoS;
  const silencioMs = rms < LIMIAR_SILENCIO ? estado.silencioMs + duracaoS * 1000 : 0;

  const cortar =
    (segundosNoTrecho >= MIN_SEGUNDOS_TRECHO && silencioMs >= SILENCIO_CONFIRMA_MS) ||
    segundosNoTrecho >= MAX_SEGUNDOS_TRECHO;

  return {
    estado: cortar ? { ...ESTADO_PAUSA_INICIAL } : { segundosNoTrecho, silencioMs },
    cortar,
  };
}

/** RMS normalizado (0 a 1) de um bloco de PCM 16-bit. */
export function rmsDe(amostras: Int16Array): number {
  if (amostras.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) {
    const v = amostras[i] / 32768;
    soma += v * v;
  }
  return Math.sqrt(soma / amostras.length);
}

export interface PcmCaptureEvents {
  /** Pedaço de PCM 16-bit mono a 24kHz, pronto para enviar. */
  onChunk: (pcm: ArrayBuffer) => void;
  /** Pausa natural detectada: hora de fechar o trecho e pedir a transcrição. */
  onPause?: () => void;
  /** Nível do microfone (0 a 1), para a orb reagir. */
  onLevel?: (level: number) => void;
}

export interface PcmCapture {
  stop(): void;
  readonly active: boolean;
}

/**
 * O worklet roda na thread de áudio e só faz o essencial: converter Float32 em
 * Int16 e repassar. Qualquer coisa mais pesada aqui vira estalo no áudio.
 *
 * Vai como string porque um AudioWorklet precisa ser carregado de uma URL —
 * empacotar um arquivo separado quebraria no build do Capacitor, onde o caminho
 * dos assets muda.
 */
const WORKLET_SRC = `
class PcmForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!canal) return true;
    const pcm = new Int16Array(canal.length);
    for (let i = 0; i < canal.length; i++) {
      // Satura em vez de dar a volta: um estouro sem clamp vira estalo.
      const s = Math.max(-1, Math.min(1, canal[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}
registerProcessor("pcm-forwarder", PcmForwarder);
`;

/**
 * O aparelho oferece o necessário para a captura ao vivo?
 *
 * Checado ANTES de criar o AudioContext: um contexto criado e abandonado segura
 * o recurso de áudio do sistema, e no WebView do Android isso atrapalha a
 * própria gravação que continua rodando em paralelo.
 */
export function podeCapturarPcm(): boolean {
  const Ctx =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return !!Ctx && typeof AudioWorkletNode !== "undefined";
}

export async function startPcmCapture(
  stream: MediaStream,
  events: PcmCaptureEvents,
): Promise<PcmCapture> {
  if (!podeCapturarPcm()) {
    throw new Error("Este aparelho não suporta captura de áudio ao vivo.");
  }

  // Pedir 24kHz direto ao AudioContext evita reamostrar na mão: o navegador
  // faz isso melhor do que qualquer laço que escrevêssemos aqui.
  const ctx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });

  // A partir daqui o contexto existe: qualquer falha precisa fechá-lo, senão o
  // microfone fica preso até a página ser recarregada.
  try {
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    if (ctx.state !== "closed") void ctx.close().catch(() => {});
    throw e;
  }

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-forwarder");

  let ativo = true;
  let pausa = { ...ESTADO_PAUSA_INICIAL };

  const AMOSTRAS_POR_ENVIO = Math.round((PCM_SAMPLE_RATE * ENVIO_MS) / 1000);
  let acumulado = new Int16Array(AMOSTRAS_POR_ENVIO);
  let usado = 0;

  /** Manda o que está acumulado e avalia se este trecho fecha aqui. */
  const despachar = () => {
    if (usado === 0) return;
    const parte = acumulado.slice(0, usado);
    usado = 0;

    const rms = rmsDe(parte);
    events.onLevel?.(Math.min(1, rms * 4));

    // O áudio sai ANTES da decisão de cortar: o pedaço que revela a pausa
    // também é fala e precisa chegar ao servidor antes do commit.
    events.onChunk(parte.buffer as ArrayBuffer);

    const r = avaliarPausa(pausa, rms, parte.length / PCM_SAMPLE_RATE);
    pausa = r.estado;
    if (r.cortar) events.onPause?.();
  };

  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ativo) return;
    const amostras = new Int16Array(e.data);
    let lidas = 0;
    while (lidas < amostras.length) {
      const cabe = Math.min(AMOSTRAS_POR_ENVIO - usado, amostras.length - lidas);
      acumulado.set(amostras.subarray(lidas, lidas + cabe), usado);
      usado += cabe;
      lidas += cabe;
      if (usado === AMOSTRAS_POR_ENVIO) {
        despachar();
        // `slice` acima entregou o buffer para o WebSocket; recriar evita
        // sobrescrever o que ainda não foi serializado.
        acumulado = new Int16Array(AMOSTRAS_POR_ENVIO);
      }
    }
  };

  source.connect(node);
  // Sem destino o grafo não roda em alguns navegadores. Ganho zero para não
  // devolver a própria voz pelos alto-falantes.
  const mudo = ctx.createGain();
  mudo.gain.value = 0;
  node.connect(mudo);
  mudo.connect(ctx.destination);

  return {
    get active() {
      return ativo;
    },
    stop() {
      if (!ativo) return;
      // O resto do buffer ainda é fala: descartá-lo comeria a última sílaba.
      despachar();
      ativo = false;
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        mudo.disconnect();
      } catch {
        // Já desconectado — nada a fazer.
      }
      // Não paramos as tracks do stream: quem é dono dele é o `recorder`, que
      // grava em paralelo e o encerra no fim.
      if (ctx.state !== "closed") void ctx.close().catch(() => {});
    },
  };
}
