# Prompt — Janela de datas nas tarefas e confirmação digitada para excluir conta

Duas tarefas independentes. Leia o `AGENTS.md` antes de mexer em qualquer
coisa — em especial a **§13 (Performance)** para a Tarefa 1 e a **§10
(Segurança)** para as duas.

A Tarefa 1 é a causa provável da lentidão que o Bernardo sentiu no iPhone em
23/10/2026: o calendário demorou muito a carregar **na conta dele, que tem
meses de dados**, e carregou na hora numa conta de teste recém-criada. A
Tarefa 2 é uma proteção nova contra exclusão acidental de conta.

---

## Tarefa 1 — Três telas baixam a conta inteira a cada abertura

**Sintoma:** o app fica mais lento quanto mais o usuário usa. Numa conta nova
é instantâneo; numa conta com meses de histórico, o calendário demora.

**Causa (verificada):** três chamadas sem nenhum filtro de data.

| Arquivo | Chamada | Baixa hoje | Precisa de verdade |
|---|---|---|---|
| `axonweb/src/pages/Planning.tsx:716` | `api.getTasks()` | **todas** as tarefas já criadas | o período visível na tela |
| `axonweb/src/pages/Planning.tsx:690` | `api.getSubtasks()` | **todas** as subtarefas já criadas | só as das tarefas carregadas |
| `axonweb/src/pages/Dashboard.tsx:170` | `api.getSubtasks()` | **todas** as subtarefas já criadas | só as de **hoje** (a seção "Hoje") |
| `axonweb/src/pages/Focus.tsx:79` | `api.getTasks()` | **todas** as tarefas já criadas | só as de **hoje** (`taskForToday`) |

O endpoint `GET /tasks` já aceita `scheduled_date` (`backend/routers/tasks.py:14`),
mas só para **um dia exato** — o Planning mostra semana ou mês, então ele não
serve. O `GET /subtasks` não aceita filtro nenhum (`subtasks_service.list_all`,
"todas as subtarefas do usuário").

> **Vale conferir no painel do Supabase:** o PostgREST tem um teto de linhas por
> resposta (`db-max-rows`, padrão 1000). Se estiver no padrão, uma conta com mais
> de 1000 tarefas **perde tarefas silenciosamente** hoje — a resposta corta e
> ninguém avisa. A janela de datas resolve isso de lado; não deixe de relatar o
> que você encontrou.

### 1a. `GET /tasks` ganha um intervalo de datas

Dois parâmetros novos, opcionais: `scheduled_from` e `scheduled_to`
(`YYYY-MM-DD`). Sem eles, o endpoint continua devolvendo tudo — **não quebre
os chamadores antigos**, porque o app das lojas continua pedindo sem filtro
até o usuário atualizar.

Quando vierem, a resposta precisa incluir **três grupos**, e errar qualquer um
quebra a tela:

1. **Tarefas dentro da janela** — `scheduled_date` entre `from` e `to`.
2. **Eventos que atravessam a janela** — um evento de 28/09 a 05/10 tem de
   aparecer numa janela que começa em 01/10, mesmo com `scheduled_date` fora
   dela. O `isTaskOnDate` (`Planning.tsx:288-299`) desenha eventos em todo o
   intervalo `scheduled_date`→`end_date`; sem este grupo, barras de evento
   desaparecem do calendário.
3. **Tarefas sem data** — `scheduled_date IS NULL`. É a "fila" de
   `Planning.tsx:786-789`, mostrada num chip sempre visível
   (`Planning.tsx:1210`, `:1726`). Sem este grupo, a fila esvazia e o usuário
   acha que perdeu as tarefas.

Montei e **validei a consulta** com a lib instalada (sem tocar em produção).
Ela sai assim:

```python
query = (
    supabase.table("tasks")
    .select("*, objectives(title)")
    .eq("user_id", user_id)
    .or_(
        f"scheduled_date.is.null,"
        f"and(scheduled_date.gte.{scheduled_from},scheduled_date.lte.{scheduled_to}),"
        f"and(scheduled_date.lt.{scheduled_from},end_date.gte.{scheduled_from})"
    )
)
```

