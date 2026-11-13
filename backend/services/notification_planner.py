"""
Decisões das notificações de planejamento: o QUE sai, QUANDO e com que texto.

Saiu do planning_scheduler para que o scheduler (produção) e o script de
simulação (backend/scripts/simular_notificacoes.py) chamem o MESMO código. Uma
cópia da lógica no script divergiria do scheduler em semanas, e a simulação
passaria a mentir. tests_simular_notificacoes.py compara as duas linhas do
tempo num dia inteiro e falha se divergirem.

O que muda entre os dois é só a CAIXA DE SAÍDA (`outbox`), recebida por
parâmetro:
  - DbOutbox (produção): o "já enviado" vem do banco, e emit grava e dispara o
    push (notification_service.create_notification);
  - SimOutbox (no script): o "já enviado" é memória, emit só anota, e note()
    registra o que NÃO saiu e por quê.

Toda função aqui recebe o usuário (e o user_id dele) ou é pura; as únicas
leituras em lote (perfis e tarefas do "30 min antes") aceitam user_id para o
script nunca ler dados de outra pessoa.
"""

import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from database import supabase
from services import activity_service
from services import calibration_service
from services import day_reminders
from services import notification_catalog as catalog
from services import notification_service
from services import streak_service
from services import user_tz as user_tz_service

# Gerador do sorteio em produção. Um objeto (e não o `random` global) para os
# testes poderem fixar a semente e comparar o scheduler com a simulação.
_rng = random.Random()

# ── Horários dos lembretes de planejamento ───────────────────────────────────

# Horários de disparo por cronótipo quando planning_use_chronotype = true
_CHRONOTYPE_TIME = {
    "morning":      "07:00",
    "intermediate": "08:30",
    "evening":      "09:30",
    "night":        "10:30",
    "bimodal":      "08:00",
    # aliases em português
    "Matutino":  "07:00",
    "Misto":     "08:30",
    "Vespertino":"09:30",
    "Noturno":   "10:30",
    "Bimodal":   "08:00",
}

_DEFAULT_WEEKLY_DAY = 0  # Segunda-feira

_CURVE_KEY = {
    "Matutino": "morning", "Vespertino": "evening", "Noturno": "night",
    "Misto": "intermediate", "Bimodal": "bimodal",
    "morning": "morning", "evening": "evening",
    "night": "night", "intermediate": "intermediate", "bimodal": "bimodal",
}


def bool_pref(val, default: bool) -> bool:
    return val if val is not None else default


def daily_fire_time(prefs: dict) -> str:
    if bool_pref(prefs.get("daily_use_chronotype"), True):
        return _CHRONOTYPE_TIME.get(prefs.get("chronotype", "intermediate"), "08:30")
    return prefs.get("daily_planning_time") or "08:30"


def weekly_fire_time(prefs: dict) -> str:
    if bool_pref(prefs.get("weekly_use_chronotype"), True):
        return _CHRONOTYPE_TIME.get(prefs.get("chronotype", "intermediate"), "08:30")
    return prefs.get("daily_planning_time") or "08:30"


def effective_weekly_day(prefs: dict) -> int:
    day = prefs.get("weekly_planning_day")
    return day if day is not None else _DEFAULT_WEEKLY_DAY


def in_window(now_local: datetime, fire: str, minutes: int = 15) -> bool:
    """
    O horário local está entre `fire` e `fire + minutes`? O job roda a cada 5
    min: comparar o minuto exato perdia disparos fora dos múltiplos de 5.
    """
    fh, fm = map(int, fire.split(":"))
    delta = (now_local.hour * 60 + now_local.minute) - (fh * 60 + fm)
    return 0 <= delta < minutes


# ── Perfis ───────────────────────────────────────────────────────────────────

_USER_COLUMNS = (
    "id, name, chronotype, timezone, "
    "daily_planning_enabled, daily_planning_time, daily_use_chronotype, "
    "weekly_planning_enabled, weekly_planning_day, weekly_use_chronotype, "
    "routine_analysis_enabled, routine_analysis_time"
)

