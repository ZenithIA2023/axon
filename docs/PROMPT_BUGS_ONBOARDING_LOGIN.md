# Prompt — Onboarding preso, mensagem de login e carimbo de build

Três problemas encontrados nos testes de 23/10/2026. Leia o `AGENTS.md`
antes de mexer em qualquer coisa.

Ordenadas por gravidade: a Tarefa 1 deixa o usuário **permanentemente** sem
cronotipo; as outras são de acabamento.

> Um quarto problema — as mensagens de erro da tela de login, que hoje
> respondem todas a mesma coisa — foi **adiado de propósito** para uma leva
> própria. Não mexa em `backend/routers/auth.py` nem nos textos de erro do
> login nesta rodada.

---

## Tarefa 1 — Usuário que interrompe o questionário nunca mais volta a ele

**Sintoma:** criar conta, começar o questionário, fechar o app no meio. Na
próxima abertura o app vai direto para o dashboard, e **não há caminho de
volta** para o questionário.

**Causa (verificada), em três partes:**

1. `axonweb/src/pages/NativeEntry.tsx` decide a rota raiz do app instalado com
   `api.hasFreshSession() ? "/dashboard" : "/login"`. **Não olha se o usuário
   tem cronotipo.** Quem parou no meio tem sessão válida, então vai para o
   dashboard.
2. `axonweb/src/pages/LandingPage.jsx:57` faz o mesmo na web: usuário logado →
   `/dashboard`, sem conferir cronotipo.
3. `axonweb/src/pages/Dashboard.tsx:483-488` **esconde o problema**: sem
   cronotipo ele cai num rótulo padrão, "Perfil Intermediário". O usuário vê um
   perfil que ele nunca respondeu, em vez de ser mandado de volta.

**O que já existe e deve ser aproveitado:** o questionário **já salva o
progresso** em `localStorage`, na chave `axon_questionnaire_progress_v1`
(`Questionnaire.tsx:327`), e já restaura o índice da pergunta ao montar
(`currentIndex`, linha 408). Ou seja, **"voltar de onde parou" já funciona** —
o que falta é o roteamento levar o usuário até lá.

**O que fazer:** garantir que quem não tem cronotipo seja levado ao
questionário, nas duas plataformas. Duas restrições:

- **O `NativeEntry` precisa continuar instantâneo e local.** O comentário dele
  explica por quê: antes o app dependia de uma chamada de rede para decidir, e
  o usuário via a tela de vendas piscar a cada abertura. Não introduza uma
  chamada de rede no caminho de abertura.
- **A autoridade é o servidor.** O `has_chronotype` já vem nas respostas de
  login e de cadastro (`backend/routers/auth.py:79` e `:104`) e no perfil
  (`profile.py:67`). Um sinal guardado localmente pode ficar velho — por
  exemplo, se o usuário responder o questionário noutro aparelho.

A combinação que atende às duas é um sinal local para a decisão imediata **mais**
uma conferência no servidor quando o perfil já for carregado de qualquer jeito.
Decida o desenho e explique a escolha na entrega.

Cuide dos três pontos de saída: o sinal precisa ser gravado no login e no
cadastro, e **limpo/atualizado quando o questionário é concluído** — senão o
usuário que terminar o questionário fica preso do outro lado.

Não mexa na lógica interna do questionário nem no formato do progresso salvo.

---

## Tarefa 2 — Carimbo do commit na tela de login em produção

**Sintoma:** ao lado do botão "Login" aparece o hash do commit
(`axonweb/src/pages/Login.tsx:142`, via `BUILD_COMMIT` de `lib/buildInfo.ts`).
Isso não pode aparecer no app publicado.

**Antes de apagar, leia `lib/buildInfo.ts`:** o carimbo existe para responder
"o que eu tenho instalado é a versão nova ou a antiga?", que o APK sozinho não
responde. É diagnóstico útil, não enfeite.

**O que fazer:** manter o carimbo **fora de produção** sem perder a capacidade.
O mínimo é condicioná-lo a `import.meta.env.DEV`, como foi feito com a mensagem
de rede em `lib/api.ts` (veja o padrão lá, inclusive o comentário pedindo para
não remover a condição).

