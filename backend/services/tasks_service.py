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
_DATE_FIELDS = (
    "scheduled_date", "end_date", "deadline", "start_time", "end_time",
    "planned_start_time", "planned_end_time", "created_at", "completed_at",
)
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
    # Campo derivado, calculado aqui para o frontend não ter de reimplementar a
    # regra (que difere entre encurtar e mover). None quando não há marcador.
    row["saved_display_minutes"] = saved_display_minutes(row)
    return row


# Os quatro níveis de carga cognitiva aceitos (ver Migration 31). Valor fora
# desta lista é descartado em vez de chegar ao banco e bater no check — o
# cliente antigo ou o agente podem mandar qualquer coisa.
COMPLEXITY_VALUES = ("light", "moderate", "focus", "deep_focus")


def _clean_complexity(payload: dict) -> None:
    """Normaliza `complexity` no payload: string vazia vira NULL (desinformar)."""
    if "complexity" not in payload:
        return
    value = payload.get("complexity")
    if value in (None, ""):
        payload["complexity"] = None
    elif str(value) not in COMPLEXITY_VALUES:
        payload.pop("complexity")


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


# ── Encurtamento por conclusão antecipada ───────────────────────────────────
#
# POR QUE ISTO É UMA FUNÇÃO, E NÃO CÓDIGO DENTRO DE update_task. Há DOIS
# caminhos que concluem uma tarefa: o PATCH normal (update_task) e a última
# subtarefa do checklist (subtasks_service._recalculate_task_progress, que
# escreve direto na tabela `tasks` para não disparar o recálculo reverso).
# Esse mesmo par de caminhos já causou um bug em que concluir pelo checklist
# não lançava a etapa no objetivo — a regra ficou só num deles. Aqui a regra
# nasce compartilhada: os dois caminhos chamam esta função e acrescentam o
# resultado ao payload do UPDATE que já iam fazer.
#
# O ganho NÃO é acumulado em lugar nenhum, de propósito. `completed_at` marca
# quando o usuário TOCOU no botão, não quando terminou a tarefa (nos dados
# reais, 64% das marcações vinham depois do fim planejado). Um feedback no
# instante é confiável; um total semanal não seria.


def shortening_payload(task_row: dict, now_local: datetime) -> dict:
    """
    Campos do UPDATE quando uma tarefa é concluída ANTES do fim planejado.

    Devolve `{}` quando não há nada a encurtar — o chamador sempre pode fazer
    `payload.update(shortening_payload(...))` sem checar nada.

    `now_local` precisa estar no FUSO DO USUÁRIO: comparar um "agora" em UTC
    com um `end_time` que é hora local encurtaria (ou não) por engano em todo
    fuso diferente de UTC.

    Não encurta quando:
    - é evento: reunião tem hora marcada com outras pessoas, e mexer no fim
      dela mentiria sobre um compromisso que não é só do usuário;
    - falta start_time ou end_time: sem janela planejada não há o que encurtar;
    - agora >= fim planejado: marcou em cima da hora ou depois — a tarefa durou
      o que estava previsto, e ESTENDER seria inventar tempo que não passou;
    - agora <= start_time: marcou antes de a tarefa começar. Encurtar aqui
      criaria uma tarefa de duração negativa (fim antes do início), que quebra
      _planned_window e o desenho do bloco no calendário.
    """
    if task_row.get("task_type") == "event":
        return {}

    start = _to_minutes(task_row.get("start_time"))
    end = _to_minutes(task_row.get("end_time"))
    if start is None or end is None:
        return {}

    now_min = now_local.hour * 60 + now_local.minute
    if now_min >= end or now_min <= start:
        return {}

    payload = {"end_time": f"{now_min // 60:02d}:{now_min % 60:02d}"}
    # Só grava o planejado na PRIMEIRA vez. Encurtar → reabrir → encurtar de
    # novo tem de continuar apontando para o horário que o usuário planejou;
    # sobrescrever aqui guardaria o horário já encurtado e a régua do snapshot
    # andaria um pouco a cada ciclo.
    if not task_row.get("planned_end_time"):
        payload["planned_end_time"] = str(task_row["end_time"])[:5]
    return payload