# Colunas das preferências do item 10 (Migration 41). Ausentes valem "ligado" e
# "horário do cronotipo" — ver day_reminders.enabled / end_of_day_times.
_REMINDER_COLUMNS = (
    "task_reminder_enabled, day_review_reminder_enabled, "
    "plan_tomorrow_reminder_enabled, day_review_reminder_time, "
    "plan_tomorrow_reminder_time"
)

# Do mais completo ao que existia antes das Migrations 40 e 41. Cada migration
# não aplicada derruba UM degrau, nunca o ciclo: se o select falhasse sem
# alternativa, pararia tudo, reconcile incluído — foi o que aconteceu com a
# Migration 16, com o scheduler falhando a cada rodada. O último degrau é o
# conjunto de antes das duas, e nele tudo se comporta como antes delas
# (todos ativos, lembretes novos ligados no horário do cronotipo).
_USER_COLUMN_SETS = (
    _USER_COLUMNS + ", last_seen_at, " + _REMINDER_COLUMNS,  # 40 e 41 aplicadas
    _USER_COLUMNS + ", last_seen_at",                        # só a 40
    _USER_COLUMNS,                                           # nenhuma das duas
)

# Teto por página das consultas em lote. O PostgREST corta a resposta no
# db-max-rows (padrão 1000) SEM avisar: sem paginar, numa base grande quem
# ficasse depois do corte sumiria do ciclo em silêncio, sem erro no log.
_PAGE = 1000


def fetch_all(build) -> list[dict]:
    """
    Todas as linhas de uma consulta, página a página. O filtro (e o user_id,
    quando houver) vem pronto em `build`.

    `build` devolve um builder NOVO a cada chamada: o do postgrest é mutável,
    e reaproveitá-lo acumularia um .range() por página. Quem chama tem que pôr
    um .order() estável (de preferência pela chave primária): sem ordem, o
    Postgres pode devolver as linhas em ordens diferentes entre uma página e
    outra, e o .range() repetiria ou pularia linhas.

    Para quando a página vem menor que _PAGE; com um múltiplo exato de _PAGE,
    a última página vem vazia e o laço termina nela.
    """
    out: list[dict] = []
    start = 0
    while True:
        rows = build().range(start, start + _PAGE - 1).execute().data or []
        out.extend(rows)
        if len(rows) < _PAGE:
            return out
        start += _PAGE


def fetch_users(user_id: str | None = None) -> list[dict]:
    """
    Perfis com cronotipo, com as colunas que existirem (ver _USER_COLUMN_SETS).
    Sem `user_id`, todos (o scheduler); com ele, só aquele (o script).

    Sem filtro de atividade AQUI de propósito: filtrar na query pularia o
    _process_user inteiro, inclusive o que nunca pode parar.

    Paginado em TODOS os degraus: se só o primeiro paginasse, uma coluna
    ausente devolveria o corte de 1.000 sem ninguém perceber. Se uma página
    do meio falhar, o degrau seguinte recomeça do zero — não mistura listas.
    """
    def build(cols):
        q = supabase.table("profiles").select(cols).not_.is_("chronotype", "null")
        if user_id:
            q = q.eq("id", user_id)
        return q.order("id")

    last_error: Exception | None = None
    for cols in _USER_COLUMN_SETS:
        try:
            users = fetch_all(lambda cols=cols: build(cols))
            if cols is not _USER_COLUMN_SETS[0]:
                print(
                    f"[planning_scheduler] colunas novas indisponíveis "
                    f"({type(last_error).__name__}); seguindo com um conjunto menor",
                    flush=True,
                )
            return users
        except Exception as e:
            last_error = e
    raise last_error if last_error else RuntimeError("perfis não carregados")


def user_tz(user: dict) -> str:
    return user_tz_service.normalize(user.get("timezone")) or user_tz_service.DEFAULT_TZ


# ── Caixa de saída de produção ───────────────────────────────────────────────

# Quanto tempo depois do horário cada aviso de fim do dia ainda pode sair. Curta
# de propósito: um "registre seu dia" às 23h50 porque o servidor voltou tarde é
# pior que nenhum. E limita as consultas ao banco a esta janela.
END_OF_DAY_WINDOW_MIN = 60

# Distância mínima entre o aviso de registro e o de organizar o amanhã. Os dois
# nunca saem juntos (decisão do Bernardo): se o registro atrasou e caiu em cima
# do horário do amanhã, o amanhã espera.
END_OF_DAY_GAP = timedelta(minutes=30)

