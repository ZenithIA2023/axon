/**
 * Corta o texto que chega em streaming em FRASES e vai mandando falar.
 *
 * Sem isto o Axon só começaria a falar depois da resposta inteira pronta — o que
 * medimos em ~8,5s numa pergunta comum. Falando por frase, a voz começa assim
 * que a primeira termina (~2,5s) e o resto chega enquanto ele já está falando.
 *
 * Os cuidados que fazem a diferença entre soar natural e soar picotado:
 *  - não cortar em "14.30", "Dr." ou "ex." (ponto que não termina frase);
 *  - não falar um fragmento curto demais ("Ok.") isolado;
 *  - falar mesmo sem pontuação se o texto parar de chegar (o modelo pausou para
 *    chamar uma ferramenta e a frase ficaria pendurada).
 */

import type { SpeechEngine } from "./tts";
import { sanitizeForSpeech } from "./sanitize";

/** Curto demais para valer uma fala isolada; espera o próximo trecho. */
const MIN_CHARS = 25;

/**
 * Mínimo da PRIMEIRA frase da resposta, mais baixo que o das seguintes.
 *
 * O Axon abre muita resposta com "Feito!", "Claro." ou "Pronto." — com o mínimo
 * de 25 a fala inteira ficava esperando a frase seguinte fechar, o que atrasa o
 * primeiro som em segundos. No meio da resposta segurar é certo (evita picotar);
 * na abertura, o silêncio custa mais que o picote, porque é o intervalo em que
 * a pessoa não sabe se foi ouvida.
 */
const MIN_CHARS_PRIMEIRA = 6;

/**
 * Até quantos caracteres juntar num único áudio ao tirar frases da fila.
 *
 * Cada frase falada isolada é uma emenda entre dois áudios, e emenda é onde a
 * fala soa travada. Quando várias frases curtas já chegaram ("A primeira é... A
 * segunda é..."), falá-las num pedido só elimina essas emendas e deixa a
 * entonação ligada, porque o TTS vê a sequência inteira.
 *
 * O teto existe porque a latência do TTS cresce com o texto (medido: 753ms para
 * uma frase, 3160ms para 308 caracteres): juntar demais atrasaria o início.
 * Só junta o que JÁ chegou — nunca espera texto novo para completar o grupo.
 */
const AGRUPAR_ATE_CHARS = 180;

/** Sem novos deltas por este tempo, fala o que tiver acumulado. */
const IDLE_FLUSH_MS = 2_500;

/** Nunca segurar mais que isto sem falar, mesmo sem pontuação. */
const MAX_BUFFER = 320;

/**
 * Abreviações comuns em PT-BR cujo ponto NÃO termina a frase.
 * Sem isto, "às 9h com o Dr. Silva" viraria duas falas.
 */
const ABREVIACOES = [
  "sr", "sra", "srta", "dr", "dra", "prof", "profa", "eng",
  "ex", "etc", "ref", "obs", "pág", "art", "av", "núm", "no",
  "seg", "ter", "qua", "qui", "sex", "sáb", "dom",
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** True se o ponto em `idx` fecha uma frase de verdade. */
function fimDeFrase(texto: string, idx: number): boolean {
  const ch = texto[idx];
  if (ch !== "." ) return true; // ! ? … sempre fecham

  // Número dos dois lados: "14.30", "R$ 1.500" — não é fim de frase.
  const antes = texto[idx - 1];
  const depois = texto[idx + 1];
  if (/\d/.test(antes ?? "") && /\d/.test(depois ?? "")) return false;

  // Reticências em pontos separados: deixa o último decidir.
  if (depois === ".") return false;

  const palavra = texto.slice(0, idx).match(/([\p{L}]+)$/u)?.[1]?.toLowerCase();
  if (palavra && ABREVIACOES.includes(palavra)) return false;

  // Inicial de nome: "J. Silva".
  if (palavra && palavra.length === 1) return false;

  return true;
}

/**
 * Acha o fim da primeira frase completa do buffer.
 * Devolve o índice logo APÓS o separador, ou -1 se ainda não há frase fechada.
 */
function proximoCorte(buffer: string): number {
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    if (!fimDeFrase(buffer, i)) continue;

    // Consome pontuação repetida ("?!", "...").
    let fim = i + 1;
    while (fim < buffer.length && /[.!?…]/.test(buffer[fim])) fim++;

    // Só corta se vier espaço/quebra depois — senão a frase pode continuar
    // (ainda estamos no meio de um delta do stream).
    if (fim < buffer.length && !/\s/.test(buffer[fim])) continue;

    if (fim >= buffer.length) return -1; // pode chegar mais pontuação
    return fim;
  }
  return -1;
}

/**
 * Divide um texto COMPLETO nas mesmas frases que a fila falaria.
 *
 * Existe para a tela de voz destacar a frase que está sendo dita: sem usar a
 * mesma regra de corte, o destaque apontaria para a frase errada em qualquer
 * resposta com "Dr. Silva", "R$ 1.500" ou um "Feito!" curto no começo — o
 * `proximoCorte` protege esses casos e uma regex ingênua não.
 *
 * Diferente do streaming, aqui o texto já chegou inteiro: não há motivo para
 * segurar o resto, então o que sobra no fim vira a última frase.
 */
