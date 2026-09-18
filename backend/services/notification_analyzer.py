"""
Análise inteligente de rotina para geração de notificações.

Fluxo:
  1. Verifica cooldown de 6h (should_analyze)
  2. Carrega contexto do usuário (tarefas, blocos, memórias, histórico)
  3. Filtro de regras baratas para decidir se vale chamar o Claude
  4. Claude analisa e decide se envia notificação + gera conteúdo
  5. Persiste e retorna a notificação criada (ou None)
"""

import os
import json
from datetime import date, datetime, timedelta

import anthropic

from database import supabase
from services import notification_service, tasks_service, memory_service
from services import chronotype as chronotype_service, user_tz

_MODEL = "claude-sonnet-4-6"


def _parse_json(raw: str) -> dict:
    """
    Extrai JSON da resposta do Claude, tolerando markdown fences (```json ... ```)
    e qualquer texto antes/depois. Pega do primeiro { ao último }.
    """
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Nenhum JSON encontrado na resposta")
    return json.loads(raw[start : end + 1])

_CURVE_KEY = {
    "Matutino": "morning", "Vespertino": "evening", "Noturno": "night",
    "Misto": "intermediate", "Bimodal": "bimodal",
    "morning": "morning", "evening": "evening",
    "night": "night", "intermediate": "intermediate", "bimodal": "bimodal",
}

# Blocos que indicam horário ruim para atividades cognitivas ou físicas intensas
_BAD_BLOCKS = {"sono", "recuperacao"}
# Blocos adequados para sugerir como alternativa. Deriva da ordem de
# preferência para não divergir dela — inclui foco_leve, onde tarefas de
# prioridade baixa podem cair quando o resto do dia está ocupado.
_GOOD_BLOCKS = set(chronotype_service.BLOCK_PREFERENCE)

# Máximo de simples por dia na fase de testes
_MAX_SIMPLE_PER_DAY = 3

# ── Compactação do dia ──────────────────────────────────────────────────────
# Ganho mínimo para valer interromper o usuário com "seu dia pode acabar mais
# cedo". 45 min é deliberado, não chute:
#   - abaixo de ~30 min o ganho não muda o que a pessoa consegue fazer com o
#     tempo (não dá para um treino, uma aula, buscar alguém) — é ruído;
#   - os blocos do cronotipo têm 90 min, então 45 é meio bloco: o menor
#     movimento que ainda desloca a agenda de forma perceptível;
#   - o gatilho é MUITO mais frequente que o de bloco ruim (quase todo dia tem
#     espaço livre antes da última tarefa), e um piso baixo transformaria o Axon
#     no assistente que fica empurrando a agenda para cima.
# Para calibrar: baixar faz a sugestão aparecer mais. Se aparecer de menos, é o
# comportamento desejado nesta fase — o caminho contrário (soltar agora, apertar
# depois) custa irritar o usuário durante o teste.
_MIN_COMPACTION_GAIN_MIN = 45

# Não sugerir mover tarefa que o usuário acabou de criar ou editar: ele escolheu
# aquele horário de propósito minutos atrás, e ouvir "mova para outro horário" em
# seguida é o Axon discutindo com uma decisão fresca. 2h cobre a sessão de
# planejamento típica (a pessoa monta o dia e segue mexendo por um tempo) sem
# proteger a tarefa para sempre.
_COMPACTION_RECENT_TOUCH_MIN = 120

# Acima disto o usuário está dizendo que gosta da agenda como está. O gatilho de
# bloco ruim continua valendo (tarefa às 3h é problema real), mas oportunidade de
# compactar, não. Mais restritivo que o limite do prompt para 'improvement' (5)
# de propósito: recusar compactação é sinal de preferência, não de desatenção.
_COMPACTION_MAX_REJECTIONS = 3