# (usuário, tipo) → dia local já DECIDIDO (enviado ou descartado). Evita voltar ao
# banco a cada ciclo de 5 min depois da decisão. Em memória: produção tem um
# worker só (AGENTS.md §3), e um restart só custa refazer a consulta — o dedup
# de verdade é o banco (latest_sent_today).
_end_of_day_decided: dict[tuple[str, str], str] = {}


class DbOutbox:
    """Produção: o "já enviado" vem do banco; emit grava e dispara o push."""

    wants_notes = False

    def __init__(self) -> None:
        self.rng = _rng

    def decided(self, user_id: str, notif_type: str, today: str) -> bool:
        return _end_of_day_decided.get((user_id, notif_type)) == today

    def decide(self, user_id: str, notif_type: str, today: str) -> None:
        _end_of_day_decided[(user_id, notif_type)] = today

    def latest_sent_today(self, user_id, notif_type, tz_name, now_utc):
        return day_reminders.latest_sent_today(user_id, notif_type, tz_name)

    def planning_sent_today(self, user_id, tz_name, now_utc) -> bool:
        return notification_service.has_planning_reminder_today(user_id, tz_name)

    def planning_sent_this_week(self, user_id, tz_name, now_utc) -> bool:
        return notification_service.has_planning_reminder_this_week(user_id, tz_name)

    def history(self, user_id, notif_type, now_utc):
        return day_reminders.variant_history(user_id, notif_type, now_utc)

    def task_reminder_state(self, user_ids, now_utc):
        return task_reminder_history(user_ids, now_utc)

    def emit(self, user_id, notif_type, choice: dict, now_utc) -> None:
        notification_service.create_notification(
            user_id=user_id,
            notif_type=notif_type,
            title=choice["title"],
            body=choice["body"],
            action=choice["action"],
        )

    def note(self, user_id, notif_type, reason, now_utc) -> None:
        """Em produção, o que não sai não vira log: seria uma linha por usuário a cada 5 min."""


# ── Contexto do catálogo (dados lidos só no disparo) ─────────────────────────

def first_name(user: dict) -> str:
    return (user.get("name") or "você").split()[0]


def base_ctx(user: dict) -> dict:
    """Variáveis que não custam leitura nenhuma: vêm da linha do perfil."""
    return {"nome": first_name(user), "pico": catalog.peak_start(user.get("chronotype"))}


def week_averages(user_id: str, today) -> dict:
    ini, fim = catalog.stats_window(today)
    return catalog.week_averages(day_reminders.task_stats_rows(user_id, ini, fim), today)


def _failed(what: str, user_id: str, e: Exception) -> None:
    print(f"[planning_scheduler] {what} falhou user={user_id}: {type(e).__name__}", flush=True)


def review_attempts(user: dict, user_id: str, now_local: datetime) -> list[tuple]:
    """
    Registro do dia: [(kind, ctx, action)] na ordem de tentativa. Com a ofensiva
    em risco (ontem sem registro, streak.frozen), as reg_risco_* vêm primeiro e o
    toque abre o registro de ONTEM — é ele que salva a sequência.
    """
    today = now_local.date()
    ctx = base_ctx(user)
    try:
        streak = streak_service.get_streak(user_id, today)
        medias = week_averages(user_id, today)
        pontos = day_reminders.calibration_points(user_id)
        ctx.update(
            streak=streak,
            media_semana=medias["atual"],
            faltam_calibrar=max(0, calibration_service.MIN_DATA_POINTS - pontos),
            tem_registro=day_reminders.has_any_log(user_id),
        )
    except Exception as e:
        _failed("dados do registro", user_id, e)
        ctx["so_parceiro"] = True

    attempts = []
    if not ctx.get("so_parceiro") and (ctx.get("streak") or {}).get("frozen"):
        ontem = str(today - timedelta(days=1))
        attempts.append((catalog.REGISTRO_RISCO, ctx, {"date": ontem, "registro": "ontem"}))
    attempts.append((catalog.REGISTRO, ctx, {"date": str(today), "registro": "hoje"}))
    return attempts