Query string resultante, conferida:

```
user_id=eq.UID&or=(scheduled_date.is.null,and(scheduled_date.gte.2026-10-01,scheduled_date.lte.2026-11-02),and(scheduled_date.lt.2026-10-01,end_date.gte.2026-10-01))
```

**Repare onde está o `user_id`: FORA do `or`.** É o ponto crítico desta
tarefa. Se o `user_id` entrar dentro do grupo `or`, ele passa a ser
*alternativa* em vez de *exigência*, e a consulta devolve tarefa de outros
usuários — exatamente o que o `AGENTS.md §10.2` proíbe. Confira a query string
gerada antes de dar a tarefa por pronta.

Duas coisas mais:

- **Valide o formato das datas** com Pydantic/`Query` antes de interpolar.
  Hoje esses valores entram direto na string da consulta; data livre vinda do
  cliente num `or_` é entrada não validada virando filtro.
- `.or_()` **não tem precedente no projeto** — confirmei, nenhum service usa.
  Comente por que ele é necessário aqui (os três grupos acima não cabem numa
  sequência de `.eq`/`.gte`, que são todos AND entre si).

### 1b. `GET /subtasks` ganha a mesma janela

Mesmos dois parâmetros, mesma regra de compatibilidade (sem eles, devolve tudo).

A tabela `subtasks` não tem data própria, então a janela é a das **tarefas
mães**: selecione os `id` de tarefa que caem na janela (mesma regra 1a) e
filtre as subtarefas com `in_()` nesses ids. São duas queries, ~210ms — bem
melhor que baixar o histórico inteiro, e o `AGENTS.md §13` já aponta
`routines_service.list_routines` como molde de busca em lote.

**Não** resolva isso mandando a lista de ids do frontend na URL: 42 dias de
tarefas podem ser mais de 100 UUIDs, a URL passa de 3.000 caracteres e bate no
limite de header do Nginx.

### 1c. Planning: janela visível + cache em memória

**Decisão do Bernardo (24/10/2026):** buscar só o período na tela e **guardar
em memória o que já baixou**. Trocar de mês busca uma vez; voltar para um mês
já visitado não busca de novo.

A janela sai de `viewMode` + `selectedDate` (`Planning.tsx:635`):

- **`"week"`** → os 7 dias de `weekDaysOf(selectedDate)` (`:349`).
- **`"month"`** → a **grade inteira**, não o mês. `Planning.tsx:3432-3440`
  monta `gridStart = new Date(year, month, 1 - firstWeekday)` e 35 ou 42
  células, incluindo os dias vizinhos que fecham a primeira e a última semana.
  Buscar só do dia 1 ao dia 30 deixa essas células do mês vizinho vazias — e
  elas aparecem na tela.

Pegue uma **folga de alguns dias em cada ponta**: trocar de semana dentro do
mesmo mês passa a não precisar de request novo, e o custo de alguns dias a mais
é irrelevante.

**O cache e a parte que é fácil errar.** Guarde por chave de janela (não em
`localStorage` — é cache de sessão, não dado persistido). E então:

> **Toda mutação invalida o cache inteiro, não só a janela atual.** Criar,
> editar, excluir, mover e concluir tarefa, e o `carryForwardTasks` da
> montagem (`:764`), podem mexer em datas de **outra** janela — arrastar uma
> tarefa de ontem para hoje atravessa a virada de mês. Um cache que só
> atualiza a janela visível faz a tarefa reaparecer no lugar velho quando o
> usuário voltar. Limpar tudo e rebuscar a janela atual é simples e está
> certo; cache esperto aqui não paga o risco.

**Não quebre o que já existe:**

- `handleToggleDone` (`:874`) virou **otimista** na leva de 23/10: ele guarda
  `previousTasks`/`previousSubtasks`, espelha as subtarefas, reverte com toast
  em caso de erro e só então chama `loadTasks()`. Esse comportamento tem de
  continuar igual — era um atraso de 4 segundos ao marcar uma tarefa.
- Os 11 pontos que chamam `loadTasks()` continuam funcionando sem mudar de
  assinatura (vários têm o comentário "já traz as subtarefas junto").
