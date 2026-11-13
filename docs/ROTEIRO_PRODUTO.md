# Roteiro do AXON — uma lista, em ordem

Levantado em 10/11/2026 a partir da lista do Bernardo, com cada item conferido
no código. **Faça de cima para baixo.** Um número por item, uma lista só.

**Progresso: 17 de 48 feitos · 1 adiado · 30 na fila**

Legenda — 🤖 tarefa de agente · 🧍 tarefa do Bernardo · ⏸️ adiado · ✅ feito

---

# AGORA

O item 1 é seu e depende do iPhone. Enquanto isso, os itens de agente
seguem a ordem da lista abaixo — um não espera o outro.


### 1. 🧍 Reconferir os 13 pontos de iOS num iPhone
Meia hora com a Build 3, que já está no TestFlight. **Tem relógio correndo:**
você convidou testadores para uma build cujo comportamento no iPhone só foi
verificado no onboarding. A lista dos 13 pontos está no histórico de 23/10.
Não compete com nenhum agente — dá para fazer enquanto um trabalha.


### 37. 🤖🧍 Push no iPhone — hoje NÃO chega nenhuma notificação
Descoberto em 13/11/2026. As notificações vão para o sininho do app e, no
Android, para o aparelho (FCM, validado na fase 3). **No iOS nada chega à tela
de bloqueio**: faltam a capacidade de Push (`aps-environment`), o
`GoogleService-Info.plist`, o repasse do token no `AppDelegate.swift`, e o
plugin atual entrega no iOS um token da Apple que o FCM não aceita.

Não trava a release do Android (o iOS ainda está no TestFlight), mas **tem que
estar pronto antes da App Store** — toda a estratégia de notificação e
reativação (itens 10, 10a e 35) depende disso para metade do público. Parte é
do Bernardo (chave de APNs na Apple, app iOS no Firebase, Push no App ID e novo
perfil de assinatura do CI) e parte é de agente (código nativo e plugin).
O `GoogleService-Info.plist` segue a mesma regra do `google-services.json`:
nunca commitado.

---

# 🏪 PENDÊNCIAS DE LOJA — em andamento desde 12/11

**Retomado em 12/11/2026:** o app foi aprovado para produção na Play e o teste
externo foi aprovado na Apple. Com o app publicado, o Data Safety declarado
virou declaração pública incorreta — é o item com relógio.

- ✅ **Política nova publicada em 12/11/2026** (`deploy.sh site` + `backend`).
  A página no ar agora é a de 10/11, com o funil e os dados do onboarding.
- ✅ **Telas de sono conferidas em 12/11: NÃO podem ser puladas** (regra em
  `onboardingState.ts`, `case "sleep_times"`). Informações de saúde viraram
  obrigatórias.
- ✅ **`docs/play-store/DATA_SAFETY.md` atualizado em 12/11** — saúde
  obrigatória, seção nova "Atividade no app", terceiros completos, exclusão.
- **Decidido em 12/11: UMA release de produção**, com as correções já na
  `main` (itens 3, 4, 5, 6, 34, data local unificada) **+ o item 10**. As três
  pendências 🧍 abaixo **ainda não foram feitas** e ficam para logo antes de
  gerar essa release — o formulário e o trader status não criam release, vão
  para revisão junto com ela. Antes da build: testar no app real e fazer os 13
  pontos de iOS (item 1).
- 🧍 **Corrigir o formulário na Play Console** — duas mudanças, descritas no
  topo do `DATA_SAFETY.md`: saúde obrigatória e Atividade no app → Interações
  com o app. A revisão de produção já terminou, então a dúvida sobre mexer
  durante a revisão não se aplica mais.
- 🧍 **Seguir as tarefas de configuração do Dashboard da Play** ("Show more"),
  na ordem que ela mostrar. Descoberto em 12/11: o acesso à produção foi
  concedido, mas **Production está "Inactive"** — o app ainda não foi publicado.
  O Data Safety corrigido precisa estar salvo **antes** da primeira release de
  produção, que é revisada junto com ele.
- 🧍 **Declarar o trader status** (faixa azul no topo da Play Console). É a
  exigência da lei europeia de serviços digitais (DSA): se você se declarar
  comerciante, a Play mostra seus dados de contato na página do app na UE, e sem
  declaração o app pode sair da Play da UE. Ler em "View details" o que fica
  público antes de responder.