def tomorrow_attempts(user: dict, user_id: str, now_local: datetime) -> list[tuple]:
    ctx = base_ctx(user)
    try:
        feitas, total = day_reminders.today_counts(user_id, now_local.date())
        ctx.update(feitas_hoje=feitas, total_hoje=total)
    except Exception as e:
        _failed("dados do amanhã", user_id, e)
        ctx["so_parceiro"] = True
    # O date leva o toque ao Planning já no dia de amanhã.
    return [(catalog.AMANHA, ctx, {"date": str(day_reminders.tomorrow_of(now_local))})]


def weekly_attempts(user: dict, user_id: str, now_local: datetime) -> list[tuple]:
    ctx = base_ctx(user)
    try:
        # sem_dad_1 fala da semana PASSADA (a última completa).
        ctx["media_semana"] = week_averages(user_id, now_local.date())["passada"]
    except Exception as e:
        _failed("dados do semanal", user_id, e)
        ctx["so_parceiro"] = True
    return [(catalog.SEMANA, ctx, {})]


def task_ctx(user: dict, task: dict, item: dict) -> dict:
    return {
        "tarefa": task["title"],
        "hora": catalog.format_hour(item["key"][2]),
        # Piso de 1: o aviso só sai com 0 minutos no segundo exato do início,
        # e "Começa em 0 minutos" não é texto do documento.
        "min": max(1, item["minutes"]),
        # tar_pico: o pico vem do cronotipo que já está na linha do perfil —
        # nenhuma leitura nova por usuário.
        "em_pico": catalog.in_peak(user.get("chronotype"), item["key"][2]),
    }


def task_choice(user: dict, item: dict, history: list, now_utc: datetime, rng) -> dict | None:
    """
    O aviso de uma tarefa (item de day_reminders.due_task_reminders): sorteio,
    texto e action. Usado pelo laço de task_reminders e pelo teste real do
    script — a mesma montagem nos dois.
    """
    task = item["task"]
    r = catalog.pick_explained(catalog.TAREFA, task_ctx(user, task, item), history, now_utc, rng)
    if r is None:
        return None
    v = r["variant"]
    return {
        "title": r["title"], "body": r["body"], "explain": r,
        # task_id + date levam o toque ao Planning no dia da tarefa; os três
        # juntos são a chave de "já avisado".
        "action": {"task_id": str(task["id"]), "date": item["key"][1],
                   "start_time": item["key"][2], "variant_id": v.id, "family": v.family},
    }


def resolve(user_id: str, notif_type: str, attempts: list[tuple], now_utc: datetime,
            outbox) -> dict | None:
    """
    Sorteia a variação (notification_catalog.pick_explained) na primeira
    tentativa que tiver alguma elegível. O variant_id e a family vão no
    `action`, junto do que já ia: é o que permite comparar as variações depois
    (seção 5 do documento) sem coluna nova. None se nada era elegível.
    """
    try:
        history = outbox.history(user_id, notif_type, now_utc)
    except Exception as e:
        # Sem o histórico, o sorteio pode repetir; e se o banco está falhando
        # para isto, o resto dos dados também é suspeito: só Parceiro.
        _failed("histórico de variações", user_id, e)
        history = []
        attempts = [(k, {**c, "so_parceiro": True}, a) for k, c, a in attempts]
    for kind, ctx, action in attempts:
        r = catalog.pick_explained(kind, ctx, history, now_utc, outbox.rng)
        if r:
            v = r["variant"]
            return {"title": r["title"], "body": r["body"],
                    "action": {**action, "variant_id": v.id, "family": v.family},
                    "explain": r}
    return None


