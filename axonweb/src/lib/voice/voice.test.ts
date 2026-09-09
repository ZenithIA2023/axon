/**
 * Testes das funções puras da voz: `sanitizeForSpeech` e `createSentenceQueue`.
 *
 * São as duas peças mais propensas a bug sutil da feature: um corte de frase
 * errado picota a fala ("Dr." virando duas frases), e um markdown que escapa é
 * lido literalmente em voz alta ("asterisco asterisco importante").
 *
 * O projeto não tem runner de teste configurado, então este arquivo é
 * auto-contido e roda direto, sem instalar nada:
 *
 *     cd axonweb && npx tsx src/lib/voice/voice.test.ts
 */

import { sanitizeForSpeech } from "./sanitize";
import { createSentenceQueue, splitSentences } from "./sentenceQueue";
import {
  avaliarPausa,
  ESTADO_PAUSA_INICIAL,
  rmsDe,
  type EstadoPausa,
} from "./pcmCapture";
import type { SpeechEngine } from "./tts";

let ok = 0;
let falhas = 0;

function eq(nome: string, obtido: unknown, esperado: unknown): void {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`FALHA ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}

/** Motor de voz falso: registra o que teria sido falado, sem tocar áudio. */
function motorFalso(): { engine: SpeechEngine; ditas: string[] } {
  const ditas: string[] = [];
  return {
    ditas,
    engine: {
      id: "native",
      isAvailable: true,
      speak: (t: string) => {
        ditas.push(t);
        return Promise.resolve();
      },
      cancel: () => {},
      warmup: () => Promise.resolve(),
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

async function main(): Promise<void> {
  console.log("\n— sanitizeForSpeech —");
  eq("negrito", sanitizeForSpeech("Isso é **muito** importante"), "Isso é muito importante");
  eq("lista", sanitizeForSpeech("- Primeiro item\n- Segundo item"), "Primeiro item Segundo item");
  eq("lista numerada", sanitizeForSpeech("1. Fazer isso\n2. Depois aquilo"), "Fazer isso Depois aquilo");
  eq("título", sanitizeForSpeech("## Seu dia\nVamos lá"), "Seu dia Vamos lá");
  eq("hora", sanitizeForSpeech("Marquei para 14:30"), "Marquei para 14 e 30");
  eq("hora cheia", sanitizeForSpeech("Começa 09:00"), "Começa 9 horas");
  eq("data ISO", sanitizeForSpeech("No dia 2026-03-15"), "No dia 15 de março");
  eq("emoji", sanitizeForSpeech("Pronto! 🎉 Tudo certo"), "Pronto! Tudo certo");
  eq("link", sanitizeForSpeech("Veja [o painel](https://x.com/y)"), "Veja o painel");
  eq("código inline", sanitizeForSpeech("Use `npm run dev` aqui"), "Use npm run dev aqui");
  eq("parágrafo vira pausa", sanitizeForSpeech("Primeira ideia.\n\nSegunda ideia."), "Primeira ideia. Segunda ideia.");
  eq("proporção não é hora", sanitizeForSpeech("A proporção é 30:70"), "A proporção é 30:70");
  eq("só emoji não sobra nada", sanitizeForSpeech("🎉"), "");

  console.log("\n— sentenceQueue —");

  let f = motorFalso();
  let q = createSentenceQueue(f.engine);
  q.push("Vamos organizar seu dia com calma. Comece pela tarefa mais pesada agora. ");
  q.flush();
  await tick();
  eq("duas frases num delta", f.ditas, [
    "Vamos organizar seu dia com calma.",
    "Comece pela tarefa mais pesada agora.",
  ]);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  for (const c of ["Vamos ", "organizar ", "o seu dia ", "de hoje. ", "Depois ", "a gente ", "revisa tudo isso."]) {
    q.push(c);
  }
  q.flush();
  await tick();
  eq("chegando delta a delta (SSE)", f.ditas, [
    "Vamos organizar o seu dia de hoje.",
    "Depois a gente revisa tudo isso.",
  ]);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  q.push("Sua consulta com o Dr. Silva custa R$ 150.50 no total. ");
  q.flush();
  await tick();
  eq("não corta em abreviação nem decimal", f.ditas, [
    "Sua consulta com o Dr. Silva custa R$ 150.50 no total.",
  ]);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  q.push("Ok. ");
  await tick();
  eq("fragmento curto espera", f.ditas, []);
  q.push("Vou marcar isso para amanhã de manhã. ");
  q.flush();
  await tick();
  eq("fragmento curto junta com a próxima", f.ditas, ["Ok. Vou marcar isso para amanhã de manhã."]);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  q.push("Isso é **muito** importante para o seu foco de hoje! ");
  q.flush();
  await tick();
  eq("markdown some antes de falar", f.ditas, ["Isso é muito importante para o seu foco de hoje!"]);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  q.push("Primeira frase completa aqui agora. ");
  q.cancel();
  q.push("Não deve falar isso nunca mais.");
  q.flush();
  await tick();
  eq("cancel descarta o resto", f.ditas, ["Primeira frase completa aqui agora."]);

  f = motorFalso();
  let idle = 0;
  q = createSentenceQueue(f.engine, { onIdle: () => idle++ });
  q.push("Terminamos por aqui o seu planejamento. ");
  q.flush();
  await new Promise((r) => setTimeout(r, 20));
  eq("onIdle dispara no fim", idle > 0, true);

  f = motorFalso();
  q = createSentenceQueue(f.engine);
  q.push("Quer que eu marque para as nove da manhã? Posso ajustar depois. ");
  q.flush();
  await tick();
  eq("interrogação fecha frase", f.ditas, [
    "Quer que eu marque para as nove da manhã?",
    "Posso ajustar depois.",
  ]);


  // ------------------------------------------------------------------------
  // splitSentences — usado pela tela de voz para destacar a frase que está
  // sendo dita. Ele PRECISA cortar igual à fila: se divergir, o destaque fica
  // uma frase à frente ou atrás do áudio, que é o defeito mais visível que a
  // página pode ter.
  // ------------------------------------------------------------------------
  console.log("\n— splitSentences —");

  /** Confere que a tela e a fala chegam às MESMAS frases para um texto. */
  async function mesmoCorte(nome: string, texto: string) {
    const m = motorFalso();
    const fila = createSentenceQueue(m.engine);
    fila.push(texto);
    fila.flush();
    await tick();
    eq(nome, splitSentences(texto), m.ditas);
  }

  await mesmoCorte(
    "abreviação não vira duas frases",
    "Marquei a consulta com o Dr. Silva às 9h de terça. Também avisei a Camila por e-mail.",
  );
  await mesmoCorte(
    "decimal não vira duas frases",
    "O orçamento fechou em R$ 1.500 este mês. Isso abre espaço para a viagem de julho.",
  );
  await mesmoCorte(
    "fragmento curto junta com a próxima",
    "Feito! Agendei a reunião para as 14h e movi a revisão para depois do almoço.",
  );
  await mesmoCorte(
    "resposta de três frases",
    "Movi a revisão do capítulo 2 para sábado às 10h. Sua sexta ficou com 4h30 de agenda. Quer que eu te lembre?",
  );

  eq("texto vazio não gera frase", splitSentences("   "), []);
  eq("frase sem pontuação final ainda conta", splitSentences("Criei a tarefa"), ["Criei a tarefa"]);

  // ------------------------------------------------------------------------
  // avaliarPausa — decide onde a transcrição ao vivo corta a fala em trechos.
  // Cortar cedo demais picota a frase e piora o texto (o modelo perde o
  // contexto); cortar tarde demais deixa a tela vazia enquanto a pessoa fala.
  // ------------------------------------------------------------------------
  console.log("\n— avaliarPausa —");

  const VOZ = 0.2;      // bem acima do limiar
  const SILENCIO = 0.001; // bem abaixo
  const BLOCO = 0.1;    // 100ms, o tamanho que o worklet entrega

  /** Roda uma sequência de (rms, segundos) e devolve onde cortou. */
  function correr(passos: Array<[number, number]>): number[] {
    let estado: EstadoPausa = { ...ESTADO_PAUSA_INICIAL };
    const cortes: number[] = [];
    let t = 0;
    for (const [rms, dur] of passos) {
      t += dur;
      const r = avaliarPausa(estado, rms, dur);
      estado = r.estado;
      if (r.cortar) cortes.push(Number(t.toFixed(1)));
    }
    return cortes;
  }

  const bloco = (rms: number, segundos: number): Array<[number, number]> =>
    Array.from({ length: Math.round(segundos / BLOCO) }, () => [rms, BLOCO] as [number, number]);

  eq("silêncio curto no meio da fala não corta",
    correr([...bloco(VOZ, 3), ...bloco(SILENCIO, 0.2), ...bloco(VOZ, 2)]), []);

  eq("pausa real depois de fala suficiente corta",
    correr([...bloco(VOZ, 3), ...bloco(SILENCIO, 0.4)]), [3.4]);

  eq("pausa longa logo no início não corta (frase curta demais)",
    correr([...bloco(VOZ, 0.5), ...bloco(SILENCIO, 1)]), []);

  // Sem teto, quem fala sem parar ficaria até 60s (o limite do recorder) sem
  // ver nada na tela.
  eq("fala contínua corta no teto de 12s",
    correr(bloco(VOZ, 30)), [12.1, 24.2]);

  eq("duas frases com pausa entre elas dão dois cortes",
    correr([
      ...bloco(VOZ, 3), ...bloco(SILENCIO, 0.4),
      ...bloco(VOZ, 3), ...bloco(SILENCIO, 0.4),
    ]).length, 2);

  console.log("\n— rmsDe —");
  eq("silêncio digital", rmsDe(new Int16Array(100)), 0);
  eq("bloco vazio não divide por zero", rmsDe(new Int16Array(0)), 0);
  eq("amplitude cheia satura em 1", Math.round(rmsDe(new Int16Array(50).fill(32767))), 1);
  eq("voz típica fica acima do limiar de silêncio", rmsDe(new Int16Array(50).fill(3000)) > 0.012, true);

  console.log(`\n${ok} passaram, ${falhas} falharam`);
  // Sai com código 1 quando algo falha, para servir em CI. `process` só existe
  // no Node (este arquivo não vai para o bundle do navegador) e o projeto não
  // tem @types/node, então o acesso é feito sem depender do tipo global.
  if (falhas > 0) {
    (globalThis as { process?: { exit: (code: number) => void } }).process?.exit(1);
  }
}

void main();