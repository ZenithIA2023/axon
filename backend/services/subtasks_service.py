"""
Checklist de subtarefas vinculado a uma tarefa mãe.

Cada subtarefa tem título + done. Ao marcar/desmarcar, o progresso e o
status da tarefa mãe são recalculados automaticamente.
Cascade de exclusão via FK: deletar a tarefa mãe apaga as subtarefas.
"""

from datetime import datetime, timezone

from database import supabase


def _serialize(row: dict) -> dict:
    if row.get("created_at") is not None:
        row["created_at"] = str(row["created_at"])
    return row


# Vínculo subtarefa → objetivo. O multiplicador só viaja com um objetivo: sem
# ele, guardar "vale 3 etapas" criaria um valor fantasma que reapareceria errado
# se o usuário revincular depois.
def _objective_link_fields(data: dict) -> dict:
    objective_id = data.get("objective_id") or None
    return {
        "objective_id": objective_id,
        "objective_steps": (
            max(int(data.get("objective_steps") or 1), 1) if objective_id else 1
        ),
    }


def _sync_objective(
    user_id: str,
    task_row: dict,
    task_id: str,
    previous_status: str | None,
    new_status: str | None,
    completed_at: str | None = None,
) -> None:
    """
    Lança/desfaz a etapa do objetivo quando o checklist muda o status da tarefa.

    Este gancho existe porque `_recalculate_task_progress` escreve direto na
    tabela `tasks`: sem ele, marcar a última subtarefa concluiria a tarefa mas
    a etapa nunca contaria no objetivo — o progresso ficaria parado sem que
    nada indicasse o erro.
    """
    if not task_row.get("objective_id") or new_status is None:
        return

    became_done = new_status == "done" and previous_status != "done"
    became_undone = new_status != "done" and previous_status == "done"
    if not (became_done or became_undone):
        return

    from services import objectives_service

    objectives_service.sync_task_completion(
        user_id,
        {**task_row, "id": task_id, "completed_at": completed_at},
        became_done=became_done,
        became_undone=became_undone,
    )


