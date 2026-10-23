# Prompt — Bugs de layout no app instalado (iOS e Android)

Sete problemas encontrados (agrupados em cinco tarefas) testando o app em iPhone 15 e em Android, em
23/10/2026. Leia o `AGENTS.md` antes de mexer em qualquer coisa — a seção 12
(responsividade) e a 11 (design system) valem aqui.

## Como trabalhar nisto

As tarefas estão **ordenadas por risco**, da mais isolada para a que toca
caminho compartilhado. Faça nessa ordem. Se precisar parar no meio, pare entre
tarefas, nunca dentro de uma.

**Você não consegue testar em iPhone.** O Bernardo vai testar tudo de uma vez
na próxima build do TestFlight. Por isso: ao terminar, escreva uma lista do que
ele precisa conferir em cada tela, em ordem. Essa lista é parte da entrega.

Onde eu dou um diagnóstico, ele foi verificado no código e está anotado com o
arquivo e a linha. Onde eu dou **hipótese**, está escrito "hipótese" — aí
confirme antes de mudar, e se a causa for outra, diga qual era.

---

## Tarefa 1 — Barra lateral do Chat ignora a safe area (iOS e Android)

**Sintoma:** ao expandir a aba lateral das conversas, o conteúdo sobe demais e
fica embaixo do relógio e da barra de status. "Não respeita os limites da
página."

**Causa (verificada):** `axonweb/src/styles/index.css` tem a regra

```css
.is-native aside.fixed,
.is-native [data-drawer] { top: calc(0.75rem + env(safe-area-inset-top)); … }
```

mas o elemento em `axonweb/src/pages/Chat.tsx:797` é

```jsx
<aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] …">
```

— **sem `fixed`**, e sem `data-drawer`. O seletor nunca casa, e a barra não
recebe compensação nenhuma.

**O que fazer:** faça o elemento ser alcançado pela regra existente. O caminho
preferido é marcá-lo com `data-drawer`, que é justamente o gancho que a regra
já oferece para casos assim — não acrescente `fixed` só para casar o seletor se
o elemento não for de fato posicionado, porque isso mudaria o layout.

Confira se a barra lateral do Chat é a única nessa situação: procure outros
`<aside>` e gavetas que deveriam estar sob essa regra e não estão.

---

## Tarefa 2 — Botão "+" sobre a barra de abas (iOS e Android)

**Sintoma:** nas telas de Rotinas e Objetivos, o botão roxo "+" fica por cima
da barra de abas "Rotinas / Agenda / Objetivos" e corta a primeira delas — na
captura, "Rotinas" aparece como "otinas".

**Causa (verificada):** o botão é posicionado de forma absoluta no canto
superior esquerdo, exatamente onde a barra de abas começa:

- `axonweb/src/pages/Routines.tsx:166`
- `axonweb/src/pages/Goals.tsx:234`

ambos com `className="absolute left-3 top-5 z-20 …"`.

**O que fazer:** os dois elementos precisam conviver sem sobreposição. Resolva
pelo layout — reservando espaço para o botão ou reposicionando-o — e não
empurrando a barra de abas com margem mágica. Os dois arquivos têm o mesmo
botão com a mesma classe: a correção vale para os dois e deve ser a mesma.

Não invente um valor novo de raio, sombra ou cor: o botão já segue o design
system e só está no lugar errado.

---

## Tarefa 3 — Controles de formulário nativos do iOS (bugs 4, 5, 6 e 7)

**Quatro sintomas, uma causa só.** Todos só no iPhone; no Android as mesmas
telas estão corretas.

| Onde | O que se vê |
|---|---|
| Criar tarefa — Início/Fim | os dois campos **se sobrepõem e achatam**, como duas caixas fundidas com um círculo no meio |
| Criar rotina — Início/Fim | idem |
| Editar objetivo — "Prazo" | o campo de data **perde a caixa**: vira texto solto, enquanto "Nome do objetivo" logo acima tem borda e fundo |
| Opções dentro de rotinas e de editar rotina | controles **comprimidos e achatados**, um deles passando do limite da tela |

**Comparação direta Android × iPhone** (mesmas telas, 23/10/2026 — isto não é
inferência, foi conferido foto a foto):

| Controle | Android | iPhone |
|---|---|---|
| `type="time"` (Início/Fim) | duas caixas separadas, `--:--` com ícone de relógio | **fundidas e achatadas** |
| `type="date"` (Prazo) | caixa com borda e ícone de calendário, valor `31/12/2026` | **sem caixa**, e valor no formato longo `31 de dez. de 2026` |
| `<select>` (Prioridade, Complexidade) | caixa alta, seta simples do projeto | **caixa mais baixa**, seta dupla nativa do iOS |

