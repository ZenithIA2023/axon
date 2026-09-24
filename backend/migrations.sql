-- =============================================
-- AXON — MIGRAÇÕES INCREMENTAIS
-- Execute no Supabase SQL Editor em ordem.
-- =============================================


-- =============================================
-- MIGRAÇÃO 1: Corrigir e expandir tabela profiles
-- =============================================

-- Remover constraint antiga de chronotype (valores em inglês)
alter table public.profiles
  drop constraint if exists profiles_chronotype_check;

-- Adicionar nova constraint com valores em português + inglês (retrocompatibilidade)
alter table public.profiles
  add constraint profiles_chronotype_check
  check (chronotype in (
    'morning', 'intermediate', 'evening', 'night',
    'Matutino', 'Vespertino', 'Noturno', 'Misto', 'Bimodal'
  ));

-- Adicionar qualidade_sono — guarda a LETRA da pergunta P9 (A–F).
-- A tradução para texto significativo é feita no backend (services/prompts.py).
alter table public.profiles
  add column if not exists qualidade_sono text;

-- Adicionar schedule_type: controla qual agente será usado
alter table public.profiles
  add column if not exists schedule_type text
  check (schedule_type in ('flexible', 'fixed'))
  default null;

-- Adicionar onboarding_completed: sinaliza que o usuário terminou o questionário
alter table public.profiles
  add column if not exists onboarding_completed boolean default false;


-- =============================================
-- MIGRAÇÃO 2: Criar tabela respostas (já usada no código)
-- =============================================

create table if not exists public.respostas (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  pergunta    text not null,
  alternativa text not null,
  created_at  timestamp with time zone default now()
);

create index if not exists respostas_user_id_idx on public.respostas(user_id);

alter table public.respostas enable row level security;

create policy "Usuários veem apenas suas próprias respostas"
  on public.respostas for select
  using (auth.uid() = user_id);

create policy "Usuários inserem apenas suas próprias respostas"
  on public.respostas for insert
  with check (auth.uid() = user_id);

create policy "Usuários deletam apenas suas próprias respostas"
  on public.respostas for delete
  using (auth.uid() = user_id);


-- =============================================
-- MIGRAÇÃO 3: Criar tabela tasks
-- =============================================

create table if not exists public.tasks (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,

  -- Conteúdo
  title           text not null,
  description     text,

  -- Tipo e status
  task_type       text check (task_type in ('task', 'event', 'routine')) not null default 'task',
  status          text check (status in ('todo', 'progress', 'done', 'scheduled')) not null default 'todo',
  priority        text check (priority in ('low', 'medium', 'high')) default 'medium',

  -- Agendamento
  scheduled_date  date,
  start_time      time,
  end_time        time,

  -- Progresso (0–100)
  progress        integer default 0 check (progress >= 0 and progress <= 100),

  -- Recorrência (apenas para task_type = 'routine')
  recurrence      text check (recurrence in ('daily', 'weekly', 'monthly')),

  -- Local ou link (apenas para task_type = 'event')
  location        text,

  -- Hierarquia: subtarefas de um projeto maior
  parent_task_id  uuid references public.tasks(id) on delete cascade,

  -- Agrupamento: conjunto de tarefas similares criado pelo sub-agente agrupador
  group_name      text,

  -- Prazo final: usado pelo sub-agente quebrador de tarefas
  deadline        date,

  -- Origem: indica se foi criada pelo agente ou pelo usuário
  created_by      text check (created_by in ('user', 'agent')) default 'user',

  created_at      timestamp with time zone default now(),
  updated_at      timestamp with time zone default now()
);

-- Índices para queries frequentes
create index if not exists tasks_user_id_idx       on public.tasks(user_id);
create index if not exists tasks_scheduled_date_idx on public.tasks(scheduled_date);
create index if not exists tasks_parent_task_id_idx on public.tasks(parent_task_id);
create index if not exists tasks_status_idx         on public.tasks(status);

-- Trigger updated_at
drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.handle_updated_at();

-- RLS
alter table public.tasks enable row level security;

-- =============================================
-- MIGRAÇÃO 4: Adicionar end_date à tabela tasks
-- =============================================

alter table public.tasks
  add column if not exists end_date date null;

create policy "Usuários veem apenas suas próprias tarefas"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Usuários inserem apenas suas próprias tarefas"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Usuários editam apenas suas próprias tarefas"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Usuários excluem apenas suas próprias tarefas"
  on public.tasks for delete
  using (auth.uid() = user_id);


-- =============================================
-- MIGRAÇÃO 5: Colunas adicionadas diretamente no Supabase (documentação)
-- Estas colunas já existem no banco — este bloco serve apenas como registro.
-- =============================================

-- Tarefa chave: máximo 1 por dia por usuário (unicidade garantida no backend).
alter table public.tasks
  add column if not exists is_key_task boolean default false;

-- Contador de carries: quantas vezes uma tarefa foi postergada para o dia seguinte.
alter table public.tasks
  add column if not exists carry_count integer default 0;

-- Timestamp de conclusão: preenchido automaticamente ao marcar status = 'done'.
alter table public.tasks
  add column if not exists completed_at timestamp with time zone;

-- ID do evento espelhado no Google Agenda (integração Google Calendar).
alter table public.tasks
  add column if not exists google_event_id text;

-- Vínculo com item de rotina que gerou esta tarefa (ON DELETE SET NULL).
alter table public.tasks
  add column if not exists routine_item_id uuid
  references public.routine_items(id) on delete set null;


-- =============================================
-- MIGRAÇÃO 6: Janela de horário em routine_items (not_before / not_after)
-- Permite que itens flexíveis respeitem uma preferência de janela informada
-- pelo usuário no chat (ex: "leitura depois do almoço" → not_before = '13:00').
-- O Axon ainda escolhe o melhor bloco de energia DENTRO dessa janela.
-- =============================================

alter table public.routine_items
  add column if not exists not_before time null,
  add column if not exists not_after  time null;


-- =============================================
-- MIGRAÇÃO 7: Objetivos (tarefa mãe com subtarefas)
-- Um objetivo é um container de tarefas relacionadas com prazo e progresso
-- automático. As subtarefas são tarefas normais vinculadas via objective_id.
-- Cascade: ao deletar um objetivo, todas as suas subtarefas são deletadas.
-- =============================================

create table if not exists public.objectives (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  description text,
  deadline    date,
  status      text check (status in ('active', 'done')) default 'active',
  progress    integer default 0 check (progress >= 0 and progress <= 100),
  created_at  timestamp with time zone default now(),
  updated_at  timestamp with time zone default now()
);

create index if not exists objectives_user_id_idx on public.objectives(user_id);

drop trigger if exists objectives_updated_at on public.objectives;
create trigger objectives_updated_at
  before update on public.objectives
  for each row execute procedure public.handle_updated_at();

alter table public.objectives enable row level security;

create policy "Usuários veem apenas seus próprios objetivos"
  on public.objectives for select using (auth.uid() = user_id);

create policy "Usuários inserem apenas seus próprios objetivos"
  on public.objectives for insert with check (auth.uid() = user_id);

