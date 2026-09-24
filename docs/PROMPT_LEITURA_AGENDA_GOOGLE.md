# Prompt — Leitura da agenda do Google (mão dupla)

Contexto para o agente que vai implementar. Leia `AGENTS.md` antes de tocar em
qualquer arquivo.

---

## Por que esta mudança existe

Hoje a sincronização com o Google Agenda é de **mão única**: o AXON cria,
atualiza e apaga eventos no Google, mas **nunca lê** a agenda do usuário.

Isso foi descoberto ao preparar a verificação do OAuth com o Google. A interface
promete "Conecte o Google Calendar para sincronizar seus compromissos" e o
`pick_best_slot` diz escolher horário "com base no que já está agendado no dia" —
mas o que ele consulta é apenas a tabela `tasks`. Um compromisso que o usuário
criou direto no Google Agenda é invisível para o AXON, que pode agendar uma
tarefa em cima dele.

A verificação do escopo `calendar.events` junto ao Google declara leitura. Esta
implementação torna a declaração verdadeira.

## O que NÃO fazer

**Não importe os eventos do Google para a tabela `tasks`.** Isso criaria um
laço: o AXON cria um evento no Google → lê de volta → vira tarefa nova → que
sincroniza de novo. Os eventos externos são **somente leitura** e nunca são
persistidos.

**Não persista título ou descrição de evento do Google em lugar nenhum.** São
dados pessoais de compromissos que não pertencem ao AXON. Eles entram em memória,
servem para calcular horários ocupados e para exibir na tela, e acabam ali.
Isso também mantém o formulário de Data Safety da Play Store simples.

---

## Estado atual do código

| Arquivo | O que tem hoje |
|---|---|
| `backend/services/google_service.py` | `create_calendar_event` (POST), `update_calendar_event` (PATCH), `delete_calendar_event` (DELETE). **Nenhum GET.** `_CALENDAR_BASE` aponta para o calendário `primary`. |
| `backend/services/calendar_sync.py` | Espelha tarefa → Google numa thread, best-effort. Só os verbos `create`/`update`/`delete`. |
| `backend/services/routines_service.py:520` | `_busy_intervals(user_id, day)` — **único ponto** que alimenta `pick_best_slot` com horários ocupados. Consulta só `tasks`. |
| `backend/services/routines_service.py:~597` | `_materialize` tem a própria consulta em lote de ocupação, por intervalo de dias. |
| `profiles.google_refresh_token` | Onde mora o token. Nulo = usuário sem Google conectado. |
| `tasks.google_event_id` | Id do evento que o AXON criou no Google (Migration, linha 173 de `migrations.sql`). |

**Nenhuma migration é necessária.** Não há coluna nova nem tabela nova.

---

## Fase 1 — Backend: ler a agenda

### 1.1 `google_service.py` — a função de leitura

Adicione, junto das outras funções de calendário:

```python
def list_calendar_events(access_token: str, time_min: str, time_max: str) -> list[dict]:
    """
    Eventos do calendário primário no intervalo [time_min, time_max].
    `time_min`/`time_max` em RFC3339 com offset (ex.: 2026-09-23T00:00:00-03:00).

    singleEvents=True é obrigatório: sem ele, uma reunião semanal volta como UMA
    entrada com RRULE em vez das ocorrências reais do dia, e o cálculo de
    horários ocupados erraria em silêncio.
    """
    with httpx.Client() as client:
        resp = client.get(
            _CALENDAR_BASE,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
        )
    resp.raise_for_status()
    return resp.json().get("items", [])
```

### 1.2 Novo módulo `backend/services/calendar_read.py`

Espelha `calendar_sync.py` no sentido oposto. Responsabilidades:

**a) `external_events(user_id, day) -> list[dict]`**

Retorna os eventos do Google daquele dia, já **sem os que o próprio AXON criou**.

Passos:
1. Ler `google_refresh_token` e `timezone` do perfil (reaproveite a lógica de
   `calendar_sync._get_sync_profile` — extraia para um lugar comum em vez de
   duplicar).
2. Sem token → retorna `[]`. Usuário não conectou o Google; não é erro.
3. Montar `time_min`/`time_max` como início e fim do **dia local** do usuário,
   em RFC3339 com offset. Use `services/user_tz` — não use UTC direto, senão o
   dia do usuário fica deslocado.
