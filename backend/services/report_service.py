"""
Relatórios narrativos periódicos (semanal/mensal).

Coleta métricas já calculadas do período (daily_task_stats, consistência de
rotinas, tarefas chave) e pede ao Claude só a tradução em uma narrativa em
texto — mesma filosofia do correlations_service: o backend faz a
matemática, o Claude só escreve. Salva em `weekly_reports` (Migration 19),
com no máximo um relatório por usuário/tipo/período (índice único + upsert
idempotente).

Disparado pelo planning_scheduler: todo domingo 20h local (semanal, cobre a
própria semana que está terminando, segunda a domingo) e todo último dia do
mês 20h local (mensal, cobre o próprio mês que está terminando, dia 1 até o
último dia). Em ambos os casos o ÚLTIMO dia do período é o dia da geração —
ainda não tem snapshot congelado (isso só acontece à meia-noite), então é
calculado ao vivo (ver `daily_stats_service.live_day_stats`).

Visibilidade: o relatório aparece no Dashboard (`GET /dashboard/reports`)
desde a geração até o usuário vê-lo (`POST /dashboard/reports/{id}/seen`
grava `seen_at`). Depois disso ele sai do Dashboard mas continua acessível
para sempre em `GET /dashboard/reports/history`, que alimenta o histórico no
Perfil — é lá que o usuário compara semanas e meses.
"""

import json
from datetime import date, datetime, timedelta

from database import supabase
from services import claude_service, daily_stats_service, routines_service
from services import user_tz as user_tz_service

_NARRATOR_SYSTEM_PROMPT = """Você é o Axon, assistente pessoal de produtividade. Você recebe um resumo \
JÁ CALCULADO (o backend fez a matemática) do desempenho do usuário num período encerrado (semana ou mês).

Sua ÚNICA tarefa é escrever um resumo de 2 a 3 frases, em português do Brasil, tom de parceiro próximo \
e direto, primeira pessoa do Axon falando com o usuário — destacando o que mais marcou o período \
(positivo ou a melhorar). O resumo aparece logo abaixo do título do relatório, antes dos números; os \
detalhes o usuário lê nos cards, então não repita número por número — dê a leitura do período. \
Regras estritas:
- NUNCA invente ou altere números; use exatamente os valores fornecidos.
- NÃO liste os dados como lista/bullets — escreva em prosa corrida.
- NÃO use jargão técnico (não diga "score", "rate", "array", "json" etc.).
- Se algum dado vier vazio, nulo ou zerado (ex.: sem rotinas ativas, sem tarefa chave definida), \
simplesmente não mencione esse ponto — não force um comentário sobre ele.

Responda APENAS com o resumo, sem título, sem aspas, sem markdown."""


def _period_summary_message(data: dict) -> str:
    return (
        "Aqui está o resumo do período (já calculado, não altere os números). "
        "Escreva a narrativa a partir dele.\n\n"
        + json.dumps(data, ensure_ascii=False, indent=2)
    )


def _most_productive_day(snapshots: list[dict]) -> dict | None:
    if not snapshots:
        return None
    top = max(snapshots, key=lambda s: (s["completion_rate"], s["completed_tasks"]))
    return {"date": top["date"], "completion_rate": top["completion_rate"]}


def _key_task_stats(user_id: str, start: date, end: date) -> dict:
    res = (
        supabase.table("tasks")
        .select("status")
        .eq("user_id", user_id)
        .eq("is_key_task", True)
        .gte("scheduled_date", str(start))
        .lte("scheduled_date", str(end))
        .execute()
    )
    rows = res.data or []
    done = sum(1 for row in rows if row.get("status") == "done")
    return {"defined": len(rows), "done": done}


# ── Bem-estar (registro diário) ────────────────────────────────────────────