create policy "Usuários editam apenas seus próprios objetivos"
  on public.objectives for update using (auth.uid() = user_id);

create policy "Usuários excluem apenas seus próprios objetivos"
  on public.objectives for delete using (auth.uid() = user_id);

-- Vínculo tarefa → objetivo (cascade: tarefa deletada junto com o objetivo)
alter table public.tasks
  add column if not exists objective_id uuid
  references public.objectives(id) on delete cascade;

create index if not exists tasks_objective_id_idx on public.tasks(objective_id);

-- =============================================
-- Migration 8: prioridade dos objetivos
-- ---------------------------------------------
-- Cada objetivo passa a ter um nível de prioridade (low/medium/high).
-- A listagem ordena por prioridade: alta → média → baixa.
-- =============================================

alter table public.objectives
  add column if not exists priority text
  check (priority in ('low', 'medium', 'high')) default 'medium';

-- =============================================
-- Migration 9: subtarefas (checklist dentro de uma tarefa)
-- ---------------------------------------------
-- Cada tarefa pode ter N subtarefas simples (título + feita/não feita).
-- Ao marcar/desmarcar uma subtarefa o progresso da tarefa mãe é recalculado.
-- Cascade: ao deletar a tarefa mãe, todas as subtarefas somem junto.
-- =============================================

create table if not exists public.subtasks (
  id         uuid default gen_random_uuid() primary key,
  task_id    uuid references public.tasks(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade not null,
  title      text not null,
  done       boolean default false not null,
  position   integer default 0 not null,
  created_at timestamp with time zone default now()
);

create index if not exists subtasks_task_id_idx on public.subtasks(task_id);
create index if not exists subtasks_user_id_idx on public.subtasks(user_id);

alter table public.subtasks enable row level security;

create policy "subtasks_select" on public.subtasks for select using (auth.uid() = user_id);
create policy "subtasks_insert" on public.subtasks for insert with check (auth.uid() = user_id);
create policy "subtasks_update" on public.subtasks for update using (auth.uid() = user_id);
create policy "subtasks_delete" on public.subtasks for delete using (auth.uid() = user_id);

-- =============================================
-- Migration 10: exclusão de contas e bloqueio de e-mail por 60 dias
-- ---------------------------------------------
-- Quando um usuário exclui a conta, gravamos o e-mail aqui.
-- O endpoint de registro verifica se o e-mail está dentro do período de bloqueio.
-- Sem RLS: acessada apenas pelo backend (service_role).
-- =============================================

create table if not exists public.deleted_accounts (
  id         uuid default gen_random_uuid() primary key,
  email      text not null,
  deleted_at timestamp with time zone default now() not null
);

create index if not exists deleted_accounts_email_idx on public.deleted_accounts(email);

-- =============================================
-- Migration 11: período de pico de produtividade no registro diário
-- ---------------------------------------------
-- Permite que o usuário informe em qual(is) período(s) do dia se sentiu
-- mais produtivo. Usado pelo serviço de calibração para personalizar os
-- blocos de foco. Array de até 2 slugs.
-- =============================================

alter table public.daily_logs
  add column if not exists peak_periods text[] default '{}';

-- =============================================
-- Migration 12: perfil de energia personalizado por usuário
-- ---------------------------------------------
-- Armazena os 16 scores de foco (blocos de 90 min) calibrados
-- a partir do comportamento real do usuário. Inicializado com os
-- valores do cronotipo base e ajustado a cada registro diário.
-- Sem RLS: acesso exclusivo via service_role no backend.
-- =============================================

create table if not exists public.user_energy_profiles (
  user_id         uuid references auth.users(id) on delete cascade primary key,
  block_scores    jsonb not null,           -- array de 16 floats (0–100)
  data_points     integer default 0 not null,
  last_calibrated timestamp with time zone,
  created_at      timestamp with time zone default now()
);

-- =============================================
-- Migration 13: snapshot diário congelado de conclusão de tarefas
-- ---------------------------------------------
-- Congela, no fim de cada dia local do usuário, os números REAIS daquele dia
-- (incluindo as pendentes que estão prestes a ser carregadas). Sem isso, o
-- carry-forward reescrevia o scheduled_date das pendentes e todo dia passado
-- exibia falso 100% de conclusão no Planning e no Insights.
-- Escrita/leitura exclusivamente pelo backend (service_role) — sem RLS.
--   completed_score  = pontuação proporcional (subtarefas contam fração)
--   completed_items  = itens 100% concluídos, INCLUI eventos (texto "X de Y" + anel)
--   completed_tasks  = tarefas concluídas por esforço (status 'done'), SEM eventos
--                      auto-concluídos → métrica de produtividade do Insights
--   completion_rate  = round(completed_score / total * 100)
-- =============================================

create table if not exists public.daily_task_stats (
  user_id         uuid references auth.users(id) on delete cascade not null,
  date            date not null,
  total           integer default 0 not null,
  completed_items integer default 0 not null,
  completed_tasks integer default 0 not null,
  completed_score numeric default 0 not null,
  completion_rate integer default 0 not null,
  carried_forward integer default 0 not null,
  created_at      timestamp with time zone default now(),
  primary key (user_id, date)
);

create index if not exists daily_task_stats_user_date_idx
  on public.daily_task_stats(user_id, date desc);

-- Para quem já rodou a versão anterior desta migration (sem completed_tasks):
-- o create table if not exists acima não altera a tabela existente, então
-- garantimos a coluna à parte. Idempotente.
alter table public.daily_task_stats
  add column if not exists completed_tasks integer default 0 not null;

-- =============================================
-- Migration 14: no máximo uma melhoria (improvement) ABERTA por usuário
-- ---------------------------------------------
-- Bug: duas análises concorrentes (POST /notifications/analyze é disparado
-- pelo frontend ao abrir/voltar à tela) passavam ambas pela checagem "há
-- melhoria pendente?" antes de qualquer uma inserir → o Axon criava 2
-- sugestões, ambas apontando para o MESMO horário livre.
-- "Aberta" = status unread/read E não expirada. A melhoria expira quando o
-- horário sugerido passa (expired_at preenchido pelo backend), para uma
-- sugestão esquecida não silenciar o Axon para sempre. O índice único parcial
-- impõe a invariante de forma ATÔMICA no banco, fechando a corrida.
-- =============================================

alter table public.notifications
  add column if not exists expired_at timestamp with time zone;

create unique index if not exists notifications_one_open_improvement
  on public.notifications(user_id)
  where type = 'improvement' and status in ('unread', 'read') and expired_at is null;

-- =============================================
-- Migration 15: cache de "Descobertas do Axon" (correlações reais)
-- ---------------------------------------------
-- Card novo na aba Insights, separado do /insights/patterns existente.
-- O BACKEND calcula as correlações (services/correlations_service.py —
-- varredura genérica condição × métrica, mesmo dia e dia seguinte, com
-- mínimo de 5 dias por grupo); o Claude só traduz os números já corretos em
-- frases. Cache de 7 dias (correlação não muda de um dia para o outro) — TTL
-- maior que o de axon_insights (24h). Mesmo padrão de axon_insights: só o
-- backend (service_role) acessa, sem RLS.
-- =============================================

create table if not exists public.axon_discoveries (
  user_id      uuid references auth.users(id) on delete cascade primary key,
  findings     jsonb not null,
  data_points  integer default 0 not null,
  generated_at timestamp with time zone not null,
  created_at   timestamp with time zone default now()
);

-- =============================================
-- Migration 16: colunas de preferências de planejamento em profiles
-- ---------------------------------------------
-- Bug (2026-07-02): planning_scheduler.py e routers/profile.py já liam/gravavam
-- estas 6 colunas (ver models/schemas.py:PlanningPreferences), mas a migration
-- que as criava nunca foi escrita — a tabela profiles nunca teve essas colunas.
-- Efeito: o scheduler (roda a cada minuto) falhava a query para TODOS os
-- usuários de uma vez ("column profiles.daily_use_chronotype does not exist"),
-- e GET/PATCH /profile/planning-preferences também deveria estar quebrado.
-- Defaults idênticos aos do Pydantic (PlanningPreferences) para não mudar o
-- comportamento de quem nunca configurou nada.
-- =============================================

alter table public.profiles
  add column if not exists daily_planning_enabled  boolean not null default true,
  add column if not exists daily_planning_time     text,
  add column if not exists daily_use_chronotype    boolean not null default true,
  add column if not exists weekly_planning_enabled boolean not null default true,
  add column if not exists weekly_planning_day     integer,
  add column if not exists weekly_use_chronotype    boolean not null default true;

-- =============================================
-- Migration 17: Canal do Axon (conversa permanente + onboarding conversacional)
-- ---------------------------------------------
-- Nova feature: uma conversa fixa por usuário (conversation_type='axon_direct'),
-- criada automaticamente no primeiro GET /chat/conversations, com uma mensagem
-- de abertura fixa (não gerada por LLM) e um onboarding conversacional guiado
-- pelo system prompt até o usuário concluir (tool concluir_onboarding).
-- Nota: a tabela real de conversas neste projeto é "conversations" (não
-- "chat_conversations" como em versões antigas do plano) — mesma tabela usada
-- por routers/conversations.py.
-- =============================================

alter table public.conversations
  add column if not exists conversation_type varchar not null default 'regular';

alter table public.profiles
  add column if not exists axon_direct_onboarding_completed boolean not null default false;

-- =============================================
-- Migration 18: marcador explícito de "primeira execução do reconcile"
-- ---------------------------------------------
-- Bug (2026-07-02): daily_task_stats ficava permanentemente vazia para
-- usuários cujos primeiros dias de uso não tinham tarefas (fim de semana,
-- início de conta etc). reconcile() decidia "já rodei antes?" checando se
-- existe QUALQUER linha em daily_task_stats para o usuário — mas
-- snapshot_days() pula dias com total=0 (nada a congelar), então esses dias
-- nunca deixavam rastro. Sem rastro, reconcile ficava PRESO no ramo de
-- "primeira execução" para sempre, nunca avançando para congelar dias
-- passados de verdade — resultado: um dia com tarefas REALMENTE concluídas
-- (ex.: 2026-07-01) não tinha snapshot, e o Planning mostrava 0% (fallback
-- "?? 0" do frontend) em vez da % real.
-- Correção: coluna explícita em profiles, gravada na PRIMEIRA vez que
-- reconcile roda para o usuário, independente de haver linha em
-- daily_task_stats ou não.
-- =============================================

alter table public.profiles
  add column if not exists daily_stats_reconcile_started_at timestamp with time zone;

-- =============================================
-- Migration 19: relatórios narrativos semanal/mensal (weekly_reports)
-- ---------------------------------------------
-- Nova feature: services/report_service.py monta um resumo do período
-- ENCERRADO (semana anterior / mês anterior) a partir de dados já
-- calculados (daily_task_stats, consistência de rotinas, tarefas chave) e
-- pede ao Claude só a narrativa em texto — mesma filosofia do
-- correlations_service (backend calcula, Claude escreve).
-- Disparado pelo planning_scheduler: toda segunda 08h local (semanal) e
-- todo dia 1º do mês 08h local (mensal). Índice único garante no máximo um
-- relatório por usuário/tipo/período — upsert idempotente se o job rodar
-- de novo no mesmo minuto/janela.
-- =============================================

create table if not exists public.weekly_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  period_type text check (period_type in ('weekly', 'monthly')) not null,
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  narrative text not null,
  created_at timestamptz default now()
);