export function splitSentences(texto: string): string[] {
  const frases: string[] = [];
  let buffer = texto;

  for (;;) {
    const corte = proximoCorte(buffer);
    if (corte === -1) break;

    const frase = buffer.slice(0, corte).trim();
    // Mesma regra da fila, INCLUSIVE o mínimo menor da primeira frase: uma
    // abertura curta ("Feito!") é falada sozinha, e se aqui ela fosse juntada
    // à seguinte o destaque na tela ficaria uma frase adiantado em relação ao
    // áudio — o defeito mais visível que a página de voz pode ter.
    const minimo = frases.length === 0 ? MIN_CHARS_PRIMEIRA : MIN_CHARS;
    if (frase.length < minimo && buffer.length < MAX_BUFFER) {
      const proximo = proximoCorte(buffer.slice(corte));
      if (proximo === -1) break;
      const junto = buffer.slice(0, corte + proximo).trim();
      frases.push(junto);
      buffer = buffer.slice(corte + proximo);
      continue;
    }

    frases.push(frase);
    buffer = buffer.slice(corte);
  }

  const resto = buffer.trim();
  if (resto) frases.push(resto);
  return frases;
}

export interface SentenceQueue {
  /** Recebe cada delta de texto do stream. */
  push(chunk: string): void;
  /** Fim do stream: fala o que sobrou no buffer. */
  flush(): void;
  /** Para tudo e descarta o que não foi falado. */
  cancel(): void;
}

export interface SentenceQueueOptions {
  /** Chamado quando uma frase COMEÇA a ser falada (para destacar na tela). */
  onSentenceStart?: (frase: string) => void;
  /** Chamado quando a fila esvazia e nada mais está sendo falado. */
  onIdle?: () => void;
}

export function createSentenceQueue(
  engine: SpeechEngine,
  options: SentenceQueueOptions = {},
): SentenceQueue {
  let buffer = "";
  let cancelado = false;
  let falando = false;
  // Nada foi falado ainda nesta resposta: a primeira frase pode sair mais curta.
  let primeira = true;
  const pendentes: string[] = [];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const limparTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  /**
   * Tira da fila o próximo bloco a falar, juntando as frases curtas que já
   * chegaram. Nunca espera: junta só o que está disponível agora.
   */
  const proximoBloco = (): string => {
    let bloco = pendentes.shift()!;
    while (
      pendentes.length > 0 &&
      bloco.length + 1 + pendentes[0].length <= AGRUPAR_ATE_CHARS
    ) {
      bloco += " " + pendentes.shift()!;
    }
    return bloco;
  };

  /** Fala a fila em ordem, um bloco por vez. */
  const bombear = async () => {
    if (falando || cancelado) return;
    falando = true;
    while (pendentes.length > 0 && !cancelado) {
      const bloco = proximoBloco();
      options.onSentenceStart?.(bloco);
      await engine.speak(bloco);
    }
    falando = false;
    if (!cancelado && pendentes.length === 0) options.onIdle?.();
  };

  const enfileirar = (bruto: string) => {
    const limpo = sanitizeForSpeech(bruto);
    // Depois de limpar pode não sobrar nada pronunciável (só um emoji, p.ex.).
    if (!/[\p{L}\p{N}]/u.test(limpo)) return;
    primeira = false;
    pendentes.push(limpo);

    // Adianta o áudio no momento em que a frase CHEGA, não quando a anterior
    // começa a tocar.
    //
    // A versão anterior fazia isto dentro de `bombear`, olhando para a próxima
    // da fila — mas o texto vem em streaming: quando a 1ª frase começa a
    // tocar, a 2ª quase nunca chegou ainda, então a fila estava vazia e o
    // prefetch nunca acontecia. Medido numa resposta de 3 frases: nenhuma das
    // três pegava cache, e cada uma custava ~1s de silêncio antes de sair.
    //
    // Aqui a frase chega enquanto a anterior ainda toca (~3s de áudio contra
    // ~1s de síntese), então o áudio fica pronto antes de ser preciso.
    if (falando) engine.prefetch?.(limpo);

    void bombear();
  };

  /** Tira do buffer todas as frases já fechadas. */
  const drenar = () => {
    for (;;) {
      const corte = proximoCorte(buffer);
      if (corte === -1) break;

      const frase = buffer.slice(0, corte).trim();
      // Fragmento curto ("Ok.") espera o próximo trecho para não picotar —
      // a menos que o buffer já esteja grande, e aí segurar é pior.
      const minimo = primeira ? MIN_CHARS_PRIMEIRA : MIN_CHARS;
      if (frase.length < minimo && buffer.length < MAX_BUFFER) break;

      buffer = buffer.slice(corte);
      enfileirar(frase);
    }

    // Sem pontuação e já muito longo: fala assim mesmo, cortando no último
    // espaço para não partir palavra ao meio.
    if (buffer.length > MAX_BUFFER) {
      const corte = buffer.lastIndexOf(" ", MAX_BUFFER);
      const at = corte > MIN_CHARS ? corte : MAX_BUFFER;
      enfileirar(buffer.slice(0, at).trim());
      buffer = buffer.slice(at);
    }
  };

  const agendarIdle = () => {
    limparTimer();
    idleTimer = setTimeout(() => {
      // O stream parou (provavelmente uma ferramenta rodando). Não deixa a
      // frase pendurada em silêncio.
      const resto = buffer.trim();
      if (resto.length >= MIN_CHARS) {
        buffer = "";
        enfileirar(resto);
      }
    }, IDLE_FLUSH_MS);
  };

  return {
    push(chunk: string) {
      if (cancelado || !chunk) return;
      buffer += chunk;
      drenar();
      agendarIdle();
    },

    flush() {
      if (cancelado) return;
      limparTimer();
      const resto = buffer.trim();
      buffer = "";
      if (resto) enfileirar(resto);
      // Stream acabou sem nada para falar e nada em voo: já está ocioso.
      if (!falando && pendentes.length === 0) options.onIdle?.();
    },

    cancel() {
      cancelado = true;
      limparTimer();
      buffer = "";
      primeira = true;
      pendentes.length = 0;
      engine.cancel();
    },
  };
}