**Causa (verificada):** no iOS o WebKit desenha `input[type="time"]`,
`input[type="date"]` e `<select>` como **controle nativo**, com largura
intrínseca e estilo próprios, ignorando boa parte do CSS do projeto. Isso
produz os dois sintomas:

- **Dentro de `grid grid-cols-2`:** item de grid tem `min-width: auto`, então a
  célula **não pode encolher** abaixo da largura intrínseca do controle. Os
  dois campos estouram as colunas e se sobrepõem.
- **Em largura total:** borda e fundo do projeto são descartados, e o campo
  fica sem caixa.

A prova de que é o iOS e não o CSS: em `axonweb/src/pages/Goals.tsx:2290` o
campo de data usa `INPUT_CLS` (linha 75), **a mesma constante** dos campos de
texto que aparecem com caixa na mesma tela. O estilo está lá; o controle nativo
o ignora.

**Ocorrências** (todas com o mesmo molde):

```
type="time"  Planning.tsx:4862, 4873, 5465, 5478 · RoutineItem.tsx:371 e o
             campo "Fim" logo abaixo · Goals.tsx:2300 · Settings.tsx:528, 534
             NotificationSettingsSheet.tsx:208, 330
type="date"  Goals.tsx:1791, 2012, 2290 · Planning.tsx:4762, 4781, 4796,
             5416, 5435, 5450 · Routines.tsx:1800
             NewRoutineSheet.tsx:342, 356
```

**O que fazer:** duas coisas, e as duas são necessárias:

1. Permitir que a célula encolha (`min-width: 0` nos itens de grid/flex que
   contêm esses controles).
2. Tirar a aparência nativa, para o CSS do projeto voltar a valer.

São mais de 20 ocorrências com o mesmo molde: prefira **uma regra em
`axonweb/src/styles/index.css`** a repetir classe em cada uma. Confira que a
regra não estraga a web nem o Android — os dois estão corretos hoje e não
podem regredir.

O valor do `type="date"` também muda de formato entre as plataformas
(`31/12/2026` no Android, `31 de dez. de 2026` no iOS). Isso é o controle
nativo formatando pelo locale. Tirar a aparência nativa pode ou não normalizar
isso — **não force um formato**; apenas registre na lista de verificação para
o Bernardo olhar como ficou.

Para os `<select>`, confirme antes de mudar: eles podem precisar de tratamento
diferente do dos campos de data e hora, e a seta indicadora do controle não
pode sumir.

> **Risco a declarar:** tirar a aparência nativa pode deixar o valor
> desalinhado, cortado ou invisível no iOS, e **você não tem como ver**. Seja
> conservador. Escreva na lista de verificação final, campo por campo, o que o
> Bernardo deve olhar: se o valor aparece, se cabe na caixa, e se o seletor
> abre ao tocar.

---

## Tarefa 4 — Botão de salvar atrás da barra de navegação (iOS e Android)

