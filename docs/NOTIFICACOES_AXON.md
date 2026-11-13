# Notificações do Axon — vozes, textos e medição

Rascunho de 13/11/2026, **aprovado pelo Bernardo em 13/11** com cinco ajustes:
variações para dia com uma tarefa só (`*_uni`), vírgula do `man_vaz_2`, título
verdadeiro do `man_mem_1`, condição do `reg_pri` e "o mais difícil" no `man_rit_1`. **Os textos são a parte para
editar à vontade**; as regras de honestidade e de privacidade (seções 2 e 3)
são as que eu manteria mesmo mudando todo o resto.

Inspiração declarada: o sistema de notificações do Duolingo — não as frases, o
**sistema**: personagem com voz, muitas variações sorteadas sem repetição, a
ofensiva no centro e medição do que funciona. Do Duolingo **não** levamos a
culpa passivo-agressiva: o Axon fala com gente cansada tentando organizar a
vida, às 21h, e "você falhou de novo" é a mensagem que faz desinstalar.

---

## 1. As famílias (vozes)

O Axon é parceiro, então não tem uma voz só. Cada notificação sorteia entre
famílias, conforme o que é verdade naquele momento para aquela pessoa.

| Família | Tom | Quando faz sentido |
|---|---|---|
| **Parceiro** | caloroso, do seu lado | sempre — é a voz padrão e o plano B de todas |
| **Brincalhão** | leve, um emoji no máximo | sempre, sem exagerar na frequência |
| **Curioso** | descoberta, "o que seu dia revela" | sempre |
| **Ritmo** | cronobiologia — pico de energia, blocos | quando o horário do cronotipo/calibração se aplica |
| **Dados** | números reais da pessoa | só com dado suficiente (regras na seção 2) |
| **Memória** | "você já me mostrou que consegue" | só quando existe o feito real no histórico |
| **Ofensiva** | sequência, marcos | ofensiva ≥ 2 |

Limite físico: no Android, com a notificação recolhida, o **título** aparece
inteiro até ~40 caracteres e o **corpo** até ~90. Todos os textos abaixo
respeitam isso, contando com as variáveis em tamanho típico.

### Variáveis disponíveis (todas calculadas em Python, sem Claude)

| Variável | De onde vem |
|---|---|
| `{nome}` | primeiro nome do perfil |
| `{n}` | itens do dia não concluídos |
| `{hora}`, `{tarefa}` | próximo item com horário |
| `{ofensiva}` | `streak_service.get_streak` |
| `{media_semana}` | média de `completion_rate` em `daily_task_stats`, semana atual |
| `{melhor_semana}` | maior média semanal das últimas 8 semanas |
| `{feitas_hoje}`, `{total_hoje}` | itens concluídos / total de hoje |
| `{pico}` | início do pico de energia (cronotipo ou curva calibrada) |
| `{faltam_calibrar}` | 14 − pontos de calibração (`calibration_service`) |

---

## 2. Regras de honestidade dos dados

Uma mensagem com número só funciona se o número for verdadeiro **e** justo. Cada
variação da família Dados ou Memória tem pré-condição; sem ela, a variação não
entra no sorteio.

1. **Média da semana** só com pelo menos 3 dias da semana com tarefas. "100% de
   média" com uma tarefa na segunda-feira é mentira estatística.
2. **Número ruim nunca vira notificação.** Se a média está abaixo de 60%, as
   variações de Dados saem do sorteio e entram Parceiro/Curioso. Não existe
   "seu ritmo caiu" — cobrança com número é a culpa do Duolingo com mais
   precisão.
3. **"Você já me mostrou isso"** só se `{melhor_semana}` for real, de semana
   completa, e maior que a média atual.
4. **Padrões ("em dias que X você rende mais")** só a partir de uma correlação
   que o `correlations_service` já considerou significativa. Nunca inventar a
   relação no texto.
5. **Marcos da ofensiva** (7, 30, 100…) só quando o registro de hoje leva
   exatamente ao marco.

## 3. Regra de privacidade: tela de bloqueio

**Notificação aparece na tela de bloqueio**, onde qualquer pessoa ao lado lê.
Sono e humor são dados de saúde (assim declarados no Data Safety).

- **Nenhum dado de sono, humor ou saúde no texto da notificação.**
- Padrões que envolvem sono/humor viram **convite**: "Descobri um padrão nos
  seus dias mais produtivos. Quer ver?" — o detalhe fica dentro do app, atrás
  do login.
- Percentual de conclusão e ofensiva podem aparecer (não são saúde).

---

## 4. Os textos

`id` é o identificador que vai gravado em cada envio (seção 5). Formato:
**título** / corpo.

### 4.1 Registro do dia (fim do dia)