def morning_choice(user: dict, user_id: str, now_local: datetime, now_utc: datetime,
                   outbox) -> dict:
    """
    Resumo da manhã (planning_daily). Duas reservas fora do catálogo, só para
    falha de leitura:

    - a leitura das tarefas falhou → o texto genérico antigo, sem número
      nenhum (melhor que nenhum lembrete, e muito melhor que um número errado);
    - as médias falharam (só Parceiro) e nenhuma Parceiro cabe → o resumo do
      day_summary.
    """
    curve_key = _CURVE_KEY.get(user.get("chronotype", "intermediate"), "intermediate")
    name = first_name(user)
    try:
        items = day_reminders.open_items_on(user_id, now_local.date())
    except Exception as e:
        _failed("resumo do dia", user_id, e)
        return {
            "title": f"Planejamento do dia, {name}",
            "body": catalog.DAILY_FALLBACK_BODY.get(curve_key, catalog.DAILY_FALLBACK_BODY["intermediate"]),
            "action": {"variant_id": catalog.RESERVA_GENERICA, "family": catalog.PARCEIRO},
            "explain": {"reserva": "a leitura das tarefas de hoje falhou"},
        }

    ctx = {**base_ctx(user), **catalog.summary_vars(items, now_local, user.get("chronotype"))}
    try:
        medias = week_averages(user_id, now_local.date())
        ctx.update(media_semana=medias["atual"], melhor_semana=medias["melhor"])
    except Exception as e:
        _failed("médias da semana", user_id, e)
        ctx["so_parceiro"] = True

    choice = resolve(user_id, "planning_daily", [(catalog.MANHA, ctx, {})], now_utc, outbox)
    if choice:
        return choice
    title, body = day_reminders.day_summary(name, items, now_local)
    return {"title": title, "body": body,
            "action": {"variant_id": catalog.RESERVA_RESUMO, "family": catalog.PARCEIRO},
            "explain": {"reserva": "nenhuma variação Parceiro cabe (leitura de dados falhou)"}}


# ── Decisões por usuário, por ciclo ──────────────────────────────────────────

def user_notifications(user: dict, now_utc: datetime, outbox) -> None:
    """
    Tudo o que o ciclo decide de notificação para UMA pessoa, menos o "30 min
    antes" (que é em lote: task_reminders). Chamado pelo _process_user do
    scheduler e pelo script de simulação.
    """
    user_id = user["id"]
    tz_name = user_tz(user)
    now_local = now_utc.astimezone(ZoneInfo(tz_name))

    # Fim do dia ANTES dos lembretes de planejamento: estes têm interruptor
    # próprio e não dependem dos de planejamento estarem ligados.
    end_of_day(user, user_id, tz_name, now_local, now_utc, outbox)
    planning_reminders(user, user_id, tz_name, now_local, now_utc, outbox)


def end_of_day(user: dict, user_id: str, tz_name: str, now_local: datetime,
               now_utc: datetime, outbox) -> None:
    """
    Registro do dia e organizar o amanhã (item 10). Valem para todos, inclusive
    contas inativas: são push, de graça, e podem trazer a pessoa de volta.
    """
    review_time, tomorrow_time = day_reminders.end_of_day_times(user)
    today = str(now_local.date())
    REVIEW, TOMORROW = day_reminders.DAY_REVIEW_REMINDER, day_reminders.PLAN_TOMORROW_REMINDER

    # Registro do dia: só se o de hoje ainda não está completo.
    if in_window(now_local, review_time, END_OF_DAY_WINDOW_MIN) and not outbox.decided(user_id, REVIEW, today):
        if not day_reminders.enabled(user, "day_review_reminder_enabled"):
            outbox.note(user_id, REVIEW, "desligado nas configurações", now_utc)
        else:
            try:
                if outbox.latest_sent_today(user_id, REVIEW, tz_name, now_utc):
                    outbox.decide(user_id, REVIEW, today)
                elif day_reminders.day_log_complete(user_id, now_local.date()):
                    outbox.note(user_id, REVIEW, "registro de hoje já está completo", now_utc)
                    outbox.decide(user_id, REVIEW, today)
                else:
                    choice = resolve(user_id, REVIEW, review_attempts(user, user_id, now_local), now_utc, outbox)
                    if choice:
                        outbox.emit(user_id, REVIEW, choice, now_utc)
                    outbox.decide(user_id, REVIEW, today)
                    # O aviso de amanhã não pode sair neste mesmo ciclo.
                    return
            except Exception as e:
                print(f"[planning_scheduler] day_review_reminder falhou user={user_id}: {e}", flush=True)

    # Organizar o amanhã: só se amanhã ainda está vazio.
    if in_window(now_local, tomorrow_time, END_OF_DAY_WINDOW_MIN) and not outbox.decided(user_id, TOMORROW, today):
        if not day_reminders.enabled(user, "plan_tomorrow_reminder_enabled"):
            outbox.note(user_id, TOMORROW, "desligado nas configurações", now_utc)
            return
        try:
            if outbox.latest_sent_today(user_id, TOMORROW, tz_name, now_utc):
                outbox.decide(user_id, TOMORROW, today)
                return
            review_sent = outbox.latest_sent_today(user_id, REVIEW, tz_name, now_utc)
            if review_sent and now_utc - review_sent < END_OF_DAY_GAP:
                outbox.note(user_id, TOMORROW, "espera 30 min depois do aviso de registro", now_utc)
                return  # tenta de novo no próximo ciclo
            if day_reminders.has_items_on(user_id, day_reminders.tomorrow_of(now_local)):
                outbox.note(user_id, TOMORROW, "amanhã já tem tarefa", now_utc)
                outbox.decide(user_id, TOMORROW, today)
                return
            choice = resolve(user_id, TOMORROW, tomorrow_attempts(user, user_id, now_local), now_utc, outbox)
            if choice:
                outbox.emit(user_id, TOMORROW, choice, now_utc)
            outbox.decide(user_id, TOMORROW, today)
        except Exception as e:
            print(f"[planning_scheduler] plan_tomorrow_reminder falhou user={user_id}: {e}", flush=True)