create unique index if not exists weekly_reports_user_period_idx
  on public.weekly_reports(user_id, period_type, period_start);

-- =============================================
-- Migration 20: rascunho do registro diário (daily_log_drafts)
-- ---------------------------------------------
-- Feature: o usuário abre o registro, preenche parte e fecha — ao reabrir
-- (em qualquer aparelho) os campos voltam preenchidos.
-- Tabela SEPARADA de daily_logs de propósito. Gravar rascunho na tabela real
-- quebraria três coisas que dependem de "linha em daily_logs = dia registrado":
--   1. insights.py conta len(logs) para destravar padrões (7) e descobertas
--      (10) — rascunhos vazios destravariam os insights sem dado real;
--   2. calibration_service.calibrate_from_log ajusta o perfil de energia a
--      cada save — calibrar com registro pela metade distorce os blocos;
--   3. memory_service.sync_dated_memory criaria memória de nota incompleta.
-- Um rascunho por usuário/dia (PK composta): reabrir sobrescreve o anterior.
-- O rascunho é apagado quando o registro é salvo de verdade (POST /daily-log/).
-- Sem RLS: só o backend (service_role) acessa, mesmo padrão de axon_insights.
-- =============================================

create table if not exists public.daily_log_drafts (
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  data       jsonb not null,
  updated_at timestamptz default now() not null,
  primary key (user_id, date)
);

-- =============================================
-- Migration 21: relatórios — marcação de "visto" + histórico permanente
-- ---------------------------------------------
-- Mudança de comportamento (2026-08-03): antes o relatório só aparecia numa
-- janela fixa de 16h (20h do último dia do período até meio-dia do dia
-- seguinte) e depois ficava INACESSÍVEL para sempre, mesmo existindo no
-- banco — narrativa paga ao Claude que o usuário podia nunca ver.
-- Agora: o card fica no Dashboard desde a geração ATÉ O USUÁRIO VER, e
-- depois disso o relatório continua acessível para sempre no histórico
-- (Perfil), permitindo comparar semanas e meses.
-- `seen_at` nulo = ainda não visto (aparece no Dashboard).
-- =============================================

alter table public.weekly_reports
  add column if not exists seen_at timestamptz;

-- Busca do card do Dashboard: "meus relatórios ainda não vistos".
create index if not exists weekly_reports_user_unseen_idx
  on public.weekly_reports(user_id, period_type, period_start desc)
  where seen_at is null;

