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

A exceção à Regra 2 (crédito de otimização)
------------------------------------------
Há UMA fonte que entra no total mesmo em dia de confiança baixa: o tempo que o
próprio AXON liberou ao reorganizar uma tarefa (`optimization_minutes`, Fase 3).

O motivo é que a Regra 2 existe para filtrar um sinal AMBÍGUO — o completed_at,
que não diz a que horas o usuário terminou. O crédito de otimização não usa esse
sinal: ele compara dois horários que o sistema conhece com certeza, o "antes" e o
"depois" de um movimento que o usuário aceitou. Não há o que confirmar com o
usuário, então exigir a confirmação dele descartaria um dado exato por causa de
uma dúvida que não se aplica a ele.

Na prática: um dia em que o usuário não respondeu a pergunta soma zero de
execução e ainda assim soma o que o AXON liberou naquele dia.


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
from services import daily_stats_service
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
            .select(
                "scheduled_date, start_time, end_time, "
                "planned_start_time, planned_end_time, completed_at"
            )
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
        # O que a tarefa adiantada libera é a duração PLANEJADA dela. Se ela foi
        # concluída antes da hora, os horários mexeram (Migrations 33 e 34) e
        # ler os novos daria uma duração que não é a que o usuário reservou.
        # Os DOIS lados vêm do planejado pelo mesmo motivo de _planned_window:
        # misturar um planejado com um movido inventa uma duração.
        start = _to_minutes(row.get("planned_start_time") or row.get("start_time"))
        end = _to_minutes(row.get("planned_end_time") or row.get("end_time"))
        if start is None or end is None or end <= start:
            continue  # sem duração planejada não há capacidade a creditar
        total += end - start
    return total


# ── Crédito por reorganização do AXON (Fase 3) ──────────────────────────────

def freed_by_move(
    tasks: list[dict],
    day: date,
    task_id: str,
    new_start: str | None,
    new_end: str | None,
    new_date: str | None = None,
) -> int:
    """
    Quantos minutos um movimento do AXON liberou no dia `day`.

    NÃO é o tamanho do movimento. Mover uma tarefa 4h para trás não libera 4h —
    só libera tempo o movimento que adianta o FIM DO DIA:

        última tarefa 20:00–22:00 → 16:00–18:00, penúltima acaba 21:20
        ⇒ o dia passa a acabar 21:20 em vez de 22:00 = 40 min liberados

        tarefa do MEIO do dia 14:00–15:00 → 10:00–11:00, última ainda acaba 22:00
        ⇒ 0 min: o dia acaba no mesmo horário

    Por isso o cálculo é "fim do dia antes" menos "fim do dia depois", sobre
    TODAS as tarefas do dia — e não sobre a tarefa movida isoladamente.

    `new_date` diferente de `day` significa que a tarefa saiu deste dia: ela é
    removida do conjunto "depois". Só o dia de ORIGEM é creditado; o de destino
    recebeu trabalho, não liberou tempo.
    """
    before = daily_stats_service.planned_day_end(tasks, day)
    if before is None:
        return 0  # dia sem horário real: nada a comparar (Regra 3)

    moved_out = bool(new_date) and str(new_date) != str(day)

    after_tasks = []
    for t in tasks:
        if str(t.get("id")) != str(task_id):
            after_tasks.append(t)
            continue
        if moved_out:
            continue  # saiu do dia: não entra no "depois"
        # Mesma tarefa com os horários novos. Cópia rasa para não mutar a lista
        # que o chamador ainda vai usar.
        updated = dict(t)
        if new_start:
            updated["start_time"] = new_start
        if new_end:
            updated["end_time"] = new_end
        if new_start or new_end:
            # Mover uma tarefa REPLANEJA o horário dela: os horários novos
            # passam a ser o plano. Sem limpar as colunas de régua (Migrations
            # 33 e 34), _planned_window continuaria lendo os horários antigos e
            # o movimento pareceria não ter liberado nada.
            updated["planned_start_time"] = None
            updated["planned_end_time"] = None
        after_tasks.append(updated)

    after = daily_stats_service.planned_day_end(after_tasks, day)
    if after is None:
        # O movimento tirou do dia o único item com horário. O dia deixou de ter
        # fim planejado, e sem ponto de comparação não há crédito a dar.
        return 0

    return max(0, before - after)


