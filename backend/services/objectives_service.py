"""
Objetivos como contador de etapas, com lançamentos auditáveis.

Um objetivo é uma META NUMÉRICA ("257 aulas de alemão"), não um container de
tarefas. Criar um objetivo não cria nada na agenda. O progresso avança quando
alguma FONTE registra um lançamento:

  - uma tarefa vinculada ao objetivo é concluída (vale `tasks.objective_steps`)
  - uma SUBTAREFA vinculada é marcada (vale `subtasks.objective_steps`) — avança
    sozinha, sem esperar a tarefa mãe fechar
  - uma tarefa gerada por um item de rotina vinculado é concluída
    (vale `routine_items.steps_per_completion`, propagado na materialização)
  - o usuário lança etapas manualmente

Por que um LEDGER (`objective_step_entries`) e não um contador incrementado:
sem saber quem causou cada avanço, desmarcar uma tarefa concluída não teria
como saber quanto subtrair — o contador dessincronizaria em silêncio e nunca
mais bateria. Com lançamentos, desmarcar apaga a linha e o total (que é sempre
a SOMA) volta sozinho ao valor certo.

`objectives.completed_steps` é apenas um cache dessa soma para leitura rápida
na listagem; a verdade é o ledger, e `recalculate_from_ledger` é quem reconcilia
os dois. Toda escrita no ledger passa por ela.
"""

from datetime import date, datetime, timezone

from database import supabase

_DATE_FIELDS = ("deadline", "created_at", "updated_at")

_PRIORITY_WEIGHT = {"high": 0, "medium": 1, "low": 2}

# Quantos lançamentos recentes acompanham o detalhe de um objetivo. O suficiente
# para o usuário conferir de onde veio o progresso sem carregar meses de dados.
_RECENT_ENTRIES_LIMIT = 30


def _serialize(row: dict) -> dict:
    for field in _DATE_FIELDS:
        if row.get(field) is not None:
            row[field] = str(row[field])
    return row


# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------

def _sum_steps(objective_id: str) -> int:
    """Soma dos lançamentos do objetivo — a fonte da verdade do progresso."""
    res = (
        supabase.table("objective_step_entries")
        .select("steps")
        .eq("objective_id", objective_id)
        .execute()
    )
    return sum(int(r.get("steps") or 0) for r in (res.data or []))


def recalculate_from_ledger(objective_id: str) -> None:
    """
    Reconcilia o cache (`completed_steps`, `progress`, `status`) com o ledger.

    Chamada após qualquer escrita de lançamento. Nunca levanta exceção: o
    avanço do objetivo é um efeito colateral de concluir uma tarefa, e falhar
    aqui não pode derrubar a operação que o usuário pediu.
    """
    try:
        res = (
            supabase.table("objectives")
            .select("total_steps")
            .eq("id", objective_id)
            .single()
            .execute()
        )
        total = int((res.data or {}).get("total_steps") or 1)

        # O ledger pode ultrapassar a meta (concluiu mais do que planejou). O
        # cache é limitado ao total para o progresso não passar de 100%, mas os
        # lançamentos ficam intactos — o histórico registra o que aconteceu.
        done = min(_sum_steps(objective_id), total)

        progress = round((done / total) * 100) if total > 0 else 0
        status = "done" if done >= total else "active"

        supabase.table("objectives").update(
            {"completed_steps": done, "progress": progress, "status": status}
        ).eq("id", objective_id).execute()

        if status == "done":
            _pause_linked_routines(objective_id)
    except Exception:
        pass


def _pause_linked_routines(objective_id: str) -> None:
    """
    Pausa as rotinas cujos itens pediram parada ao concluir o objetivo.

    Import tardio: `routines_service` já importa daqui indiretamente pela
    cadeia de tarefas, e o import no topo fecharia um ciclo.
    """
    try:
        from services import routines_service

        routines_service.pause_for_completed_objective(objective_id)
    except Exception:
        pass