def planning_reminders(user: dict, user_id: str, tz_name: str, now_local: datetime,
                       now_utc: datetime, outbox) -> None:
    """Resumo da manhã (planning_daily) e planejamento da semana (planning_weekly)."""
    daily_enabled = bool_pref(user.get("daily_planning_enabled"), True)
    weekly_enabled = bool_pref(user.get("weekly_planning_enabled"), True)
    hhmm = now_local.strftime("%H:%M")

    # Semanal: dispara no dia + horário específico para semanal
    if now_local.weekday() == effective_weekly_day(user) and hhmm >= weekly_fire_time(user):
        if not weekly_enabled:
            outbox.note(user_id, "planning_weekly", "desligado nas configurações", now_utc)
        elif not outbox.planning_sent_this_week(user_id, tz_name, now_utc):
            choice = resolve(user_id, "planning_weekly", weekly_attempts(user, user_id, now_local), now_utc, outbox)
            if choice:
                outbox.emit(user_id, "planning_weekly", choice, now_utc)
                print(f"[planning_scheduler] planning_weekly → user={user_id}", flush=True)

    # Diário: dispara todo dia a partir do horário
    if hhmm >= daily_fire_time(user):
        if not daily_enabled:
            outbox.note(user_id, "planning_daily", "desligado nas configurações", now_utc)
        elif not outbox.planning_sent_today(user_id, tz_name, now_utc):
            outbox.emit(user_id, "planning_daily", morning_choice(user, user_id, now_local, now_utc, outbox), now_utc)
            print(f"[planning_scheduler] planning_daily → user={user_id}", flush=True)


# ── 30 min antes (em lote) ───────────────────────────────────────────────────

def fetch_reminder_tasks(now_utc: datetime, user_id: str | None = None) -> dict[str, list[dict]]:
    """
    Tarefas candidatas a "30 min antes" em UMA consulta (paginada), agrupadas
    por usuário — de todos (scheduler) ou de um só (script).

    Uma consulta por usuário por ciclo, em série (~105 ms cada, AGENTS.md §13),
    não escala: com 1.000 usuários o ciclo passaria de 5 minutos. A faixa
    ontem→amanhã em UTC cobre qualquer fuso (UTC−12 a UTC+14); a decisão do
    horário é feita depois, no fuso de cada um (day_reminders.due_task_reminders).
    Sem item de rotina, sem concluídas, só com horário.
    """
    today = now_utc.date()

    def build():
        q = (
            supabase.table("tasks")
            .select("id, user_id, title, task_type, status, scheduled_date, start_time, routine_item_id")
            .gte("scheduled_date", str(today - timedelta(days=1)))
            .lte("scheduled_date", str(today + timedelta(days=1)))
            .not_.is_("start_time", "null")
            .is_("routine_item_id", "null")
            .neq("status", "done")
        )
        if user_id:
            q = q.eq("user_id", user_id)
        return q.order("id")

    out: dict[str, list[dict]] = {}
    for r in fetch_all(build):
        out.setdefault(str(r["user_id"]), []).append(r)
    return out