def move_back_payload(
    user_id: str,
    task_id: str,
    task_row: dict,
    now_local: datetime,
    first_subtask_done_at: datetime | None = None,
) -> dict:
    """
    Campos do UPDATE quando uma tarefa é concluída ANTES de a janela começar —
    o "caso B". A tarefa não encurta: ela MUDA DE LUGAR para o horário em que o
    trabalho de fato aconteceu.

        planejada 17:00–18:00, concluída às 15:00 → vira 14:00–15:00

    O fim vira o momento da marcação. O início recua, e o quanto ele recua
    depende de haver evidência:

    - `first_subtask_done_at` (a primeira subtarefa marcada, Migration 34) é um
      horário REAL de quando o trabalho começou — usa ele;
    - sem ela, o Axon só pode estimar: agora menos a duração planejada.

    POR QUE O CASO "ADIANTEI UMA ETAPA E FIZ O RESTO NA HORA" NÃO CHEGA AQUI.
    Considere a tarefa 18:00–19:00 com a primeira subtarefa marcada às 14:00 e
    a tarefa concluída às 19:00. Usar o 14:00 como início registraria uma
    jornada de 5 horas que nunca existiu — o usuário adiantou uma etapa quando
    teve tempo e fez o resto no horário planejado. A proteção é a
    pré-condição `now <= start`: concluir às 19:00 não é o caso B (é o caso A,
    ou nada), então a lógica de subtarefa nunca é alcançada. Quem for
    "melhorar" esta função relaxando essa pré-condição vai reintroduzir
    exatamente esse bug.

    Devolve `{}` quando não há nada a mover — o chamador pode sempre fazer
    `payload.update(move_back_payload(...))` sem checar nada.
    """
    if task_row.get("task_type") == "event":
        return {}  # compromisso com outras pessoas não muda de lugar sozinho

    # Usa os planejados quando já existem: a tarefa pode estar sendo
    # RECONCLUÍDA (concluiu → reabriu → concluiu), e nesse caso start/end já
    # são os horários movidos da vez anterior. A duração que importa é sempre a
    # que o usuário planejou.
    start = _to_minutes(task_row.get("planned_start_time") or task_row.get("start_time"))
    end = _to_minutes(task_row.get("planned_end_time") or task_row.get("end_time"))
    if start is None or end is None or end <= start:
        return {}

    now_min = now_local.hour * 60 + now_local.minute
    if now_min > start:
        return {}  # dentro da janela (caso A) ou depois dela — não é o caso B

    # Só o dia de HOJE. Concluir hoje uma tarefa planejada para amanhã é
    # adiantamento de capacidade, não "fiz mais cedo": mover a tarefa para hoje
    # apagaria o dia em que ela estava planejada, e o snapshot daquele dia
    # perderia a linha inteira em vez de registrar o adiantamento.
    if str(task_row.get("scheduled_date") or "") != str(now_local.date()):
        return {}

    duration = end - start
    new_end = now_min

    new_start = now_min - duration
    if first_subtask_done_at is not None:
        sub_local = first_subtask_done_at.astimezone(now_local.tzinfo)
        # Subtarefa de OUTRO dia é ignorada de propósito. "Comecei ontem e
        # terminei hoje" tem o mesmo problema do caso protegido acima: não há
        # como afirmar que o trabalho foi contínuo, e o início viraria um
        # horário do dia errado.
        if sub_local.date() == now_local.date():
            sub_min = sub_local.hour * 60 + sub_local.minute
            if sub_min < now_min:
                new_start = sub_min

    # Recuar para antes da meia-noite exigiria mover a tarefa para o dia
    # anterior, o que muda o dia de um snapshot já fechado. Não mexer é menos
    # errado que mexer no histórico.
    if new_start < 0:
        return {}

    new_start_str = f"{new_start // 60:02d}:{new_start % 60:02d}"
    new_end_str = f"{new_end // 60:02d}:{new_end % 60:02d}"

    # Só consulta conflito depois de TODAS as pré-condições — é uma query
    # (list_tasks + tags) e a maioria das conclusões nem chega aqui.
    # Sobrepor duas tarefas é pior que deixar um slot desatualizado: o usuário
    # perde a leitura do dia e o anti-colisão do Axon passa a mentir.
    if find_conflicting_task(
        user_id,
        str(task_row.get("scheduled_date")),
        new_start_str,
        new_end_str,
        exclude_id=task_id,
    ):
        return {}

    payload = {"start_time": new_start_str, "end_time": new_end_str}
    # Mesma razão de shortening_payload: só grava o planejado na PRIMEIRA vez,
    # senão cada ciclo de concluir/reabrir empurraria a régua um pouco.
    if not task_row.get("planned_start_time"):
        payload["planned_start_time"] = str(task_row["start_time"])[:5]
    if not task_row.get("planned_end_time"):
        payload["planned_end_time"] = str(task_row["end_time"])[:5]
    return payload


