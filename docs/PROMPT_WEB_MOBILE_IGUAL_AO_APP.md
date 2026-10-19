# Prompt — Web em largura de celular idêntica ao app

Leia `AGENTS.md` antes de mexer.

---

## Objetivo

Fazer o site, **quando aberto em largura de celular**, renderizar exatamente
como o APK. O desktop **não muda**.

## Por quê

Decisão do Bernardo e da sócia (19/10/2026): a versão web para celular deixa de
ser produto para o público geral e passa a servir como **pré-visualização ao
vivo do design mobile**, para a colega conferir alterações sem instalar um APK
a cada ajuste.

A versão **desktop web continua existindo como produto** e já tem design
próprio, deliberadamente diferente. Nada do desktop deve ser tocado.

---

## O que NÃO mudar

`isNative()` é chamado em 10 lugares. **Sete são comportamento e devem ficar
exatamente como estão.** Alterá-los quebra o app:

| Arquivo | Linha | O que quebra se mexer |
|---|---|---|
| `lib/nativeAuth.ts` | 28 | a web passaria a mandar `platform=mobile`, e o backend redirecionaria para `tech.axonapp.app:///#/…` — deep link que o navegador não abre. **Login com Google não volta.** |
| `lib/nativeAuth.ts` | 48 | abre o OAuth no navegador do sistema (plugin do Capacitor) |
| `lib/nativeAuth.ts` | 87 | ouvinte de deep link; não existe na web |
| `lib/api.ts` | 161 | manda para `#/login` (HashRouter). Na web, com BrowserRouter, `#/login` não navega — só acrescenta hash. **Sessão expirada prende o usuário.** |
| `lib/api.ts` | 1189 | idem |
| `lib/api.ts` | 265 | `remember \|\| isNative()`. Sem isso a web gravaria sessão sempre no `localStorage`, ignorando o "lembrar de mim" — mesma classe do vazamento entre contas corrigido em setembro |
| `lib/api.ts` | 336 | registro do token de push (FCM); não existe na web |
| `pages/Signup.tsx` | 22 | URL absoluta das páginas legais, necessária porque o app serve de origem local |

---

## O que mudar

Os três pontos abaixo fazem a **pergunta errada**. Eles perguntam "sou o app?"
quando o que importa é "estou em largura de celular?". Não é para criar um
sinalizador paralelo: é para trocar a condição.

### 1. Hook novo

Criar `axonweb/src/lib/useLarguraDeCelular.ts`:

```ts
/**
 * Verdadeiro abaixo de 1024px — a mesma quebra que o `lg:` do Tailwind usa em
 * todo o projeto (ver `Chat.tsx`, que separa mobile e desktop nesse ponto).
 *
 * Precisa ser REATIVO: a colega redimensiona o navegador para conferir o
 * design, e uma checagem só na montagem ficaria velha.
 */
export function useLarguraDeCelular(): boolean
```

Implementação com `window.matchMedia("(min-width: 1024px)")` mais listener de
mudança, limpo no cleanup do `useEffect` (AGENTS.md §5).

Já existe `isDesktopChatViewport()` em `Chat.tsx:159`, local e não reativa.
**Não precisa unificar agora** — mas se for trivial, prefira reaproveitar o
hook lá também, em vez de manter duas definições do mesmo limite.

### 2. `components/layout/BottomNav.tsx`, linha ~691

```tsx
export function BottomNavGate() {
  if (!isNative()) return null;      // ← hoje
  return <BottomNav />;
}
```

Passa a esconder por **largura**, não por plataforma.

**Crítico: desmonte, não esconda por CSS.** O `styles/index.css` tem a regra
`body:has([data-bottom-nav]) main:not(.h-\[100dvh\])`, que reserva espaço no
rodapé. O `:has()` enxerga o elemento mesmo invisível — usar `lg:hidden`
deixaria um vão morto no rodapé de todo o desktop.

### 3. `pages/ChatConversation.tsx`, linha 397

```tsx
const temComposerNativo = isNative();   // ← hoje
```

Passa a vir do hook. Os dois usos (linhas ~1457 e ~1599) seguem a mesma lógica
que já têm: o compositor da conversa some e o espaçador da barra aparece.

Renomeie a variável — `temComposerNativo` deixa de descrever o que ela é.
Algo como `usaComposerDaBarra`.

### 4. `main.tsx`, linha 11

```tsx
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("is-native");
}
```

Passa a ser **sempre aplicada**, sem condição.

Isso é o que liga as regras de safe area e o espaçamento da barra inferior.
Na web o `env(safe-area-inset-*)` vale zero, então nada de ruim acontece — as
regras existem mas não reservam espaço.

**Não renomeie a classe.** O nome vira impreciso, mas renomear mexe em ~15
regras do `index.css` sem ganho funcional, e errar uma é mais caro que o
incômodo. Atualize o comentário acima dela explicando que hoje ela marca o
"shell de aplicativo", não a plataforma.

---

## O limite que precisa ficar claro para a colega

**Safe area não dá para replicar no navegador.** `env(safe-area-inset-*)` vale
zero onde não há entalhe nem barra do sistema.

Ou seja: a pré-visualização mostra **estrutura** igual — barra inferior,
compositor, layout, componentes, cores — mas não o respiro das bordas do
aparelho. Bugs de corte no topo ou no rodapé continuam só aparecendo no APK.

Vale deixar isso escrito onde a colega vá ler, não só no código.

---

## Verificação

**No navegador, abaixo de 1024px:**

1. A barra inferior aparece
2. Dentro de uma conversa há **um** campo de mensagem, o da barra — não dois
3. O botão de microfone da barra navega para `/voz` e **não** pede permissão de
   microfone
4. Enviar pela barra entrega a mensagem na conversa (o `state.draft` continua
   funcionando)

**No navegador, a partir de 1024px:**

5. Nada mudou: Sidebar, compositor dentro da conversa, **sem** barra inferior
6. **Sem vão morto no rodapé** — é o sintoma de ter escondido por CSS em vez de
   desmontar

**Redimensionando:**

7. Arrastar a janela através de 1024px troca o layout na hora, sem recarregar

**No APK:**

8. Nada mudou. Gere com `./scripts/build-apk.sh` e confira a barra, o
   compositor e o espaçamento do rodapé.

## Definition of Done

```bash
cd axonweb && npm run lint
cd axonweb && npx tsc --noEmit -p tsconfig.json
cd axonweb && npm run build
cd axonweb && npx tsx src/lib/voice/voice.test.ts
```

Mais: console sem erro novo, nenhum `setInterval`/listener sem cleanup, e o
item 8 conferido no aparelho — a mudança toca layout nativo.

Não commite — o Bernardo faz os commits.