def record_optimization(
    user_id: str,
    task_id: str,
    day: date,
    freed: int,
    *,
    notification_id: str | None = None,
    old_start: str | None = None,
    old_end: str | None = None,
    new_start: str | None = None,
    new_end: str | None = None,
    source: str = "improvement",
) -> None:
    """
    Registra no ledger um movimento que o AXON fez e o usuário aceitou.

    Falha em silêncio de propósito: esta gravação é uma MÉTRICA, e não pode
    derrubar o aceite da sugestão — o usuário pediu para mover a tarefa, e a
    tarefa já foi movida quando chegamos aqui. O índice único parcial em
    notification_id faz o segundo aceite da mesma sugestão cair aqui como erro
    de constraint, que é exatamente o comportamento desejado (sem crédito em
    dobro).
    """
    try:
        supabase.table("axon_optimizations").insert(
            {
                "user_id": user_id,
                "task_id": task_id,
                "notification_id": notification_id,
                "day": str(day),
                "old_start_time": old_start,
                "old_end_time": old_end,
                "new_start_time": new_start,
                "new_end_time": new_end,
                "freed_minutes": max(0, int(freed)),
                "source": source,
            }
        ).execute()
    except Exception as e:
        print(f"[saved_time] otimização não registrada user={user_id}: {e}", flush=True)


def _optimization_minutes(user_id: str, day: date) -> int:
    """Total liberado pelo AXON num dia (soma do ledger)."""
    try:
        res = (
            supabase.table("axon_optimizations")
            .select("freed_minutes")
            .eq("user_id", user_id)
            .eq("day", str(day))
            .execute()
        )
    except Exception:
        return 0
    return sum(int(r.get("freed_minutes") or 0) for r in res.data or [])


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
        # Mesmo sem plano com horário, o crédito de otimização é gravado: ele
        # não depende do fim planejado do dia — só da diferença entre o antes e
        # o depois de um movimento, que já foi calculada no aceite.
        return _upsert(
            user_id,
            day,
            {
                "recorded_end": None,
                "saved_minutes": 0,
                "advanced_minutes": 0,
                "optimization_minutes": _optimization_minutes(user_id, day),
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
            # A ÚNICA parcela que não depende do selo: ver a exceção à Regra 2
            # no cabeçalho do módulo.
            "optimization_minutes": _optimization_minutes(user_id, day),
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
                # "Não terminei" zera a execução, mas não o que o AXON liberou:
                # o movimento aconteceu independente de o usuário ter terminado.
                "optimization_minutes": _optimization_minutes(user_id, day),
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
            "optimization_minutes": _optimization_minutes(user_id, day),
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


def total_for_range(user_id: str, start: date, end: date) -> int:
    """
    Minutos poupados num intervalo QUALQUER — usado pelos relatórios semanais e
    mensais, cujo período não é a semana/mês de calendário de `summary`.

    Aplica exatamente as mesmas regras do card para os dois números baterem:
    só dias de confiança alta somam `saved` e `advanced`, e o crédito de
    otimização do AXON soma sempre (a exceção à Regra 2 do cabeçalho).

    Devolve 0 em qualquer falha: um relatório não pode quebrar por causa de uma
    métrica secundária, e o card do relatório se esconde sozinho quando é 0.
    """
    try:
        res = (
            supabase.table("day_closures")
            .select("saved_minutes, advanced_minutes, optimization_minutes, confidence")
            .eq("user_id", user_id)
            .gte("date", str(start))
            .lte("date", str(end))
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        print(f"[saved_time] total_for_range falhou user={user_id}: {e}", flush=True)
        return 0

    total = 0
    for row in rows:
        total += int(row.get("optimization_minutes") or 0)
        if row.get("confidence") == CONFIDENCE_HIGH:
            total += int(row.get("saved_minutes") or 0)
            total += int(row.get("advanced_minutes") or 0)
    return total


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
            .select(
                "date, saved_minutes, advanced_minutes, "
                "optimization_minutes, confidence"
            )
            .eq("user_id", user_id)
            .gte("date", str(start))
            .lte("date", str(end))
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        # NÃO silenciar: um erro aqui (coluna/tabela ausente, migration não
        # aplicada) devolveria zeros que o card mostra como "nada poupado", e o
        # número erraria sem ninguém notar. Foi assim que a calibração ficou
        # quebrada por semanas atrás de um except vazio.
        print(f"[saved_time] summary falhou user={user_id}: {e}", flush=True)
        rows = []

    total = 0
    advanced = 0
    optimization = 0
    counted_days = 0
    discarded_days = 0

    for row in rows:
        # O crédito de otimização soma SEMPRE — é a exceção à Regra 2 explicada
        # no cabeçalho do módulo. Fica fora do if de propósito.
        opt = int(row.get("optimization_minutes") or 0)
        optimization += opt
        total += opt

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
            # Um dia de confiança baixa que ainda assim liberou tempo pelo AXON
            # não é um dia "descartado": ele contribuiu para o número. Contá-lo
            # na nota de dias fora da conta faria o card se contradizer.
            if opt > 0:
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
        # As três origens do total. early = execução do usuário dentro do plano;
        # advanced = trabalho de outro dia adiantado; optimization = o que o
        # AXON reorganizou.
        "early_minutes": total - advanced - optimization,
        "advanced_minutes": advanced,
        "optimization_minutes": optimization,
        "counted_days": counted_days,
        "discarded_days": discarded_days,
    }