# Piso do marcador de tempo ganho. Abaixo disso a tarefa ainda encurta/move no
# calendário (o vão é real), mas não vale um chip: "ganhou 3 min" é ruído, e o
# ruído é o que faz o usuário parar de ler os marcadores.
SAVED_DISPLAY_FLOOR_MIN = 10


def saved_display_minutes(task_row: dict) -> int | None:
    """
    Minutos que o usuário ganhou ao concluir a tarefa fora da janela, ou None
    quando não há marcador a mostrar.

    POR QUE ISTO É REGRA DE NEGÓCIO E MORA NO BACKEND. Os dois casos medem
    coisas DIFERENTES, e a diferença não é óbvia:

    - caso A (encurtou): `fim_planejado − fim_novo`, o pedaço final que sobrou;
    - caso B (moveu): a DURAÇÃO PLANEJADA inteira.

    No caso B é tentador mostrar a distância do movimento — a tarefa das 17:00
    concluída às 15:00 "andou" 3 horas. Seria falso: o usuário já estava livre
    às 15:00 e usou aquele tempo para trabalhar. O que mudou no dia dele é que
    o slot das 17:00–18:00 deixou de estar reservado. O ganho é sempre o tempo
    que deixou de estar ocupado, nunca o tamanho do salto.

    Deixar esse cálculo no frontend faria as duas regras divergirem na primeira
    tela que alguém esquecesse de atualizar.

    E ele NÃO é somado em lugar nenhum — nem semana, nem mês, nem horas
    poupadas. Esta feature já foi descartada uma vez (agosto/2026) por isso:
    `completed_at` marca quando o usuário TOCOU no botão, não quando terminou.
    O feedback do instante é confiável (o app está aberto na mão dele); um
    acumulado não seria.
    """
    planned_end = _to_minutes(task_row.get("planned_end_time"))
    if planned_end is None:
        return None

    planned_start = _to_minutes(task_row.get("planned_start_time"))
    if planned_start is not None:
        # Caso B: a tarefa mudou de lugar. O ganho é a janela que vagou.
        gained = planned_end - planned_start
    else:
        # Caso A: só o fim mexeu. O ganho é o pedaço final que sobrou.
        end = _to_minutes(task_row.get("end_time"))
        if end is None:
            return None
        gained = planned_end - end

    return gained if gained >= SAVED_DISPLAY_FLOOR_MIN else None


def _first_subtask_for_move(
    user_id: str, task_id: str, task_row: dict, now_local: datetime
) -> datetime | None:
    """
    Busca o `done_at` da primeira subtarefa SÓ quando o caso B tem chance de se
    aplicar.

    Esta pré-triagem existe por causa do custo: cada query ao Supabase são
    ~105ms, e a esmagadora maioria das conclusões é caso A (dentro da janela)
    ou nada (depois dela). Consultar subtarefa em toda conclusão colocaria essa
    latência no caminho de um botão que o usuário toca o dia inteiro.

    Repete de propósito as pré-condições baratas de move_back_payload — as que
    não custam query. A função continua validando tudo por conta própria: esta
    aqui só decide se vale pagar a busca.
    """
    if task_row.get("task_type") == "event":
        return None
    start = _to_minutes(task_row.get("planned_start_time") or task_row.get("start_time"))
    end = _to_minutes(task_row.get("planned_end_time") or task_row.get("end_time"))
    if start is None or end is None or end <= start:
        return None
    if (now_local.hour * 60 + now_local.minute) > start:
        return None
    if str(task_row.get("scheduled_date") or "") != str(now_local.date()):
        return None
    return first_subtask_done_at(user_id, task_id)