- **Etiquetas de privacidade da App Store** (Fase 5, ainda não preenchidas): o
  funil e os dados do onboarding precisam entrar desde o começo.

---

# CUSTO — antes de escalar

### 8. 🧍 Decidir planos, modelos e limites
Decisão sua, não de agente. O `Plans.tsx` é maquete e o backend não tem
conceito de plano. **Destrava o item 9.**

### 9. 🤖 Cota e % de uso por usuário
O `usage_service` já grava custo por chamada (Claude, OpenRouter, STT, TTS).
Falta a cota e o percentual — e sem o item 8 não dá para saber o que é 100%.

---

# RETENÇÃO — o que traz o usuário de volta

### 10a. 🧍 Rodada de textos das notificações — ANTES da release
Decidido em 13/11: o texto é o que faz o usuário voltar, então tem rodada
própria, com o Bernardo, e não fica a cargo do agente que fez a mecânica. Para
cada uma das quatro notificações: o momento em que a pessoa lê, duas ou três
abordagens, e as variações (com ofensiva, sem ofensiva, primeiro dia). Os textos
estão centralizados em `backend/services/day_reminders.py`. Problema já
conhecido: "mantém sua ofensiva" não faz sentido para quem está com ofensiva 0.

**Textos aprovados e implementados (13/11):** virou sistema de mensagens
inspirado no Duolingo — várias vozes (parceiro, brincalhão, curioso, ritmo,
dados, memória, ofensiva), sorteio sem repetir em 7 dias, regras de honestidade
dos números, nada de dado de saúde na tela de bloqueio, e medição por variação.
Documento aprovado: `docs/NOTIFICACOES_AXON.md` (32 textos). Catálogo em
`services/notification_catalog.py` (313 testes, compara texto a texto com o
documento). As decisões saíram do scheduler para `services/notification_planner.py`.

**Simulador:** `backend/scripts/simular_notificacoes.py --user-id <uuid>` mostra
a linha do tempo do dia (o que sai, quando, qual variação e por quê, e o que
NÃO sai e por quê), sem escrever nada — guarda no cliente do Supabase recusa
escrita e consulta de outro usuário. `--enviar-teste <tipo>` manda UMA
notificação real só para esse usuário, pede `enviar` digitado e apaga a linha
depois. Teste prova que simulação e `run()` real dão os mesmos envios em 3 dias.

Migration 42 (`notifications.tapped_at`) aplicada em 13/11. Simulação rodada na
conta do Bernardo em 13/11: resumo 08:00 e registro 21:00 corretos; nenhum aviso
de 30 min porque as 5 tarefas do dia eram de rotina (excluídas de propósito).

**Falta (🧍 Bernardo):** a conta não tem token de push (um mês sem usar o app).
Abrir o app no Android, logar, conferir a permissão de notificação, ver o
cabeçalho da simulação mostrar `android: 1` e só então rodar `--enviar-teste`.
Fazer antes da release.

**Ajustes pequenos do simulador (🤖, não bloqueiam a release):** anotar por que
uma tarefa não recebe aviso de 30 min (de rotina, sem horário, concluída) em vez
de silêncio; não deixar o print `[planning_scheduler] planning_daily → …` vazar
na saída; mostrar "sem dados" em vez de "média 0%" quando não há registros.

### 36. 🤖 Lembrete diário antigo consulta o banco a cada ciclo
Achado pelo agente do item 10 em 13/11. O `planning_daily` consulta o banco a
cada ciclo de 5 min depois do horário, e não uma vez por dia — o mesmo problema
de escala que o aviso de 30 min resolveu com uma consulta por ciclo para todos.
Sem urgência com a base atual.

### 11. 🤖 Botões "planejar agora" / "já planejei" nas notificações de planejamento

### 12. 🤖 Análise de rotina detectar choque de horário
Conferido: `routine_analysis_service` só revalida conflito ao **aplicar** um
movimento; nunca procura sobreposição como achado.

### 13. 🤖 `atualizar_tarefa` do agente não checa conflito nenhum
Nem com outra tarefa. Pedir ao Axon para mover uma tarefa para cima de outra
passa sem aviso — o `criar_tarefa` avisa, o `atualizar_tarefa` não.

### 14. 🤖 Verificação de conflito ao criar tarefa pela tela
Popup pedindo confirmação, desligável nas configurações. Irmão do 12 e do 13.