-- =============================================
-- Migration 22: device_tokens — entrega de push (FCM)
-- ---------------------------------------------
-- Fase 3 do plano da Play Store. Até aqui as notificações do Axon só existiam
-- dentro do app: quem não abrisse, não via. Esta tabela guarda o endereço de
-- cada aparelho (o registration token do FCM) para que o backend consiga
-- entregar a notificação na tela de bloqueio.
--
-- Um usuário pode ter vários aparelhos, e o MESMO aparelho pode ser usado por
-- contas diferentes (celular emprestado, conta de teste). Por isso a unicidade
-- é do token sozinho, não do par (user_id, token): o FCM emite um token por
-- instalação do app, e ele precisa pertencer a um único usuário por vez — senão
-- o dono anterior continuaria recebendo os push do novo.
--
-- `last_seen_at` permite limpar tokens de aparelhos que sumiram há meses.
-- =============================================

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Envio: "todos os aparelhos deste usuário".
create index if not exists device_tokens_user_idx
  on public.device_tokens(user_id);

-- =============================================
-- Migration 23: dia livre + até 3 períodos de pico ORDENADOS
-- ---------------------------------------------
-- Duas mudanças no registro diário (DayReview).
--
-- 1) `peak_periods` passa de no máximo 2 para no máximo 3 períodos, e a ORDEM
--    do array passa a ser significativa: posição 0 = período mais produtivo,
--    1 = segundo, 2 = terceiro. Não há mudança de tipo — text[] já preserva a
--    ordem de inserção — então os registros antigos continuam válidos: um
--    array de 1 ou 2 itens simplesmente não usa as posições seguintes. O que
--    muda é quem LÊ: a calibração agora pondera por posição (ver
--    calibration_service.PEAK_RANK_WEIGHT) em vez de tratar todos como iguais.
--    Por isso não existe migração de dados aqui — só de interpretação.
--
-- 2) `is_day_off`: o usuário marca que aquele dia foi de descanso deliberado.
--    Sem isso, um domingo de folga é indistinguível de um dia perdido: ambos
--    aparecem como produtividade 1 e zero tarefas. Os insights já vinham
--    lendo esses dias como "seu ponto mais baixo da semana", quando na
--    verdade eram descanso planejado.
--
--    NOT NULL DEFAULT false: registro antigo não vira "dia livre" por omissão,
--    e o backend nunca precisa tratar NULL como um terceiro estado.
-- =============================================

alter table public.daily_logs
  add column if not exists is_day_off boolean not null default false;

comment on column public.daily_logs.is_day_off is
  'Dia de descanso deliberado. Distingue folga planejada de dia improdutivo — a análise de produtividade deve excluir estes dias em vez de contá-los como baixo desempenho.';

comment on column public.daily_logs.peak_periods is
  'Até 3 slugs de período, ORDENADOS por produtividade percebida: posição 0 = mais produtivo. Arrays de tamanho 1-2 (registros anteriores à Migration 23) permanecem válidos.';

-- =============================================
-- Migration 24: dias em que o usuário abriu mão da ofensiva
-- ---------------------------------------------
-- A ofensiva do registro diário (foguinho) não admite buracos: um dia sem
-- registro a encerra. O app dá uma folga real ao aceitar registro retroativo
-- de ontem — quem passou o dia longe do app ainda salva a sequência no dia
-- seguinte.
--
-- Quando a ofensiva está em risco e o usuário fecha o pop-up do registro, ele
-- vê um aviso e pode confirmar que NÃO vai registrar. Esta tabela guarda essa
-- desistência: o dia deixa de contar mesmo que ele mude de ideia e registre
-- dentro do prazo.
--
-- Por que uma tabela e não uma coluna em daily_logs: o dia desistido é
-- justamente aquele que NÃO tem registro — não existe linha em daily_logs para
-- receber a marca.
--
-- Por que no banco e não em localStorage: reinstalar o app ou trocar de
-- aparelho apagaria a marcação, e ela não valeria entre web e mobile.
--
-- A PK composta (user_id, date) torna a operação idempotente: confirmar duas
-- vezes o mesmo dia não cria linha duplicada.
-- =============================================

create table if not exists public.streak_forfeits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Leitura sempre por usuário + janela de datas (cálculo da ofensiva).
create index if not exists streak_forfeits_user_date_idx
  on public.streak_forfeits(user_id, date desc);

-- =============================================
-- Migration 25: voice_stt_usage — teto mensal de transcrição
-- ---------------------------------------------
-- Fase 2 do plano de voz. Transcrição é cobrada por segundo de áudio no
-- Google Speech-to-Text, e sem um teto o custo só aparece na fatura no fim do
-- mês. Esta tabela guarda, por usuário e mês civil, quantos segundos já
-- foram transcritos; `stt_service.check_quota` lê daqui antes de aceitar um
-- novo áudio.
--
-- `year_month` é texto ('2026-08') em vez de uma data: o contador é por MÊS
-- inteiro, não por dia, e um texto evita a ambiguidade de qual dia do mês
-- representaria a linha. A PK composta torna o incremento idempotente e evita
-- duas linhas para o mesmo usuário/mês.
--
-- Sem RLS, no mesmo padrão de `device_tokens`/`streak_forfeits`: só o backend
-- (service_role) lê e escreve aqui — não há tela que consulte isto direto do
-- Supabase.
-- =============================================

create table if not exists public.voice_stt_usage (
  user_id      uuid not null references auth.users(id) on delete cascade,
  year_month   text not null,
  seconds_used integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, year_month)
);

-- =============================================
-- Migration 26: objetivos como contador de etapas
-- ---------------------------------------------
-- Antes desta migração, um objetivo só tinha progresso se existissem TAREFAS
-- reais vinculadas a ele: o cálculo era `tarefas concluídas / tarefas totais`,
-- contando linhas em `tasks`. Isso obrigava a criar um compromisso na agenda
-- para cada unidade de progresso — um curso com 257 aulas virava 257 tarefas
-- sem horário, poluindo a agenda a ponto da funcionalidade ser abandonada.
--
-- O modelo novo separa "o que eu preciso fazer" (a meta, um número) de "quando
-- eu vou fazer" (a agenda). O objetivo passa a ser um CONTADOR; tarefas e
-- itens de rotina viram FONTES DE AVANÇO desse contador. Criar um objetivo não
-- cria nada na agenda.
--
-- Por que uma tabela de lançamentos (`objective_step_entries`) e não uma
-- coluna que é incrementada: sem rastro de QUEM causou cada avanço, desmarcar
-- uma tarefa concluída não teria como saber quanto subtrair, e o contador
-- dessincronizaria em silêncio. Com o lançamento, desmarcar apaga a linha e o
-- total (que é sempre a SOMA dos lançamentos) volta sozinho ao valor correto.
-- De brinde, o histórico passa a ser real: report_service deixa de reconstruir
-- o progresso passado por aproximação (ver o comentário em _objectives_progress).
--
-- `completed_steps` em `objectives` é apenas um CACHE dessa soma, para leitura
-- rápida na listagem. A verdade é o ledger.
-- =============================================

-- Limpeza: o modelo antigo sai inteiro. O cascade de `tasks.objective_id`
-- apaga junto as tarefas-etapa que poluíam a agenda (decisão do Bernardo —
-- nenhum usuário ativo usava a funcionalidade).
delete from public.objectives;

alter table public.objectives
  add column if not exists total_steps     integer not null default 1,
  add column if not exists completed_steps integer not null default 0,
  add column if not exists step_label      text    not null default 'etapas';