def add_entry(
    user_id: str,
    objective_id: str,
    steps: int,
    *,
    source_task_id: str | None = None,
    source_subtask_id: str | None = None,
    source_routine_item_id: str | None = None,
    occurred_at: str | None = None,
) -> dict | None:
    """
    Registra um avanço e reconcilia o objetivo.

    Idempotente por origem: os índices únicos parciais em `source_task_id` e
    `source_subtask_id` garantem um lançamento por tarefa e um por subtarefa,
    então um duplo clique em "concluir" (ou uma corrida entre dois caminhos que
    marcam a mesma linha) não lança duas vezes — o insert duplicado falha e é
    engolido de propósito.
    """
    if steps <= 0:
        return None

    payload = {
        "user_id": user_id,
        "objective_id": objective_id,
        "steps": int(steps),
        "source_task_id": source_task_id,
        "source_subtask_id": source_subtask_id,
        "source_routine_item_id": source_routine_item_id,
        "occurred_at": occurred_at or datetime.now(timezone.utc).isoformat(),
    }

    try:
        res = supabase.table("objective_step_entries").insert(payload).execute()
    except Exception:
        # Violação do índice único: o lançamento desta origem já existe.
        return None

    recalculate_from_ledger(objective_id)
    return (res.data or [None])[0]


def _remove_entry_by_source(column: str, source_id: str) -> None:
    """
    Desfaz o lançamento de uma origem (a linha foi reaberta).

    Lê o `objective_id` antes de apagar: depois da exclusão não haveria como
    saber qual objetivo reconciliar.
    """
    try:
        existing = (
            supabase.table("objective_step_entries")
            .select("objective_id")
            .eq(column, source_id)
            .execute()
        )
        rows = existing.data or []
        if not rows:
            return

        supabase.table("objective_step_entries").delete().eq(
            column, source_id
        ).execute()

        for objective_id in {r["objective_id"] for r in rows}:
            recalculate_from_ledger(objective_id)
    except Exception:
        pass


def remove_entry_for_task(task_id: str) -> None:
    """Desfaz o lançamento de uma tarefa reaberta."""
    _remove_entry_by_source("source_task_id", task_id)


def remove_entry_for_subtask(subtask_id: str) -> None:
    """Desfaz o lançamento de uma subtarefa desmarcada."""
    _remove_entry_by_source("source_subtask_id", subtask_id)


def _subtask_steps_for(task_id: str | None, objective_id: str) -> int:
    """
    Quantas etapas as subtarefas desta tarefa já cobrem neste objetivo.

    Conta TODAS as subtarefas vinculadas, marcadas ou não: o número é o quanto
    o checklist se propõe a cobrir, não o quanto já cobriu. Usar só as marcadas
    faria o ajuste da mãe variar conforme a ordem dos cliques — concluir a
    tarefa com o checklist pela metade lançaria um ajuste grande, e marcar o
    resto depois estouraria o total.

    Na dúvida (erro de consulta) devolve 0: sem cobertura conhecida a mãe lança
    o valor cheio, o que mantém o progresso andando. Zerar por engano o
    congelaria em silêncio.
    """
    if not task_id:
        return 0

    try:
        res = (
            supabase.table("subtasks")
            .select("objective_steps")
            .eq("task_id", task_id)
            .eq("objective_id", objective_id)
            .execute()
        )
        return sum(int(r.get("objective_steps") or 1) for r in (res.data or []))
    except Exception:
        return 0