| id | Família | Condição | Texto |
|---|---|---|---|
| reg_par_1 | Parceiro | — | **Fechando o dia, {nome}?** / Me conta como foi. Amanhã eu organizo melhor pra você. |
| reg_par_2 | Parceiro | — | **Antes de descansar…** / Como foi seu dia? Seu registro me ajuda a acertar seus horários. |
| reg_bri_1 | Brincalhão | — | **O Axon tá de olho 👀** / Seu dia não vai se registrar sozinho. Um minutinho? |
| reg_bri_2 | Brincalhão | — | **Psiu, {nome}** / Faltou só uma coisa hoje: me contar como foi. |
| reg_cur_1 | Curioso | — | **Hoje rendeu ou travou?** / Cada registro mostra mais do seu ritmo. Esse leva 30 segundos. |
| reg_cur_2 | Curioso | — | **Seu dia teve cara de quê?** / Três toques e eu aprendo mais sobre você. |
| reg_ofe_1 | Ofensiva | ofensiva ≥ 2 | **🔥 {ofensiva} dias seguidos** / Não deixa a chama apagar hoje. |
| reg_ofe_2 | Ofensiva | ofensiva ≥ 2 | **{ofensiva} dias e contando** / Mais um registro e a sequência continua. |
| reg_marco | Ofensiva | hoje leva a 7/30/100… | **Hoje são {ofensiva+1} dias 🔥** / Um marco desses merece ser fechado. |
| reg_dad_cal | Dados | faltam 1–10 p/ calibrar | **Faltam {faltam_calibrar} registros** / Com eles eu calibro sua curva de energia de verdade. |
| reg_pri | Parceiro | nenhum registro ainda | **Seu primeiro registro, {nome}** / É assim que eu começo a entender seu ritmo. Leva 30 segundos. |

**Ofensiva em risco** (ontem ficou sem registro, `streak.frozen`): esta tem
prioridade sobre o sorteio, e o toque abre o registro de **ontem**:

| id | Texto |
|---|---|
| reg_risco_1 | **Sua ofensiva de {ofensiva} dias** / Ontem ficou sem registro. Ainda dá tempo de salvar. |
| reg_risco_2 | **Ainda dá tempo 🔥** / Registra ontem e seus {ofensiva} dias continuam. |

### 4.2 Resumo da manhã (substitui o texto do `planning_daily`)

O núcleo informativo (quantos itens, qual o próximo e quando) fica em todas; o
que muda é o título e o ângulo.

| id | Família | Condição | Texto |
|---|---|---|---|
| man_par_1 | Parceiro | n ≥ 2 | **Bom dia, {nome}!** / Hoje são {n} tarefas. A primeira às {hora}: {tarefa}. |
| man_bri_1 | Brincalhão | n ≥ 2 | **Café pronto? ☕** / Hoje são {n} tarefas te esperando. A primeira às {hora}. |
| man_rit_1 | Ritmo | n ≥ 2 | **Seu pico começa às {pico}** / Hoje são {n} tarefas. Guarde o mais difícil para esse horário. |
| man_dad_1 | Dados | n ≥ 2, regra 1 e 2 | **{media_semana}% esta semana** / Mais um dia assim e a semana fecha forte. Hoje são {n}. |
| man_mem_1 | Memória | n ≥ 2, regra 3 | **Sua melhor semana: {melhor_semana}%** / Você já mostrou que consegue. Hoje são {n} tarefas. |
| man_par_uni | Parceiro | n = 1 | **Bom dia, {nome}!** / Hoje o foco é um só: {tarefa}. |
| man_bri_uni | Brincalhão | n = 1 | **Café pronto? ☕** / Só uma missão hoje: {tarefa}. |
| man_rit_uni | Ritmo | n = 1 | **Seu pico começa às {pico}** / Um item só hoje: {tarefa}. Cabe direitinho nesse horário. |
| man_vaz_1 | Parceiro | n = 0 | **Dia em branco, {nome}** / Quer que eu te ajude a organizar? Leva 2 minutos. |
| man_vaz_2 | Curioso | n = 0 | **Dia livre hoje?** / Se for descanso, aproveita. Se não, posso te ajudar a organizar. |

"Tarefas" vira "compromissos" quando há evento no dia (regra que já existe).

### 4.3 Organizar o amanhã (só quando amanhã está vazio)

| id | Família | Condição | Texto |
|---|---|---|---|
| ama_par_1 | Parceiro | — | **Que tal deixar amanhã pronto?** / Alguns minutos agora deixam a manhã bem mais leve. |
| ama_bri_1 | Brincalhão | — | **Amanhã tá em branco 👀** / Bora preencher antes de dormir? Eu te ajudo. |
| ama_rit_1 | Ritmo | — | **Amanhã seu pico é às {pico}** / Planejando agora, a tarefa mais pesada cai nele. |
| ama_mem_1 | Memória | feitas_hoje ≥ 1 | **Hoje você fez {feitas_hoje} de {total_hoje}** / Fecha o dia deixando amanhã encaminhado? |

### 4.4 Trinta minutos antes (utilitário — pouca variação de propósito)

| id | Condição | Texto |
|---|---|---|
| tar_1 | — | **{tarefa}** / Começa em {min} minutos, às {hora}. |
| tar_pico | o horário cai no pico de energia | **{tarefa}** / Começa às {hora}, bem no seu pico de energia. |

### 4.5 Planejamento da semana (já existia; reescrito para caber em 90)