### 35. 🤖 Estratégias de reativação de quem sumiu
Decidido em 12/11/2026: o Bernardo quer funcionalidades com o objetivo de
trazer de volta quem parou de usar. **Não é urgente — ainda não há base de
usuários para reativar** (a segunda maior conta tem 66 tarefas). Fica aqui para
ser retomado quando houver gente de verdade.

Depende do item 7, e é por causa deste item que o 7 **congela só as chamadas ao
Claude e mantém o push**: cortar notificação de inativo economiza zero (FCM e
APNs são grátis) e desligaria a única ferramenta de recuperação que existe.

O item 7 também entrega a matéria-prima: `profiles.last_seen_at` passa a dizer
quem sumiu e há quanto tempo.

---

# PROFUNDIDADE DO PRODUTO

### 15. 🤖 O Axon quando o plano quebra
**Consolida quatro itens da sua lista original:** queda de energia no meio do
dia · destravar tarefa em que o usuário está parado · "melhorar a inteligência
do Axon" (hábitos, estratégias para energia baixa e para excesso de demandas) ·
"fazer o Axon quebrar tarefas difíceis".

É um recurso só. Separados, viram três entregas que se contradizem — e o
conteúdo sobre hábitos e estratégias é justamente o que impede o conselho de
sair genérico.

Máquina que já existe: `calibration_service.get_block_scores`,
`_block_level_at`, `_find_good_slot`, `_pick_free_good_slot`,
`_compaction_candidate`. Entrada decidida: conversa, de preferência pela página
de voz, com uma tool em `agent_tools.py` gravando a linha estruturada. O que
faz a v2 funcionar é o par **intervenção → resultado**, então precisa de uma
pergunta de retorno ("voltou?") algum tempo depois.

### 16. 🤖 Ajustar horários ao longo do dia e da semana
Análises às 8h, 12h e 18h, e aos domingos e segundas.

### 17. 🤖 Adiantar tarefas dos próximos dias e redistribuir a semana
O caso das 10 aulas: fez 3 na segunda, algum outro dia passa a ter 1.

### 18. 🤖 Sugerir tarefa nova quando o usuário adiantar uma
Prompt da Fase 2 já escrito (está na sua lista original). Depende de coisas que
já estão prontas, então é o mais barato deste grupo.

### 19. 🤖 Notas do usuário
Usuário e Axon escrevem; serve de memória para os dois.

### 20. 🤖 Chat: orientações predefinidas
### 21. 🤖 Chat: botão de parar no meio da resposta
Conferido: não existe. É pequeno.

### 22. 🤖 Melhorar a criação dos insights
Você escreveu que nem você sabe como funcionam hoje. **Comece por entender,
não por mudar** — depende do item 23.

---

# ESTRUTURA

### 23. 🤖 Documentar o aplicativo
**Vale antecipar.** Barateia todo o resto da lista e é o que você escreveu
querer: agentes com contexto sem gastar tantos tokens. Pré-requisito do 22.

### 24. 🤖 Otimizações de segurança
### 25. 🤖 Dashboard de métricas da empresa (com Instagram e TikTok)
### 26. 🤖 Site/página de feedback dos usuários

---

# DESIGN E ACABAMENTO

### 27. 🤖 Objetivos — os três juntos
Reformular o design (card) · criar etapas com subtarefas dentro · objetivos
mensais, semanais ou fixos com reset por período. **É a mesma página**: fazer
separado significa redesenhar Objetivos três vezes.

### 28. 🤖 Registro diário — os dois juntos
Tags menos usadas somem depois de 10–15 · ajuste visual de dormir/acordar.
Mesma tela.

### 29. 🤖 Abrir a tarefa por dentro + o design interno
O link entre tarefa, objetivo e rotina já existe; falta abrir ao tocar e
desenhar o interior.

### 30. 🤖 Página de configurações: decidir o conjunto e o design
### 31. 🤖 Reformulação do design mobile
**Fazer o item 33 junto** — ele mexe na mesma tela, e assim o risco de
regressão no `Planning.tsx` é pago uma vez só.

### 33. 🤖 O hub do Planning monta tudo duas vezes
Descoberto em 12/11/2026 no log do VPS. UMA abertura do Planning gera
`GET /routines` ×2, `GET /profile` ×3, `POST /tasks/carry-forward` ×2,
`GET /tasks` ×2, `GET /subtasks` ×2 e `GET /tasks/daily-stats` ×4.

