# Prompt — O agendamento respeitar os compromissos fixos

Item 17 do `docs/ROTEIRO_PRODUTO.md` (Tier 1). Leia o `AGENTS.md` antes de
mexer em qualquer coisa.

**O problema:** o onboarding novo pergunta ao usuário quais são os compromissos
fixos dele — trabalho, estudo, almoço — e grava em `profiles.fixed_commitments`.
**Nenhuma função que escolhe horário lê esse campo.** O Axon continua agendando
tarefa em cima do almoço e do expediente da pessoa.

Perguntar e ignorar é pior do que não perguntar: o usuário informou, espera que
valha, e perde a confiança quando a primeira sugestão cai no meio do trabalho.

## O que já existe

```sql
-- Migration 39
profiles.fixed_commitments jsonb
-- lista de {activity, days[seg..dom], start "HH:MM", end "HH:MM"}
-- Só vale com schedule_type = 'fixed'.
```

O **chat já lê** esse campo: `services/prompts.py:237` formata os compromissos
com `_dias_texto()` e os coloca no contexto do Axon. Então a conversa sabe; o
agendamento não.

## Onde está o buraco — são quatro lugares, não um

Conferi cada um. Todos escolhem horário e nenhum enxerga compromisso:

| Arquivo | Função | Como enxerga "ocupado" hoje |
|---|---|---|
| `routines_service.py:423` | `_free_slot` | recebe `busy: list[tuple[int,int]]` — **intervalos**, formato certo |
| `routines_service.py:536` | `pick_best_slot` | repassa para `_free_slot` |
| `notification_analyzer.py:128` | `_find_good_slot` | recebe `busy_times: set[str]` — **só horários de início** |
| `notification_analyzer.py:184` | `_pick_free_good_slot` | idem |
| `routine_analysis_service.py:149` | `best_slot` | próprio |
| `agent_tools.py` | criação de tarefa | detecta `conflito_de_horario`, mas **só contra tarefas** |

> ⚠️ **A armadilha que define esta tarefa.** Em `notification_analyzer.py:636`,
> `busy_times` é montado como um **conjunto de horários de início**:
> ```python
> busy_times = {t["start_time"][:5] for t in (...) if t.get("start_time")}
> ```
> Um almoço das 12:00 às 13:00 **não cabe nessa estrutura**. Se você só
> acrescentar `"12:00"` ao conjunto, o slot das 12:30 continua livre e o Axon
> agenda no meio do almoço — com a tarefa "corrigida" e o bug vivo.
>
> `_find_good_slot` precisa passar a raciocinar com **intervalos**, não com
> horários de início. É mudança de forma, não de dado. Essa é a parte difícil;
> o resto é encanamento.

## O que construir

### 1. Um helper só, e todo mundo usa

Uma função em `services/` que, dado o `user_id` e uma data, devolve os
compromissos daquele dia como **intervalos em minutos** — o mesmo formato que o
`_free_slot` já aceita. Nome e lugar: escolha o que combinar com o projeto, mas
**uma só**. Quatro lugares com quatro leituras do mesmo campo é como este bug
volta na próxima feature.

Regras:

- **Só vale com `schedule_type == 'fixed'`.** É o que o comentário da coluna diz.
  Com qualquer outro valor, devolve vazio e tudo se comporta como hoje.
- **Dia da semana** pelas chaves `seg ter qua qui sex sab dom`, no **fuso do
  usuário** (`services/user_tz`), nunca no do servidor.
- **`fixed_commitments` nulo, ausente ou lista vazia → devolve vazio.** Isso não
  é caso de borda: é a maioria dos usuários hoje, que criou conta antes da
  Migration 39. Nenhum comportamento pode mudar para eles.
- **Compromisso que vira o dia** (`end` menor que `start`, ex.: turno 22:00–06:00)
  precisa funcionar. Decida como representar e **comente a decisão**.

### 2. Alimentar os quatro caminhos

- `routines_service._free_slot` e `pick_best_slot`: juntar os intervalos do
  helper ao `busy` que já recebem. É o mais simples — o formato já bate.
- `notification_analyzer._find_good_slot` e `_pick_free_good_slot`: **mudar para
  intervalos** (ver a armadilha acima) e então incluir os compromissos.
- `routine_analysis_service.best_slot`: idem.

### 3. O agente, ao criar tarefa

`agent_tools.py` já tem `conflito_de_horario` e `confirmar_conflito` para
sobreposição com outra tarefa. Compromisso fixo entra na **mesma** mecânica:
avisa e pede confirmação, **não bloqueia**. O horário é do usuário; se ele quer
marcar algo no almoço, pode. O que não pode é o Axon marcar sozinho sem avisar.

Reuse o fluxo existente; a mensagem muda para citar o compromisso pelo nome
(`activity`), já que ele tem um e a tarefa conflitante também tem título.

## O que NÃO fazer

- **Não transforme compromisso em tarefa.** Ele bloqueia o agendamento; não
  aparece como item concluível, não entra em estatística, não conta para
  porcentagem do dia.
- **Não mexa em `work_start`/`work_end`.** A Migration 39 os marcou "SEM USO";
  deixe como estão.
- **Não mude `prompts.py`**: o chat já lê os compromissos e está certo.
- **Não altere o `FixedCommitmentsEditor`** nem o onboarding: a captura funciona.
- **Nada de migration nova.** A coluna existe e está aplicada.
- Mostrar os compromissos desenhados no calendário é **outra decisão**, fora
  desta rodada. Se achar que vale, escreva a sugestão no relatório — não
  implemente.

## Como testar

Com um perfil `schedule_type = 'fixed'` e almoço seg–sex, 12:00–13:00:

1. Pedir ao Axon para agendar uma tarefa de 30 min numa segunda com a manhã
   cheia → **não** cai entre 12:00 e 13:00.
2. Tarefa de 90 min num dia em que só sobra 11:30–13:30 → não encaixa à força
   por cima do almoço.
3. **Slot das 12:30** (o caso da armadilha): com o almoço 12:00–13:00, nenhum
   caminho pode oferecer 12:30.
4. Rotina gerada por `pick_best_slot` → não cai no compromisso.
5. Análise de rotina (`best_slot`) → não propõe mover tarefa para dentro dele.
6. Agente criando tarefa às 12:15 → **avisa** e pede confirmação; confirmando,
   cria normalmente.
7. **Sábado**, com o almoço só de seg a sex → 12:00 está livre.
8. Perfil **sem** `fixed_commitments` (a maioria hoje) → comportamento
   **idêntico** ao de antes, em todos os quatro caminhos.
9. Perfil com `schedule_type` diferente de `'fixed'` → idem, campo ignorado.
10. Compromisso 22:00–06:00 → bloqueia as duas pontas do dia, e uma tarefa às
    23:00 é recusada.
11. Usuário em fuso diferente do servidor → o dia da semana usado é o dele.

## Definition of Done (`AGENTS.md §18`)

- [ ] `cd backend && python3 -c "import main"`
- [ ] `cd backend && python3 tests_onboarding.py` (e os testes novos, se houver)
- [ ] `cd axonweb && npm run lint` e `npx tsc --noEmit -p tsconfig.json`
- [ ] Os 11 testes acima, com o resultado de cada um no relatório
- [ ] Uma única função lê `fixed_commitments` para agendamento — diga qual
- [ ] Toda query nova filtra `user_id`
- [ ] Comentários em português; nenhum `any`; nenhum segredo

**Não commite.** O Bernardo faz os commits.