def first_subtask_done_at(user_id: str, task_id: str) -> datetime | None:
    """
    Quando a PRIMEIRA subtarefa desta tarefa foi marcada (Migration 34), ou
    None se nenhuma tem `done_at`.

    UMA query, ordenada no banco com limit 1 — não traz o checklist inteiro
    para ordenar em Python. Quem chama só deve chamar quando as pré-condições
    do caso B já passaram: a maioria das conclusões não é caso B, e uma query a
    mais em toda conclusão custaria ~105ms à toa.
    """
    try:
        res = (
            supabase.table("subtasks")
            .select("done_at")
            .eq("task_id", task_id)
            .eq("user_id", user_id)
            .not_.is_("done_at", "null")
            .order("done_at", desc=False)
            .limit(1)
            .execute()
        )
    except Exception as e:
        # Não derruba a conclusão da tarefa por causa do sinal auxiliar: sem
        # ele o caso B cai no fallback da duração, que é aceitável. Mas LOGA —
        # um except mudo aqui esconderia a regra das subtarefas nunca rodando.
        print(f"[tasks] done_at da primeira subtarefa falhou (task={task_id}): {e}", flush=True)
        return None

    rows = res.data or []
    if not rows:
        return None
    try:
        return datetime.fromisoformat(str(rows[0]["done_at"]).replace("Z", "+00:00"))
    except Exception:
        return None


def restore_payload(task_row: dict) -> dict:
    """
    Campos do UPDATE quando uma tarefa encurtada (caso A) ou movida (caso B) é
    REABERTA: os horários voltam a ser os planejados e as colunas de régua
    zeram.

    Os dois lados são independentes: o caso A só grava `planned_end_time`, e
    restaurar um `start_time` que nunca mudou apagaria o horário real da
    tarefa. Por isso cada lado só volta se tiver sido guardado.

    `{}` quando a tarefa nunca foi encurtada nem movida.
    """
    planned_end = task_row.get("planned_end_time")
    planned_start = task_row.get("planned_start_time")
    if not planned_end and not planned_start:
        return {}

    payload: dict = {}
    if planned_end:
        payload["end_time"] = str(planned_end)[:5]
        payload["planned_end_time"] = None
    if planned_start:
        payload["start_time"] = str(planned_start)[:5]
        payload["planned_start_time"] = None
    return payload


def _now_for_user(user_id: str) -> datetime:
    """
    "Agora" no fuso do usuário, para quem chama update_task sem ter resolvido o
    fuso (agente, notificações, análise de rotina). Import local: user_tz lê
    `profiles` e o topo deste módulo já é caminho quente.
    """
    from services import user_tz

    return datetime.now(user_tz.zone(user_tz.stored_tz(user_id)))


def _to_minutes(value: str | None) -> int | None:
    """"HH:MM" ou "HH:MM:SS" → minutos desde 00:00. None se ausente/inválido."""
    if not value:
        return None
    try:
        hh, mm = str(value).split(":")[:2]
        return int(hh) * 60 + int(mm)
    except Exception:
        return None


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

    # Tags em BULK (duas queries no total, não uma por tarefa) — ver o docstring
    # de tags_for_tasks sobre o custo de um N+1 aqui.
    if tasks:
        try:
            from services import task_tags_service

            by_task = task_tags_service.tags_for_tasks(
                user_id, [t["id"] for t in tasks]
            )
            for t in tasks:
                t["tags"] = by_task.get(t["id"], [])
        except Exception as e:
            print(f"[tasks] tags não carregadas: {e}", flush=True)
            for t in tasks:
                t.setdefault("tags", [])

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

    # Tags não são coluna de `tasks`: saem do payload e viram vínculos depois do
    # insert (precisam do id da tarefa).
    tag_ids = payload.pop("tag_ids", None)
    _clean_complexity(payload)

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
                # A complexidade entra justamente aqui: é o caminho em que o
                # AXON escolhe o horário, e uma tarefa de foco profundo não pode
                # cair em bloco fraco só porque a prioridade é baixa.
                complexity=payload.get("complexity"),
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

    # Vínculo de tag em try/except: a tarefa já existe, e falhar ao marcar a
    # categoria dela não pode desfazer a criação.
    if tag_ids is not None:
        try:
            from services import task_tags_service

            task_tags_service.set_task_tags(user_id, task["id"], tag_ids)
            task["tags"] = task_tags_service.tags_for_tasks(
                user_id, [task["id"]]
            ).get(task["id"], [])
        except Exception as e:
            print(f"[tasks] tags não vinculadas task={task['id']}: {e}", flush=True)

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


