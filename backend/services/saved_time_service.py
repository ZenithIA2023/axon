"""
Horas poupadas: quanto tempo o AXON devolveu ao usuário em relação ao plano
que ELE mesmo fez.

Não é um contrafactual ("você levaria 10h sem o AXON" — impossível de provar).
É uma comparação entre dois horários do próprio usuário: o dia estava planejado
até 22h, ele terminou o que planejou às 20h45 → 1h15 devolvida.

O sinal ruim que derrubou a primeira tentativa (ago/2026)
--------------------------------------------------------
`tasks.completed_at` NÃO registra quando a tarefa terminou, registra quando o
usuário abriu o app e tocou no botão ("vou para a academia e marco quando
volto"). Nos dados reais: 25% marcadas antes do fim planejado, 64% depois no
mesmo dia, 11% em outro dia. Tratar completed_at como hora de término erra em
75% dos casos.

A saída aqui não é uma fórmula mais esperta — é admitir a ignorância:
  - marcação DENTRO do horário planejado  → o dado basta, confiança alta;
  - marcação DEPOIS                       → o AXON PERGUNTA ao usuário;
  - sem resposta                           → o dia NÃO entra no número.

As três regras inegociáveis
---------------------------
1. Só há tempo poupado se o trabalho foi feito, medido em MINUTOS planejados
   concluídos (nunca em contagem de tarefas: pular 10min ≠ pular 3h).
2. Só entra no total o que tem confiança 'high'. 'medium'/'low' ficam
   registrados e fora da soma — o número fica menor e verdadeiro.
3. Dia cujo plano não tem horário real fica fora (planned_day_end nulo).

Por que adiantar trabalho de amanhã CONTA
-----------------------------------------
Segunda planejada até 22h, terminou 20h adiantando 2h de terça → +2h. Terça,
com o plano CONGELADO no início do dia, também acaba 20h → +2h. Não é contagem
dupla: são dois dias diferentes, cada um terminando antes do SEU plano, e às
20h de terça o usuário estava de fato livre. É por isso que o plano nunca é
recalculado depois do adiantamento (ver Migration 28).
"""

from datetime import date, datetime, time, timedelta, timezone

from database import supabase
from services import user_tz as user_tz_service

# Regra 1: abaixo desta fração dos minutos planejados, a economia é ZERO
# independente do horário. 0.8 e não 1.0 porque exigir 100% descartaria o dia
# por uma subtarefa esquecida, e o usuário que fez 39 dos 40 minutos planejados
# e terminou cedo poupou tempo de verdade. Abaixo disso o "terminei antes" não
# é eficiência, é trabalho empurrado para frente.
_MIN_COMPLETION_RATIO = 0.8

# A pergunta só vale para o passado recente: lembrar a que horas terminou
# anteontem já é chute, e um chute confirmado entra no número como se fosse
# certeza. Fora dessa janela o dia fica 'low' e simplesmente não conta.
_MAX_QUESTION_AGE_DAYS = 2

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"


# ── Conversões de horário ───────────────────────────────────────────────────

def _to_minutes(hhmm: str | None) -> int | None:
    """'22:30' (ou '22:30:00') → 1350 minutos desde a meia-noite."""
    if not hhmm:
        return None
    try:
        parts = str(hhmm).split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return None


def _to_hhmm(minutes: int) -> str:
    m = max(0, min(int(minutes), 24 * 60 - 1))
    return f"{m // 60:02d}:{m % 60:02d}"


# ── Leitura dos dados do dia ────────────────────────────────────────────────