4. `refresh_access_token` → `list_calendar_events`.
5. **Filtrar os eventos do próprio AXON** (ver 1.3).
6. Normalizar cada evento para o formato abaixo.

Formato de saída (o mesmo que vai para o frontend):

```python
{
    "id": str,           # id do evento no Google
    "title": str,        # summary; "(sem título)" quando ausente
    "start_time": str,   # "HH:MM" — None em evento de dia inteiro
    "end_time": str,     # "HH:MM" — None em evento de dia inteiro
    "all_day": bool,
}
```

**b) `busy_intervals(user_id, day) -> list[tuple[int, int]]`**

Os mesmos eventos convertidos em pares `(minuto_inicio, minuto_fim)`, no formato
que `routines_service` já usa. Eventos de dia inteiro **não** entram — bloquear
o dia inteiro impediria qualquer agendamento, e um feriado ou aniversário não
significa que a pessoa está ocupada.

**c) Cache em memória, TTL de 5 minutos**

Cada chamada ao Google custa centenas de ms, e `_busy_intervals` roda a cada
criação de tarefa. Sem cache, criar 5 tarefas seguidas faria 5 chamadas.

Use um dict de módulo, no mesmo estilo dos `_pending_states` de
`google_service.py`: chave `(user_id, str(day))`, valor `(eventos, timestamp)`.
Produção roda **um worker só** (AGENTS.md seção 3), então cache em processo é
suficiente e não precisa de tabela.

Exponha `invalidate(user_id, day)` e chame-a depois de o AXON criar ou apagar um
evento no Google, para a próxima leitura não vir defasada.

**d) Tratamento de erro — leia com atenção**

O padrão do projeto é engolir falha de integração secundária. **Aqui não é bem
assim.** Se a leitura falhar em silêncio, `_busy_intervals` devolve só as tarefas
internas e o AXON agenda por cima de um compromisso real — resposta errada sem
erro nenhum, que é exatamente a armadilha registrada em
`calibracao-tabela-inexistente`.

Faça assim:
- A função **não** lança exceção (não pode quebrar a criação de tarefa).
- Mas registra o estado: retorne também um indicador de falha, ou guarde-o no
  cache, para o endpoint da fase 2 poder dizer ao frontend
  `"google_status": "error"`.
- `print` de diagnóstico **sem** título de evento nem e-mail (AGENTS.md 10.7).

### 1.3 Filtrar os eventos que o próprio AXON criou

Sem isso, um evento criado pelo AXON seria contado duas vezes: uma como tarefa,
outra como evento externo — e o dia pareceria cheio.

Monte o conjunto de ids próprios:

```sql
select google_event_id from tasks
 where user_id = :user_id and google_event_id is not null
```

Ao filtrar, atenção a uma pegadinha: com `singleEvents=true`, a ocorrência de um
evento recorrente vem com id `<id_base>_20260923T120000Z`. Comparar id inteiro
deixaria passar as ocorrências de rotinas que o AXON criou. Compare também o
prefixo antes do primeiro `_`.

Reforço opcional: o AXON sempre escreve `"Sincronizado pelo Axon."` no fim da
descrição (`calendar_sync._task_to_event`). Dá para usar como segunda checagem.

### 1.4 Ligar nos dois pontos de agendamento

**`routines_service._busy_intervals` (linha 520):** depois de montar a lista das
tarefas, some `calendar_read.busy_intervals(user_id, day)`.

**`routines_service._materialize` (~linha 597):** a consulta em lote cobre um
intervalo de dias. Chame a leitura **uma vez por dia do intervalo** e acrescente
em `busy_by_date`. Cuidado com o alcance: materialização de rotina cobre até 60
dias — 60 chamadas ao Google numa tacada só é inaceitável. Limite a leitura
externa aos **próximos 7 dias** do intervalo e siga sem ela no resto, ou leia o
intervalo inteiro numa única chamada (`timeMin`/`timeMax` aceitam qualquer
janela) e agrupe por dia em memória. **A segunda opção é a correta** — uma
chamada só, e o agrupamento é de graça.

---

## Fase 2 — Endpoint e frontend

### 2.1 Endpoint

`GET /tasks/external-events?date=YYYY-MM-DD` em `backend/routers/tasks.py`,
autenticado como os demais.

Resposta:

```json
{
  "events": [ { "id": "...", "title": "...", "start_time": "09:00",
                "end_time": "10:00", "all_day": false } ],
  "google_status": "ok" | "disconnected" | "error"
}
```