Causa: `Planning.tsx:522` monta `<AgendaView embedded />` e `:530` monta outra
com `desktopMode`. O container do desktop é `hidden lg:block` — o CSS esconde,
mas o React monta e roda os efeitos das DUAS. Vale também para `Routines`
(`/routines` ×2) e `Goals`. O código já admitia em `Planning.tsx:695`.

**Não corrompe dado.** O `carry_forward_tasks` é seguro na corrida: quem lê
depois do update não acha mais a linha (`scheduled_date` já é hoje), e quem lê
antes grava o mesmo `carry_count`. O custo é desperdício puro — na conta do
Bernardo, 1.638 linhas de tarefa por abertura em vez de 819.

Efeito colateral visível: o aviso "N pendentes movidas" vive em estado local de
cada instância, e quem ganha a corrida pode ser a instância ESCONDIDA. O aviso
pode não aparecer mesmo tendo havido movimentação.

**É o maior ganho restante no Planning** e é independente do item 3: a janela
corta linhas por request, isto corta requests. Cuidado ao consertar: `lg:hidden`
/ `hidden lg:block` é CSS, não desmontagem — precisa de renderização
condicional de verdade, e os dois modos têm props diferentes.

### 32. 🤖 Modal do calendário desktop no hover (design da Luiza)

---

# ⏸️ ADIADO

### Horários bloqueados do usuário
**Adiado em 10/11/2026, decisão do Bernardo.** O código está pronto e correto
(`services/fixed_commitments.py`, 59 testes, fiação em 6 caminhos de
agendamento) — **não foi para a `main` de propósito**, e as alterações do
agente foram revertidas.

**Por que parou:** o campo captura "trabalho, faculdade, estágio" como bloco
único. Quem trabalha das 08:00 às 18:00 cadastra dez horas; tratado como
ocupado, isso apaga o expediente inteiro da agenda do Axon. Um matutino com
emprego **nunca** usaria o próprio pico, e a tese do app deixa de valer para a
maior parte da base. **O Axon deve organizar as tarefas de expediente** — então
horário de trabalho é contexto, não bloqueio.

**Desenho proposto para quando voltar:** opção em Configurações chamada "Meus
horários bloqueados", onde o usuário adiciona intervalos em dias específicos,
cada um com um título. No caso do Bernardo, uma linha: o almoço.

**Por que esse desenho é seguro e o atual não é: ele nasce vazio.** O
`fixed_commitments` é preenchido pelo onboarding, então todos que responderam
têm o expediente lá — ligar o bloqueio quebra a agenda de todos de uma vez.
Lista vazia = comportamento idêntico ao de hoje.

**O formato é o mesmo** (`{título, days[], start, end}`), então o trabalho já
feito serve direto. Falta a tela em Configurações e um campo próprio.