def _load_user_context(user_id: str, tz_name: str) -> dict:
    """Carrega dados necessários para a análise (no fuso do usuário)."""
    profile_res = (
        supabase.table("profiles")
        .select("name, chronotype")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_res.data or {}
    chronotype = profile.get("chronotype", "intermediate")
    curve_key = _CURVE_KEY.get(chronotype, "intermediate")

    now = datetime.now(user_tz.zone(tz_name))
    hour = now.hour
    block_idx = (hour * 60) // 90
    blocks = chronotype_service.CHRONOTYPE_BLOCKS.get(
        curve_key, chronotype_service.CHRONOTYPE_BLOCKS["intermediate"]
    )

    today_date = now.date()
    today = str(today_date)
    tasks = tasks_service.list_tasks(user_id, scheduled_date=today)
    tomorrow_tasks = tasks_service.list_tasks(
        user_id, scheduled_date=str(today_date.fromordinal(today_date.toordinal() + 1))
    )
    memories = memory_service.load_memories(user_id)
    recent_notifs = notification_service.get_recent_notifications(user_id, hours=72)

    return {
        "user_name": profile.get("name", "usuário"),
        "chronotype": chronotype,
        "curve_key": curve_key,
        "blocks": blocks,
        "current_block_idx": block_idx,
        "tasks_today": tasks,
        "tasks_tomorrow": tomorrow_tasks,
        "memories": memories,
        "recent_notifications": recent_notifs,
        "today": today,
        "now_hhmm": now.strftime("%H:%M"),
        "timezone": tz_name,
    }


def _find_good_slot(blocks: list, busy_times: set[str]) -> tuple[int, str] | None:
    """
    Melhor bloco de foco livre do dia — a DICA que vai no prompt do Claude.
    Retorna (block_idx, start_time) ou None.

    Segue a mesma cascata por qualidade de _pick_free_good_slot (pico antes de
    foco profundo, etc.). Varrer em ordem cronológica devolveria um foco
    moderado das 09h estando um pico das 15h livre, e a dica puxaria o Claude
    para um horário pior do que o que a validação escolheria depois.
    """
    for level_wanted in chronotype_service.BLOCK_PREFERENCE:
        for i, (level, _) in enumerate(blocks):
            if level != level_wanted:
                continue
            start_min = i * 90
            start_time = f"{start_min // 60:02d}:{start_min % 60:02d}"
            if start_time not in busy_times:
                return i, start_time
    return None


def _has_tasks_in_bad_blocks(tasks: list, blocks: list) -> list[dict]:
    """Retorna tarefas agendadas em blocos de sono ou recuperação."""
    bad = []
    for task in tasks:
        if not task.get("start_time"):
            continue
        t = task["start_time"][:5]
        h, m = int(t[:2]), int(t[3:])
        block_idx = (h * 60 + m) // 90
        if block_idx < len(blocks):
            level, _ = blocks[block_idx]
            if level in _BAD_BLOCKS:
                bad.append({**task, "_block_level": level})
    return bad


def _to_minutes(hhmm: str) -> int:
    """'HH:MM' (ou 'HH:MM:SS') -> minutos desde 00:00."""
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def _block_level_at(blocks: list, hhmm: str) -> str | None:
    """Nível do bloco de foco que contém o horário ('pico', 'sono', …)."""
    idx = _to_minutes(hhmm) // 90
    return blocks[idx][0] if idx < len(blocks) else None


def _duration_min(task: dict | None) -> int:
    """Duração da tarefa em minutos (default 45 via task_interval quando sem fim)."""
    iv = tasks_service.task_interval(
        (task or {}).get("start_time"), (task or {}).get("end_time")
    )
    return iv[1] - iv[0] if iv else 45


def _pick_free_good_slot(
    user_id: str, target_date: str, blocks: list, duration: int, exclude_id: str | None,
    not_before_min: int | None = None,
    allowed: tuple[str, ...] | None = None,
) -> tuple[str, str] | None:
    """
    Melhor horário livre do dia para a tarefa, respeitando a matriz de
    prioridade. Determinístico — o horário que o Claude sugeriu é só uma dica.

    A busca é em CASCATA pela qualidade do bloco: tenta todos os picos do dia,
    depois todos os de foco profundo, e assim por diante. Isso difere de varrer
    o dia em ordem cronológica, que devolveria um foco moderado das 09h antes
    de um pico das 15h.

    `allowed` restringe quais níveis podem ser usados (ver
    chronotype.allowed_blocks); sem ele, qualquer bloco bom serve.
    `not_before_min` descarta blocos que já passaram (relevante só para hoje):
    não adianta propor as 09h quando já são 15h.

    None se não há bloco permitido e livre.
    """
    intervals = []
    for t in tasks_service.list_tasks(user_id, scheduled_date=str(target_date)):
        if exclude_id and t["id"] == exclude_id:
            continue
        iv = tasks_service.task_interval(t.get("start_time"), t.get("end_time"))
        if iv:
            intervals.append(iv)

    allowed = allowed or chronotype_service.BLOCK_PREFERENCE

    # Cascata: esgota cada nível de qualidade antes de descer para o próximo.
    for level_wanted in chronotype_service.BLOCK_PREFERENCE:
        if level_wanted not in allowed:
            continue
        for i, (level, _) in enumerate(blocks):
            if level != level_wanted:
                continue
            s = i * 90
            e = s + duration
            if e > 1440:  # não cabe antes da meia-noite
                continue
            if not_before_min is not None and s < not_before_min:
                continue
            if all(not (s < te and ts < e) for ts, te in intervals):
                return f"{s // 60:02d}:{s % 60:02d}", f"{e // 60:02d}:{e % 60:02d}"
    return None


def _recently_touched(task: dict, now: datetime) -> bool:
    """
    True se a tarefa foi criada ou editada nos últimos
    `_COMPACTION_RECENT_TOUCH_MIN` minutos — o usuário escolheu aquele horário
    agora e não quer ser contrariado.

    Falha para o lado de NÃO sugerir: timestamp ilegível é tratado como recente.
    """
    for field in ("updated_at", "created_at"):
        raw = task.get(field)
        if not raw:
            continue
        try:
            ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except Exception:
            return True  # não sei quando foi tocada → não mexo
        if (now - ts).total_seconds() / 60 < _COMPACTION_RECENT_TOUCH_MIN:
            return True
    return False


def _compaction_candidate(user_id: str, ctx: dict) -> dict | None:
    """
    A última tarefa do dia pode vir para mais cedo e fazer o dia acabar antes?

    Este é o SEGUNDO gatilho de melhoria (o primeiro é tarefa em bloco ruim). Ele
    existe porque o crédito de horas poupadas do Axon (`axon_optimizations`,
    Migration 30) mede justamente o quanto o fim do dia adiantou — e o gatilho de
    bloco ruim quase nunca produz esse movimento: no cronotipo bimodal, bloco
    ruim é madrugada até 07:29, e tarefa ali raramente é a última do dia.

    Só a ÚLTIMA tarefa interessa. Mover uma do meio não adianta o fim do dia:

        09:00–10:00 Reunião
        20:00–22:00 Estudar alemão   ← mover para 16:00–18:00 = 4h liberadas
        14:00–15:00 Ler artigo       ← mover para 10:00 = 0, a última segue 22:00

    Devolve None quando não há candidato — o que é o caso comum e desejado.
    """
    tasks = ctx["tasks_today"]
    now_min = _to_minutes(ctx["now_hhmm"])

    # Candidatas: têm horário de fim real e ainda não foram concluídas. Tarefa
    # feita não se move, e sem horário não há fim de dia a comparar.
    timed = []
    for t in tasks:
        if t.get("status") == "done":
            continue
        iv = tasks_service.task_interval(t.get("start_time"), t.get("end_time"))
        if not iv:
            continue
        timed.append((iv[1], iv[0], t))
    if not timed:
        return None

    # O fim do dia é o maior horário de término — incluindo as CONCLUÍDAS, porque
    # uma tarefa já feita às 22h mantém o dia terminando às 22h e mover a
    # pendente das 20h não liberaria nada.
    day_end = 0
    for t in tasks:
        iv = tasks_service.task_interval(t.get("start_time"), t.get("end_time"))
        if iv:
            day_end = max(day_end, iv[1])

    last_end, last_start, last_task = max(timed, key=lambda x: x[0])

    # A pendente mais tardia precisa SER o fim do dia; se algo (concluído ou não)
    # termina depois, movê-la não adianta nada.
    if last_end < day_end:
        return None

    # Empate: duas tarefas terminam juntas e mover só uma não muda o fim do dia.
    # Mover as duas de uma vez é escopo de outra fase.
    if sum(1 for end, _, _ in timed if end == last_end) > 1:
        return None

    # O dia já acabou — não há o que compactar.
    if last_end <= now_min:
        return None

    if _recently_touched(last_task, datetime.now(user_tz.zone(ctx["timezone"]))):
        return None

    duration = last_end - last_start
    allowed = chronotype_service.allowed_blocks(
        last_task.get("priority"),
        bool(last_task.get("is_key_task")),
        last_task.get("complexity"),
    )

    slot = _pick_free_good_slot(
        user_id,
        str(ctx["today"]),
        ctx["blocks"],
        duration,
        last_task["id"],
        not_before_min=now_min,
        allowed=allowed,
    )
    if not slot:
        return None

    new_end = _to_minutes(slot[1])
    gain = last_end - new_end
    if gain < _MIN_COMPACTION_GAIN_MIN:
        return None

    return {
        "task": last_task,
        "new_start_time": slot[0],
        "new_end_time": slot[1],
        "current_end": f"{last_end // 60:02d}:{last_end % 60:02d}",
        "freed_minutes": gain,
    }


def _ensure_free_slot(user_id: str, ctx: dict, action: dict) -> dict | None:
    """
    Decide o horário DEFINITIVO da sugestão. O horário vem do Claude (o
    good_slot do prompt é só uma dica), então validamos de forma dura — o Axon
    nunca propõe um horário já ocupado.

    Ordem de preferência:
      1. O horário que o Claude sugeriu, se estiver livre e for permitido.
      2. Melhor bloco permitido livre HOJE (cascata pico → profundo → …).
      3. Melhor bloco permitido livre AMANHÃ — adiar é melhor do que empilhar
         tarefa sobre tarefa: o objetivo é aliviar o dia, não sobrecarregá-lo.
      4. Último recurso: relaxa a matriz de prioridade e aceita qualquer bloco
         bom livre (hoje ou amanhã). Tirar uma tarefa chave das 03h da manhã
         vale mais do que respeitar a restrição de nível — mas `sono` e
         `recuperacao` continuam proibidos, senão não seria melhoria nenhuma.
      5. Nada: não sugere.

    Quais blocos são permitidos vem de chronotype.allowed_blocks(), pela
    prioridade da tarefa. Vale só aqui e no "Axon decide": tarefa marcada pelo
    usuário nunca passa por esta função.

    O dict devolvido carrega `_slot_changed` quando o horário final difere do
    que o Claude escreveu, e `_relaxed` quando o passo 4 foi necessário. Quem
    chama USA isso para reescrever o texto — sem essa etapa a notificação diria
    "07h" enquanto a ação move para outro horário, e o usuário aceitaria uma
    coisa lendo outra.
    """
    new_start = action.get("new_start_time")
    if not new_start:
        return action  # sugestão sem horário (ex.: só muda a data) — nada a checar

    task_id = action.get("task_id")
    moved = next(
        (t for t in (ctx["tasks_today"] + ctx["tasks_tomorrow"]) if t["id"] == task_id),
        None,
    )
    target_date = action.get("new_date") or (moved or {}).get("scheduled_date")
    if not target_date:
        return action

    today_str = str(ctx["today"])
    # Só o dia de hoje tem horas já vencidas; amanhã está inteiro disponível.
    now_min = _to_minutes(ctx["now_hhmm"]) if str(target_date) == today_str else None

    duration = _duration_min(moved)
    allowed = chronotype_service.allowed_blocks(
        (moved or {}).get("priority"),
        bool((moved or {}).get("is_key_task")),
        (moved or {}).get("complexity"),
    )
    tomorrow = str(date.fromisoformat(today_str) + timedelta(days=1))

    # Passo 1 — o horário do Claude serve se estiver livre, não tiver passado
    # e cair num bloco que a prioridade da tarefa permite.
    conflict = tasks_service.find_conflicting_task(
        user_id, target_date, new_start, action.get("new_end_time"), exclude_id=task_id
    )
    is_past = now_min is not None and _to_minutes(new_start) < now_min
    if not conflict and not is_past and _block_level_at(ctx["blocks"], new_start) in allowed:
        return action

    def _try(day: str, allowed_levels: tuple[str, ...], relaxed: bool) -> dict | None:
        slot = _pick_free_good_slot(
            user_id, day, ctx["blocks"], duration, task_id,
            not_before_min=now_min if day == today_str else None,
            allowed=allowed_levels,
        )
        if not slot:
            return None
        out = {
            **action,
            "new_start_time": slot[0],
            "new_end_time": slot[1],
            "new_date": day,
            "_slot_changed": True,
        }
        if relaxed:
            out["_relaxed"] = True
        return out

    # Passos 2 e 3 — respeitando a matriz: hoje, depois amanhã.
    for day in (str(target_date), tomorrow):
        found = _try(day, allowed, relaxed=False)
        if found:
            return found

    # Passo 4 — nenhum bloco permitido cabe em dois dias. Relaxa a matriz:
    # qualquer bloco bom é melhor que deixar a tarefa em sono/recuperação.
    if allowed != chronotype_service.BLOCK_PREFERENCE:
        for day in (str(target_date), tomorrow):
            found = _try(day, chronotype_service.BLOCK_PREFERENCE, relaxed=True)
            if found:
                return found

    return None


def _rewrite_suggestion_text(
    ctx: dict,
    task_id: str | None,
    new_date: str | None,
    new_start: str | None,
    reason: str | None,
    relaxed: bool = False,
    compaction_end: str | None = None,
) -> tuple[str, str]:
    """
    Reescreve título/corpo da melhoria quando o horário final difere do que o
    Claude propôs. O texto NUNCA pode mencionar um horário diferente do que a
    ação executa: é o que faz o usuário aceitar uma coisa e receber outra.

    `relaxed` indica que não havia bloco do nível ideal e o Axon aceitou um
    inferior — o texto avisa, para a sugestão não parecer melhor do que é.

    Se o Claude falhar (rede, créditos, JSON inválido), cai num texto montado
    localmente com o horário certo — pior redação, dado correto. O texto
    original nunca é reaproveitado: ele é justamente o que está desatualizado.
    """
    task = next(
        (t for t in (ctx["tasks_today"] + ctx["tasks_tomorrow"]) if t["id"] == task_id),
        None,
    )
    title_task = (task or {}).get("title", "sua tarefa")
    is_tomorrow = new_date and str(new_date) != str(ctx["today"])
    quando = f"amanhã às {new_start}" if is_tomorrow else f"às {new_start}"

    # Compactação: o texto precisa falar do fim do dia, que é o ganho real.
    extra = (
        f"\nEste movimento faz o DIA TERMINAR às {compaction_end} em vez do horário "
        f"atual. Diga isso explicitamente — é o benefício que importa."
        if compaction_end
        else ""
    )

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        response = client.messages.create(
            model=_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": f"""Você é o Axon, assistente de produtividade. Escreva uma notificação curta sugerindo remarcar uma tarefa.

Tarefa: {title_task}
Novo horário sugerido: {quando}
Motivo: {reason or 'melhor adequação ao ritmo do usuário'}{extra}
{"IMPORTANTE: o dia de hoje não tem mais espaço livre, por isso a sugestão é para AMANHÃ. Deixe isso claro e natural no texto." if is_tomorrow else ""}
{"IMPORTANTE: não havia horário do nível ideal livre para esta tarefa. Este é o melhor disponível, e ainda assim é bem melhor que o horário atual. Seja honesto sobre isso, sem soar negativo." if relaxed else ""}

Regras:
- Mencione o horário EXATAMENTE como informado acima. Não invente outro horário.
- 2 frases no máximo, tom de parceiro próximo, português do Brasil.

Retorne APENAS JSON válido: {{"title": "título curto", "body": "2 frases"}}"""}],
        )
        parsed = _parse_json(response.content[0].text)
        title = (parsed.get("title") or "").strip()
        body = (parsed.get("body") or "").strip()
        # Só aceita o texto do Claude se ele de fato cita o horário decidido.
        # Sem essa checagem, um modelo distraído reintroduz a divergência.
        #
        # Título OU corpo: na compactação o ganho vai no título de propósito (o
        # corpo é cortado na prévia), então exigir o horário só no corpo
        # rejeitaria justamente o texto bem escrito e cairia no fallback.
        if title and body and new_start and (new_start in body or new_start in title):
            return title, body
    except Exception:
        pass

    # Fallback determinístico: redação simples, horário garantido.
    if compaction_end and not is_tomorrow:
        # O ganho vai no TÍTULO de propósito: o toast corta o corpo em 2 linhas
        # (line-clamp-2, ~96 caracteres) e cortaria justamente o "termina às X".
        # O título aparece inteiro nos dois lugares, e o card do Dashboard — onde
        # o usuário de fato aceita — mostra o corpo completo.
        return (
            f"Seu dia pode terminar às {compaction_end}",
            f"Movendo '{title_task}' para {new_start}, você fecha o dia mais cedo.",
        )
    if relaxed:
        return (
            "Melhor que o horário atual",
            f"Não encontrei um horário ideal livre, mas mover '{title_task}' para "
            f"{quando} já é bem melhor do que está hoje.",
        )
    if is_tomorrow:
        return (
            "Que tal amanhã?",
            f"Hoje já está cheio, então sugiro mover '{title_task}' para {quando}. "
            f"Assim seu dia fica mais leve.",
        )
    return (
        "Sugestão de horário",
        f"Que tal mover '{title_task}' para {quando}? "
        f"{reason or 'Esse horário combina melhor com seu ritmo.'}",
    )


def _apply_rule_filter(user_id: str, ctx: dict) -> dict:
    """
    Aplica regras baratas para identificar candidatos de notificação.
    Retorna dict com flags do que foi detectado.

    `compaction_candidate` é o único item aqui que consulta o banco
    (_pick_free_good_slot lê as tarefas do dia). Ainda é barato comparado à
    chamada ao Claude que ele evita quando não há candidato.
    """
    tasks_today = ctx["tasks_today"]
    blocks = ctx["blocks"]

    done = [t for t in tasks_today if t.get("status") == "done"]
    todo = [t for t in tasks_today if t.get("status") in ("todo", "progress")]
    bad_block_tasks = _has_tasks_in_bad_blocks(
        ctx["tasks_today"] + ctx["tasks_tomorrow"], blocks
    )

    return {
        "has_tasks_today": len(tasks_today) > 0,
        "all_done": len(tasks_today) > 0 and len(todo) == 0,
        "none_started": len(tasks_today) > 0 and len(done) == 0,
        "no_tasks_today": len(tasks_today) == 0,
        "bad_block_tasks": bad_block_tasks,
        "has_improvement_candidate": len(bad_block_tasks) > 0,
        # Segundo gatilho de melhoria: o dia pode acabar mais cedo. Ver
        # _compaction_candidate sobre por que ele existe.
        "compaction_candidate": _compaction_candidate(user_id, ctx),
        # consecutive_rejections é preenchido no caller (analyze_and_notify)
        "consecutive_rejections": 0,
    }


def _compaction_prompt_section(flags: dict) -> str:
    """
    Descreve o candidato de compactação para o Claude, ou avisa que não há.

    Dá os números PRONTOS (horário atual, proposto, ganho em h/min) em vez de
    deixar o modelo calcular: o texto da notificação tem de bater com a ação, e
    subtração feita por LLM é fonte de divergência.
    """
    cand = flags.get("compaction_candidate")
    if not cand:
        return "COMPACTAÇÃO DISPONÍVEL: nenhuma (não sugira compactação)"

    gain = cand["freed_minutes"]
    horas, minutos = divmod(gain, 60)
    if horas and minutos:
        ganho = f"{horas}h{minutos:02d}"
    elif horas:
        ganho = f"{horas}h"
    else:
        ganho = f"{minutos} minutos"

    task = cand["task"]
    return (
        "COMPACTAÇÃO DISPONÍVEL (o dia pode acabar mais cedo):\n"
        f"  task_id: {task['id']}\n"
        f"  tarefa: {task['title']}\n"
        f"  horário atual: {(task.get('start_time') or '')[:5]}–{cand['current_end']}"
        " (é a ÚLTIMA do dia)\n"
        f"  horário proposto: {cand['new_start_time']}–{cand['new_end_time']}\n"
        f"  o dia passaria a terminar às {cand['new_end_time']} "
        f"em vez de {cand['current_end']}\n"
        f"  ganho: {ganho} livres no fim do dia"
    )


def _build_analysis_prompt(ctx: dict, flags: dict) -> str:
    blocks_summary = []
    for i, (level, desc) in enumerate(ctx["blocks"]):
        start_min = i * 90
        start = f"{start_min // 60:02d}:{start_min % 60:02d}"
        end_min = (i + 1) * 90
        end = f"{(end_min % 1440) // 60:02d}:{end_min % 60:02d}"
        blocks_summary.append(f"  {start}-{end}: {level} — {desc[:60]}")

    busy_times = {
        t["start_time"][:5]
        for t in (ctx["tasks_today"] + ctx["tasks_tomorrow"])
        if t.get("start_time")
    }

    good_slot = _find_good_slot(ctx["blocks"], busy_times)
    good_slot_str = (
        f"{good_slot[1]}" if good_slot else "nenhum horário livre disponível hoje"
    )

    return f"""Você é o Axon, assistente de produtividade pessoal. Analise a situação do usuário e decida se deve enviar uma notificação.

USUÁRIO: {ctx['user_name']}
CRONOTIPO: {ctx['chronotype']}
HORA ATUAL: {ctx['now_hhmm']} (fuso do usuário: {ctx['timezone']})
DATA: {ctx['today']}

TAREFAS DE HOJE ({len(ctx['tasks_today'])} total):
{json.dumps([{'id': t['id'], 'title': t['title'], 'status': t['status'], 'start_time': t.get('start_time'), 'task_type': t['task_type']} for t in ctx['tasks_today']], ensure_ascii=False, indent=2)}

TAREFAS DE AMANHÃ ({len(ctx['tasks_tomorrow'])} total):
{json.dumps([{'id': t['id'], 'title': t['title'], 'start_time': t.get('start_time'), 'task_type': t['task_type']} for t in ctx['tasks_tomorrow']], ensure_ascii=False, indent=2)}

BLOCOS DE FOCO DO DIA (cronotipo {ctx['chronotype']}):
{chr(10).join(blocks_summary)}

MELHOR HORÁRIO LIVRE DISPONÍVEL: {good_slot_str}

TAREFAS EM HORÁRIOS INADEQUADOS: {json.dumps([{'title': t['title'], 'start_time': t.get('start_time'), 'block': t['_block_level']} for t in flags['bad_block_tasks']], ensure_ascii=False)}

{_compaction_prompt_section(flags)}

NOTIFICAÇÕES RECENTES (evite repetir):
{json.dumps([{'type': n['type'], 'title': n['title'], 'status': n['status']} for n in ctx['recent_notifications']], ensure_ascii=False, indent=2)}

MEMÓRIAS DO USUÁRIO:
{json.dumps(ctx['memories'], ensure_ascii=False)}

SITUAÇÃO DETECTADA:
- Todas as tarefas concluídas hoje: {flags['all_done']}
- Nenhuma tarefa iniciada hoje: {flags['none_started']}
- Sem tarefas para hoje: {flags['no_tasks_today']}
- Tarefas em horários inadequados: {len(flags['bad_block_tasks'])}
- Dia pode acabar mais cedo (compactação): {'sim' if flags.get('compaction_candidate') else 'não'}
- Rejeições consecutivas de melhorias: {flags['consecutive_rejections']}

INSTRUÇÕES:
1. Decida se alguma notificação é genuinamente útil agora. Prefira NÃO notificar se não houver algo relevante.
2. Para 'simple': use quando houver algo concreto a celebrar ou incentivar (max 3/dia já considera o histórico).
3. Para 'improvement': há DOIS motivos válidos, e só estes dois:
   (a) TAREFA EM BLOCO INADEQUADO — existe tarefa em bloco de sono/recuperação e há horário melhor livre.
   (b) COMPACTAÇÃO DO DIA — o bloco "COMPACTAÇÃO DISPONÍVEL" acima está preenchido.
   Se os DOIS existirem, escolha (a): tarefa em bloco ruim é um problema do usuário; dia que
   poderia acabar mais cedo é apenas uma oportunidade. Problema vem antes de oportunidade.
   Se nenhum dos dois existir, NÃO use 'improvement'.
6. Na compactação (b), o texto precisa dizer o GANHO CONCRETO, não uma promessa vaga.
   Diga a que horas o dia passa a terminar e quanto tempo isso libera. Use o task_id, o
   horário e o ganho EXATAMENTE como informados no bloco "COMPACTAÇÃO DISPONÍVEL".
   Coloque o ganho no TÍTULO: o corpo é cortado em 2 linhas na prévia, e o título aparece
   sempre inteiro. Corpo de no máximo ~90 caracteres, uma frase.
   Bom:  título "Seu dia pode acabar 2h mais cedo"
         corpo  "Estudar alemão às 18h em vez de 20h fecha seu dia às 20h."
   Ruim: título "Sugestão de horário"  (o ganho ficou escondido no corpo, que é cortado)
   Ruim: "Notei que sua agenda pode ser otimizada."  (vago, sem número)
   Nunca enquadre como cobrança ("você está perdendo tempo"): é uma oferta, e o usuário
   pode ter deixado a tarefa tarde de propósito.
4. Para 'change': use apenas após uma alteração ter sido feita (não se aplica aqui).
5. Se rejeições consecutivas > 5, seja muito mais seletivo com 'improvement'.

RETORNE APENAS JSON VÁLIDO (sem markdown, sem texto extra):
{{
  "should_notify": true ou false,
  "type": "simple" ou "improvement",
  "title": "título curto da notificação",
  "body": "texto personalizado da notificação (2-3 frases)",
  "action": {{
    "task_id": "uuid da tarefa a ser alterada",
    "new_date": "YYYY-MM-DD ou null",
    "new_start_time": "HH:MM ou null",
    "new_end_time": "HH:MM ou null",
    "reason": "explicação breve do motivo"
  }}
}}

O campo "action" só é necessário para type="improvement". Para type="simple", omita-o ou envie null.
Se should_notify=false, os outros campos podem ser strings vazias."""


def analyze_and_notify(user_id: str, tz_header: str | None = None) -> dict | None:
    """
    Analisa a rotina do usuário e cria uma notificação se necessário.

    Dois caminhos com gatilhos independentes:
    - improvement: REAGE a tarefas em blocos ruins mesmo dentro do cooldown de 6h,
      mas só se não houver outra melhoria ainda não resolvida (evita spam).
    - simple: respeita o cooldown de 6h (análise periódica de incentivo/celebração).

    Retorna a notificação criada ou None.
    """
    tz_name = user_tz.resolve(user_id, tz_header)

    # Libera melhorias cujo horário sugerido já passou antes de checar o slot.
    notification_service.expire_stale_improvements(user_id, tz_name)

    cooldown_elapsed = notification_service.should_analyze(user_id)

    # Reivindica o slot de cooldown IMEDIATAMENTE para evitar race condition:
    # sem isso, duas tasks de background concorrentes passam ambas pelo check
    # antes que qualquer uma atualize o timestamp, gerando notificações duplicadas.
    if cooldown_elapsed:
        notification_service.update_analyzed_at(user_id)

    ctx = _load_user_context(user_id, tz_name)
    flags = _apply_rule_filter(user_id, ctx)
    flags["consecutive_rejections"] = notification_service.count_consecutive_rejections(user_id)

    simple_today = notification_service.count_today(user_id, "simple")

    # Já existe uma melhoria ABERTA (não resolvida e não expirada)? Não cria
    # outra. Atalho barato que evita a chamada ao Claude; a garantia real
    # contra corrida é o índice único parcial no banco (ver create_improvement_guarded).
    has_pending_improvement = notification_service.has_open_improvement(user_id)

    # ── Elegibilidade da melhoria: dois gatilhos independentes ──────────────
    # (1) tarefa em bloco ruim — um PROBLEMA, reage sempre;
    # (2) dia que pode acabar mais cedo — uma OPORTUNIDADE, com três travas.
    #
    # As travas existem porque o gatilho (2) é muito mais frequente: quase todo
    # dia tem espaço livre antes da última tarefa. E há quem deixe a última
    # tarefa às 20h PORQUE QUER (a tarde é do filho, do treino, do descanso) —
    # para essa pessoa, "seu dia pode acabar mais cedo" é o Axon pedindo para
    # encher o tempo livre dela.
    compaction = flags.get("compaction_candidate")
    compaction_eligible = bool(compaction)
    if compaction_eligible:
        # (a) Uma compactação por dia. count_today não serve: ela conta por TIPO,
        # e os dois gatilhos usam o tipo 'improvement'. A marca vai no action.
        if notification_service.count_compactions_today(user_id, tz_name) > 0:
            compaction_eligible = False
        # (b) Quem vem recusando está dizendo que gosta da agenda como está.
        elif flags["consecutive_rejections"] >= _COMPACTION_MAX_REJECTIONS:
            compaction_eligible = False

    improvement_eligible = (
        flags["has_improvement_candidate"] or compaction_eligible
    ) and not has_pending_improvement
    simple_candidate = flags["all_done"] or flags["none_started"] or flags["no_tasks_today"]
    simple_eligible = cooldown_elapsed and simple_candidate and simple_today < _MAX_SIMPLE_PER_DAY

    # Nada elegível → cooldown já foi registrado acima se necessário
    if not improvement_eligible and not simple_eligible:
        return None

    # Chama Claude para análise
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = _build_analysis_prompt(ctx, flags)

    try:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        result = _parse_json(response.content[0].text)
    except Exception as e:
        # NÃO silenciar: sem este log, "conta sem créditos" e "JSON inválido"
        # viram indistinguíveis de "o Claude decidiu não notificar" — e a
        # análise inteira parece funcionar enquanto está morta. Foi assim que
        # a falta de créditos passou despercebida em 16-18/09/2026.
        print(f"[notification_analyzer] análise falhou user={user_id}: {e}", flush=True)
        return None

    if not result.get("should_notify"):
        return None

    notif_type = result.get("type")

    # Respeita as restrições por tipo
    if notif_type == "simple" and not simple_eligible:
        return None
    if notif_type == "improvement" and not improvement_eligible:
        return None

    action = result.get("action") if notif_type == "improvement" else None
    if action and not action.get("task_id"):
        action = None
    # Melhoria sem ação executável não faz sentido (não dá para aceitar)
    if notif_type == "improvement" and not action:
        return None

    if notif_type == "improvement":
        # O Claude escolheu compactar? Reconhecemos pelo task_id bater com o
        # candidato que NÓS calculamos — e não por um campo que ele devolva, que
        # seria palpite dele sobre a própria intenção.
        is_compaction = bool(
            compaction
            and compaction_eligible
            and str(action.get("task_id")) == str(compaction["task"]["id"])
        )

        # Anti-colisão: nunca sugerir um horário já ocupado por outra tarefa.
        action = _ensure_free_slot(user_id, ctx, action)
        if action is None:
            return None

        if is_compaction:
            # _ensure_free_slot pode ter realocado para AMANHÃ (passo 3) ou para
            # um horário que termina DEPOIS do atual — as duas coisas destroem a
            # premissa da compactação, que é o dia de hoje acabar mais cedo.
            # Nesse caso a sugestão deixa de ser compactação: se o Claude também
            # não tinha motivo de bloco ruim, não há o que sugerir.
            still_earlier = (
                str(action.get("new_date") or ctx["today"]) == str(ctx["today"])
                and action.get("new_end_time")
                and _to_minutes(action["new_end_time"])
                <= _to_minutes(compaction["current_end"]) - _MIN_COMPACTION_GAIN_MIN
            )
            if not still_earlier:
                if not flags["has_improvement_candidate"]:
                    return None
                is_compaction = False

        if is_compaction:
            # A marca que sustenta a trava "uma compactação por dia"
            # (count_compactions_today) e identifica a origem da sugestão.
            action["kind"] = "compaction"

        title = result.get("title", "Axon")
        body = result.get("body", "")

        # O horário final pode não ser o que o Claude escreveu no texto. Se o
        # texto ficasse como está, a notificação prometeria um horário e a ação
        # executaria outro — o usuário aceita lendo "07h" e a tarefa vai para
        # as 12h. O texto é reescrito a partir do horário REAL.
        slot_changed = action.pop("_slot_changed", False)
        relaxed = action.pop("_relaxed", False)
        if slot_changed:
            title, body = _rewrite_suggestion_text(
                ctx=ctx,
                task_id=action.get("task_id"),
                new_date=action.get("new_date"),
                new_start=action.get("new_start_time"),
                reason=action.get("reason"),
                relaxed=relaxed,
                # Na compactação o texto tem de falar do FIM DO DIA, não de um
                # "horário melhor" genérico — é esse o ganho que o usuário aceita.
                compaction_end=(
                    action.get("new_end_time") if is_compaction else None
                ),
            )

        # Via protegida pelo índice único: se outra análise concorrente já criou
        # a melhoria aberta, o banco recusa e devolvemos None (sem duplicar).
        return notification_service.create_improvement_guarded(
            user_id=user_id,
            title=title,
            body=body,
            action=action,
        )

    return notification_service.create_notification(
        user_id=user_id,
        notif_type=notif_type,
        title=result.get("title", "Axon"),
        body=result.get("body", ""),
        action=action,
    )


def generate_change_notification(
    user_id: str,
    task_title: str,
    old_time: str | None,
    new_time: str | None,
    reason: str | None,
) -> dict:
    """
    Gera e persiste uma notificação de alteração após uma melhoria aceita.
    Claude escreve o texto explicando o que mudou e por quê.
    """
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    prompt = f"""Gere uma notificação curta e amigável informando que o Axon alterou um horário de tarefa com autorização do usuário.

Tarefa: {task_title}
Horário anterior: {old_time or 'não definido'}
Novo horário: {new_time or 'não definido'}
Motivo: {reason or 'melhor adequação ao cronotipo do usuário'}

Retorne APENAS JSON válido:
{{"title": "título curto", "body": "2 frases explicando o que mudou e por quê"}}"""

    try:
        response = client.messages.create(
            model=_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_json(response.content[0].text)
        title = data.get("title", "Axon atualizou sua agenda")
        body = data.get("body", f"O horário de '{task_title}' foi ajustado.")
    except Exception:
        title = "Axon atualizou sua agenda"
        body = f"O horário de '{task_title}' foi ajustado para {new_time} conforme sugerido."

    return notification_service.create_notification(
        user_id=user_id,
        notif_type="change",
        title=title,
        body=body,
    )