-- A meta precisa ser positiva: total_steps = 0 tornaria o progresso indefinido.
alter table public.objectives
  drop constraint if exists objectives_total_steps_positive;
alter table public.objectives
  add constraint objectives_total_steps_positive check (total_steps > 0);

-- Quanto esta tarefa vale quando concluída (só se tiver objective_id).
alter table public.tasks
  add column if not exists objective_steps integer not null default 1;

-- Vínculo item de rotina → objetivo. É por ITEM, não pela rotina inteira: uma
-- rotina "Manhã" pode ter só o item "Alemão" contando para o objetivo.
-- (O TÉRMINO da rotina por objetivo é outra coisa, e mora em
-- `routines.objective_id` — ver Migration 27.)
-- ON DELETE SET NULL: apagar o objetivo não pode derrubar a rotina do usuário.
alter table public.routine_items
  add column if not exists objective_id uuid
    references public.objectives(id) on delete set null,
  add column if not exists steps_per_completion integer not null default 1;

create index if not exists routine_items_objective_id_idx
  on public.routine_items(objective_id);

-- O ledger.
create table if not exists public.objective_step_entries (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  objective_id           uuid not null references public.objectives(id) on delete cascade,
  -- A tarefa que causou o avanço. CASCADE: apagar a tarefa desfaz o lançamento,
  -- que é exatamente o comportamento esperado (o avanço deixa de existir).
  source_task_id         uuid references public.tasks(id) on delete cascade,
  -- Só para relatório ("quanto veio da rotina X"). SET NULL para não perder o
  -- lançamento quando o item de rotina é editado/removido — o avanço aconteceu.
  source_routine_item_id uuid references public.routine_items(id) on delete set null,
  steps                  integer not null check (steps > 0),
  occurred_at            timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

-- Um lançamento por tarefa: sem isto, um duplo clique em "concluir" (ou uma
-- corrida entre dois caminhos que marcam a tarefa) lançaria duas vezes. Parcial
-- porque lançamentos manuais não têm tarefa de origem e podem repetir.
create unique index if not exists objective_step_entries_source_task_uniq
  on public.objective_step_entries(source_task_id)
  where source_task_id is not null;

-- Leitura por objetivo (soma do total) e por janela de datas (relatórios).
create index if not exists objective_step_entries_objective_idx
  on public.objective_step_entries(objective_id, occurred_at desc);

create index if not exists objective_step_entries_user_occurred_idx
  on public.objective_step_entries(user_id, occurred_at desc);

alter table public.objective_step_entries enable row level security;

create policy "objective_step_entries_select" on public.objective_step_entries
  for select using (auth.uid() = user_id);
create policy "objective_step_entries_insert" on public.objective_step_entries
  for insert with check (auth.uid() = user_id);
create policy "objective_step_entries_update" on public.objective_step_entries
  for update using (auth.uid() = user_id);
create policy "objective_step_entries_delete" on public.objective_step_entries
  for delete using (auth.uid() = user_id);

-- =============================================
-- Migration 27: subtarefa como fonte de avanço + rotina que termina com o objetivo
-- ---------------------------------------------
-- Duas mudanças que nasceram do uso real da Migration 26.
--
-- (1) VÍNCULO POR SUBTAREFA. Até aqui só a tarefa mãe avançava o objetivo: um
-- "Estudar alemão" com 3 aulas como subtarefas só lançava quando as TRÊS
-- fechassem. Mas a unidade de progresso real do usuário é a aula, não o bloco
-- de estudo. Agora a subtarefa pode ter o próprio `objective_id`, e marcá-la
-- lança sozinha — independente da tarefa mãe.
--
-- Os dois vínculos coexistem de propósito e NÃO se somam por acidente: quem
-- vincula só a mãe continua lançando na conclusão dela; quem vincula as
-- subtarefas lança uma a uma. Vincular os dois ao mesmo objetivo é escolha do
-- usuário (o ledger registra ambos como lançamentos distintos, cada um com sua
-- origem), e o índice único é por LINHA de origem — um por tarefa e um por
-- subtarefa —, então nada duplica dentro de cada caminho.
--
-- (2) `routines.objective_id`. Antes, "pausar a rotina quando o objetivo
-- terminar" era opção de ITEM, escondida em opções avançadas. Mas quem para é
-- a ROTINA inteira, não o item — a opção estava no nível errado, e o usuário
-- tinha de abrir um item para configurar algo da rotina. Ela sobe para o lado
-- da data de término, que é exatamente o que ela é: um término por objetivo em
-- vez de por data.
-- =============================================

-- (1) A subtarefa como fonte de avanço.
-- ON DELETE SET NULL no objetivo: apagar o objetivo não pode apagar o
-- checklist do usuário.
alter table public.subtasks
  add column if not exists objective_id uuid
    references public.objectives(id) on delete set null,
  add column if not exists objective_steps integer not null default 1;

create index if not exists subtasks_objective_id_idx
  on public.subtasks(objective_id);

-- A origem do lançamento no ledger. CASCADE como em source_task_id: apagar a
-- subtarefa desfaz o avanço que ela causou.
alter table public.objective_step_entries
  add column if not exists source_subtask_id uuid
    references public.subtasks(id) on delete cascade;

-- Um lançamento por subtarefa, no mesmo espírito do índice de source_task_id:
-- sem ele, um duplo clique em "concluir" lançaria duas vezes. Índice separado
-- (e não um composto) porque cada origem é independente da outra.
create unique index if not exists objective_step_entries_source_subtask_uniq
  on public.objective_step_entries(source_subtask_id)
  where source_subtask_id is not null;

-- (2) Rotina que termina quando o objetivo é concluído.
-- É o par da coluna `end_date`: término por objetivo em vez de por data.
alter table public.routines
  add column if not exists objective_id uuid
    references public.objectives(id) on delete set null;

create index if not exists routines_objective_id_idx
  on public.routines(objective_id);

-- =============================================
-- Migration 28: horas poupadas — congelar o PLANO do dia
-- ---------------------------------------------
-- Primeira metade de "horas poupadas": a métrica compara o horário em que o
-- dia estava PLANEJADO para acabar com o horário em que o usuário terminou o
-- que planejou. Para isso o plano tem de ser congelado no fim do dia, junto
-- com o resto do snapshot — depois disso o carry-forward reescreve
-- scheduled_date das pendentes e o plano original fica irrecuperável.
--
-- Por que o plano NÃO pode ser recalculado depois: adiantar trabalho de
-- amanhã é tempo poupado de verdade (o usuário estava livre às 20h), e isso
-- só se sustenta se cada dia for comparado com o plano que ELE tinha no
-- início. Recalcular o plano de amanhã depois do adiantamento zeraria o
-- ganho que o usuário de fato sentiu.
--
--   planned_day_end            = fim da última tarefa COM horário real.
--                                NULL quando nenhum item do dia tem horário —
--                                daily_stats_service._end_datetime usa 23:59
--                                como fallback para o anel de adesão, e contar
--                                esse 23:59 como "fim do plano" inventaria
--                                horas poupadas (dia terminado às 20h viraria
--                                "3h59 poupadas"). NULL = dia fora da conta.
--   planned_minutes            = soma das durações planejadas (end - start).
--   completed_planned_minutes  = quanto desses minutos foi concluído, pela
--                                MESMA definição de "concluído" do snapshot.
--
-- Os minutos são o que sustenta a regra "só há tempo poupado se o trabalho foi
-- feito": medir por CONTAGEM de tarefas trataria pular uma tarefa de 10min
-- igual a pular uma de 3h.
-- =============================================

alter table public.daily_task_stats
  add column if not exists planned_day_end time,
  add column if not exists planned_minutes integer default 0 not null,
  add column if not exists completed_planned_minutes integer default 0 not null;

-- =============================================
-- Migration 29: horas poupadas — fechamento do dia (day_closures)
-- ---------------------------------------------
-- Segunda metade: uma linha por dia fechado, com o resultado do cálculo e o
-- grau de confiança nele.
--
-- O PROBLEMA QUE ESTA TABELA RESOLVE. `tasks.completed_at` não registra quando
-- o usuário terminou a tarefa, registra quando ele abriu o app e tocou no
-- botão ("vou para a academia e marco quando volto"). Nos dados reais: 25%
-- marcadas antes do fim planejado, 64% depois no mesmo dia, 11% em outro dia.
-- Uma fórmula que trate completed_at como hora de término erra em 75% dos
-- casos — foi por isso que a primeira tentativa desta feature (ago/2026) foi
-- descartada.
--
-- A saída é não adivinhar: quando a marcação caiu DENTRO do horário planejado
-- o dado já é confiável; quando caiu depois, o AXON PERGUNTA ao usuário a que
-- horas ele terminou, e só soma o dia se tiver resposta.
--
--   reported_end      = o que o usuário respondeu; NULL se não respondeu.
--   recorded_end      = a marcação mais tardia do dia (o sinal cru, guardado
--                       para calibrar as opções da pergunta e para análise).
--   saved_minutes     = o resultado; 0 quando não há economia comprovável.
--   advanced_minutes  = parcela vinda de adiantar trabalho de outro dia. Linha
--                       SEPARADA no detalhamento porque é informação útil, mas
--                       SOMA no total (ver Migration 28 sobre o porquê).
--   confidence        = 'high' entra no número mostrado ao usuário; 'medium' e
--                       'low' ficam registrados e FORA da soma. O contador fica
--                       menor e verdadeiro — é deliberado: é o que sustenta a
--                       credibilidade quando o usuário clica para ver de onde
--                       veio o número.
--   asked_at          = quando a pergunta foi exibida (não repetir).
--   dismissed         = usuário fechou a pergunta sem responder; não insistir.
--
-- PK composta (user_id, date): responder duas vezes o mesmo dia atualiza a
-- mesma linha em vez de duplicar, e o upsert do fechamento é idempotente — o
-- scheduler roda numa janela de 15 min e pode chamar o fechamento mais de uma
-- vez na mesma virada.
-- =============================================

create table if not exists public.day_closures (
  user_id          uuid references auth.users(id) on delete cascade not null,
  date             date not null,
  reported_end     time,
  recorded_end     time,
  saved_minutes    integer default 0 not null,
  advanced_minutes integer default 0 not null,
  confidence       text default 'low' not null,
  asked_at         timestamp with time zone,
  answered_at      timestamp with time zone,
  dismissed        boolean default false not null,
  created_at       timestamp with time zone default now(),
  primary key (user_id, date)
);

-- A consulta quente é "somar os dias de confiança alta num intervalo" e
-- "achar a pergunta pendente mais recente" — as duas varrem por usuário e
-- data decrescente.
create index if not exists day_closures_user_date_idx
  on public.day_closures(user_id, date desc);

alter table public.day_closures enable row level security;

create policy "day_closures_select" on public.day_closures for select using (auth.uid() = user_id);
create policy "day_closures_insert" on public.day_closures for insert with check (auth.uid() = user_id);
create policy "day_closures_update" on public.day_closures for update using (auth.uid() = user_id);
create policy "day_closures_delete" on public.day_closures for delete using (auth.uid() = user_id);

-- =============================================
-- Migration 30: horas poupadas — crédito por reorganização do AXON
-- ---------------------------------------------
-- Terceira origem do número (as duas primeiras, nas Migrations 28 e 29, vêm de
-- COMO O USUÁRIO executou o dia). Esta vem do que o próprio AXON reorganizou.
--
-- O QUE SE PERDIA. Quando o AXON sugere mover uma tarefa e o usuário aceita, o
-- horário antigo é sobrescrito no update e esquecido — `old_time` chega a ser
-- lido no aceite só para escrever o texto da notificação de mudança, e é
-- descartado em seguida. Ninguém registrava que houve uma melhoria, então a
-- contribuição do AXON era invisível para a métrica.
--
-- POR QUE ESTE É O SINAL MAIS FORTE. Não depende do usuário marcar tarefa nem
-- responder pergunta: o "antes" e o "depois" são dois horários que o sistema
-- conhece com certeza. É medição determinística, ao contrário do completed_at
-- (ver o cabeçalho de saved_time_service.py).
--
-- freed_minutes NÃO é o tamanho do movimento. Mover uma tarefa 4h para trás não
-- libera 4h: só libera tempo o movimento que adianta o FIM DO DIA. Mover a
-- última tarefa de 20:00–22:00 para 16:00–18:00, com a penúltima acabando
-- 21:20, libera 40 min (22:00 → 21:20). Mover uma tarefa do MEIO do dia não
-- libera nada, porque o dia continua acabando no mesmo horário. Por isso a
-- coluna guarda o resultado desse cálculo, e não a diferença de horários.
--
-- source distingue as duas origens:
--   'improvement' = sugestão de melhoria aceita pelo usuário (tem "antes").
--   'pick_time'   = o AXON escolheu o horário de uma tarefa NOVA ("Axon
--                   decide", em tasks_service.create_task). Não existe "antes",
--                   então nada foi adiantado e freed_minutes é 0 — a linha fica
--                   só como histórico do trabalho de organização do AXON, fora
--                   do número.
--
-- O índice único parcial em notification_id impede crédito em dobro: um duplo
-- toque em "aceitar" (ou um retry do cliente) passaria duas vezes pelo mesmo
-- fluxo, e sem ele a mesma melhoria somaria duas vezes no total. Mesmo espírito
-- do índice de objective_step_entries (Migration 27).
-- =============================================

create table if not exists public.axon_optimizations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  -- CASCADE: apagar a tarefa desfaz o crédito que ela gerou. Um número que
  -- sobrevivesse à tarefa que o originou não teria como ser justificado no
  -- detalhamento.
  task_id         uuid references public.tasks(id) on delete cascade not null,
  notification_id uuid references public.notifications(id) on delete set null,
  day             date not null,
  old_start_time  time,
  old_end_time    time,
  new_start_time  time,
  new_end_time    time,
  freed_minutes   integer default 0 not null,
  source          text default 'improvement' not null,
  created_at      timestamp with time zone default now()
);

create unique index if not exists axon_optimizations_notification_uniq
  on public.axon_optimizations(notification_id)
  where notification_id is not null;

create index if not exists axon_optimizations_user_day_idx
  on public.axon_optimizations(user_id, day);

alter table public.axon_optimizations enable row level security;

create policy "axon_optimizations_select" on public.axon_optimizations for select using (auth.uid() = user_id);
create policy "axon_optimizations_insert" on public.axon_optimizations for insert with check (auth.uid() = user_id);
create policy "axon_optimizations_update" on public.axon_optimizations for update using (auth.uid() = user_id);
create policy "axon_optimizations_delete" on public.axon_optimizations for delete using (auth.uid() = user_id);

-- O crédito de otimização no fechamento do dia. Coluna PRÓPRIA (e não somada em
-- saved_minutes) porque ela é a ÚNICA exceção à regra "só confiança alta soma":
-- o crédito é determinístico e entra no total mesmo num dia que o AXON não
-- conseguiu fechar com certeza. Ver saved_time_service.py.
alter table public.day_closures
  add column if not exists optimization_minutes integer default 0 not null;

-- =============================================
-- Migration 31: complexidade e tags nas tarefas
-- ---------------------------------------------
-- Base para a análise de rotina (agrupar tarefas parecidas, tirar trabalho
-- complexo de bloco fraco, compactar buracos). Hoje o Axon não consegue fazer
-- nada disso porque não sabe duas coisas sobre uma tarefa.
--
-- (1) COMPLEXIDADE NÃO É PRIORIDADE. O que existe é `priority` (low/medium/
-- high), que mede URGÊNCIA — não carga cognitiva. "Pagar a conta de luz" é
-- prioridade alta e mentalmente leve; "escrever o capítulo da tese" pode ser
-- prioridade média e exigir o melhor da energia do dia. Com um só campo o Axon
-- colocaria a conta de luz no pico e a tese no foco leve, achando que acertou.
-- São dois eixos independentes e precisam de duas colunas.
--
-- NULL é um valor legítimo e significa "não informado": a tarefa fica FORA de
-- qualquer análise de complexidade, e `allowed_blocks` se comporta exatamente
-- como antes desta migration. Nada de default implícito — assumir 'moderate'
-- para quem não preencheu faria o Axon agendar com base num palpite nosso.
--
-- (2) TAG É TABELA, NÃO TEXTO LIVRE. Já existe `tasks.group_name` (text livre,
-- coluna morta: declarada e nunca escrita por nenhum service). Não serve aqui
-- justamente por ser livre — "Estudos", "estudos" e "Estudo" seriam três
-- categorias diferentes, e agrupar exige vocabulário controlado. Daí
-- `task_tags` com índice único em (user_id, slug): o slug normalizado é quem
-- impede o duplicado, e o label preserva como o usuário escreveu.
--
-- O vínculo é N:N (`task_tag_links`) porque uma tarefa pode pertencer a mais de
-- uma categoria — um curso profissional é "estudo" e "trabalho" ao mesmo tempo.
-- PK composta (task_id, tag_id) torna o vínculo idempotente: vincular duas
-- vezes não duplica.
-- =============================================

create table if not exists public.task_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  label      text not null,
  slug       text not null,
  color      text,
  -- Veio da lista semeada. O usuário pode renomear/excluir do mesmo jeito; a
  -- flag existe só para a ordenação (padrão primeiro) e para não semear duas
  -- vezes.
  is_default boolean default false not null,
  created_at timestamp with time zone default now()
);