def sync_task_completion(
    user_id: str,
    task: dict,
    *,
    became_done: bool,
    became_undone: bool,
) -> None:
    """
    Ponte tarefa → ledger, usada por todo caminho que muda o status de uma
    tarefa (`tasks_service.update_task` e `subtasks_service`).

    Concentrar a regra aqui evita que um caminho novo esqueça de lançar: quem
    mexe no status de uma tarefa chama esta função e não precisa conhecer o
    ledger.

    Só cuida do vínculo da TAREFA. Subtarefa vinculada tem caminho próprio
    (`sync_subtask_completion`) porque avança sozinha, sem esperar a mãe.
    """
    objective_id = task.get("objective_id")
    if not objective_id:
        return

    if became_done:
        # A mãe COMPLETA A DIFERENÇA: ela declara o tamanho total do trabalho
        # ("esta tarefa vale 2"), e as subtarefas vinculadas dizem como parte
        # dele se divide. A mãe lança só o que o checklist não cobre, então o
        # total sempre respeita o valor dela e o mesmo esforço nunca conta duas
        # vezes — "vale 2" com uma subtarefa de 1 dá 1 + 1, não 1 nem 3.
        steps = int(task.get("objective_steps") or 1) - _subtask_steps_for(
            task.get("id"), objective_id
        )

        # Checklist cobrindo o total (ou mais): nada sobra para a mãe. O
        # excedente fica de pé — quem detalhou mais do que planejou de fato
        # avançou mais, e o ledger registra o que aconteceu.
        if steps <= 0:
            return

        add_entry(
            user_id,
            objective_id,
            steps,
            source_task_id=task.get("id"),
            source_routine_item_id=task.get("routine_item_id"),
            occurred_at=task.get("completed_at"),
        )
    elif became_undone:
        # A remoção nunca é filtrada pela precedência: um lançamento da mãe
        # pode ter sido criado ANTES de a subtarefa ganhar vínculo, e abster-se
        # aqui o deixaria órfão no ledger para sempre.
        remove_entry_for_task(task["id"])


def reconcile_task_entry(user_id: str, task_id: str, objective_id: str | None) -> None:
    """
    Reavalia se a tarefa mãe deve ter lançamento próprio neste objetivo.

    Necessária porque o ajuste da mãe depende de um estado que muda por fora:
    vincular, desvincular, criar ou apagar uma subtarefa muda quanto o checklist
    cobre, e portanto quanto sobra para a mãe. Sem esta reconciliação o
    lançamento dela ficaria "preso" no valor do momento em que foi concluída —
    o contador só voltaria ao certo se o usuário reabrisse e concluísse a tarefa
    de novo.
    """
    if not objective_id:
        return

    try:
        task = (
            supabase.table("tasks")
            .select("id, status, objective_id, objective_steps, routine_item_id, completed_at")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        ).data or {}
    except Exception:
        return

    # Quanto a mãe deve valer AGORA: o total que ela declara menos o que o
    # checklist cobre. Zero (ou negativo) significa que as subtarefas dão conta
    # sozinhas e a mãe não lança nada.
    steps = 0
    if task.get("status") == "done" and task.get("objective_id") == objective_id:
        steps = int(task.get("objective_steps") or 1) - _subtask_steps_for(
            task_id, objective_id
        )

    # O valor do ajuste mudou, não só a sua existência — e o índice único é por
    # tarefa, então o lançamento antigo precisa sair antes de o novo entrar.
    # Remover sempre (mesmo para recriar em seguida) mantém isto simples: é uma
    # operação a mais no caso raro, e evita um caminho que esquece de limpar.
    remove_entry_for_task(task_id)

    if steps > 0:
        add_entry(
            user_id,
            objective_id,
            steps,
            source_task_id=task_id,
            source_routine_item_id=task.get("routine_item_id"),
            occurred_at=task.get("completed_at"),
        )


def sync_subtask_completion(
    user_id: str,
    subtask: dict,
    *,
    became_done: bool,
    became_undone: bool,
) -> None:
    """
    Ponte subtarefa → ledger.

    A unidade de progresso do usuário costuma ser o item do checklist ("aula
    12"), não o bloco de estudo que os agrupa. Quando a subtarefa tem o próprio
    `objective_id`, marcá-la lança na hora — sem esperar a tarefa mãe fechar.

    O vínculo da mãe segue independente: se as duas apontam para o objetivo,
    cada uma gera seu lançamento, com origem distinta no extrato. Foi escolha
    do usuário vincular os dois, e o ledger mostra de onde veio cada avanço.
    """
    objective_id = subtask.get("objective_id")
    if not objective_id:
        return

    if became_done:
        add_entry(
            user_id,
            objective_id,
            int(subtask.get("objective_steps") or 1),
            source_subtask_id=subtask.get("id"),
        )
    elif became_undone:
        remove_entry_for_subtask(subtask["id"])