def update_task(
    user_id: str, task_id: str, data: dict, now: datetime | None = None
) -> dict:
    """
    `now` é o "agora" NO FUSO DO USUÁRIO e só serve ao encurtamento por
    conclusão antecipada. O router passa o horário que já resolveu pelo header
    X-Timezone; quem chama de dentro (agente, notificações, análise de rotina)
    omite e cai no fuso salvo no perfil — uma query a mais, mas só no PATCH que
    de fato conclui uma tarefa.
    """
    payload = _stringify_dates({**data})

    # Tags vivem em outra tabela: saem do payload antes da checagem de "nenhum
    # campo". `None` = não veio no PATCH (não mexer); lista vazia = remover
    # todas. Um PATCH que só troca as tags deixa o payload vazio e ainda assim é
    # uma edição válida, por isso a checagem considera as duas coisas.
    tag_ids = payload.pop("tag_ids", None)
    _clean_complexity(payload)

    if not payload and tag_ids is None:
        raise ValueError("Nenhum campo para atualizar")

    if not payload:
        # Só tags mudaram: aplica o vínculo e devolve a tarefa sem passar pelo
        # UPDATE (que exigiria ao menos uma coluna).
        _ensure_owned(user_id, task_id)
        from services import task_tags_service

        task_tags_service.set_task_tags(user_id, task_id, tag_ids)
        current = (
            supabase.table("tasks")
            .select("*, objectives(title)")
            .eq("id", task_id)
            .eq("user_id", user_id)
            .execute()
        )
        task = serialize(current.data[0])
        task["tags"] = task_tags_service.tags_for_tasks(user_id, [task_id]).get(
            task_id, []
        )
        return task

    # Confirma posse e lê estado atual (status para completed_at; scheduled_date
    # e is_key_task para a lógica de unicidade de tarefa chave).
    existing = (
        supabase.table("tasks")
        .select(
            "status, scheduled_date, is_key_task, objective_id, objective_steps, "
            # Janela planejada + tipo: o encurtamento por conclusão antecipada
            # decide a partir deles, e ler junto evita uma segunda query.
            "task_type, start_time, end_time, planned_start_time, planned_end_time"
        )
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise ValueError("Tarefa não encontrada")
    existing_row = existing.data[0]
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

    # Mexer no horário REPLANEJA a tarefa: o fim novo é o novo plano, e o
    # horário guardado no encurtamento anterior deixa de valer. Sem zerar aqui,
    # uma tarefa encurtada e depois remarcada manteria para sempre um "fim
    # planejado" de outro horário, e o snapshot leria a régua errada.
    if "end_time" in payload or "start_time" in payload:
        if existing_row.get("planned_end_time"):
            payload.setdefault("planned_end_time", None)
        if existing_row.get("planned_start_time"):
            payload.setdefault("planned_start_time", None)

    if "status" in payload:
        if payload["status"] == "done" and current_status != "done":
            payload["completed_at"] = datetime.now(timezone.utc).isoformat()
            # Encurtamento: só quando o PATCH não está mexendo no horário. Um
            # PATCH que conclui E move a tarefa ao mesmo tempo (o agente faz
            # isso) tem horário explícito do chamador, e sobrescrevê-lo aqui
            # desfaria o movimento que ele acabou de pedir.
            if "end_time" not in payload and "start_time" not in payload:
                now_local = now or _now_for_user(user_id)
                moved = shortening_payload(existing_row, now_local)
                if not moved:
                    # Caso B (Migration 34): marcou ANTES da janela começar.
                    # As duas funções são mutuamente exclusivas por construção
                    # — A exige `start < agora < fim`, B exige `agora <= start`
                    # —, então tentar a segunda só quando a primeira sai vazia
                    # não pode aplicar as duas.
                    moved = move_back_payload(
                        user_id,
                        task_id,
                        existing_row,
                        now_local,
                        _first_subtask_for_move(user_id, task_id, existing_row, now_local),
                    )
                payload.update(moved)
        elif payload["status"] != "done":
            payload["completed_at"] = None  # reabriu a tarefa
            if current_status == "done" and "end_time" not in payload:
                payload.update(restore_payload(existing_row))

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

    # Tags depois do UPDATE, em try/except: a tarefa já foi salva.
    try:
        from services import task_tags_service

        if tag_ids is not None:
            task_tags_service.set_task_tags(user_id, task_id, tag_ids)
        task["tags"] = task_tags_service.tags_for_tasks(user_id, [task_id]).get(
            task_id, []
        )
    except Exception as e:
        print(f"[tasks] tags não atualizadas task={task_id}: {e}", flush=True)
        task.setdefault("tags", [])

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