**Sintoma:** em vários painéis que sobem de baixo, o botão de ação final fica
**atrás da `BottomNav`** e não dá para apertar. Visto em: criar rotina ("Período
— Passo 3 de 3"), criar objetivo, editar tarefa e editar objetivo. Acontece nas
duas plataformas.

**É o mais grave dos sete:** os outros são feios, este **impede concluir a
ação**.

**Causa (verificada, não é hipótese):**

Toda página do app envolve o conteúdo num wrapper assim — `Goals.tsx` é o
exemplo, e o padrão se repete em **21 páginas**:

```jsx
<main className="relative min-h-screen overflow-hidden …">
  <Background />
  <div className="relative z-10 …">   ← cria um CONTEXTO DE EMPILHAMENTO
```

`position: relative` com `z-index: 10` **cria um contexto de empilhamento**.
Tudo que está dentro dele — inclusive um painel com `z-[120]` — fica confinado
ali: o `z-[120]` só compete com os irmãos **dentro** daquele contexto. Para o
resto da página, o painel inteiro vale **10**.

A `BottomNav` (`BottomNav.tsx:885`) está na **raiz do App**
(`App.tsx:75`), com `z-[90]`.

**10 contra 90: a barra ganha sempre.** É por isso que o painel próprio do
Goals, com `z-[120]`, perde exatamente como o `BottomSheet` com `z-[110]` —
e por isso **aumentar o z-index do painel nunca resolveria**.

**O que fazer:** faça os painéis saírem desse contexto, renderizando-os num
**portal para `document.body`**. É a correção geral: resolve o `BottomSheet`
(6 telas), o painel próprio do `DayReview.tsx:435` e o painel próprio do
`Goals.tsx:2256` de uma vez.

**NÃO remova o `relative z-10` das páginas.** Ele existe para o conteúdo ficar
acima do `<Background />` (os borrões decorativos). Tirá-lo em 21 páginas para
resolver um problema de painel quebraria os fundos de todas elas.

**Decisão de produto, já tomada, que vale como requisito:** enquanto um painel
inferior está aberto, **a barra de navegação não deve aparecer nem receber
toque**. O usuário está numa tarefa focada; navegar para outra aba por baixo do
painel não é comportamento desejado.

**Cuidado:** o `BottomSheet` é usado por 6 telas —

```
Planning.tsx · NewRoutineSheet.tsx · TagEditorSheet.tsx
NotificationSettingsSheet.tsx · TaskTagsSheet.tsx · RoutineAnalysisReview.tsx
```

Qualquer mudança nele vale para todas. E o `DayReview.tsx:435` tem um painel
**próprio**, não o compartilhado, com `z-[110]` igual — confira se ele sofre do
mesmo problema e, se sofrer, corrija junto em vez de deixar um caso órfão.

Não mude as regras de safe area do `index.css` para resolver isto. Elas estão
documentadas com o motivo de cada linha, inclusive a armadilha do
`:not([data-own-safe-bottom])`, e já custaram caro para ficar certas.

---

## Tarefa 5 — Marcar tarefa como feita demora ~4 segundos (iOS e Android)

**Sintoma:** no Planning, tocar na bolinha de concluir leva cerca de 4 segundos
até a tarefa aparecer marcada. É pior quanto mais dados a conta tem: numa conta
nova é instantâneo.

**Causa (verificada):** `axonweb/src/pages/Planning.tsx:874`,
`handleToggleDone`:

```ts
await api.updateTask(task.id, next);
await loadTasks();
await loadSubtasks();
```

Dois defeitos somados:

1. **Não há atualização otimista.** A interface só muda depois das três idas e
   voltas. As duas funções logo abaixo no mesmo arquivo —
   `handleToggleSubtask` e `handleDeleteSubtask` — **fazem** atualização
   otimista, uma delas com comentário explícito. Esta ficou de fora.
2. **`loadSubtasks()` é redundante.** O `loadTasks()` (linha 713) já o chama
   dentro de um `Promise.all`. A lista inteira de subtarefas da conta é baixada
   **duas vezes** por clique.

**O que fazer:** atualizar a tela na hora e reverter em caso de erro, seguindo
o padrão que já existe nas funções vizinhas; e remover a chamada duplicada.
Confira se `handleToggleSubtask` e `handleDeleteSubtask` também têm a chamada
redundante — pela leitura, têm.

**O que NÃO fazer nesta tarefa:** a causa de fundo é que o Planning busca
**todas** as tarefas e **todas** as subtarefas da conta, sem filtro de data
(`api.getTasks()` sem parâmetros → `tasks_service.list_tasks` sem
`scheduled_date`; `GET /subtasks` → `subtasks_service.list_all`). Isso faz o
app ficar mais lento quanto mais o usuário o usa. **Fica para outra rodada:**
mexe no backend e no modelo de dados da tela, e não cabe junto com correção de
layout na mesma build.

---

## O que NÃO tocar

- `backend/` — nenhuma das sete tarefas precisa.
- As regras de safe area e da `BottomNav` em `axonweb/src/styles/index.css`,
  exceto onde uma tarefa pedir explicitamente. Cada linha ali tem o motivo
  escrito e várias são cicatriz de bug real.
- `axonweb/capacitor.config.ts`, `main.tsx`, `index.html` e `api.ts` — acabaram
  de ser alterados para o iOS e estão corretos.
- Tokens do design system: cores, raios e sombras. Nenhum destes bugs é de cor.
- `axonweb/android/` e `axonweb/ios/` — gerados pelo Capacitor.

## Verificação

- [ ] `cd axonweb && npm run lint` passa
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json` passa
- [ ] `cd axonweb && npm run build` passa, sem aviso novo (o de tamanho de
      bloco já existia)
- [ ] `cd backend && python3 -c "import main"` passa
- [ ] Nenhuma regra nova de CSS quebra a web: confira as mesmas telas em
      largura de desktop e em ~400px no navegador
- [ ] A marcação de tarefa responde na hora e reverte se a API falhar

## Entrega

**Não commite.** O Bernardo faz os commits.

Ao terminar, entregue duas coisas:

1. **Os arquivos alterados**, com uma linha por tarefa dizendo qual era a causa
   real — e confirmando se bateu com o diagnóstico deste documento. Se alguma causa
   era outra, diga qual era.
2. **A lista de verificação no aparelho**, tela por tela, na ordem em que o
   Bernardo deve percorrer. Ele vai ter um iPhone emprestado por pouco tempo e
   uma única build: o que não estiver nessa lista não vai ser testado.