def _snapshot(user_id: str, day: date) -> dict | None:
    """O plano congelado do dia (Migration 28). None se o dia não foi congelado."""
    try:
        res = (
            supabase.table("daily_task_stats")
            .select(
                "date, total, planned_day_end, planned_minutes, "
                "completed_planned_minutes"
            )
            .eq("user_id", user_id)
            .eq("date", str(day))
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def _recorded_end_minutes(user_id: str, day: date, tz) -> int | None:
    """
    Hora local da marcação mais TARDIA do dia — o sinal cru de completed_at.

    Só olha tarefas agendadas para `day`, mas NÃO filtra completed_at por data:
    11% das marcações caem no dia seguinte, e é justamente esse caso que precisa
    virar pergunta. Uma marcação feita depois da meia-noite local devolve um
    horário >= 24h (ex.: 01:30 do dia seguinte → 1530 min), para o cálculo
    saber que ela transbordou o dia em vez de parecer 01:30 da manhã.
    """
    try:
        res = (
            supabase.table("tasks")
            .select("completed_at")
            .eq("user_id", user_id)
            .eq("scheduled_date", str(day))
            .not_.is_("completed_at", "null")
            .execute()
        )
    except Exception:
        return None

    latest: int | None = None
    for row in res.data or []:
        ts = row.get("completed_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(tz)
        except Exception:
            continue
        minutes = dt.hour * 60 + dt.minute + (dt.date() - day).days * 24 * 60
        if minutes < 0:
            continue  # marcada ANTES do dia começar: não diz nada sobre o fim
        latest = minutes if latest is None else max(latest, minutes)
    return latest


# ── Cálculo ─────────────────────────────────────────────────────────────────

def _saved_minutes(planned_end: int, actual_end: int, ratio_ok: bool) -> int:
    """
    Minutos devolvidos: o quanto o dia acabou antes do planejado.

    `ratio_ok` é a Regra 1 — sem trabalho feito não há economia, por mais cedo
    que o dia tenha "acabado". Terminar depois do planejado não vira débito
    (a métrica é "tempo devolvido", não um saldo): o piso é zero.
    """
    if not ratio_ok:
        return 0
    return max(0, planned_end - actual_end)


def _ratio_ok(snapshot: dict) -> bool:
    planned = int(snapshot.get("planned_minutes") or 0)
    if planned <= 0:
        # Sem minutos planejados não há o que comparar — e sem essa guarda a
        # divisão abaixo estouraria. Dia com horário mas duração zero (só
        # start_time) não sustenta economia.
        return False
    done = float(snapshot.get("completed_planned_minutes") or 0)
    return (done / planned) >= _MIN_COMPLETION_RATIO


def _advanced_minutes(user_id: str, day: date, tz) -> int:
    """
    Minutos de trabalho de OUTROS dias concluídos dentro deste dia.

    É a "capacidade adiantada": tarefa planejada para amanhã (ou depois) que o
    usuário fechou hoje. Aparece em linha separada no detalhamento porque é
    informação de natureza diferente — mas SOMA no total, pelo raciocínio do
    cabeçalho deste módulo.

    Conta a DURAÇÃO planejada da tarefa adiantada, não a diferença de horários:
    adiantar uma tarefa de 1h libera 1h, independente de quantos dias à frente
    ela estava.
    """
    try:
        res = (
            supabase.table("tasks")
            .select("scheduled_date, start_time, end_time, completed_at")
            .eq("user_id", user_id)
            .eq("status", "done")
            .gt("scheduled_date", str(day))
            .not_.is_("completed_at", "null")
            .execute()
        )
    except Exception:
        return 0

    total = 0
    for row in res.data or []:
        ts = row.get("completed_at")
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(tz)
        except Exception:
            continue
        if dt.date() != day:
            continue  # só o que foi fechado NESTE dia
        start = _to_minutes(row.get("start_time"))
        end = _to_minutes(row.get("end_time"))
        if start is None or end is None or end <= start:
            continue  # sem duração planejada não há capacidade a creditar
        total += end - start
    return total


# ── Fechamento do dia ───────────────────────────────────────────────────────

def close_day(user_id: str, tz_name: str, day: date) -> dict | None:
    """
    Fecha um dia: decide a confiança, calcula a economia e grava em
    `day_closures`. Idempotente — o scheduler roda numa janela de 15 min e pode
    chamar mais de uma vez na mesma virada; o upsert pela PK (user_id, date)
    reescreve a mesma linha.

    NÃO sobrescreve um dia já respondido pelo usuário: a resposta dele é o
    melhor dado que existe e uma reexecução do fechamento não pode descartá-la.
    """
    tz = user_tz_service.zone(tz_name)

    existing = _closure(user_id, day)
    if existing and existing.get("answered_at"):
        return existing

    snapshot = _snapshot(user_id, day)
    planned_end = _to_minutes((snapshot or {}).get("planned_day_end"))

    # Regra 3: sem horário real no plano, o dia não entra na conta. Grava a
    # linha de todo jeito (com 0) para o fechamento ser rastreável e para a
    # pergunta nunca ser feita sobre um dia que não tem o que comparar.
    if not snapshot or planned_end is None:
        return _upsert(
            user_id,
            day,
            {
                "recorded_end": None,
                "saved_minutes": 0,
                "advanced_minutes": 0,
                "confidence": CONFIDENCE_LOW,
            },
        )

    recorded = _recorded_end_minutes(user_id, day, tz)
    ratio_ok = _ratio_ok(snapshot)
    advanced = _advanced_minutes(user_id, day, tz)

    if recorded is None:
        # Nada foi marcado no dia. Não há economia a comprovar e não há o que
        # perguntar ("que horas você terminou?" sobre um dia sem conclusão).
        confidence = CONFIDENCE_LOW
        saved = 0
    elif recorded <= planned_end:
        # Marcou tudo dentro do horário planejado: o sinal é confiável por si —
        # o usuário estava com o app aberto antes do fim do plano. É o único
        # caso que dispensa a pergunta.
        confidence = CONFIDENCE_HIGH
        saved = _saved_minutes(planned_end, recorded, ratio_ok)
    else:
        # Marcou depois do fim planejado: pode ter terminado no horário e
        # marcado tarde, ou ter estourado o plano. O AXON não sabe — fica 'low'
        # (fora do número) até o usuário responder.
        confidence = CONFIDENCE_LOW
        saved = 0

    return _upsert(
        user_id,
        day,
        {
            "recorded_end": _to_hhmm(recorded) if recorded is not None else None,
            "saved_minutes": saved,
            # A capacidade adiantada segue a mesma confiança do dia: creditar
            # adiantamento num dia que o AXON não consegue fechar colocaria no
            # total um número que o detalhamento não sabe justificar.
            "advanced_minutes": advanced if confidence == CONFIDENCE_HIGH else 0,
            "confidence": confidence,
        },
    )


def answer_closure(
    user_id: str,
    day: date,
    tz_name: str,
    reported_end: str | None = None,
    not_finished: bool = False,
) -> dict | None:
    """
    Aplica a resposta do usuário à pergunta do dia.

    "Não terminei" é uma resposta legítima e valiosa: fecha o dia com zero e
    encerra o assunto, em vez de deixar a pergunta voltando.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if not_finished:
        return _upsert(
            user_id,
            day,
            {
                "reported_end": None,
                "saved_minutes": 0,
                "advanced_minutes": 0,
                "confidence": CONFIDENCE_LOW,
                "answered_at": now_iso,
            },
        )

    reported = _to_minutes(reported_end)
    if reported is None:
        return None

    snapshot = _snapshot(user_id, day)
    planned_end = _to_minutes((snapshot or {}).get("planned_day_end"))
    if not snapshot or planned_end is None:
        return None  # Regra 3: dia sem plano não vira número nem com resposta

    tz = user_tz_service.zone(tz_name)
    saved = _saved_minutes(planned_end, reported, _ratio_ok(snapshot))
    advanced = _advanced_minutes(user_id, day, tz)

    return _upsert(
        user_id,
        day,
        {
            "reported_end": _to_hhmm(reported),
            "saved_minutes": saved,
            "advanced_minutes": advanced,
            # O usuário respondeu: é o melhor dado disponível sobre o fim do
            # dia dele, e é o que autoriza o dia a entrar no número.
            "confidence": CONFIDENCE_HIGH,
            "answered_at": now_iso,
        },
    )


# ── Persistência ────────────────────────────────────────────────────────────

def _closure(user_id: str, day: date) -> dict | None:
    try:
        res = (
            supabase.table("day_closures")
            .select("*")
            .eq("user_id", user_id)
            .eq("date", str(day))
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None
    except Exception:
        return None


def _upsert(user_id: str, day: date, fields: dict) -> dict | None:
    row = {"user_id": user_id, "date": str(day), **fields}
    try:
        res = (
            supabase.table("day_closures")
            .upsert(row, on_conflict="user_id,date")
            .execute()
        )
        data = res.data or []
        return data[0] if data else row
    except Exception as e:
        print(f"[saved_time] upsert falhou user={user_id} day={day}: {e}", flush=True)
        return None


def mark_asked(user_id: str, day: date) -> None:
    """Registra que a pergunta daquele dia foi exibida (não repetir)."""
    _upsert(user_id, day, {"asked_at": datetime.now(timezone.utc).isoformat()})


def dismiss(user_id: str, day: date) -> None:
    """Usuário fechou a pergunta sem responder — não insistir naquele dia."""
    _upsert(user_id, day, {"dismissed": True})


# ── A pergunta ──────────────────────────────────────────────────────────────

def _question_options(planned_end: int) -> list[str]:
    """
    Até três horários sugeridos, terminando no fim planejado.

    São CALCULADOS, não fixos. A pergunta só existe quando a marcação veio
    DEPOIS do fim planejado, então a resposta honesta do usuário está em algum
    ponto até esse fim — as opções andam de meia em meia hora para trás a partir
    dele. Ex.: planejado 22h → 21:00, 21:30, 22:00. As opções "Quando marquei" e
    "Não terminei" cobrem o resto e ficam no frontend.
    """
    anchor = (planned_end // 30) * 30
    out = [anchor - i * 30 for i in range(2, -1, -1)]
    return [_to_hhmm(m) for m in out if m > 0]


def pending_question(user_id: str, tz_name: str) -> dict | None:
    """
    A pergunta pendente, se houver — consumida na abertura do app.

    O disparo é o FECHAMENTO do dia, não a conclusão da última tarefa: como 11%
    das marcações caem em outro dia, disparar na conclusão faria a pergunta
    aparecer na terça falando de segunda sem contexto. Por isso ela sempre se
    refere a um dia nomeado ("ontem").
    """
    tz = user_tz_service.zone(tz_name)
    today = datetime.now(tz).date()
    oldest = today - timedelta(days=_MAX_QUESTION_AGE_DAYS)

    try:
        res = (
            supabase.table("day_closures")
            .select("date, recorded_end, confidence, asked_at, answered_at, dismissed")
            .eq("user_id", user_id)
            .neq("confidence", CONFIDENCE_HIGH)
            .is_("answered_at", "null")
            .eq("dismissed", False)
            .gte("date", str(oldest))
            .lt("date", str(today))
            .order("date", desc=True)
            .execute()
        )
    except Exception:
        return None

    for row in res.data or []:
        day = date.fromisoformat(str(row["date"]))
        recorded = _to_minutes(row.get("recorded_end"))
        if recorded is None:
            continue  # dia sem marcação: não há o que perguntar

        snapshot = _snapshot(user_id, day)
        planned_end = _to_minutes((snapshot or {}).get("planned_day_end"))
        if planned_end is None:
            continue  # Regra 3

        mark_asked(user_id, day)
        return {
            "date": str(day),
            "is_yesterday": day == today - timedelta(days=1),
            "planned_day_end": _to_hhmm(planned_end),
            "recorded_end": _to_hhmm(recorded),
            "options": _question_options(planned_end),
        }
    return None


# ── O número para a tela ────────────────────────────────────────────────────

def _period_bounds(today: date, period: str, offset: int = 0) -> tuple[date, date]:
    """
    Semana do calendário (domingo→sábado) ou mês do calendário — as MESMAS
    janelas do card de tarefas (routers/insights.py), para os números da aba
    Insights serem comparáveis entre cartões.
    """
    if period == "week":
        start = today - timedelta(days=(today.weekday() + 1) % 7, weeks=offset)
        return start, start + timedelta(days=6)

    anchor = today.replace(day=1)
    for _ in range(offset):
        anchor = (anchor - timedelta(days=1)).replace(day=1)
    last = (anchor.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return anchor, last


def summary(user_id: str, tz_name: str, period: str = "week", offset: int = 0) -> dict:
    """
    O número do card: minutos poupados no período, somando SÓ os dias de
    confiança alta (Regra 2).

    Devolve também quantos dias ficaram de fora, para o card poder explicar um
    número baixo em vez de parecer que perdeu dados.
    """
    tz = user_tz_service.zone(tz_name)
    today = datetime.now(tz).date()
    start, end = _period_bounds(today, period, offset)

    try:
        res = (
            supabase.table("day_closures")
            .select("date, saved_minutes, advanced_minutes, confidence")
            .eq("user_id", user_id)
            .gte("date", str(start))
            .lte("date", str(end))
            .execute()
        )
        rows = res.data or []
    except Exception:
        rows = []

    total = 0
    advanced = 0
    counted_days = 0
    discarded_days = 0

    for row in rows:
        if row.get("confidence") == CONFIDENCE_HIGH:
            saved = int(row.get("saved_minutes") or 0)
            adv = int(row.get("advanced_minutes") or 0)
            total += saved + adv
            advanced += adv
            # "Entrou no número" = dia que de fato contribuiu. Um dia de
            # confiança alta que poupou zero não é um dia contado, senão o card
            # diria "5 dias" com 0h no total.
            if saved + adv > 0:
                counted_days += 1
        else:
            discarded_days += 1

    return {
        "period": period,
        "offset": offset,
        "start": str(start),
        "end": str(end),
        # `saved_minutes` é o TOTAL mostrado; `early_minutes` e
        # `advanced_minutes` são as duas origens e somam nele.
        "saved_minutes": total,
        "early_minutes": total - advanced,
        "advanced_minutes": advanced,
        "counted_days": counted_days,
        "discarded_days": discarded_days,
    }