- `loading` e `error` já existem; **não** deixe a tela piscar vazia a cada troca
  de mês. Mantenha as tarefas atuais à mostra enquanto a nova janela carrega,
  com um indicador discreto. Tela em branco por 300ms a cada navegação é pior
  do que o problema que estamos resolvendo.

### 1d. Dashboard: só as subtarefas de hoje

`Dashboard.tsx:170` baixa tudo para montar o progresso da seção "Hoje". Passe a
janela de hoje. Comportamento na tela: idêntico.

### 1e. Focus: só as tarefas de hoje

`Focus.tsx:79` baixa tudo e usa **apenas** `todayTasks`
(`Focus.tsx:58`, filtro `taskForToday` = `scheduled_date === hoje`, `:24-28`).
É casamento exato com `api.getTasks({ scheduled_date: hoje })` — aqui o
parâmetro de um dia que já existe basta, nem precisa da janela.

---

## Tarefa 2 — Exigir o e-mail digitado para excluir a conta

Hoje a exclusão tem dois passos, os dois de um clique só
(`Profile.tsx:481-493` "Excluir sua conta?" → `:519` "Confirmação final").
Dois cliques em sequência num item de menu são fáceis de dar sem querer, e a
ação é **irreversível** e bloqueia o e-mail por 60 dias.

**Decisão do Bernardo (24/10/2026):** no passo final, o usuário digita o
**e-mail da conta**. É o padrão do GitHub e do Supabase, e tem a vantagem de
confirmar *qual* conta está sendo apagada.

O diálogo final (`:519-545`) já mostra o e-mail e o aviso dos 60 dias. Acrescente
o campo embaixo e deixe o botão "Excluir conta" **desabilitado** até bater.

**Comparação:** ignore espaços nas pontas e diferença de maiúsculas
(`trim()` + minúsculas nos dois lados) — digitar `Bernardo@Exemplo.com` conta.
Fora disso, igualdade exata.

**O detalhe que decide se isso funciona no celular.** O teclado do iPhone e do
Android sugere e completa e-mail com um toque — e aí o atrito que estamos
construindo desaparece. O campo precisa recusar esse preenchimento:

```tsx
type="text"          // NÃO use type="email": é ele que liga a sugestão de e-mail
inputMode="email"    // mantém o teclado com @ à mão, sem o autofill
autoComplete="off"
autoCorrect="off"
autoCapitalize="none"
spellCheck={false}
```

Dê ao campo um `name` que não pareça campo de e-mail de formulário (algo como
`confirmacao-exclusao`), senão o gerenciador de senhas oferece preencher.

**Não bloqueie colar.** Quem realmente quer sair pode copiar o e-mail que está
ali no diálogo, e bloquear `paste` atrapalha leitor de tela e teclado
alternativo sem impedir exclusão nenhuma — o objetivo é que o ato seja
deliberado, não que seja uma prova.

### 2b. O erro de exclusão hoje é invisível

`Profile.tsx:294-306`:

```tsx
} catch (error) {
  console.error("Erro ao excluir conta:", error);
}
```

Se a exclusão falhar, o modal **fica aberto, sem mensagem nenhuma** e o usuário
clica de novo achando que o botão não funcionou. Isso contraria o
`AGENTS.md §14` ("erro vira estado visível"). Mostre a mensagem dentro do
diálogo e deixe o botão clicável outra vez. Reaproveite o que o `ConfirmDialog`
já oferece (`loading`, variante `danger`) em vez de criar modal novo — o
`AGENTS.md §11` proíbe modal novo.

### 2c. O backend também confere (opcional, mas recomendado)

`DELETE /account` (`backend/routers/account.py:9`) hoje não exige nada além de
um token válido. Aceite **opcionalmente** o e-mail no corpo: se vier, tem de
bater com o do usuário autenticado; se não vier, exclui como hoje.

**Por que opcional e não obrigatório:** o app publicado na Play Store e a Build
2 do TestFlight chamam `DELETE /account` **sem corpo**. Se o backend passar a
exigir, esses usuários não conseguem mais excluir a conta — e o fluxo de
exclusão é **exigência da Play Store**. Opcional dá a defesa a quem atualizar,
sem quebrar quem não atualizou.