**Decisão pendente:** telas separadas ("meu expediente" × "meus horários
bloqueados") ou lista única com tipo por linha.

**Soltar primeiro para um grupo pequeno** pelo TestFlight externo.

**Dívida aberta:** o onboarding continua coletando o campo e o `prompts.py` já
o entrega ao Axon no chat. O Axon conversa sabendo do expediente e agenda sem
saber. Fecha-se com uma mudança de texto na tela — deixar claro que serve para
o Axon conhecer a pessoa, não para desviar da agenda.

---

# ✅ FEITO

| Item | Evidência |
|---|---|
| Encurtar tarefa concluída cedo | "min livres" em `Planning.tsx`, `Dashboard.tsx`, `api.ts`, `RoutineAnalysisCard.tsx` |
| Mostrar minutos economizados | mesma máquina; validado no app em 22/09/2026 |
| Linkar tarefas ↔ objetivos ↔ rotinas | `objective_id` em tarefas e subtarefas |
| App para iOS | Build 3 em revisão no TestFlight, 09/11 |
| Onboarding: tela fixa, sem arrastar | `html.is-native { overscroll-behavior: none }` |
| Onboarding: múltipla escolha | tipo `ranked` em `onboardingSteps.ts` |
| Onboarding: voltar uma pergunta | `goBack` em `Onboarding.tsx` |
| Objetivos: subtarefa contar ponto | `objective_steps` em `subtasks_service` |
| Evento concluir ao passar o horário | `_event_completed` → fração 1.0 |
| Reformulação do onboarding | em produção 09/11/2026 |
| Política de privacidade reescrita | 5 mudanças em `privacidade.html`, aprovadas em 10/11 — **falta publicar** |
| Janela de datas no Planning | medido em 12/11 no banco: 819 → 233 linhas por abertura (tarefas 599→233, subtarefas 220→0); cache auditado, 15/15 mutações invalidam; commitado em 12/11 |
| Exclusão de conta pedindo o e-mail | conferido funcionando pelo Bernardo em 12/11; commitado em 12/11; acabamentos no item 34 |
| Bug da ofensiva no registro diário | causa: `DayReview.handleSave` chamava `onSaved`+`onClose` no mesmo tick e o `onClose` do pop-up disparava o aviso; a condição virou "o dia pendente ainda está em branco?" (`Dashboard.tsx`); conferido pelo Bernardo em 12/11 |
| Pop-up de registro em conta nova | `streak_service.yesterday_reviewable` + `can_review_yesterday` no `/dashboard`, no fuso do usuário; 12 testes novos; marca do pop-up virou dado de conta (`lib/autoReviewMark`) e a data local unificada em `lib/localDate`; PR #157 |
| Acabamentos da exclusão de conta | falha ao carregar o perfil virou aviso visível com "Tentar de novo"; `.single()` em `try` (400, não 500); corpo do `DELETE` confirmado atravessando o Nginx em produção (422 com corpo malformado, 401 sem); commit `0d96211` |
| Congelar trabalho pago de inativos | `profiles.last_seen_at` (Migration 40, aplicada em 12/11) gravada 1×/dia em `get_current_user`; 21 dias sem uso congelam só relatórios, catch-up e análise de rotina — reconcile, close_day e push seguem; 26 testes; **a economia só aparece a partir de 03/12/2026** (o backfill deu 21 dias a todas as contas existentes); commit `0d96211` |
| As quatro notificações (item 10) | resumo do dia no `planning_daily`, 30 min antes (uma consulta por ciclo, paginada, fora para inativos), registro e organizar o amanhã; Migration 41 aplicada em 13/11; 61 testes; **painel de notificações remontado** em Configurações → Organização (estava órfão desde 29/07, commit `e751547`); busca de perfis do scheduler paginada nos três degraus. **Backend só sobe junto com a release**: as notificações nascem ligadas e o botão de desligar só existe na build nova. Falta a rodada de textos (10a) |

> Falta só confirmar a **bolinha visual** dos eventos — o cálculo já está certo.

---

# Hipóteses descartadas por medição

Guardadas para ninguém gastar tempo nelas de novo. As duas pareciam graves no
papel e caíram na medição de 12/11/2026.

- **`tags_for_tasks` estourando o limite de URL.** O `.in_("task_id", ...)` manda
  todos os ids num filtro só: com 599 tarefas são ~22 KB de URL, acima do limite
  típico de 8 KB do nginx, e o erro é engolido em `tasks_service.py` com um
  `print`. Conferido ao vivo no `journalctl -u axon-api` abrindo o Planning em
  produção: a linha "tags não carregadas" **não aparece**, e o controle (as
  linhas `GET /tasks` do uvicorn no mesmo log) prova que o journal captura o
  stdout. O Supabase aceita a URL longa. Reabrir só se alguém passar de umas
  1.500 tarefas.
- **`db-max-rows` truncando listas em silêncio.** O padrão do PostgREST é 1.000
  linhas. A maior conta tem **599** tarefas; a segunda, 66. Ninguém está sendo
  truncado. Reabrir quando a maior conta chegar perto de 1.000.


# Dependências

```
23 (documentar)   →  22 (insights)
8  (planos)       →  9  (cota e %)
3 e 4             →  mesmo prompt, um agente resolve os dois
12 ↔ 13 ↔ 14      →  a mesma noção de conflito, em 3 momentos
```

# Como usar

Marque aqui, **não em outro lugar**. Quando um item sair, mova para a tabela
"FEITO" com a evidência — foi a falta disso que fez metade da lista original
conter coisas que já estavam prontas.

Quando reordenar, mantenha **uma numeração só**. A versão anterior deste
arquivo tinha três numerações cruzadas e ficou impossível de seguir.
