"""
Lembretes do dia (item 10): resumo da manhã, 30 min antes, registro do dia e
organizar o amanhã (Migration 41).

Nenhum deles chama o Claude: o texto é montado aqui a partir das tarefas. É a
regra do projeto (o backend calcula, o modelo só redige), e aqui não há nada
para redigir.

Quase tudo é PURO — recebe dados e devolve decisão/texto —, para ser testável
sem banco (tests_day_reminders.py). As poucas funções com I/O recebem user_id
e filtram por ele. A consulta em lote dos "30 min antes" (todos os usuários
num ciclo) mora no planning_scheduler, ao lado da busca de perfis, porque é
trabalho do ciclo e não de um usuário.
"""

import math
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from database import supabase
# format_hour mora no catálogo (puro, testável sem banco); reexportado aqui
# porque o resumo-reserva (day_summary) e o scheduler já o usavam por este nome.
from services.notification_catalog import format_hour  # noqa: F401

# Tipos novos de notificação. Precisam estar na restrição notifications_type_check
# (Migration 41) — sem isso o insert falha em silêncio dentro do try por usuário.
TASK_REMINDER = "task_reminder"
DAY_REVIEW_REMINDER = "day_review_reminder"
PLAN_TOMORROW_REMINDER = "plan_tomorrow_reminder"

# Antecedência do aviso de tarefa. A janela é [0, 30] minutos e não "exatamente
# 30": o ciclo de 5 min atrasa e o servidor pode cair, e uma tarefa criada 10 min
# antes do horário também merece o aviso — com o número real no texto.
TASK_REMINDER_MINUTES = 30

# Horários padrão de fim do dia por cronotipo (registro, organizar o amanhã),
# decididos pelo Bernardo. A meia hora entre os dois é proposital: os dois
# avisos nunca saem juntos.
_END_OF_DAY_DEFAULTS = {
    "morning":      ("20:00", "20:30"),
    "intermediate": ("21:00", "21:30"),
    "bimodal":      ("21:00", "21:30"),
    "evening":      ("22:00", "22:30"),
    "night":        ("22:00", "22:30"),
}

_CURVE_KEY = {
    "Matutino": "morning", "Vespertino": "evening", "Noturno": "night",
    "Misto": "intermediate", "Bimodal": "bimodal",
    "morning": "morning", "evening": "evening",
    "night": "night", "intermediate": "intermediate", "bimodal": "bimodal",
}


# ── Horários ─────────────────────────────────────────────────────────────────

def end_of_day_defaults(chronotype: str | None) -> tuple[str, str]:
    """(registro, organizar o amanhã) padrão do cronotipo. Pura."""
    curve = _CURVE_KEY.get(chronotype or "", "intermediate")
    return _END_OF_DAY_DEFAULTS.get(curve, _END_OF_DAY_DEFAULTS["intermediate"])


def end_of_day_times(prefs: dict) -> tuple[str, str]:
    """
    Horários efetivos (HH:MM) dos dois avisos de fim do dia. Pura.
    Nulo/ausente = o horário do cronotipo; a coluna é `time` e chega "HH:MM:SS".
    """
    review_default, tomorrow_default = end_of_day_defaults(prefs.get("chronotype"))
    review = prefs.get("day_review_reminder_time")
    tomorrow = prefs.get("plan_tomorrow_reminder_time")
    return (
        str(review)[:5] if review else review_default,
        str(tomorrow)[:5] if tomorrow else tomorrow_default,
    )


def enabled(prefs: dict, column: str) -> bool:
    """
    Interruptor de uma notificação nova. Ausente ou nulo = LIGADO: as novas
    nascem ligadas (decisão do Bernardo), e antes de a Migration 41 rodar a
    coluna nem existe no select.
    """
    val = prefs.get(column)
    return True if val is None else bool(val)


# ── Texto ────────────────────────────────────────────────────────────────────

def _greeting(hour: int) -> str:
    # O lembrete diário pode sair à tarde (horário escolhido pelo usuário, ou
    # o servidor voltou tarde): "Bom dia" às 15h soa automático demais.
    if hour < 12:
        return "Bom dia"
    if hour < 18:
        return "Boa tarde"
    return "Boa noite"