def task_state_from_rows(rows: list[dict]):
    """
    Das notificações de "30 min antes": (chaves já avisadas, histórico de
    variações por usuário). Pura — o banco (produção) e a memória (simulação)
    passam pelas mesmas regras.
    """
    sent: set[tuple[str, str, str]] = set()
    history: dict[str, list] = {}
    for row in rows:
        a = row.get("action") or {}
        if a.get("task_id") and a.get("date") and a.get("start_time"):
            sent.add(day_reminders.reminder_key(a["task_id"], a["date"], a["start_time"]))
        quando = day_reminders.parse_ts(row.get("created_at"))
        if a.get("variant_id") and quando:
            history.setdefault(str(row["user_id"]), []).append((a["variant_id"], quando))
    return sent, history


def task_reminder_history(user_ids: list[str], now_utc: datetime):
    """
    Avisos de "30 min antes" dos últimos 7 dias destes usuários, em UMA
    consulta paginada por ciclo (e só quando há candidatos). Serve ao "já
    avisado" — o controle vive no `action` da própria notificação, sem escrita
    extra — e ao histórico do sorteio. Uma leitura por usuário seria o N+1 que
    o AGENTS.md §13 proíbe.
    """
    if not user_ids:
        return set(), {}
    since = (now_utc - timedelta(days=catalog.SEM_REPETIR_DIAS)).isoformat()
    rows: list[dict] = []
    for i in range(0, len(user_ids), 150):  # URL do PostgREST: ~37 chars/UUID
        chunk = user_ids[i : i + 150]
        rows += fetch_all(
            lambda chunk=chunk: supabase.table("notifications")
            .select("id, user_id, action, created_at")
            .eq("type", day_reminders.TASK_REMINDER)
            .gte("created_at", since)
            .in_("user_id", chunk)
            .order("id")
        )
    return task_state_from_rows(rows)


def task_reminders(users: list[dict], now_utc: datetime, outbox,
                   user_id: str | None = None) -> None:
    """
    Avisa as tarefas e eventos que começam nos próximos 30 minutos.

    Não vale para contas inativas (activity_service): o carry-forward traz as
    pendentes para hoje todo dia mantendo o horário, e quem sumiu receberia o
    mesmo "começa em 30 minutos" das mesmas tarefas velhas, indefinidamente —
    o que afasta em vez de trazer de volta. Os outros lembretes seguem para
    todos (decisão do item 7).
    """
    def why_out(u: dict) -> str | None:
        if not day_reminders.enabled(u, "task_reminder_enabled"):
            return "desligado nas configurações"
        if not activity_service.is_active(u.get("last_seen_at"), now_utc):
            return "conta inativa (21+ dias sem abrir o app)"
        return None

    out_reason = {str(u["id"]): why_out(u) for u in users}
    eligible = [u for u in users if out_reason[str(u["id"])] is None]
    # Sem ninguém elegível a consulta não vale a pena — a não ser na simulação,
    # que quer mostrar a tarefa que NÃO foi avisada e por quê.
    if not eligible and not outbox.wants_notes:
        return

    tasks_by_user = fetch_reminder_tasks(now_utc, user_id)
    due: list[tuple[dict, dict]] = []
    for u in users:
        uid = str(u["id"])
        for item in day_reminders.due_task_reminders(tasks_by_user.get(uid, []), now_utc, user_tz(u)):
            if out_reason[uid] is None:
                due.append((u, item))
            else:
                outbox.note(u["id"], day_reminders.TASK_REMINDER,
                            f"{item['task']['title']} ({item['key'][2]}): {out_reason[uid]}", now_utc)
    if not due:
        return

    sent, history = outbox.task_reminder_state(sorted({str(u["id"]) for u, _ in due}), now_utc)
    for u, item in due:
        if item["key"] in sent:
            continue
        uid = str(u["id"])
        choice = task_choice(u, item, history.get(uid, []), now_utc, outbox.rng)
        if choice is None:
            continue
        try:
            outbox.emit(u["id"], day_reminders.TASK_REMINDER, choice, now_utc)
            sent.add(item["key"])
            history.setdefault(uid, []).append((choice["action"]["variant_id"], now_utc))
        except Exception as e:
            print(f"[planning_scheduler] task_reminder falhou user={u['id']}: {e}", flush=True)