def list_entries(user_id: str, objective_id: str, limit: int = _RECENT_ENTRIES_LIMIT) -> list[dict]:
    """Lançamentos mais recentes do objetivo, para o histórico na tela."""
    res = (
        supabase.table("objective_step_entries")
        .select(
            "id, steps, occurred_at, source_task_id, source_subtask_id, "
            "source_routine_item_id"
        )
        .eq("objective_id", objective_id)
        .eq("user_id", user_id)
        .order("occurred_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []
    for row in rows:
        if row.get("occurred_at") is not None:
            row["occurred_at"] = str(row["occurred_at"])
    return rows


# ---------------------------------------------------------------------------
# Projeção de ritmo
# ---------------------------------------------------------------------------

def projection(objective: dict, today: date | None = None) -> dict:
    """
    Ritmo atual e data provável de conclusão. Aritmética pura, sem custo de API.

    O ritmo usa o intervalo desde o PRIMEIRO lançamento, não desde a criação do
    objetivo: um objetivo criado em janeiro e começado em março teria o ritmo
    diluído pelos dois meses parados, e a previsão viraria pessimismo sem
    sentido.

    Devolve `pace_per_day = None` quando ainda não há histórico suficiente —
    a tela deve omitir a previsão em vez de mostrar um número inventado.
    """
    today = today or datetime.now(timezone.utc).date()

    total = int(objective.get("total_steps") or 1)
    done = int(objective.get("completed_steps") or 0)
    remaining = max(total - done, 0)

    out: dict = {
        "pace_per_day": None,
        "projected_date": None,
        "days_late": None,
        "on_track": None,
    }

    if remaining == 0:
        out["on_track"] = True
        return out

    first = (
        supabase.table("objective_step_entries")
        .select("occurred_at")
        .eq("objective_id", objective["id"])
        .order("occurred_at", desc=False)
        .limit(1)
        .execute()
    )
    rows = first.data or []
    if not rows or done <= 0:
        return out

    started = str(rows[0]["occurred_at"])[:10]
    try:
        started_date = date.fromisoformat(started)
    except ValueError:
        return out

    # Inclusivo: quem lançou hoje pela primeira vez trabalhou 1 dia, não 0.
    elapsed_days = max((today - started_date).days + 1, 1)
    pace = done / elapsed_days
    if pace <= 0:
        return out

    projected = today.fromordinal(today.toordinal() + round(remaining / pace))

    out["pace_per_day"] = round(pace, 2)
    out["projected_date"] = str(projected)

    deadline = objective.get("deadline")
    if deadline:
        try:
            deadline_date = date.fromisoformat(str(deadline)[:10])
            delta = (projected - deadline_date).days
            out["days_late"] = max(delta, 0)
            out["on_track"] = delta <= 0
        except ValueError:
            pass

    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def _get_owned(user_id: str, objective_id: str) -> dict:
    res = (
        supabase.table("objectives")
        .select("*")
        .eq("id", objective_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise ValueError("Objetivo não encontrado")
    return res.data[0]


def _to_response(row: dict, today: date | None = None) -> dict:
    row = _serialize(row)
    row["projection"] = projection(row, today)
    return row


def list_objectives(user_id: str) -> list[dict]:
    res = (
        supabase.table("objectives")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    today = datetime.now(timezone.utc).date()
    return [_to_response(r, today) for r in (res.data or [])]


def get_objective(user_id: str, objective_id: str) -> dict:
    row = _get_owned(user_id, objective_id)
    result = _to_response(row)
    result["entries"] = list_entries(user_id, objective_id)

    # Tarefas que o usuário escolheu colocar na agenda para este objetivo. São
    # opcionais e NÃO definem o progresso (o ledger define) — servem para ele
    # ver o que já agendou.
    linked = (
        supabase.table("tasks")
        .select(
            "id, title, status, priority, scheduled_date, start_time, end_time, "
            "is_key_task, objective_steps"
        )
        .eq("objective_id", objective_id)
        .eq("user_id", user_id)
        .execute()
    )
    tasks = linked.data or []
    tasks.sort(key=lambda t: _PRIORITY_WEIGHT.get(t.get("priority") or "medium", 1))
    result["linked_tasks"] = tasks
    return result


def create_objective(user_id: str, data: dict) -> dict:
    title = (data.get("title") or "").strip()
    if not title:
        raise ValueError("O título do objetivo é obrigatório")

    priority = data.get("priority")
    if priority not in ("low", "medium", "high"):
        priority = "medium"

    total_steps = int(data.get("total_steps") or 1)
    if total_steps < 1:
        raise ValueError("O objetivo precisa ter pelo menos 1 etapa")

    step_label = (data.get("step_label") or "").strip() or "etapas"

    payload = {
        "user_id": user_id,
        "title": title,
        "description": data.get("description"),
        "deadline": str(data["deadline"]) if data.get("deadline") else None,
        "priority": priority,
        "total_steps": total_steps,
        "step_label": step_label,
    }
    res = supabase.table("objectives").insert(payload).execute()
    if not res.data:
        raise ValueError("Erro ao criar objetivo")
    return _to_response(res.data[0])


def update_objective(user_id: str, objective_id: str, data: dict) -> dict:
    _get_owned(user_id, objective_id)

    payload = {}
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            raise ValueError("O título do objetivo não pode ser vazio")
        payload["title"] = title
    if "description" in data:
        payload["description"] = data["description"]
    if "deadline" in data:
        payload["deadline"] = str(data["deadline"]) if data["deadline"] else None
    if "status" in data:
        payload["status"] = data["status"]
    if "priority" in data and data["priority"] in ("low", "medium", "high"):
        payload["priority"] = data["priority"]
    if "step_label" in data:
        payload["step_label"] = (data["step_label"] or "").strip() or "etapas"

    # Mexer na meta muda o denominador do progresso, então o cache precisa ser
    # reconciliado logo depois — senão a barra fica com a porcentagem antiga.
    total_changed = False
    if "total_steps" in data and data["total_steps"] is not None:
        total_steps = int(data["total_steps"])
        if total_steps < 1:
            raise ValueError("O objetivo precisa ter pelo menos 1 etapa")
        payload["total_steps"] = total_steps
        total_changed = True

    if not payload:
        raise ValueError("Nenhum campo para atualizar")

    res = (
        supabase.table("objectives")
        .update(payload)
        .eq("id", objective_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise ValueError("Erro ao atualizar objetivo")

    if total_changed:
        recalculate_from_ledger(objective_id)
        return _to_response(_get_owned(user_id, objective_id))

    return _to_response(res.data[0])


def add_manual_entry(user_id: str, objective_id: str, steps: int) -> dict:
    """Lançamento avulso: o usuário avançou etapas fora de qualquer tarefa."""
    _get_owned(user_id, objective_id)
    if steps <= 0:
        raise ValueError("A quantidade de etapas deve ser maior que zero")

    add_entry(user_id, objective_id, steps)
    return _to_response(_get_owned(user_id, objective_id))


def delete_entry(user_id: str, objective_id: str, entry_id: str) -> dict:
    """Apaga um lançamento específico (correção manual de histórico)."""
    _get_owned(user_id, objective_id)

    res = (
        supabase.table("objective_step_entries")
        .delete()
        .eq("id", entry_id)
        .eq("objective_id", objective_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise ValueError("Lançamento não encontrado")

    recalculate_from_ledger(objective_id)
    return _to_response(_get_owned(user_id, objective_id))


def delete_objective(user_id: str, objective_id: str) -> None:
    _get_owned(user_id, objective_id)
    # Cascade apaga os lançamentos; os itens de rotina vinculados ficam com
    # objective_id = NULL (SET NULL) e seguem funcionando como rotina comum.
    supabase.table("objectives").delete().eq("id", objective_id).eq(
        "user_id", user_id
    ).execute()