def day_summary(first_name: str, items: list[dict], now_local: datetime) -> tuple[str, str]:
    """
    (título, corpo) do resumo do dia. Pura.

    Desde o catálogo (notification_catalog), é só a RESERVA do resumo da
    manhã: sai quando nenhuma variação do documento é elegível (o caso comum
    é o dia com uma tarefa só).

    `items` são os itens de HOJE ainda não concluídos. A palavra é "tarefas"
    quando todos são tarefas, e "compromissos" quando há evento no meio:
    chamar reunião de tarefa soa errado.

    O item citado é o PRÓXIMO com horário a partir de agora — "a primeira"
    quando ele também é o primeiro do dia, "a próxima" quando o lembrete saiu
    depois de algum já ter passado.
    """
    title = f"{_greeting(now_local.hour)}, {first_name}!"
    if not items:
        return title, "Seu dia está livre. Quer planejar?"

    n = len(items)
    has_event = any(i.get("task_type") == "event" for i in items)
    if has_event:
        noun = "compromisso" if n == 1 else "compromissos"
    else:
        noun = "tarefa" if n == 1 else "tarefas"

    timed = sorted(
        (i for i in items if i.get("start_time")),
        key=lambda i: str(i["start_time"])[:5],
    )
    now_hhmm = now_local.strftime("%H:%M")
    upcoming = [i for i in timed if str(i["start_time"])[:5] >= now_hhmm]

    if n == 1:
        only = items[0]
        when = f", às {format_hour(str(only['start_time'])[:5])}" if only.get("start_time") else ""
        return title, f"Hoje você tem 1 {noun}: {only['title']}{when}."

    if not upcoming:
        return title, f"Hoje você tem {n} {noun}."

    nxt = upcoming[0]
    which = "a primeira" if timed and nxt is timed[0] else "a próxima"
    if has_event:
        which = "o primeiro" if which == "a primeira" else "o próximo"
    return title, (
        f"Hoje você tem {n} {noun} — {which} às "
        f"{format_hour(str(nxt['start_time'])[:5])}: {nxt['title']}."
    )


# ── 30 min antes ─────────────────────────────────────────────────────────────

def reminder_key(task_id: str, scheduled_date: str, start_time: str) -> tuple[str, str, str]:
    """
    Identidade de um aviso: tarefa + data + horário. Pura.

    O horário faz parte de propósito: se o usuário remarcar a tarefa depois do
    aviso, a chave muda e ela é avisada de novo para o horário novo.
    """
    return str(task_id), str(scheduled_date)[:10], str(start_time)[:5]


def due_task_reminders(tasks: list[dict], now_utc: datetime, tz_name: str) -> list[dict]:
    """
    Das tarefas de UM usuário, as que começam nos próximos 0–30 minutos, no fuso
    dele. Pura. Devolve dicts com `task`, `minutes` e `key`.

    `tasks` já vem filtrada pela consulta em lote (com horário, não concluída,
    sem item de rotina, data entre ontem e amanhã em UTC); aqui só se decide o
    tempo. Os filtros de status/rotina se repetem por segurança: são baratos,
    e um item de rotina avisado todo dia é exatamente o ruído que a regra evita.
    """
    tz = ZoneInfo(tz_name)
    now_local = now_utc.astimezone(tz)
    out = []
    for t in tasks:
        if t.get("status") == "done" or t.get("routine_item_id"):
            continue
        if not t.get("start_time") or not t.get("scheduled_date"):
            continue
        try:
            d = date.fromisoformat(str(t["scheduled_date"])[:10])
            h, m = int(str(t["start_time"])[:2]), int(str(t["start_time"])[3:5])
        except (ValueError, IndexError):
            continue
        start = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        seconds = (start - now_local).total_seconds()
        if 0 <= seconds <= TASK_REMINDER_MINUTES * 60:
            out.append({
                "task": t,
                # Arredonda para cima: às 09:32:10 para as 10:00 faltam 27,8 min,
                # e "em 28 minutos" é o que a pessoa conferiria no relógio.
                "minutes": math.ceil(seconds / 60),
                "key": reminder_key(t["id"], t["scheduled_date"], t["start_time"]),
            })
    return out


# ── Consultas de UM usuário (I/O) ────────────────────────────────────────────

def open_items_on(user_id: str, day: date) -> list[dict]:
    """Itens do dia ainda não concluídos (para o resumo da manhã)."""
    res = (
        supabase.table("tasks")
        .select("id, title, task_type, start_time, status")
        .eq("user_id", user_id)
        .eq("scheduled_date", str(day))
        .neq("status", "done")
        .execute()
    )
    return res.data or []