create unique index if not exists task_tags_user_slug_uniq
  on public.task_tags(user_id, slug);

alter table public.task_tags enable row level security;

create policy "task_tags_select" on public.task_tags for select using (auth.uid() = user_id);
create policy "task_tags_insert" on public.task_tags for insert with check (auth.uid() = user_id);
create policy "task_tags_update" on public.task_tags for update using (auth.uid() = user_id);
create policy "task_tags_delete" on public.task_tags for delete using (auth.uid() = user_id);

create table if not exists public.task_tag_links (
  task_id    uuid references public.tasks(id) on delete cascade not null,
  tag_id     uuid references public.task_tags(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  primary key (task_id, tag_id)
);

-- A busca "todas as tarefas desta tag", que a análise de rotina vai usar para
-- agrupar. A direção oposta (tags de uma tarefa) já é servida pela PK.
create index if not exists task_tag_links_user_tag_idx
  on public.task_tag_links(user_id, tag_id);

alter table public.task_tag_links enable row level security;

create policy "task_tag_links_select" on public.task_tag_links for select using (auth.uid() = user_id);
create policy "task_tag_links_insert" on public.task_tag_links for insert with check (auth.uid() = user_id);
create policy "task_tag_links_update" on public.task_tag_links for update using (auth.uid() = user_id);
create policy "task_tag_links_delete" on public.task_tag_links for delete using (auth.uid() = user_id);

-- Os quatro níveis, do mais leve ao mais exigente. O check protege contra valor
-- inventado pelo cliente ou pelo agente; NULL continua permitido.
alter table public.tasks
  add column if not exists complexity text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_complexity_check'
  ) then
    alter table public.tasks
      add constraint tasks_complexity_check
      check (complexity in ('light', 'moderate', 'focus', 'deep_focus'));
  end if;