**Nesta rodada é só tirar o número da tela de login.** O Bernardo quer manter
a capacidade e já decidiu que o lugar definitivo dele em produção fica para a
próxima leva — hoje não existe seção "sobre" em `Settings.tsx` nem em
`Profile.tsx`, e criar uma é trabalho de UI que não cabe aqui. Se tiver uma
sugestão de onde ele deveria morar, escreva **na entrega**, sem implementar.

---

## Tarefa 3 — Onboarding: rolagem solta e botão voltar que pula demais

Dois problemas independentes na mesma tela.

### 3a — A tela do questionário se arrasta para baixo

**Causa (verificada): o seletor está morto.** Em
`axonweb/src/styles/index.css:626`:

```css
@media (max-width: 1023.98px) {
  .is-native html,
  .is-native body { overscroll-behavior: none; }
}
```

`is-native` é posto **no próprio `<html>`** (`main.tsx:19`,
`document.documentElement`). Então `.is-native html` pede um `<html>` **dentro**
de um `<html class="is-native">` — nunca casa. Só a metade `body` vale.

Corrija o seletor. **Não mude o bloco todo nem a media query**: o comentário
acima dela explica que esta é a única regra do bloco que precisa da media
query, porque desligaria o repique de rolagem do desktop, que é comportamento
de produto.

Depois disso, confirme se a tela **ainda** rola. O `<main>` do questionário
(`Questionnaire.tsx:494`) é `min-h-screen` com `py-5`, e o contêiner interno
(linha 497) é `min-h-[calc(100vh-40px)]`. Se o conteúdo couber na tela, não
deve haver rolagem nenhuma. Se ainda houver, diga qual era a causa — pode ser
altura, e não overscroll.

### 3b — O botão voltar do Android sai da tela inteira

**Sintoma:** estando nas perguntas, o botão físico de voltar leva à introdução,
em vez de voltar uma pergunta.

**Causa (verificada):** `axonweb/src/lib/nativeBack.ts` faz
`window.history.back()`, que volta **uma entrada de histórico**. As perguntas
não são rotas — são estado interno (`currentIndex` em `Questionnaire.tsx:408`).
Então voltar sai da rota inteira.

**Comportamento desejado:** nas perguntas, voltar anda **uma pergunta**. Só na
primeira pergunta é que voltar sai da tela, como hoje.

**O que fazer:** dar ao `nativeBack` uma forma de uma tela assumir o botão
voltar enquanto está montada, e usá-la no questionário. **O
`axonweb/src/lib/openPanels.ts` é o modelo a seguir** — ele resolve o mesmo
tipo de problema (uma tela precisa influenciar um componente da raiz) com um
registro em módulo mais um hook. Siga aquele desenho em vez de inventar outro.

Preserve o que o `nativeBack.ts` já faz: o duplo toque para sair nas rotas
raiz, e o fato de ele só valer em plataforma nativa. **Isto é só Android** — o
iOS não tem botão físico de voltar.

---

## O que NÃO tocar

- A lógica interna do questionário (cálculo do cronotipo, ordem das perguntas,
  formato do progresso salvo).
- `backend/` inteiro: nenhuma das três tarefas precisa dele.
- O bloco de safe area e o da `BottomNav` em `index.css`, exceto o seletor da
  3a.
- `PagePortal.tsx` e `openPanels.ts` — criados hoje e já validados no Android.
- `capacitor.config.ts`, `main.tsx` e o `@supports` do iOS em `index.css`.

## Verificação

- [ ] `cd axonweb && npm run lint` passa
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa
- [ ] `cd axonweb && npm run build` passa sem aviso novo
- [ ] `cd backend && python3 -c "import main"` passa
- [ ] `npx tsx src/lib/voice/voice.test.ts` e
      `cd backend && python3 tests_stt_vocabulary.py` passam
- [ ] O build de produção **não** contém o hash do commit na tela de login
- [ ] Conta sem cronotipo cai no questionário, e conta **com** cronotipo
      continua indo direto ao dashboard — teste os dois sentidos

## Entrega

**Não commite.** O Bernardo faz os commits.

Entregue: os arquivos alterados com a causa de cada um; o desenho escolhido na
Tarefa 1 e por quê; e a lista de verificação no aparelho. Diga separadamente o
que é testável no Android e o que só aparece no iPhone — o Bernardo tem um
iPhone emprestado por pouco tempo e testes acumulados de duas builds.