def _recalculate_task_progress(user_id: str, task_id: str) -> None:
    """Recalcula progress + status da tarefa mãe com base nas subtarefas."""
    try:
        res = (
            supabase.table("subtasks")
            .select("done")
            .eq("task_id", task_id)
            .eq("user_id", user_id)
            .execute()
        )
        rows = res.data or []
        total = len(rows)

        # Lê o status atual para detectar a transição e manter completed_at
        # coerente com o caminho de tasks_service.update_task — sem isso a
        # tarefa concluída via subtarefas some das métricas de Insights, que
        # filtram por completed_at.
        # `objective_id`/`objective_steps` vêm junto porque esta função escreve
        # direto em `tasks`, sem passar por tasks_service.update_task — quem
        # lança a etapa no objetivo é o gancho abaixo, não aquele caminho.
        current = (
            supabase.table("tasks")
            .select("status, objective_id, objective_steps, routine_item_id")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        current_task = current.data or {}
        current_status = current_task.get("status")

        if total == 0:
            # A última subtarefa foi excluída: a tarefa volta a ser uma tarefa
            # simples, sem checklist. Zera o progresso e, se ela estava 'done'
            # apenas por causa do checklist, reabre — senão ficaria concluída
            # para sempre sem nenhuma subtarefa, contaminando as métricas de
            # Insights (que filtram por completed_at).
            payload = {"progress": 0}
            if current_status == "done":
                payload["status"] = "todo"
                payload["completed_at"] = None
            supabase.table("tasks").update(payload).eq("id", task_id).eq(
                "user_id", user_id
            ).execute()
            _sync_objective(user_id, current_task, task_id, current_status, payload.get("status"))
            return

        done_count = sum(1 for r in rows if r.get("done"))
        progress = round((done_count / total) * 100)
        status = "done" if done_count == total else ("progress" if done_count > 0 else "todo")

        payload: dict = {"progress": progress, "status": status}
        if status == "done" and current_status != "done":
            payload["completed_at"] = datetime.now(timezone.utc).isoformat()
        elif status != "done" and current_status == "done":
            payload["completed_at"] = None  # reabriu a tarefa

        supabase.table("tasks").update(payload).eq("id", task_id).eq(
            "user_id", user_id
        ).execute()
        _sync_objective(user_id, current_task, task_id, current_status, status,
                        completed_at=payload.get("completed_at"))
    except Exception:
        pass


def list_all(user_id: str) -> list[dict]:
    """Retorna todas as subtarefas do usuário (para carga em bulk no frontend)."""
    res = (
        supabase.table("subtasks")
        .select("*")
        .eq("user_id", user_id)
        .order("position", desc=False)
        .order("created_at", desc=False)
        .execute()
    )
    return [_serialize(r) for r in (res.data or [])]


def list_for_task(user_id: str, task_id: str) -> list[dict]:
    res = (
        supabase.table("subtasks")
        .select("*")
        .eq("user_id", user_id)
        .eq("task_id", task_id)
        .order("position", desc=False)
        .order("created_at", desc=False)
        .execute()
    )
    return [_serialize(r) for r in (res.data or [])]


def _assert_task_owned(user_id: str, task_id: str) -> None:
    """A tarefa-mãe precisa ser do usuário. Sem isso dava para inserir subtarefas
    em tarefas alheias conhecendo o UUID (C1 do relatório de segurança)."""
    res = (
        supabase.table("tasks")
        .select("id")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise ValueError("Tarefa não encontrada")


def create_subtask(user_id: str, task_id: str, data: dict) -> dict:
    title = (data.get("title") or "").strip()
    if not title:
        raise ValueError("O título da subtarefa é obrigatório")

    _assert_task_owned(user_id, task_id)

    existing = (
        supabase.table("subtasks")
        .select("position")
        .eq("task_id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    max_pos = max((r.get("position", 0) for r in (existing.data or [])), default=-1)

    payload = {
        "task_id": task_id,
        "user_id": user_id,
        "title": title,
        "done": False,
        "position": max_pos + 1,
        **_objective_link_fields(data),
    }
    res = supabase.table("subtasks").insert(payload).execute()
    if not res.data:
        raise ValueError("Erro ao criar subtarefa")

    _recalculate_task_progress(user_id, task_id)

    # Criar a primeira subtarefa vinculada tira da mãe o direito de lançar. Se
    # ela já estava concluída, o lançamento dela precisa sair agora.
    if payload.get("objective_id"):
        from services import objectives_service
        objectives_service.reconcile_task_entry(
            user_id, task_id, payload["objective_id"]
        )

    return _serialize(res.data[0])


def update_subtask(user_id: str, subtask_id: str, data: dict) -> dict:
    # `done` e `objective_id` atuais são necessários para decidir o lançamento:
    # sem eles não dá para saber se houve transição nem de qual objetivo sair.
    fetch = (
        supabase.table("subtasks")
        .select("task_id, done, objective_id, objective_steps")
        .eq("id", subtask_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not fetch.data:
        raise ValueError("Subtarefa não encontrada")
    current = fetch.data[0]
    task_id = current["task_id"]
    was_done = bool(current.get("done"))
    previous_objective_id = current.get("objective_id")
    previous_steps = int(current.get("objective_steps") or 1)

    payload: dict = {}
    if "title" in data:
        t = (data["title"] or "").strip()
        if not t:
            raise ValueError("O título não pode ser vazio")
        payload["title"] = t
    if "done" in data:
        payload["done"] = bool(data["done"])
    if "objective_id" in data or "objective_steps" in data:
        payload.update(_objective_link_fields({**current, **data}))

    if not payload:
        raise ValueError("Nenhum campo para atualizar")

    upd = (
        supabase.table("subtasks")
        .update(payload)
        .eq("id", subtask_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not upd.data:
        raise ValueError("Erro ao atualizar subtarefa")

    subtask = upd.data[0]

    # Ledger da subtarefa. Duas coisas independentes podem mudar: o `done` e o
    # objetivo a que ela aponta. Tratar só a primeira deixaria o lançamento
    # preso no objetivo errado quando uma subtarefa JÁ marcada troca de vínculo.
    from services import objectives_service

    is_done = bool(subtask.get("done"))
    new_objective_id = subtask.get("objective_id")
    objective_changed = new_objective_id != previous_objective_id

    if objective_changed and was_done and previous_objective_id:
        # O lançamento antigo sai primeiro: o índice único é por subtarefa,
        # então sem apagar, o lançamento no destino não entraria.
        objectives_service.remove_entry_for_subtask(subtask_id)

    if is_done and (not was_done or (objective_changed and new_objective_id)):
        objectives_service.sync_subtask_completion(
            user_id, subtask, became_done=True, became_undone=False
        )
    elif was_done and not is_done:
        objectives_service.sync_subtask_completion(
            user_id, subtask, became_done=False, became_undone=True
        )

    # Depois do lançamento próprio: recalcular o progresso da mãe pode concluí-la
    # e disparar o lançamento DELA, que é um caminho separado.
    _recalculate_task_progress(user_id, task_id)

    # O ajuste da mãe é "o que ela declara menos o que o checklist cobre", então
    # ele muda tanto ao trocar o VÍNCULO quanto ao trocar o MULTIPLICADOR da
    # subtarefa. Cobrir só o primeiro deixaria o lançamento da mãe preso no
    # valor antigo quando o usuário só corrige "esta subtarefa vale 2, não 1".
    steps_changed = int(subtask.get("objective_steps") or 1) != previous_steps

    if objective_changed or steps_changed:
        for affected in {previous_objective_id, new_objective_id}:
            if affected:
                objectives_service.reconcile_task_entry(user_id, task_id, affected)

    return _serialize(subtask)


def delete_subtask(user_id: str, subtask_id: str) -> None:
    fetch = (
        supabase.table("subtasks")
        .select("task_id, objective_id")
        .eq("id", subtask_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not fetch.data:
        raise ValueError("Subtarefa não encontrada")
    task_id = fetch.data[0]["task_id"]
    objective_id = fetch.data[0].get("objective_id")

    # O cascade de `source_subtask_id` apaga o lançamento desta subtarefa junto.
    supabase.table("subtasks").delete().eq("id", subtask_id).eq("user_id", user_id).execute()
    _recalculate_task_progress(user_id, task_id)

    # Apagar a última subtarefa vinculada devolve à mãe o direito de lançar.
    if objective_id:
        from services import objectives_service
        objectives_service.reconcile_task_entry(user_id, task_id, objective_id)
