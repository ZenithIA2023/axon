"""
Lógica de CRUD de tarefas (tabela `tasks`) isolada do router HTTP.

Tanto os endpoints de routers/tasks.py quanto o agente Axon (tool use) usam
estas funções, para que haja uma única fonte da verdade. Todas recebem o
`user_id` explicitamente e garantem a posse das linhas (`.eq("user_id", …)`).

Erros de validação/posse levantam ValueError com mensagem amigável:
- o router converte para HTTPException;
- o agente converte para um tool_result de erro.
"""

from datetime import datetime, timezone

from database import supabase
from services import calendar_sync

# Campos de data que o Supabase devolve como date/datetime e precisam virar str.
_DATE_FIELDS = ("scheduled_date", "end_date", "deadline", "start_time", "end_time", "created_at", "completed_at")
# Campos de data que enviamos ao Supabase e precisam ser serializados antes.
_WRITE_DATE_FIELDS = ("scheduled_date", "end_date", "deadline")


def serialize(row: dict) -> dict:
    """Converte campos de data/hora para string e achata o join com objectives."""
    for field in _DATE_FIELDS:
        if row.get(field) is not None:
            row[field] = str(row[field])
    # Achata o join objectives(title) → objective_title
    obj = row.pop("objectives", None)
    row["objective_title"] = (obj or {}).get("title") if isinstance(obj, dict) else None
    return row


def _stringify_dates(payload: dict) -> dict:
    for field in _WRITE_DATE_FIELDS:
        if payload.get(field) is not None:
            payload[field] = str(payload[field])
    return payload


_PRIORITY_WEIGHT = {"high": 0, "medium": 1, "low": 2}


def _task_sort_key(t: dict) -> tuple:
    """Alta → Média → Baixa → mesmo nível: por start_time. Tarefa chave não altera a posição."""
    return (
        _PRIORITY_WEIGHT.get(t.get("priority") or "medium", 1),
        t.get("start_time") or "",
    )


# Duração assumida quando a tarefa não tem end_time — 45 min reflete melhor a
# média geral das tarefas do que um bloco cheio de 90.
_DEFAULT_SLOT_MIN = 45


def task_interval(start_time: str | None, end_time: str | None) -> tuple[int, int] | None:
    """
    Converte (start_time, end_time) em (início, fim) em minutos desde 00:00.
    Sem end_time (ou end<=start) assume _DEFAULT_SLOT_MIN. None se sem start.
    Tolera "HH:MM" e "HH:MM:SS".
    """
    if not start_time:
        return None
    try:
        s = int(start_time[:2]) * 60 + int(start_time[3:5])
    except (ValueError, IndexError):
        return None
    e = None
    if end_time:
        try:
            e = int(end_time[:2]) * 60 + int(end_time[3:5])
        except (ValueError, IndexError):
            e = None
    if e is None or e <= s:
        e = s + _DEFAULT_SLOT_MIN
    return s, e


def find_conflicting_task(
    user_id: str,
    scheduled_date: str,
    start_time: str | None,
    end_time: str | None = None,
    exclude_id: str | None = None,
) -> dict | None:
    """
    Primeira tarefa do usuário no dia cujo intervalo sobrepõe [start, end).
    Ignora `exclude_id` (a própria tarefa que está sendo remarcada). None se
    o slot está livre. Base da verificação anti-colisão das sugestões do Axon.
    """
    cand = task_interval(start_time, end_time)
    if not cand or not scheduled_date:
        return None
    cs, ce = cand
    for t in list_tasks(user_id, scheduled_date=str(scheduled_date)):
        if exclude_id and t["id"] == exclude_id:
            continue
        iv = task_interval(t.get("start_time"), t.get("end_time"))
        if not iv:
            continue
        ts, te = iv
        if cs < te and ts < ce:  # sobreposição
            return t
    return None


# Janela em que uma tarefa idêntica é tratada como repetição da MESMA intenção,
# não como um segundo pedido do usuário.
_DUPLICATE_WINDOW_SEC = 120


