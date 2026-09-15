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
        current = (
            supabase.table("tasks")
            .select("status")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        current_status = (current.data or {}).get("status")

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
    }
    res = supabase.table("subtasks").insert(payload).execute()
    if not res.data:
        raise ValueError("Erro ao criar subtarefa")

    _recalculate_task_progress(user_id, task_id)
    return _serialize(res.data[0])


def update_subtask(user_id: str, subtask_id: str, data: dict) -> dict:
    fetch = (
        supabase.table("subtasks")
        .select("task_id")
        .eq("id", subtask_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not fetch.data:
        raise ValueError("Subtarefa não encontrada")
    task_id = fetch.data[0]["task_id"]

    payload: dict = {}
    if "title" in data:
        t = (data["title"] or "").strip()
        if not t:
            raise ValueError("O título não pode ser vazio")
        payload["title"] = t
    if "done" in data:
        payload["done"] = bool(data["done"])

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

    _recalculate_task_progress(user_id, task_id)
    return _serialize(upd.data[0])


def delete_subtask(user_id: str, subtask_id: str) -> None:
    fetch = (
        supabase.table("subtasks")
        .select("task_id")
        .eq("id", subtask_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not fetch.data:
        raise ValueError("Subtarefa não encontrada")
    task_id = fetch.data[0]["task_id"]

    supabase.table("subtasks").delete().eq("id", subtask_id).eq("user_id", user_id).execute()
    _recalculate_task_progress(user_id, task_id)
