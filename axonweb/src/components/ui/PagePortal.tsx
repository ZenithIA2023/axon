import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ===========================================================================
// PORTAL PARA PAINÉIS DA PÁGINA
// ===========================================================================
// Toda página envolve o conteúdo em `relative z-10` (para ficar acima do
// <Background />), e isso cria um CONTEXTO DE EMPILHAMENTO: um painel lá
// dentro com `z-[110]` vale 10 para o resto do app, e a BottomNav (`z-[90]`, na
// raiz do App) ficava por cima do botão de salvar (23/10/2026). Subir o z-index
// do painel nunca resolveria; tirar o `z-10` das páginas quebraria os fundos.
// O painel sai do contexto sendo renderizado direto no <body>.
//
// O que se perde no caminho é o escopo de tema da página: Planning, Dashboard e
// ChatConversation redefinem tokens (`--surface-*`, `--accent`...) numa classe
// `*-light-theme` do próprio <main>. Sem levar essa classe junto, os painéis
// mudariam de cor no tema claro. Por isso o portal descobre as classes de tema
// da página de onde foi montado e as repete num wrapper `display: contents` —
// os tokens herdam por ele, e ele não gera caixa nem pinta o fundo que a
// classe de tema também define.
const THEME_SCOPE_SUFFIX = "-light-theme";

// Procura a classe de tema, não o <main>: um painel aberto de dentro de outro
// (ex.: TaskTagsSheet) já está no <body>, e o ancestral com o tema é o wrapper
// do portal de fora.
function themeScopeOf(element: Element): string {
  const scoped = element.closest(`[class*="${THEME_SCOPE_SUFFIX}"]`);
  if (!scoped) return "";
  return Array.from(scoped.classList)
    .filter((name) => name.endsWith(THEME_SCOPE_SUFFIX))
    .join(" ");
}

export default function PagePortal({ children }: { children: ReactNode }) {
  // `null` = ainda não medido. A âncora só existe até a medição: deixada na
  // página, ela viraria o último filho do pai e mudaria seletores como o
  // `space-y-*` do Tailwind.
  const [scope, setScope] = useState<string | null>(null);

  const measure = useCallback((node: HTMLSpanElement | null) => {
    if (node) setScope(themeScopeOf(node));
  }, []);

  if (scope === null) {
    return <span ref={measure} hidden />;
  }

  return createPortal(
    <div className={scope} style={{ display: "contents" }}>
      {children}
    </div>,
    document.body
  );
}
