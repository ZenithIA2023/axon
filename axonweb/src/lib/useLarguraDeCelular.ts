/**
 * "A janela está em largura de celular?"
 *
 * Existe porque três pontos do app precisavam saber se devem renderizar o
 * shell de aplicativo (barra inferior, compositor na barra) e perguntavam
 * `isNative()` — ou seja, "sou o APK?". A pergunta certa é a largura: desde
 * 19/10/2026 a web em largura de celular serve como pré-visualização ao vivo do
 * design mobile, para conferir alterações sem instalar um APK a cada ajuste.
 *
 * O corte é 1024px, a mesma quebra que o `lg:` do Tailwind usa em todo o
 * projeto — manter um número só evita que a barra apareça numa largura e o
 * compositor troque em outra.
 */

import { useEffect, useState } from "react";

/**
 * Acima deste ponto é desktop. A consulta é pelo lado DESKTOP (e não
 * `max-width: 1023px`) para casar exatamente com o `lg:` do Tailwind, que é
 * `min-width: 1024px`: com `max-width` haveria 1px de desacordo na fronteira.
 */
const CONSULTA_DESKTOP = "(min-width: 1024px)";

/**
 * Versão não reativa, para quem precisa checar a largura DENTRO de um callback
 * ou efeito, onde um valor de render ficaria capturado velho.
 */
export function ehLarguraDeCelular(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia(CONSULTA_DESKTOP).matches;
}

/**
 * Versão reativa, para decidir o que renderizar. Reage ao redimensionamento
 * porque a pré-visualização é usada arrastando a janela: uma checagem só na
 * montagem deixaria o layout velho até um recarregamento.
 */
export function useLarguraDeCelular(): boolean {
  const [ehCelular, setEhCelular] = useState<boolean>(ehLarguraDeCelular);

  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_DESKTOP);
    const sincronizar = () => setEhCelular(!consulta.matches);

    // A janela pode ter mudado entre o primeiro render e este efeito (o
    // StrictMode do React 19 monta duas vezes em desenvolvimento).
    sincronizar();

    consulta.addEventListener("change", sincronizar);
    return () => consulta.removeEventListener("change", sincronizar);
  }, []);

  return ehCelular;
}