end $$;

-- =============================================
-- Migration 32: análise completa de rotina (routine_analyses)
-- ---------------------------------------------
-- Última fase do roteiro de planejamento. A Fase 1 (Migration 31) deu ao Axon
-- os dados — complexidade e tags; a Fase 2 (compactação) o fez mover UMA tarefa
-- por vez, sozinho. Esta fase reorganiza o dia INTEIRO, mexendo em várias
-- tarefas de uma vez, sob demanda do usuário ou num horário agendado.
--
-- POR QUE A PROPOSTA É UMA TABELA E NÃO UMA NOTIFICAÇÃO. Uma sugestão pontual é
-- "aceitar ou não". Reorganizar o dia pode mexer em oito tarefas, e aceitar tudo
-- às cegas é inaceitável — há precedente doloroso: o Axon criou 40 tarefas de
-- uma vez ao organizar um curso, tecnicamente certo e na prática abandonado.
-- A proposta fica persistida com cada movimento e seu motivo, para o usuário
-- INSPECIONAR, desmarcar linha a linha e só então aplicar. `proposal` guarda a
-- lista de movimentos:
--   { task_id, title, old_start, old_end, new_start, new_end, kind, reason }
--   kind ∈ bad_block | complexity_match | grouping | compaction
--
-- A VERSÃO AGENDADA NÃO APLICA NADA. Ela gera a proposta (status 'pending') e
-- notifica; o usuário abre e decide. O Axon sempre pediu permissão antes de
-- mexer na agenda, e aplicar em lote sem o usuário ver seria o comportamento
-- mais agressivo do app.
--
-- O índice único parcial em (user_id, target_date) WHERE status = 'pending'
-- impede acumular propostas abertas para o mesmo dia — duas análises
-- concorrentes (botão + agendamento no mesmo minuto) gerariam duas propostas
-- diferentes para a mesma agenda, e o usuário aplicaria uma por cima da outra.
-- Mesmo espírito do índice de notifications (Migration 14).
-- =============================================