def has_items_on(user_id: str, day: date) -> bool:
    """O dia já tem pelo menos um item (qualquer status)? Para o organizar-o-amanhã."""
    res = (
        supabase.table("tasks")
        .select("id")
        .eq("user_id", user_id)
        .eq("scheduled_date", str(day))
        .limit(1)
        .execute()
    )
    return bool(res.data)


def day_log_complete(user_id: str, day: date) -> bool:
    """
    O registro do dia está completo? Mesmo critério do pop-up do Dashboard:
    sono, humor e produtividade preenchidos. Um rascunho ou um registro só com
    o sono ainda merece o lembrete.
    """
    res = (
        supabase.table("daily_logs")
        .select("sleep_rating, mood_rating, productivity_rating")
        .eq("user_id", user_id)
        .eq("date", str(day))
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    return bool(row) and all(
        row.get(k) is not None for k in ("sleep_rating", "mood_rating", "productivity_rating")
    )


def has_any_log(user_id: str) -> bool:
    """
    A pessoa já fez algum registro diário? Condição do reg_pri ("Seu primeiro
    registro"), que só é verdade para quem nunca registrou.
    """
    res = (
        supabase.table("daily_logs")
        .select("date")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def latest_sent_today(user_id: str, notif_type: str, tz_name: str) -> datetime | None:
    """Quando saiu, no dia LOCAL de hoje, a última notificação deste tipo (UTC)."""
    tz = ZoneInfo(tz_name)
    midnight = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        supabase.table("notifications")
        .select("created_at")
        .eq("user_id", user_id)
        .eq("type", notif_type)
        .gte("created_at", midnight.astimezone(timezone.utc).isoformat())
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    raw = str(res.data[0]["created_at"]).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        # Ilegível: tratamos como "saiu agora", o que só adia o aviso seguinte.
        return datetime.now(timezone.utc)


def tomorrow_of(now_local: datetime) -> date:
    return now_local.date() + timedelta(days=1)


# ── Dados das variações do catálogo (I/O; lidos só no disparo) ───────────────
# Nenhuma engole erro: quem chama trata a falha caindo na família Parceiro
# (notification_catalog), e para isso precisa saber que falhou.

def task_stats_rows(user_id: str, start: date, end: date) -> list[dict]:
    """Linhas de daily_task_stats entre start e end, inclusive."""
    res = (
        supabase.table("daily_task_stats")
        .select("date, total, completion_rate")
        .eq("user_id", user_id)
        .gte("date", str(start))
        .lte("date", str(end))
        .execute()
    )
    return res.data or []


def calibration_points(user_id: str) -> int:
    """
    Registros já usados na calibração. Lido direto, e não por
    calibration_service.get_block_scores, porque aquele devolve 0 quando a
    leitura falha — e 0 viraria "faltam 14" num texto com número.
    """
    res = (
        supabase.table("user_energy_profiles")
        .select("data_points")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return int((res.data or [{}])[0].get("data_points") or 0)


def today_counts(user_id: str, day: date) -> tuple[int, int]:
    """(concluídos, total) dos itens do dia — o {feitas_hoje} de {total_hoje}."""
    res = (
        supabase.table("tasks")
        .select("status")
        .eq("user_id", user_id)
        .eq("scheduled_date", str(day))
        .execute()
    )
    rows = res.data or []
    return sum(1 for r in rows if r.get("status") == "done"), len(rows)


def parse_ts(raw: object) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def variant_history(user_id: str, notif_type: str, now_utc: datetime,
                    days: int = 7) -> list[tuple[str, datetime]]:
    """
    [(variant_id, enviada_em)] deste tipo nos últimos `days` dias — para o
    sorteio não repetir variação (notification_catalog.choose).
    """
    res = (
        supabase.table("notifications")
        .select("action, created_at")
        .eq("user_id", user_id)
        .eq("type", notif_type)
        .gte("created_at", (now_utc - timedelta(days=days)).isoformat())
        .execute()
    )
    out = []
    for row in res.data or []:
        vid = (row.get("action") or {}).get("variant_id")
        quando = parse_ts(row.get("created_at"))
        if vid and quando:
            out.append((vid, quando))
    return out