Para que serve, sendo o usuário o dono da conta: o campo digitado não é
credencial, é freio contra acidente. A checagem no servidor garante que
**nenhum caminho de código** chegue a apagar uma conta sem a confirmação —
hoje um bug em qualquer lugar que chame `api.deleteAccount()` apaga a conta,
sem segunda barreira.

---

## O que NÃO tocar

- **O filtro por `user_id`** de qualquer consulta, e nunca dentro de um `or_`.
- **A compatibilidade dos endpoints:** sem os parâmetros novos, `GET /tasks` e
  `GET /subtasks` continuam devolvendo tudo. O app das lojas depende disso.
- **`handleToggleDone` otimista** e os `loadTasks()` existentes do Planning.
- **O bloqueio de 60 dias** do `account_service` e o `deletion-info` público:
  são exigência de loja, já revisados.
- **`forgot-password`** e as mensagens de erro do login: acabaram de ser mexidas.
- Nenhuma migration: as três colunas usadas (`scheduled_date`, `end_date`,
  `task_id`) já existem.

## Como testar

Performance (o ponto da tarefa — meça, não ache):

1. Na aba **Network**, abra o Planning e anote **tamanho e tempo** da resposta
   de `/tasks` e `/subtasks`, antes e depois. Ponha os quatro números no
   relatório. Se não caiu, a tarefa não está pronta.
2. Use `npm run preview` (build de produção), não o dev server, e **confirme
   que não há VPN ligada** — o `AGENTS.md §13` tem o histórico de uma medição
   invalidada exatamente por isso.

Correção (cada item já quebrou numa implementação ingênua):

3. Evento de vários dias que **começa no mês anterior** e termina no mês
   visível: a barra aparece nas duas telas (mês e semana).
4. Tarefa **sem data**: o chip da fila continua com a contagem certa.
5. Vista de **mês**: as células dos dias vizinhos (fim do mês anterior, começo
   do seguinte) mostram os pontos/itens delas, não vazio.
6. Trocar de mês ida e volta: a segunda visita ao mês já visto **não** gera
   request novo (confirme na aba Network).
7. **Criar** uma tarefa num mês, navegar para outro e voltar: ela está lá.
8. **Mover** uma tarefa de 31/10 para 01/11, navegar para novembro e voltar
   para outubro: ela saiu de outubro e está em novembro. (Este é o teste que
   pega cache invalidado só na janela atual.)
9. Marcar tarefa como concluída: continua **instantâneo**, sem os 4 segundos.
10. Dashboard e Focus: nada mudou na tela.

Exclusão de conta — **use uma conta de teste, criada para isso**:

11. Botão desabilitado com o campo vazio e com o e-mail errado.
12. E-mail certo com espaço na ponta e letra maiúscula: habilita.
13. No **celular**, tocar no campo **não** faz o teclado oferecer o e-mail com
    um toque. Confirme no aparelho, não só no navegador.
14. Exclusão completa: a conta sai, o e-mail entra no bloqueio de 60 dias.
15. Falha na exclusão (simule derrubando a rede): aparece **mensagem na tela**
    e o botão volta a funcionar.
16. Apague o que sobrou da conta de teste, inclusive o rastro derivado.

## Definition of Done (`AGENTS.md §18`)

- [ ] `cd axonweb && npm run lint`
- [ ] `cd axonweb && npx tsc --noEmit -p tsconfig.json`
- [ ] `cd axonweb && npm run build` sem aviso novo de chunk
- [ ] `cd backend && python3 -c "import main"`
- [ ] Os 16 testes acima, com o resultado de cada um no relatório
- [ ] A query string gerada pelo `or_` conferida, com o `user_id` fora do grupo
- [ ] Os quatro números de tamanho/tempo do teste 1 no relatório
- [ ] Console sem erro novo; aba Network sem request repetido por navegação
- [ ] Comentários em português, nenhum `any`, nenhum segredo

**Não commite.** O Bernardo faz os commits.