| id | Família | Condição | Texto |
|---|---|---|---|
| sem_par_1 | Parceiro | — | **Semana nova, {nome}** / Vamos planejar juntos? Eu encaixo tudo no seu ritmo. |
| sem_dad_1 | Dados | regra 1 e 2 (semana passada) | **Semana passada: {media_semana}%** / Bora planejar a próxima no mesmo ritmo? |
| sem_cur_1 | Curioso | — | **Como vai ser essa semana?** / Dez minutos agora e eu cuido do resto. |

### 4.6 Para depois (item 35 — reativação)

Não entram nesta release. Registrados para não se perder:

- **Padrão descoberto** (teaser, regra 4): "Descobri um padrão nos seus dias
  mais produtivos. Quer ver?"
- **Recuo com quem sumiu**, no espírito do Duolingo mas sem culpa: "Parece que
  meus lembretes não estão ajudando agora. Vou dar um tempo — quando quiser,
  estou aqui."

---

## 5. Como escolher e como medir

**Sorteio:** entre as variações elegíveis, sorteio uniforme, excluindo as que
a pessoa recebeu nos últimos 7 dias daquela notificação. Sorteio aleatório (e
não "a que funciona melhor") é o que permite comparar depois: cada variação
recebe uma amostra justa.

**O que é gravado em cada envio** (no `action` da notificação): `variant_id` e
`family`.

**Abertura:** hoje tocar na notificação **não marca nada**. Precisa passar a
marcar `read_at` quando a pessoa toca no push.

**Resultado** (o que importa, mais que abrir):

| Notificação | Conta como sucesso |
|---|---|
| Registro | registro daquele dia feito em até 3h depois do envio |
| Amanhã | pelo menos uma tarefa criada para amanhã antes da meia-noite |
| Resumo da manhã | toque na notificação (por enquanto) |
| 30 min antes | tarefa concluída no dia |

**Honestidade sobre a amostra:** com a base atual, comparar variações não dá
resposta confiável por meses — diferença entre textos aparece com centenas de
envios por variação. O que se faz agora é **gravar desde o primeiro envio**,
para a análise existir quando a base crescer. Uma consulta SQL de comparação
fica pronta junto.

Esse registro é medição própria de uso, já declarada no Data Safety em
"Atividade no app → Interações com o app", finalidade Análise.

### Consulta de comparação

Para rodar no SQL Editor do Supabase quando a base crescer. Só lê. Precisa da
Migration 42 (`tapped_at`); sem ela, a coluna de toques não existe.

Uma linha por tipo de notificação e variação: envios, toques no push e
sucessos pela tabela acima. As reservas (`man_reserva`, `man_generico`)
aparecem separadas das variações do catálogo. O semanal não tem critério de
sucesso definido e sai com `sucessos` vazio. O dia de cada envio é o do fuso
da pessoa (`profiles.timezone`, São Paulo quando vazio).

```sql
with envios as (
  select
    n.id, n.user_id, n.type, n.created_at, n.tapped_at,
    n.action->>'variant_id' as variant_id,
    n.action->>'family'     as family,
    n.action->>'task_id'    as task_id,
    coalesce(p.timezone, 'America/Sao_Paulo') as tz,
    -- dia a que o envio se refere: o `date` gravado; nos antigos, o dia local do envio
    coalesce(
      (n.action->>'date')::date,
      (n.created_at at time zone coalesce(p.timezone, 'America/Sao_Paulo'))::date
    ) as dia
  from public.notifications n
  join public.profiles p on p.id = n.user_id
  where n.action ? 'variant_id'
)
select
  e.type,
  e.variant_id,
  e.family,
  count(*)                       as envios,
  count(e.tapped_at)             as toques,
  round(100.0 * count(e.tapped_at) / count(*), 1) as toques_pct,
  sum(case e.type
    -- Registro: registro daquele dia feito (ou completado) até 3h depois do envio
    when 'day_review_reminder' then (exists (
      select 1 from public.daily_logs dl
      where dl.user_id = e.user_id and dl.date = e.dia
        and greatest(dl.created_at, coalesce(dl.updated_at, dl.created_at))
            between e.created_at and e.created_at + interval '3 hours'))::int
    -- Amanhã: ao menos uma tarefa criada para amanhã antes da meia-noite local
    when 'plan_tomorrow_reminder' then (exists (
      select 1 from public.tasks t
      where t.user_id = e.user_id and t.scheduled_date = e.dia
        and t.created_at >= e.created_at
        and t.created_at < (e.dia::timestamp at time zone e.tz)))::int
    -- Resumo da manhã: o toque, por enquanto
    when 'planning_daily' then (e.tapped_at is not null)::int
    -- 30 min antes: a tarefa foi concluída no dia dela
    when 'task_reminder' then (exists (
      select 1 from public.tasks t
      where t.id::text = e.task_id and t.user_id = e.user_id
        and t.status = 'done'
        and (t.completed_at at time zone e.tz)::date = e.dia))::int
  end) as sucessos
from envios e
group by e.type, e.variant_id, e.family
order by e.type, envios desc;
```

Lembrete da seção acima: com poucas dezenas de envios por variação, a
diferença entre as linhas é ruído.
