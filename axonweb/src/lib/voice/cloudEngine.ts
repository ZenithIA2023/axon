/**
 * Voz neural, gerada no servidor (Google / ElevenLabs / OpenAI).
 *
 * Substitui a voz nativa, que foi testada e reprovada por soar artificial. Como
 * implementa a mesma interface `SpeechEngine`, nada fora daqui precisou mudar —
 * era exatamente para isto que a fronteira existia.
 *
 * O detalhe que faz a diferença: o áudio da PRÓXIMA frase é buscado enquanto a
 * atual ainda toca. Sem isso haveria um silêncio de ~1s entre cada frase, e a
 * fala soaria mais picotada que a voz nativa que estamos substituindo.
 */

import * as api from "../api";
import type { SpeechEngine } from "./tts";
import { loadVoicePrefs } from "./tts";

/** Um pedido de fala que já pode estar em voo. */
interface Pedido {
  texto: string;
  audio: Promise<Blob>;
  controller: AbortController;
}

export function createCloudEngine(): SpeechEngine {
  let cancelado = false;

  /**
   * Frases já sendo baixadas enquanto a atual toca, na ordem em que chegaram.
   *
   * É uma lista e não um único pedido porque a fila adianta o áudio assim que
   * cada frase CHEGA do stream: duas frases próximas guardariam só a última, e
   * a primeira seria abortada justamente para ser pedida de novo um instante
   * depois — o silêncio que o prefetch existe para evitar.
   *
   * O teto é baixo de propósito: cada item é uma chamada paga ao TTS, e mais
   * que isso seria adiantar áudio que o usuário pode interromper antes de ouvir.
   */
  const precarregados: Pedido[] = [];
  const MAX_PRECARGA = 3;

  const descartarPrecargas = () => {
    for (const p of precarregados) p.controller.abort();
    precarregados.length = 0;
  };

  /**
   * Uma URL por elemento: revogar a do que ainda está tocando cortaria a fala
   * no meio. Cada posição é liberada só quando aquele elemento recebe outra.
   */
  const urls: (string | null)[] = [null, null];

  const trocarUrl = (i: number, nova: string | null) => {
    const antiga = urls[i];
    if (antiga) URL.revokeObjectURL(antiga);
    urls[i] = nova;
  };

  const liberarUrls = () => {
    trocarUrl(0, null);
    trocarUrl(1, null);
  };

  /** O áudio já carregado no elemento livre, esperando a vez. */
  let preparado: { blob: Blob } | null = null;

  /**
   * Carrega um blob no elemento ocioso e manda decodificar.
   *
   * `load()` é o que faz o navegador buscar e decodificar sem esperar o
   * `play()` — é justamente esse trabalho que, feito na hora da troca, aparece
   * como a travada depois do ponto.
   */
  const prepararNoLivre = (blob: Blob) => {
    const i = 1 - atual;
    const url = URL.createObjectURL(blob);
    trocarUrl(i, url);
    const el = elemento(i);
    el.onended = null;
    el.onerror = null;
    el.onpause = null;
    el.src = url;
    el.load();
    preparado = { blob };
  };

  /** Adianta a decodificação da próxima frase já baixada, se houver. */
  const prepararProxima = async () => {
    if (cancelado || preparado) return;
    const proximo = precarregados[0];
    if (!proximo) return;
    try {
      const blob = await proximo.audio;
      // Entre o await e aqui a fala pode ter sido cancelada ou a fila mudado.
      if (cancelado || preparado || precarregados[0] !== proximo) return;
      prepararNoLivre(blob);
    } catch {
      // Falha no pré-carregamento: `speak` tentará de novo pelo caminho normal.
    }
  };

  /**
   * DOIS elementos que se alternam, não um só.
   *
   * Com um único <audio>, cada frase troca o `src` do mesmo elemento — e trocar
   * o src descarta o buffer decodificado e obriga o navegador a decodificar de
   * novo antes de `play()` resolver. Isso é sentido como uma travada logo depois
   * do ponto, mesmo quando o arquivo já estava baixado.
   *
   * Alternando, a frase seguinte é carregada e decodificada no elemento ocioso
   * ENQUANTO a atual toca no outro; na troca só resta chamar `play()` num
   * elemento que já está pronto.
   *
   * Dois bastam: são sempre "o que toca" e "o que prepara". Um terceiro não
   * teria o que fazer, e criar um por frase vaza memória no iOS.
   */
  const elementos: HTMLAudioElement[] = [];
  let atual = 0;

  const criarElemento = (): HTMLAudioElement => {
    const el = new Audio();
    el.preload = "auto";
    // Sem isto, o WebView do celular pode assumir o áudio num player nativo em
    // tela cheia — o app sumiria da frente enquanto o Axon fala. Vai por
    // atributo porque a propriedade só é tipada em <video>, mas o WebView
    // respeita nos dois. Inofensivo no desktop, que ignora.
    el.setAttribute("playsinline", "");
    return el;
  };

  const elemento = (i: number): HTMLAudioElement => {
    while (elementos.length <= i) elementos.push(criarElemento());
    return elementos[i];
  };

  /** O que está tocando agora. */
  const elementoAtual = () => elemento(atual);
  /** O ocioso, onde a próxima frase é preparada. */
  const elementoLivre = () => elemento(1 - atual);

  const buscar = (texto: string): Pedido => {
    const prefs = loadVoicePrefs();
    const controller = new AbortController();
    return {
      texto,
      controller,
      audio: api.synthesizeSpeech(
        texto,
        prefs.voiceURI ?? null,
        prefs.rate,
        controller.signal,
      ),
    };
  };

  const engine: SpeechEngine = {
    id: "cloud",

    // Depende do servidor, não do aparelho. Se o provedor falhar, `speak`
    // rejeita e quem chama decide — não dá para saber antes.
    isAvailable: true,

    async warmup() {
      cancelado = false;
      // Tocar um áudio vazio dentro do gesto do usuário destrava o autoplay.
      // Sem isto a primeira frase é bloqueada pelo navegador.
      try {
        // Os dois precisam ser destravados: o autoplay é liberado por elemento,
        // e o segundo só entraria em ação na 2ª frase — quando o gesto do
        // usuário já expirou e o navegador bloquearia a reprodução.
        for (const el of [elemento(0), elemento(1)]) {
          el.src =
          "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjEyLjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//8AAAAATGF2YzU4LjE4AAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZCIP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
          el.volume = 0;
          await el.play().catch(() => {});
          el.pause();
          el.volume = 1;
        }
      } catch {
        // Warmup é otimização; a fala ainda tem chance de funcionar sem ele.
      }
    },

    speak(text, opts) {
      if (cancelado || !text.trim()) return Promise.resolve();

      // Se já pré-carregamos exatamente esta frase, reaproveita o download.
      const i = precarregados.findIndex((p) => p.texto === text);
      let pedido: Pedido;
      if (i >= 0) {
        pedido = precarregados[i];
        // Sai da lista, junto com o que ficou para trás: se estamos falando
        // esta, as anteriores não serão mais ditas.
        for (const antigo of precarregados.splice(0, i + 1)) {
          if (antigo !== pedido) antigo.controller.abort();
        }
      } else {
        pedido = buscar(text);
      }

      return new Promise<void>((resolve) => {
        let terminou = false;
        const finalizar = () => {
          if (terminou) return;
          terminou = true;
          opts?.signal?.removeEventListener("abort", aoAbortar);
          resolve();
        };

        const aoAbortar = () => {
          pedido.controller.abort();
          // Pausa os dois: o abort pode chegar antes da troca de elemento, e
          // pausar só o "atual" deixaria o outro tocando. O handler sai antes,
          // para o nosso pause não ser lido como interrupção do sistema.
          for (const el of elementos) {
            el.onpause = null;
            el.pause();
          }
          finalizar();
        };
        opts?.signal?.addEventListener("abort", aoAbortar, { once: true });

        pedido.audio
          .then((blob) => {
            if (cancelado || opts?.signal?.aborted) return finalizar();

            // Se esta frase já foi preparada no elemento livre, o áudio está
            // decodificado e é só tocar. Senão, prepara agora (custa a
            // decodificação, que é o que estamos tentando evitar).
            if (preparado?.blob !== blob) {
              prepararNoLivre(blob);
            }
            // O que estava livre passa a ser o atual.
            atual = 1 - atual;
            preparado = null;

            const el = elementoAtual();
            el.onended = finalizar;
            el.onerror = () => {
              console.warn("[voz] falha ao tocar o áudio");
              finalizar();
            };
            // O sistema pode pausar por conta própria — uma ligação chegando,
            // outro app tomando o áudio. Sem tratar, `onended` nunca dispara e
            // a fila fica travada esperando uma frase que não vai terminar.
            // Só conta como interrupção se ainda faltava áudio: o `pause` que
            // alguns navegadores emitem junto com o fim natural é ignorado.
            el.onpause = () => {
              if (!el.ended && el.currentTime > 0) finalizar();
            };
            void el.play().catch((e) => {
              // Autoplay bloqueado: o gesto do usuário expirou.
              console.warn("[voz] reprodução bloqueada:", e?.name ?? e);
              finalizar();
            });

            // Com esta tocando, o outro elemento volta a ficar livre para a
            // próxima — e a próxima já pode estar baixada.
            void prepararProxima();
          })
          .catch((e) => {
            if (e?.name !== "AbortError") {
              console.warn("[voz] falha ao gerar a fala:", e?.message ?? e);
            }
            finalizar();
          });
      });
    },

    /**
     * Começa a baixar uma frase antes de ela ser falada. O SentenceQueue chama
     * isto para a próxima da fila enquanto a atual ainda toca.
     */
    prefetch(text: string) {
      if (cancelado || !text.trim()) return;
      // Já pedido: não paga a mesma síntese duas vezes.
      if (precarregados.some((p) => p.texto === text)) return;
      if (precarregados.length >= MAX_PRECARGA) return;

      const pedido = buscar(text);
      precarregados.push(pedido);
      // Sem isto, uma falha no pré-carregamento vira "unhandled rejection" no
      // console; o erro real é tratado quando `speak` consome a mesma promise.
      pedido.audio.catch(() => {});
    },

    cancel() {
      cancelado = true;
      descartarPrecargas();
      for (const el of elementos) {
        // Zera o handler ANTES de pausar: senão o nosso próprio pause dispara
        // a lógica de interrupção durante o cancelamento.
        el.onpause = null;
        el.pause();
        el.onended = null;
        el.onerror = null;
        el.removeAttribute("src");
      }
      preparado = null;
      liberarUrls();
      // Um cancel não é permanente: a próxima resposta volta a falar.
      queueMicrotask(() => {
        cancelado = false;
      });
    },
  };

  return engine;
}