create table if not exists public.routine_analyses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  target_date       date not null,
  status            text default 'pending' not null,
  proposal          jsonb default '[]'::jsonb not null,
  current_day_end   time,
  proposed_day_end  time,
  freed_minutes     integer default 0 not null,
  -- 'manual' (botão) ou 'scheduled' (horário nas preferências).
  source            text default 'manual' not null,
  created_at        timestamp with time zone default now(),
  resolved_at       timestamp with time zone
);

create unique index if not exists routine_analyses_one_pending_per_day
  on public.routine_analyses(user_id, target_date)
  where status = 'pending';

-- "Proposta aberta deste usuário" e "quantas análises manuais hoje" (trava de
-- custo) varrem por usuário e data de criação.
create index if not exists routine_analyses_user_created_idx
  on public.routine_analyses(user_id, created_at desc);

alter table public.routine_analyses enable row level security;

create policy "routine_analyses_select" on public.routine_analyses for select using (auth.uid() = user_id);
create policy "routine_analyses_insert" on public.routine_analyses for insert with check (auth.uid() = user_id);
create policy "routine_analyses_update" on public.routine_analyses for update using (auth.uid() = user_id);
create policy "routine_analyses_delete" on public.routine_analyses for delete using (auth.uid() = user_id);

-- Preferências do agendamento, ao lado das de planejamento diário/semanal.
-- Desligado por padrão: é uma análise que chama o Claude todo dia, e o usuário
-- precisa optar por ela.
alter table public.profiles
  add column if not exists routine_analysis_enabled boolean default false not null,
  add column if not exists routine_analysis_time time;

-- =============================================
-- Migration 33: horário planejado antes de a tarefa ser encurtada
-- =============================================
-- Quando o usuário conclui uma tarefa ANTES do fim planejado, a tarefa encurta
-- de verdade: `end_time` passa a ser o horário em que ele marcou. Isso abre um
-- vão real no calendário, que é o ponto da funcionalidade — mas destrói duas
-- coisas se o horário original não for guardado em algum lugar.
--
-- 1. A RÉGUA DAS HORAS POUPADAS. O snapshot das 00:10 congela o fim planejado
--    do dia (`daily_task_stats.planned_day_end`, Migration 28) lendo os
--    `end_time` como estão naquele momento. Se a última tarefa do dia encolheu
--    de 19:00 para 18:37, o snapshot congelaria "o dia estava planejado até
--    18:37" — e a economia real desapareceria sem erro nenhum, só com números
--    menores. `planned_end_time` é a referência que o snapshot passa a usar.
--
-- 2. O DESFAZER. Reabrir uma tarefa concluída precisa devolver o horário que o
--    usuário planejou, não o horário em que ele por acaso tocou no botão.
--
-- NULL significa "nunca foi encurtada" — a coluna só é escrita no instante do
-- encurtamento e volta a NULL quando a tarefa é reaberta. Por isso ela não
-- serve como "fim planejado" universal: quem precisa do plano lê
-- coalesce(planned_end_time, end_time).
alter table public.tasks
  add column if not exists planned_end_time time;

comment on column public.tasks.planned_end_time is
  'end_time original de uma tarefa encurtada por conclusão antecipada. NULL = nunca encurtada.';

-- =============================================
-- Migration 34: caso B — a tarefa concluída antes da hora MUDA DE LUGAR
-- =============================================
-- A Migration 33 cobriu a tarefa concluída DENTRO da janela planejada: ela
-- encurta. Faltava o caso de concluir ANTES de a janela começar — tarefa das
-- 17:00–18:00 marcada às 15:00. Ali o encurtamento não serve (o fim ficaria
-- antes do início), e o resultado era não fazer nada: o calendário mentia duas
-- vezes, mostrando 15h livre quando o usuário estava ocupado e 17h ocupada
-- quando ele já estará livre. Agora a tarefa MOVE para o horário real.
--
-- `subtasks.done_at` — QUANDO a subtarefa foi marcada.
-- Mover a tarefa exige saber quando o trabalho começou. Sem evidência o Axon
-- só pode CHUTAR (agora menos a duração planejada); com a primeira subtarefa
-- marcada, há um horário real de início. `subtasks` só tinha `done boolean` e
-- um `created_at` que é da CRIAÇÃO da subtarefa, não da marcação — nenhum dos
-- dois responde à pergunta.
--
-- Subtarefas marcadas ANTES desta migration ficam com done_at nulo para
-- sempre: o dado não existe em lugar nenhum e não há como recuperá-lo. Elas
-- caem no fallback da duração planejada, que é o comportamento correto —
-- melhor estimar do que inventar um horário.
--
-- `tasks.planned_start_time` — o início original.
-- O caso A só mexia no fim, então guardar `planned_end_time` bastava. O caso B
-- mexe nos DOIS lados, e desfazer exige os dois. Também é a segunda metade da
-- régua do snapshot: `daily_task_stats` congela o fim planejado do dia E os
-- minutos planejados (Migration 28). Sem o início original, uma tarefa movida
-- para trás encolheria o `planned_minutes` do dia e as horas poupadas dariam
-- números errados sem erro nenhum aparecer.
--
-- NULL nas duas = "nunca foi movida/encurtada". Quem precisa do plano lê
-- coalesce(planned_start_time, start_time) e coalesce(planned_end_time, end_time).
alter table public.subtasks
  add column if not exists done_at timestamp with time zone;

alter table public.tasks
  add column if not exists planned_start_time time;

comment on column public.subtasks.done_at is
  'Quando a subtarefa foi marcada como concluída. NULL em subtarefas anteriores à Migration 34.';

comment on column public.tasks.planned_start_time is
  'start_time original de uma tarefa movida por conclusão fora da janela. NULL = nunca movida.';

-- "Primeira subtarefa marcada desta tarefa" é uma busca por task_id ordenada
-- por done_at com limit 1 — sem índice ela varre todas as subtarefas do
-- usuário a cada conclusão que cai no caso B.
create index if not exists subtasks_task_done_at_idx
  on public.subtasks(task_id, done_at)
  where done_at is not null;

-- =============================================
-- Migration 35: a escolha do calendário pertence à CONTA, não ao navegador
-- =============================================
-- A opção entre vincular o Google Calendar e usar o calendário independente
-- vivia em localStorage (`axon_calendar_setup_choice`). O localStorage é do
-- navegador: uma conta nova criada na mesma máquina herdava a escolha da conta
-- anterior e via "Google Calendar selecionado" sem nunca ter conectado nada, e
-- o mesmo usuário em outro aparelho era perguntado de novo.
--
-- NULL = o usuário ainda não escolheu; é o estado que faz a pergunta aparecer.
alter table public.profiles
  add column if not exists calendar_setup_choice text;

alter table public.profiles
  drop constraint if exists profiles_calendar_setup_choice_check;

alter table public.profiles
  add constraint profiles_calendar_setup_choice_check
  check (calendar_setup_choice in ('google', 'independent'));

comment on column public.profiles.calendar_setup_choice is
  'Como o usuário optou por usar a agenda: google, independent ou NULL (ainda não escolheu).';