def find_recent_duplicate(
    user_id: str,
    title: str | None,
    scheduled_date: str | None,
    start_time: str | None,
    *,
    now: datetime | None = None,
    window_sec: int = _DUPLICATE_WINDOW_SEC,
) -> dict | None:
    """
    Tarefa idêntica (mesmo título, dia e horário) criada há menos de
    `window_sec`. None se não houver.

    Existe porque o loop de tool use pode reenviar a mesma chamada quando o
    `tool_result` não chega de volta ao modelo (ex.: rodada cortada por
    max_tokens): a tool já executou, mas o modelo não soube e tenta de novo.
    Sem esta checagem cada tentativa virava uma linha nova — foi assim que um
    único "marca dentista amanhã às 14h" virou três tarefas no banco.

    A comparação de título ignora caixa e espaços nas pontas; o resto tem de
    bater exatamente. Duas tarefas iguais no mesmo horário nunca são pedido
    legítimo — o usuário não agenda o dentista duas vezes às 14h.
    """
    if not title or not scheduled_date:
        return None
    alvo = title.strip().casefold()
    agora = now or datetime.now(timezone.utc)
    if agora.tzinfo is None:
        agora = agora.replace(tzinfo=timezone.utc)

    # O banco devolve "HH:MM:SS" e o agente manda "HH:MM" — sem normalizar, a
    # comparação nunca bate e a guarda não pega nada.
    alvo_hora = (start_time or "")[:5] or None

    for t in list_tasks(user_id, scheduled_date=str(scheduled_date)):
        if (t.get("title") or "").strip().casefold() != alvo:
            continue
        if ((t.get("start_time") or "")[:5] or None) != alvo_hora:
            continue
        criado = t.get("created_at")
        if not criado:
            continue
        try:
            dt = datetime.fromisoformat(str(criado).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if 0 <= (agora - dt).total_seconds() <= window_sec:
            return t
    return None


def list_tasks(
    user_id: str,
    *,
    scheduled_date: str | None = None,
    status: str | None = None,
    task_type: str | None = None,
    objective_id: str | None = None,
) -> list[dict]:
    query = (
        supabase.table("tasks")
        .select("*, objectives(title)")
        .eq("user_id", user_id)
        .order("start_time", desc=False)
    )

    if scheduled_date:
        query = query.eq("scheduled_date", scheduled_date)
    if status:
        query = query.eq("status", status)
    if task_type:
        query = query.eq("task_type", task_type)
    if objective_id:
        query = query.eq("objective_id", objective_id)

    result = query.execute()
    tasks = [serialize(row) for row in (result.data or [])]
    return sorted(tasks, key=_task_sort_key)


def _unset_key_task(user_id: str, scheduled_date: str, exclude_id: str | None = None) -> None:
    """Garante unicidade de tarefa chave por dia: zera a anterior antes de setar a nova."""
    q = (
        supabase.table("tasks")
        .update({"is_key_task": False})
        .eq("user_id", user_id)
        .eq("scheduled_date", scheduled_date)
        .eq("is_key_task", True)
    )
    if exclude_id:
        q = q.neq("id", exclude_id)
    q.execute()


def create_task(user_id: str, data: dict, now: datetime | None = None) -> dict:
    payload = _stringify_dates({**data})
    payload["user_id"] = user_id

    # Slot escolhido pelo próprio Axon ("Axon decide"), preenchido abaixo. Fica
    # registrado no ledger de otimizações como histórico do trabalho de
    # organização dele — com freed_minutes 0, porque agendar uma tarefa que não
    # tinha horário não ADIANTA o fim do dia (não havia "antes" para comparar).
    axon_picked_slot = None

    # "Axon decide": escolhe o melhor slot de energia para o dia, baseado no cronotipo.
    if payload.pop("axon_pick_time", False):
        duration = payload.pop("duration_minutes", None)
        if duration and payload.get("scheduled_date"):
            from services.routines_service import pick_best_slot
            from datetime import date as _date
            day = _date.fromisoformat(str(payload["scheduled_date"]))
            # `now` faz o slot de hoje começar a partir de agora, nunca no
            # passado; prioridade/chave impedem que o Axon coloque uma tarefa
            # importante num bloco fraco.
            slot = pick_best_slot(
                user_id, day, int(duration), now=now,
                priority=payload.get("priority"),
                is_key_task=bool(payload.get("is_key_task")),
            )
            if slot:
                payload["start_time"], payload["end_time"] = slot
                axon_picked_slot = slot
        else:
            payload.pop("duration_minutes", None)
    else:
        payload.pop("duration_minutes", None)

    # Tarefa chave implica prioridade Alta — garante consistência independente do frontend.
    if payload.get("is_key_task"):
        payload["priority"] = "high"
        if payload.get("scheduled_date"):
            _unset_key_task(user_id, payload["scheduled_date"])

    result = supabase.table("tasks").insert(payload).execute()
    if not result.data:
        raise ValueError("Erro ao criar tarefa")

    task = serialize(result.data[0])
    calendar_sync.sync_task_async(user_id, task, "create")

    if axon_picked_slot and task.get("scheduled_date"):
        # Import local: saved_time_service importa daily_stats_service, que
        # importa este módulo — no topo do arquivo isso seria um ciclo.
        try:
            from datetime import date as _date
            from services import saved_time_service

            saved_time_service.record_optimization(
                user_id,
                task["id"],
                _date.fromisoformat(str(task["scheduled_date"])),
                0,
                new_start=axon_picked_slot[0],
                new_end=axon_picked_slot[1],
                source="pick_time",
            )
        except Exception:
            pass  # métrica não pode impedir a criação da tarefa

    # O título novo precisa entrar no vocabulário de voz: sem isto o usuário
    # criaria a tarefa e, ao falar dela em seguida, o reconhecedor ainda não a
    # conheceria (o cache dura 5 min).
    from services import stt_vocabulary
    stt_vocabulary.invalidate(user_id)

    # Tarefa que já nasce concluída (importação, registro retroativo) precisa
    # lançar a etapa na hora — não haverá transição todo→done depois para
    # disparar o ledger.
    if task.get("objective_id") and task.get("status") == "done":
        from services import objectives_service
        objectives_service.sync_task_completion(
            user_id, task, became_done=True, became_undone=False
        )

    return task


def _ensure_owned(user_id: str, task_id: str) -> None:
    existing = (
        supabase.table("tasks")
        .select("id")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise ValueError("Tarefa não encontrada")


def _mirror_subtasks(user_id: str, task_id: str, *, done: bool) -> None:
    """
    Espelha o status da tarefa nas subtarefas e lança as que estão vinculadas
    a um objetivo.

    A escrita vai direto na tabela (sem passar por `subtasks_service`) para não
    disparar o recálculo reverso, que sobrescreveria o status que acabamos de
    definir. O efeito colateral é que o gancho de ledger daquele serviço também
    fica de fora — então ele é chamado aqui, explicitamente. Sem isto, concluir
    a tarefa mãe marcaria as subtarefas vinculadas sem avançar o objetivo, e o
    contador ficaria parado sem nada indicando o erro.
    """
    affected = (
        supabase.table("subtasks")
        .select("id, done, objective_id, objective_steps")
        .eq("task_id", task_id)
        .eq("user_id", user_id)
        .execute()
    ).data or []

    supabase.table("subtasks").update({"done": done}).eq("task_id", task_id).eq(
        "user_id", user_id
    ).execute()

    linked = [s for s in affected if s.get("objective_id")]
    if not linked:
        return

    from services import objectives_service

    for subtask in linked:
        was_done = bool(subtask.get("done"))
        if was_done == done:
            continue  # já estava nesse estado: nada a lançar nem a desfazer

        objectives_service.sync_subtask_completion(
            user_id,
            {**subtask, "done": done},
            became_done=done,
            became_undone=not done,
        )


def update_task(user_id: str, task_id: str, data: dict) -> dict:
    payload = _stringify_dates({**data})
    if not payload:
        raise ValueError("Nenhum campo para atualizar")

    # Confirma posse e lê estado atual (status para completed_at; scheduled_date
    # e is_key_task para a lógica de unicidade de tarefa chave).
    existing = (
        supabase.table("tasks")
        .select("status, scheduled_date, is_key_task, objective_id, objective_steps")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise ValueError("Tarefa não encontrada")
    current_status = existing.data[0].get("status")
    current_scheduled_date = existing.data[0].get("scheduled_date")
    current_objective_id = existing.data[0].get("objective_id")

    # objective_id vazio ("" vindo do formulário) significa desvincular do
    # objetivo. Vira NULL no banco — o router usa exclude_none, então a string
    # vazia chega até aqui e é normalizada neste ponto.
    if "objective_id" in payload and not payload["objective_id"]:
        payload["objective_id"] = None

    if payload.get("is_key_task"):
        payload["priority"] = "high"
        effective_date = str(payload.get("scheduled_date") or current_scheduled_date or "")
        if effective_date:
            _unset_key_task(user_id, effective_date, exclude_id=task_id)

    if "status" in payload:
        if payload["status"] == "done" and current_status != "done":
            payload["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif payload["status"] != "done":
            payload["completed_at"] = None  # reabriu a tarefa

    result = (
        supabase.table("tasks")
        .update(payload)
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise ValueError("Erro ao atualizar tarefa")

    task = serialize(result.data[0])
    calendar_sync.sync_task_async(user_id, task, "update")

    # Espelha o status da tarefa nas subtarefas: concluir a tarefa conclui
    # todas as subtarefas; reabrir uma tarefa concluída desmarca todas. A
    # atualização vai direto na tabela (sem passar por subtasks_service) para
    # não disparar o recálculo reverso, que sobrescreveria o status que
    # acabamos de definir. É o par da lógica subtarefas→tarefa em
    # subtasks_service._recalculate_task_progress.
    mirrored_status = payload.get("status")
    if mirrored_status == "done" and current_status != "done":
        _mirror_subtasks(user_id, task_id, done=True)
    elif mirrored_status and mirrored_status != "done" and current_status == "done":
        _mirror_subtasks(user_id, task_id, done=False)

    # Ledger do objetivo. Duas coisas independentes podem mudar aqui: o status
    # da tarefa (concluiu/reabriu) e o objetivo a que ela pertence. Tratar só a
    # primeira deixaria o lançamento preso no objetivo errado quando uma tarefa
    # JÁ concluída é movida de objetivo.
    from services import objectives_service

    new_status = task.get("status")
    was_done = current_status == "done"
    is_done = new_status == "done"
    new_objective_id = task.get("objective_id")
    objective_changed = new_objective_id != current_objective_id

    if objective_changed and was_done and current_objective_id:
        # O lançamento antigo sai antes de qualquer coisa: o índice único é por
        # tarefa, então sem apagar primeiro o lançamento no destino não entra.
        # (remove_entry_for_task já reconcilia o objetivo de origem.)
        objectives_service.remove_entry_for_task(task_id)

    if is_done and (not was_done or (objective_changed and new_objective_id)):
        objectives_service.sync_task_completion(
            user_id, task, became_done=True, became_undone=False
        )
    elif was_done and not is_done:
        objectives_service.sync_task_completion(
            user_id, task, became_done=False, became_undone=True
        )

    return task


def delete_task(user_id: str, task_id: str) -> None:
    # Busca a tarefa (com google_event_id) antes de deletar, para remover do Google
    existing = (
        supabase.table("tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise ValueError("Tarefa não encontrada")

    task = existing.data[0]
    objective_id = task.get("objective_id")
    supabase.table("tasks").delete().eq("id", task_id).eq("user_id", user_id).execute()
    calendar_sync.sync_task_async(user_id, task, "delete")

    # O cascade de `objective_step_entries.source_task_id` já apagou o
    # lançamento junto com a tarefa; só falta reconciliar o cache do objetivo.
    if objective_id:
        from services import objectives_service
        objectives_service.recalculate_from_ledger(objective_id)


def carry_forward_tasks(user_id: str, today=None) -> list[dict]:
    """
    Move para hoje TODAS as tarefas do tipo 'task' agendadas para dias
    passados que ainda estão pendentes (status 'todo' ou 'progress').

    `today` (date, opcional): "hoje" no fuso do usuário. Sem ele, cai no
    date.today() do servidor (UTC) — mantido para compatibilidade.

    Usa `< today` (não apenas ontem) para que nenhuma pendente fique presa
    num dia passado quando o app/servidor pula uma virada de dia. As
    pendentes só devem ser movidas DEPOIS de o snapshot do dia ser congelado
    (ver daily_stats_service.reconcile).

    Idempotente: chamadas repetidas no mesmo dia não encontram nada a mover.
    """
    from datetime import date as _date

    today = str(today or _date.today())

    result = (
        supabase.table("tasks")
        .select("id, carry_count")
        .eq("user_id", user_id)
        .eq("task_type", "task")
        .lt("scheduled_date", today)
        .in_("status", ["todo", "progress"])
        .is_("routine_item_id", "null")
        .execute()
    )

    rows = result.data or []
    if not rows:
        return []

    # Atualiza linha a linha para incrementar carry_count (PostgREST não
    # permite expressões SQL como coluna = coluna + 1 em update em lote).
    updated = []
    for row in rows:
        res = (
            supabase.table("tasks")
            .update(
                {
                    "scheduled_date": today,
                    "carry_count": (row.get("carry_count") or 0) + 1,
                }
            )
            .eq("user_id", user_id)
            .eq("id", row["id"])
            .execute()
        )
        if res.data:
            updated.append(serialize(res.data[0]))
    return updated


def list_subtasks(user_id: str, task_id: str) -> list[dict]:
    result = (
        supabase.table("tasks")
        .select("*")
        .eq("parent_task_id", task_id)
        .eq("user_id", user_id)
        .order("scheduled_date")
        .execute()
    )
    return [serialize(row) for row in (result.data or [])]