def _avg(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _minutes_of(clock: str | None) -> int | None:
    """'23:40' / '23:40:00' → minutos desde a meia-noite."""
    if not clock:
        return None
    try:
        hh, mm = str(clock).split(":")[:2]
        return int(hh) * 60 + int(mm)
    except (ValueError, TypeError):
        return None


def _avg_clock(clocks: list[str | None]) -> str | None:
    """
    Horário médio em 'HH:MM'. Horários noturnos cruzam a meia-noite: 23h40 e
    00h20 têm média 00h00, não 12h00. Por isso os valores antes das 12h são
    somados como se fossem do dia seguinte quando a lista é predominantemente
    noturna (heurística usada só para dormir; acordar nunca cruza).
    """
    minutes = [m for m in (_minutes_of(c) for c in clocks) if m is not None]
    if not minutes:
        return None

    # Se há valores nos dois extremos do dia, trata os da madrugada como +24h.
    if any(m >= 18 * 60 for m in minutes) and any(m < 6 * 60 for m in minutes):
        minutes = [m + 24 * 60 if m < 6 * 60 else m for m in minutes]

    avg = round(sum(minutes) / len(minutes)) % (24 * 60)
    return f"{avg // 60:02d}:{avg % 60:02d}"


def _wellbeing_stats(user_id: str, start: date, end: date) -> tuple[dict | None, dict | None]:
    """
    (sono, bem-estar) a partir dos registros diários do período.

    Dias marcados como folga (`is_day_off`) entram normalmente: o usuário
    descansou, mas dormiu e teve humor — o que não vale para eles é a leitura
    de produtividade, e essa já é média só dos dias que a preencheram.

    Qualquer um dos dois pode vir None quando não há registro utilizável, e o
    frontend simplesmente não desenha o card correspondente.
    """
    rows = (
        supabase.table("daily_logs")
        .select("hours_slept, sleep_time, wake_time, sleep_rating, "
                "mood_rating, productivity_rating")
        .eq("user_id", user_id)
        .gte("date", str(start))
        .lte("date", str(end))
        .execute()
    ).data or []

    if not rows:
        return None, None

    hours = [float(r["hours_slept"]) for r in rows if r.get("hours_slept") is not None]
    avg_hours = _avg(hours)

    sleep = None
    if avg_hours is not None:
        sleep = {
            "avg_minutes": round(avg_hours * 60),
            # Preenchido depois, comparando com o período anterior.
            "delta_minutes": None,
            "avg_sleep_time": _avg_clock([r.get("sleep_time") for r in rows]),
            "avg_wake_time": _avg_clock([r.get("wake_time") for r in rows]),
        }

    scores = []
    for key, column, label in (
        ("mood", "mood_rating", "Humor"),
        ("productivity", "productivity_rating", "Produtividade"),
        ("sleep_quality", "sleep_rating", "Qualidade do sono"),
    ):
        avg = _avg([float(r[column]) for r in rows if r.get(column) is not None])
        if avg is not None:
            scores.append({"key": key, "label": label, "value": round(avg, 1)})

    wellbeing = {"scores": scores, "logs_count": len(rows)} if scores else None
    return sleep, wellbeing


def _avg_sleep_minutes(user_id: str, start: date, end: date) -> int | None:
    """Média de sono (minutos) de um período — usada para o delta do card."""
    rows = (
        supabase.table("daily_logs")
        .select("hours_slept")
        .eq("user_id", user_id)
        .gte("date", str(start))
        .lte("date", str(end))
        .execute()
    ).data or []

    hours = [float(r["hours_slept"]) for r in rows if r.get("hours_slept") is not None]
    avg = _avg(hours)
    return round(avg * 60) if avg is not None else None


# ── Planejado x realizado ──────────────────────────────────────────────────

def _duration_hours(task: dict) -> float:
    """
    Duração agendada da tarefa em horas. Sem start/end definidos a tarefa não
    ocupa faixa na agenda e conta como 0 — só entram no total as que o usuário
    de fato colocou num horário.
    """
    start_min = _minutes_of(task.get("start_time"))
    end_min = _minutes_of(task.get("end_time"))
    if start_min is None or end_min is None:
        return 0.0
    if end_min <= start_min:  # vira o dia (ex.: 23:00 → 00:30)
        end_min += 24 * 60
    return (end_min - start_min) / 60


def _plan_vs_real(user_id: str, start: date, end: date) -> list[dict]:
    """
    Três linhas: horas agendadas x cumpridas, tarefas e eventos.

    "Realizado" = status 'done'. Para eventos isso inclui os auto-concluídos
    ao passar do horário, que é como o resto do app os trata.
    Rotinas (task_type 'routine') ficam de fora: elas têm o próprio card.
    """
    rows = (
        supabase.table("tasks")
        .select("task_type, status, start_time, end_time")
        .eq("user_id", user_id)
        .in_("task_type", ["task", "event"])
        .gte("scheduled_date", str(start))
        .lte("scheduled_date", str(end))
        .execute()
    ).data or []

    if not rows:
        return []

    hours_planned = hours_done = 0.0
    tasks_planned = tasks_done = 0
    events_planned = events_done = 0

    for row in rows:
        done = row.get("status") == "done"
        hours = _duration_hours(row)

        hours_planned += hours
        if done:
            hours_done += hours

        if row.get("task_type") == "event":
            events_planned += 1
            events_done += 1 if done else 0
        else:
            tasks_planned += 1
            tasks_done += 1 if done else 0

    out = []
    if hours_planned > 0:
        out.append({
            "label": "Horas registradas",
            "done": round(hours_done, 1),
            "planned": round(hours_planned, 1),
            "unit": "h",
        })
    if tasks_planned > 0:
        out.append({"label": "Tarefas", "done": tasks_done, "planned": tasks_planned})
    if events_planned > 0:
        out.append({"label": "Eventos", "done": events_done, "planned": events_planned})
    return out


# ── Objetivos ──────────────────────────────────────────────────────────────

def _objectives_progress(user_id: str, start: date, end: date) -> list[dict]:
    """
    Progresso dos objetivos ao FIM do período, e quanto avançou dentro dele.

    `objectives.progress` guarda só o valor de agora, sem histórico — mas o
    progresso é sempre (etapas concluídas / total), e cada etapa concluída tem
    `completed_at`. Dá para reconstruir o valor em qualquer data contando
    quantas etapas já estavam concluídas até lá:
        progress(d) = concluídas até d / total de etapas

    Isso assume que o conjunto de etapas não mudou durante o período (etapa
    criada depois dilui o passado). É aproximação aceitável — o alternativa
    seria uma tabela de snapshot diário por objetivo, que não existe.

    Objetivos sem etapa nenhuma ficam de fora: progresso 0/0 não diz nada.
    """
    objectives = (
        supabase.table("objectives")
        .select("id, title, progress, status")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    if not objectives:
        return []

    by_id = {o["id"]: o for o in objectives}

    # Uma consulta para todas as etapas de todos os objetivos (evita N+1).
    steps = (
        supabase.table("tasks")
        .select("objective_id, status, completed_at")
        .eq("user_id", user_id)
        .in_("objective_id", list(by_id.keys()))
        .execute()
    ).data or []

    if not steps:
        return []

    start_iso = str(start)
    end_iso = str(end)

    totals: dict[str, int] = {}
    done_by_end: dict[str, int] = {}
    done_before: dict[str, int] = {}

    for step in steps:
        oid = step.get("objective_id")
        if oid not in by_id:
            continue

        totals[oid] = totals.get(oid, 0) + 1
        if step.get("status") != "done":
            continue

        # Sem completed_at (concluída antes da coluna existir) conta como
        # anterior ao período: não infla o avanço deste relatório.
        stamp = str(step.get("completed_at") or "")[:10]
        if not stamp or stamp < start_iso:
            done_before[oid] = done_before.get(oid, 0) + 1
            done_by_end[oid] = done_by_end.get(oid, 0) + 1
        elif stamp <= end_iso:
            done_by_end[oid] = done_by_end.get(oid, 0) + 1

    out = []
    for oid, total in totals.items():
        if total == 0:
            continue

        progress = round(done_by_end.get(oid, 0) / total * 100)
        previous = round(done_before.get(oid, 0) / total * 100)

        # Objetivo que não existia/não andou e segue em 0: não vale a linha.
        if progress == 0 and previous == 0:
            continue

        out.append({
            "id": oid,
            "title": by_id[oid]["title"],
            "progress": progress,
            "delta": progress - previous,
        })

    # Quem mais avançou primeiro; empate pelo maior progresso.
    out.sort(key=lambda o: (o["delta"], o["progress"]), reverse=True)
    return out


def _collect_period_data(user_id: str, start: date, end: date, tz_name: str) -> dict:
    # No disparo pontual (20h do último dia), `end` é HOJE e ainda não tem
    # snapshot congelado — os dias anteriores vêm do snapshot e `end` é
    # calculado ao vivo, entrando na média só se tiver algo agendado (mesma
    # regra que snapshot_days usa para não congelar dias vazios).
    # Num catch-up (período já encerrado), `end` está no passado e JÁ tem
    # snapshot: usar live_day_stats aqui traria os números de hoje rotulados
    # como se fossem do último dia do período.
    today = datetime.now(user_tz_service.zone(tz_name)).date()

    # Nenhuma métrica olha para o futuro: no disparo normal `end` é hoje, mas
    # num catch-up (ou num período ainda em curso) `end` pode estar à frente.
    # Sem este corte, dias que ainda não chegaram entrariam no "planejado" e
    # afundariam toda taxa de cumprimento.
    data_end = min(end, today)
    end_is_today = data_end >= today

    frozen_end = data_end - timedelta(days=1) if end_is_today else data_end
    snapshots = (
        daily_stats_service.get_range(user_id, str(start), str(frozen_end))
        if frozen_end >= start else []
    )

    if end_is_today:
        live_today = daily_stats_service.live_day_stats(user_id, data_end, tz_name)
        if live_today["total"] > 0:
            snapshots = snapshots + [live_today]

    avg_completion_rate = (
        round(sum(s["completion_rate"] for s in snapshots) / len(snapshots))
        if snapshots else 0
    )

    completed_items = sum(s["completed_items"] for s in snapshots)
    total_items = sum(s["total"] for s in snapshots)

    # Período anterior de mesma duração, imediatamente antes deste. Serve para
    # os dois "vs. período anterior" do relatório (conclusão e sono).
    span_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span_days - 1)

    prev_snapshots = daily_stats_service.get_range(
        user_id, str(prev_start), str(prev_end)
    )
    completion_delta = None
    if prev_snapshots:
        prev_rate = round(
            sum(s["completion_rate"] for s in prev_snapshots) / len(prev_snapshots)
        )
        completion_delta = avg_completion_rate - prev_rate

    sleep, wellbeing = _wellbeing_stats(user_id, start, data_end)
    if sleep is not None:
        prev_sleep = _avg_sleep_minutes(user_id, prev_start, prev_end)
        if prev_sleep is not None:
            sleep["delta_minutes"] = sleep["avg_minutes"] - prev_sleep

    return {
        "period_start": str(start),
        "period_end": str(end),
        "generated_at": str(today),
        "avg_completion_rate": avg_completion_rate,
        "completion_delta": completion_delta,
        "completed_items": completed_items,
        "total_items": total_items,
        # Sem fórmula validada (completed_at marca quando o usuário MARCOU, não
        # quando terminou). O frontend esconde o card quando vem None.
        "time_saved_minutes": None,
        "most_productive_day": _most_productive_day(snapshots),
        "plan_vs_real": _plan_vs_real(user_id, start, data_end),
        "objectives": _objectives_progress(user_id, start, data_end),
        "routines": routines_service.daily_grid_for_range(user_id, start, data_end),
        # Mantido para não quebrar relatórios/consumidores antigos que leem
        # este campo; a grade nova é `routines`.
        "routine_consistency": routines_service.consistency_for_range(user_id, start, data_end),
        "key_tasks": _key_task_stats(user_id, start, data_end),
        "sleep": sleep,
        "wellbeing": wellbeing,
    }


def _generate_report(user_id: str, period_type: str, start: date, end: date, tz_name: str) -> dict:
    data = _collect_period_data(user_id, start, end, tz_name)

    narrative = claude_service.call_chat(
        messages=[{"role": "user", "content": _period_summary_message(data)}],
        system_prompt=_NARRATOR_SYSTEM_PROMPT,
    ).strip()

    payload = {
        "user_id": user_id,
        "period_type": period_type,
        "period_start": str(start),
        "period_end": str(end),
        "data": data,
        "narrative": narrative,
    }

    res = (
        supabase.table("weekly_reports")
        .upsert(payload, on_conflict="user_id,period_type,period_start")
        .execute()
    )
    return (res.data or [payload])[0]


def weekly_period_for(day: date) -> tuple[date, date]:
    """Semana (segunda→domingo) à qual `day` pertence."""
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def monthly_period_for(day: date) -> tuple[date, date]:
    """Mês calendário ao qual `day` pertence."""
    start = day.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month - timedelta(days=1)


def generate_weekly_report(user_id: str, tz_name: str, period_start: date | None = None) -> dict:
    """
    Relatório semanal. Sem `period_start`, gera a semana que termina hoje
    (disparo pontual de domingo 20h). Com ele, gera aquela semana — usado
    pelo catch-up para períodos já encerrados.
    """
    if period_start is None:
        today = datetime.now(user_tz_service.zone(tz_name)).date()
        period_start = today - timedelta(days=today.weekday())
        period_end = today
    else:
        period_start, period_end = weekly_period_for(period_start)
    return _generate_report(user_id, "weekly", period_start, period_end, tz_name)


def generate_monthly_report(user_id: str, tz_name: str, period_start: date | None = None) -> dict:
    """
    Relatório mensal. Sem `period_start`, gera o mês que termina hoje
    (disparo pontual do último dia 20h). Com ele, gera aquele mês — usado
    pelo catch-up para períodos já encerrados.
    """
    if period_start is not None:
        period_start, period_end = monthly_period_for(period_start)
        return _generate_report(user_id, "monthly", period_start, period_end, tz_name)

    today = datetime.now(user_tz_service.zone(tz_name)).date()
    period_start = today.replace(day=1)
    period_end = today
    return _generate_report(user_id, "monthly", period_start, period_end, tz_name)


# Quantos períodos encerrados o catch-up olha para trás. 1 = só o último.
# Manter baixo de propósito: cada relatório gerado é uma chamada paga ao
# Claude, e ressuscitar meses antigos de uma vez seria caro e pouco útil.
_CATCHUP_LOOKBACK = 1


def _has_report(user_id: str, period_type: str, period_start: date) -> bool:
    res = (
        supabase.table("weekly_reports")
        .select("id")
        .eq("user_id", user_id)
        .eq("period_type", period_type)
        .eq("period_start", str(period_start))
        .limit(1)
        .execute()
    )
    return bool(res.data)


def catch_up(user_id: str, tz_name: str) -> list[str]:
    """
    Gera relatórios de períodos JÁ ENCERRADOS que não foram gerados no
    horário — tipicamente porque o servidor estava fora do ar às 20h do
    último dia (o disparo pontual compara o minuto exato, sem recuperação).

    Só considera períodos completamente encerrados: a semana/mês corrente
    fica de fora, senão o relatório sairia com dados parciais e o índice
    único impediria a versão completa depois.

    Idempotente: períodos que já têm relatório são pulados, então rodar
    todo dia não regenera nem duplica nada.

    Devolve a lista de períodos gerados, para log.
    """
    today = datetime.now(user_tz_service.zone(tz_name)).date()
    generated: list[str] = []

    # --- semanais encerrados ---
    current_week_start, _ = weekly_period_for(today)
    for i in range(1, _CATCHUP_LOOKBACK + 1):
        wk_start = current_week_start - timedelta(weeks=i)
        if _has_report(user_id, "weekly", wk_start):
            continue
        generate_weekly_report(user_id, tz_name, period_start=wk_start)
        generated.append(f"weekly:{wk_start}")

    # --- mensais encerrados ---
    current_month_start, _ = monthly_period_for(today)
    ref = current_month_start
    for _ in range(_CATCHUP_LOOKBACK):
        ref = (ref - timedelta(days=1)).replace(day=1)  # mês anterior
        if _has_report(user_id, "monthly", ref):
            continue
        generate_monthly_report(user_id, tz_name, period_start=ref)
        generated.append(f"monthly:{ref}")

    return generated