Schema Pydantic novo em `models/schemas.py`. **Atenção:** campo não declarado no
schema é filtrado em silêncio e nunca chega ao frontend — já aconteceu com
`completed_at` neste projeto. Declare os cinco campos.

`disconnected` quando não há `google_refresh_token` — o frontend usa isso para
não mostrar erro a quem simplesmente não conectou a agenda.

### 2.2 `axonweb/src/lib/api.ts`

Função `getExternalEvents(date: string)` com o tipo de resposta ao lado, como
manda a seção 6 do AGENTS.md. Nada de `fetch` direto na página.

### 2.3 `axonweb/src/pages/Planning.tsx`

Os eventos externos aparecem na lista do dia, **intercalados por horário** com as
tarefas, e são visivelmente diferentes:

- Rótulo "Google Agenda" no cartão
- **Sem** ícones de editar, excluir, marcar ou adicionar subtarefa — o AXON não
  é dono desses eventos
- Sem barra de progresso
- Não entram na contagem "X de Y tarefas concluídas" nem na porcentagem do dia.
  Essa conta é do planejamento do usuário no AXON; misturar compromissos
  externos distorceria a métrica e o snapshot diário que depende dela.

Quando `google_status === "error"`, mostre um aviso discreto: *"Não foi possível
ler sua agenda do Google agora."* Não use `EmptyState` — é um estado de erro
parcial, o resto da tela continua útil.

Siga o design system (seção 11 do AGENTS.md): tokens, `rounded-2xl`, sem hex
novo hardcoded.

---

## Fase 3 — Corrigir o bug do localStorage

Bug encontrado junto: a escolha "Google Calendar" fica em `localStorage`
(`Planning.tsx:224`, chave `axon_calendar_setup_choice`), não no perfil. Uma
conta nova criada no mesmo navegador **herda a escolha da conta anterior** e vê
"Google Calendar selecionado" sem nunca ter conectado nada.

Correção: a escolha passa a viver no backend.

- Migration nova (a próxima livre) em `backend/migrations.sql`, com o porquê:
  `profiles.calendar_setup_choice text` — valores `google`, `independent`, nulo.
- Endpoint para ler e gravar (pode entrar no router de profile que já existe).
- `Planning.tsx` lê do backend, não do `localStorage`.
- Remova a chave antiga na primeira carga, para não deixar lixo no navegador
  dos usuários atuais.

Isso segue a regra que já está registrada no projeto: a fonte da verdade é o
backend (`axon-arquitetura-debug`).

---

## Verificação

1. Criar um evento **direto no Google Agenda** para hoje, às 15:00–16:00.
   Abrir o Planning do AXON → o evento aparece na lista, marcado "Google Agenda",
   sem botões de edição.
2. Criar uma tarefa no AXON com "Axon decide", duração 60 min, num dia em que o
   único espaço livre seja fora desse intervalo → **o AXON não agenda 15:00–16:00**.
3. Criar uma tarefa no AXON com horário fixo → ela vira evento no Google (fluxo
   antigo, não pode ter quebrado) e **não aparece duplicada** como evento externo.
4. Criar uma rotina que materialize 60 dias → conferir na aba Network que houve
   **uma** chamada de leitura, não 60.
5. Desconectar o Google no perfil → `google_status: "disconnected"`, nenhum aviso
   de erro na tela, agendamento volta a considerar só as tarefas internas.
6. Revogar o acesso em `myaccount.google.com/permissions` sem desconectar no app
   → `google_status: "error"`, aviso discreto, app continua utilizável.
7. Evento de dia inteiro (um feriado) → aparece na lista, **não** bloqueia o dia
   para agendamento.
8. Evento recorrente semanal → a ocorrência do dia aparece; a de outros dias não.
9. Criar conta nova no mesmo navegador → a tela pergunta de novo como usar a
   agenda (fase 3).

## Definition of Done

O checklist da seção 18 do `AGENTS.md`, integralmente. Em especial:
`npm run lint`, `npx tsc --noEmit`, `npm run build`, e
`cd backend && python3 -c "import main"`.

## Limitação conhecida, a documentar

A leitura cobre apenas o calendário `primary`. Calendários secundários do usuário
não são lidos. Ler todos exigiria listar a `calendarList`, o que pede escopo
adicional — e ampliar escopo durante uma verificação em andamento junto ao Google
é má ideia. Registre isso num comentário no módulo novo.
