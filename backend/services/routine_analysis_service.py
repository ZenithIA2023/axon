"""
Análise completa de rotina: reorganizar o dia INTEIRO de uma vez.

É o passo seguinte à compactação (notification_analyzer._compaction_candidate),
que move UMA tarefa por vez. Aqui o Axon olha o dia todo e propõe vários
movimentos num só passe, em quatro tipos — nesta ordem, porque problemas vêm
antes de oportunidades:

  1. bad_block         tarefa em bloco de sono/recuperação → bloco bom
  2. complexity_match  deep_focus em bloco fraco enquanto light ocupa o pico → troca
  3. grouping          tarefas da mesma tag dispersas → aproxima
  4. compaction        fecha vãos para o dia acabar antes

SÓ USA O QUE O USUÁRIO INFORMOU. Tarefa sem `complexity` não entra na troca;
sem tag não entra no agrupamento. Campo nulo nunca vira suposição (ver
Migration 31).

Quem decide o horário é ESTE CÓDIGO, deterministicamente. O Claude entra só
para escrever os motivos em português a partir da lista pronta — a mesma regra
de correlations_service: o backend calcula, o Claude traduz. Deixar o modelo
escolher horário reintroduziria a divergência texto↔ação que o app já
combateu.

A ARMADILHA CLÁSSICA deste tipo de algoritmo é gerar cinco movimentos que
colidem ENTRE SI: cada gerador olhava a agenda original e dois deles escolhiam
o mesmo slot livre. Aqui há uma única ocupação (`_Day`) que TODOS os geradores
consultam e atualizam — o movimento N vê os N-1 anteriores como se já
estivessem aplicados.
"""

import os
from datetime import date, datetime, timedelta, timezone

import anthropic

from database import supabase
from services import chronotype as chronotype_service
from services import notification_analyzer, notification_service
from services import saved_time_service, tasks_service, user_tz

_MODEL = notification_analyzer._MODEL

# ── Trava de custo ──────────────────────────────────────────────────────────
# Cada análise manual é uma chamada ao Claude (~$0,02). 3 por dia cobre o uso
# legítimo — analisar de manhã, reanalisar depois de mexer na agenda, e uma
# terceira para o "e agora?" do fim da tarde — sem deixar um usuário clicando o
# botão o dia todo. A análise AGENDADA não conta aqui: é uma por dia por
# construção.
#
# PROVISÓRIO: será substituído pela cota mensal por usuário (85% livre / 15%
# reservado ao essencial) quando ela existir — ver a memória
# plano-cota-mensal-usuario. Até lá este limite simples é a proteção.
MAX_MANUAL_ANALYSES_PER_DAY = 3

# ── Piso de relevância ──────────────────────────────────────────────────────
# Sem nenhum bad_block, a proposta só vale a pena se o dia acabar ao menos isto
# mais cedo. 30 min, e não os 45 da compactação pontual, porque aqui o usuário
# PEDIU a análise — o custo de interrupção já foi pago por ele — e um dia
# reorganizado que rende meia hora já é resposta honesta ao pedido. Abaixo
# disso, "sua agenda já está bem distribuída" é a resposta certa.
MIN_FREED_WITHOUT_BAD_BLOCK = 30

# Por quantas horas um veredito "nada a mudar" cala a sugestão pontual sobre
# aquele dia. Ver silenced_dates.
_NOTHING_SILENCE_HOURS = 6

# Ganho mínimo, em minutos, para um movimento de compactação valer a pena. É o
# MESMO piso da sugestão pontual (notification_analyzer._MIN_COMPACTION_GAIN_MIN),
# de propósito: os dois caminhos decidem a mesma coisa sobre a mesma tarefa, e
# pisos diferentes faziam o app se contradizer — a análise completa dizia "seu dia
# está bem estruturado" e a pontual propunha adiantar 1h minutos depois (21/09/2026).
_MIN_COMPACTION_GAIN_MIN = notification_analyzer._MIN_COMPACTION_GAIN_MIN

# Pausa que a compactação nunca elimina. Uma tarefa não pode ser colada no fim da
# anterior: o dia do usuário não é uma fila de blocos encostados, e "almoce mais
# rápido para terminar antes" não é uma melhoria que ele pediu.
#
# Isto substituiu um "vão mínimo de 120 min" que media a coisa errada — ele olhava
# o tamanho do buraco ANTES da tarefa e barrava casos legítimos (um vão de 90 min
# entre a academia e a última tarefa, que a sugestão pontual propunha de todo
# jeito, criando a contradição de 21/09). O que importa não é o tamanho do vão que
# a tarefa deixa para trás, e sim quanto respiro sobra ONDE ela chega.
_MIN_BREAK_AFTER_MIN = 30

# Quanto duas tarefas da mesma tag podem estar distantes (entre o fim de uma e
# o começo da outra) e ainda contar como "juntas". Um intervalo curto (almoço,
# pausa) não é dispersão.
_GROUPING_GAP_MIN = 60

_BAD_BLOCKS = notification_analyzer._BAD_BLOCKS
_GOOD_ORDER = chronotype_service.BLOCK_PREFERENCE

# Ordem de força dos blocos, do mais forte ao mais fraco, para comparar
# "esta tarefa está num bloco pior que aquela".
_LEVEL_RANK = {level: i for i, level in enumerate(_GOOD_ORDER)}


# ── Modelo do dia ───────────────────────────────────────────────────────────

def _hhmm(minutes: int) -> str:
    m = max(0, min(int(minutes), 24 * 60 - 1))
    return f"{m // 60:02d}:{m % 60:02d}"


class _Day:
    """
    A ocupação do dia como ela ficaria com os movimentos já propostos.

    `occupied` guarda (início, fim, task_id) de TODAS as tarefas com horário —
    inclusive as que não se movem. Mover uma tarefa remove o intervalo antigo e
    insere o novo, então o gerador seguinte enxerga a agenda já reorganizada.
    """

    def __init__(self, tasks: list[dict], blocks: list, now_min: int | None):
        self.blocks = blocks
        self.now_min = now_min
        self.by_id: dict[str, dict] = {t["id"]: t for t in tasks}
        self.occupied: dict[str, tuple[int, int]] = {}
        for t in tasks:
            iv = tasks_service.task_interval(t.get("start_time"), t.get("end_time"))
            if iv:
                self.occupied[t["id"]] = iv
        # Onde cada tarefa está AGORA no passe (começa igual ao original).
        self.position: dict[str, tuple[int, int]] = dict(self.occupied)

    def is_free(self, start: int, end: int, exclude: str | None = None) -> bool:
        if start < 0 or end > 24 * 60 or end <= start:
            return False
        if self.now_min is not None and start < self.now_min:
            return False  # não cair no passado (só quando o dia é hoje)
        for tid, (s, e) in self.occupied.items():
            if tid == exclude:
                continue
            if s < end and start < e:
                return False
        return True

    def level_at(self, minute: int) -> str | None:
        idx = minute // 90
        return self.blocks[idx][0] if 0 <= idx < len(self.blocks) else None

    def move(self, task_id: str, start: int, end: int) -> None:
        self.occupied[task_id] = (start, end)
        self.position[task_id] = (start, end)

    def day_end(self) -> int | None:
        return max((e for _, e in self.occupied.values()), default=None)

    def best_slot(
        self,
        duration: int,
        allowed: tuple[str, ...],
        exclude: str,
        *,
        not_after: int | None = None,
        not_before: int | None = None,
        prefer_near: int | None = None,
    ) -> tuple[int, int] | None:
        """
        Melhor slot livre para `duration` em bloco permitido.

        Cascata por qualidade (todos os picos, depois todos os focos profundos…),
        como _pick_free_good_slot. Dentro do mesmo nível, `prefer_near` puxa para
        perto de um horário (usado pelo agrupamento); sem ele, o mais cedo.
        `not_after` descarta slots que terminam depois de um limite (usado pela
        compactação: só vale se ADIANTA).
        """
        for level in _GOOD_ORDER:
            if level not in allowed:
                continue
            candidates = []
            for i, (lvl, _) in enumerate(self.blocks):
                if lvl != level:
                    continue
                block_start = i * 90
                # Tenta cada posição de 15 em 15 min dentro do bloco, para
                # encaixar depois de uma tarefa que ocupa o começo dele.
                for s in range(block_start, block_start + 90, 15):
                    e = s + duration
                    if not_after is not None and e > not_after:
                        continue
                    if not_before is not None and s < not_before:
                        continue
                    if self.is_free(s, e, exclude=exclude):
                        candidates.append((s, e))
            if candidates:
                if prefer_near is not None:
                    candidates.sort(key=lambda c: (abs(c[0] - prefer_near), c[0]))
                else:
                    candidates.sort()
                return candidates[0]
        return None


# ── Regras por tarefa ───────────────────────────────────────────────────────

def _movable(task: dict) -> bool:
    """
    Só se move o que o usuário deixou em aberto.

    Concluída não se move (já aconteceu). Evento não se move: hora marcada com
    outras pessoas não é do Axon reorganizar.

    Tarefa de ROTINA se move (decisão de 21/09/2026, revertendo a regra inicial).
    A rotina define o PADRÃO do dia, não uma promessa a terceiros, e mover a
    instância de hoje não altera a rotina — amanhã ela volta ao horário de sempre.
    Proibir criava uma contradição visível: a análise completa dizia "seu dia está
    bem estruturado" e a sugestão pontual, que nunca teve essa regra, propunha
    adiantar a mesma tarefa minutos depois. Na agenda real do usuário quase toda
    tarefa vem de rotina, então a regra antiga desligava a feature na prática.

    O que protege um horário que é compromisso de verdade é cadastrá-lo como
    EVENTO — e aí os dois caminhos recusam, pelo motivo certo.
    """
    if task.get("status") == "done":
        return False
    if task.get("task_type") == "event":
        return False
    return bool(task.get("start_time"))


def _allowed(task: dict) -> tuple[str, ...]:
    return chronotype_service.allowed_blocks(
        task.get("priority"),
        bool(task.get("is_key_task")),
        task.get("complexity"),
    )


def _duration(day: _Day, task_id: str) -> int:
    s, e = day.position[task_id]
    return e - s


# ── Geradores ───────────────────────────────────────────────────────────────

def _gen_bad_block(day: _Day, moves: list[dict]) -> None:
    """Tarefa em sono/recuperação vai para o melhor bloco permitido livre."""
    for tid, (s, e) in sorted(day.position.items(), key=lambda kv: kv[1][0]):
        task = day.by_id[tid]
        if not _movable(task) or any(m["task_id"] == tid for m in moves):
            continue
        if day.level_at(s) not in _BAD_BLOCKS:
            continue
        slot = day.best_slot(e - s, _allowed(task), exclude=tid)
        if not slot:
            continue
        _push(day, moves, task, slot, "bad_block")


def _gen_complexity_match(day: _Day, moves: list[dict]) -> None:
    """
    deep_focus/focus em bloco fraco enquanto uma light/moderate ocupa bloco
    forte → tenta TROCAR as duas de lugar. Só tarefas COM complexidade entram.

    Troca em vez de "mover a pesada para um pico livre" porque, se houvesse
    pico livre, o passo anterior já teria usado. O ganho aqui é redistribuir o
    que já está ocupado.
    """
    heavy = {"deep_focus", "focus"}
    light = {"light", "moderate"}
    for a_id, (a_s, a_e) in list(day.position.items()):
        a = day.by_id[a_id]
        if not _movable(a) or a.get("complexity") not in heavy:
            continue
        if any(m["task_id"] == a_id for m in moves):
            continue
        a_level = day.level_at(a_s)
        if a_level is None or a_level in _BAD_BLOCKS:
            continue
        a_rank = _LEVEL_RANK.get(a_level, 99)
        # Só vale trocar se a pesada está num bloco que a complexidade dela
        # NÃO permite — senão ela já está bem.
        if a_level in _allowed(a):
            continue

        for b_id, (b_s, b_e) in list(day.position.items()):
            if b_id == a_id:
                continue
            b = day.by_id[b_id]
            if not _movable(b) or b.get("complexity") not in light:
                continue
            if any(m["task_id"] == b_id for m in moves):
                continue
            b_level = day.level_at(b_s)
            if b_level is None or _LEVEL_RANK.get(b_level, 99) >= a_rank:
                continue  # b não está num bloco melhor que a
            if b_level not in _allowed(a):
                continue  # o bloco de b não serve para a pesada
            if a_level not in _allowed(b):
                continue  # o bloco de a não serve para a leve

            a_dur, b_dur = a_e - a_s, b_e - b_s
            # A pesada assume o começo de b; a leve assume o começo de a.
            new_a = (b_s, b_s + a_dur)
            new_b = (a_s, a_s + b_dur)
            # Libera as duas antes de checar, porque uma ocupa o lugar da outra.
            saved = {a_id: day.occupied.pop(a_id), b_id: day.occupied.pop(b_id)}
            ok = day.is_free(*new_a) and day.is_free(*new_b)
            # As duas novas posições não podem se sobrepor entre si.
            if ok and new_a[0] < new_b[1] and new_b[0] < new_a[1]:
                ok = False
            day.occupied.update(saved)
            if not ok:
                continue

            _push(day, moves, a, new_a, "complexity_match", swap_with=b)
            _push(day, moves, b, new_b, "complexity_match", swap_with=a)
            break


def _gen_grouping(day: _Day, moves: list[dict]) -> None:
    """
    Tarefas com a mesma tag dispersas → aproxima. Só tarefas COM tag entram.

    A âncora é a tarefa mais cedo do grupo (ou uma já movida por bad_block, que
    não se move de novo). As outras vão para o slot permitido mais perto dela.
    Aproximar, não colar: o slot precisa ser bloco bom e livre.
    """
    groups: dict[str, list[str]] = {}
    for tid, task in day.by_id.items():
        if not _movable(task):
            continue
        for tag in task.get("tags") or []:
            groups.setdefault(tag["id"], []).append(tid)

    for tag_id, ids in groups.items():
        if len(ids) < 2:
            continue
        # Dispersas = existe um par com mais de _GROUPING_GAP_MIN de distância.
        positions = sorted((day.position[t], t) for t in ids if t in day.position)
        gaps = [
            positions[i + 1][0][0] - positions[i][0][1]
            for i in range(len(positions) - 1)
        ]
        if not any(g > _GROUPING_GAP_MIN for g in gaps):
            continue

        anchor_iv, anchor_id = positions[0]
        for (iv, tid) in positions[1:]:
            if any(m["task_id"] == tid for m in moves):
                continue
            task = day.by_id[tid]
            gap = iv[0] - anchor_iv[1]
            if gap <= _GROUPING_GAP_MIN:
                anchor_iv = (anchor_iv[0], max(anchor_iv[1], iv[1]))
                continue  # já está junto
            slot = day.best_slot(
                iv[1] - iv[0], _allowed(task), exclude=tid, prefer_near=anchor_iv[1]
            )
            if not slot:
                continue
            # Só move se ficou de fato mais perto do grupo.
            if abs(slot[0] - anchor_iv[1]) >= gap:
                continue
            _push(day, moves, task, slot, "grouping")
            anchor_iv = (min(anchor_iv[0], slot[0]), max(anchor_iv[1], slot[1]))


def _gen_compaction(day: _Day, moves: list[dict]) -> None:
    """
    Fecha VÃOS: a última tarefa vem para um buraco que já existe entre as
    outras, repetidamente, enquanto o fim do dia adiantar.

    "Vão" é a palavra-chave. A primeira versão puxava a última tarefa para o
    slot mais cedo possível, e um dia bem organizado (09–12h, 16:30–18h) virava
    "Academia às 07:30" — isso não é fechar buraco, é reescrever o dia do
    usuário. Aqui o slot precisa ficar DEPOIS da primeira tarefa do dia: a
    compactação empurra o fim para dentro, nunca o começo para fora.
    """
    for _ in range(8):  # teto de segurança; na prática para bem antes
        end = day.day_end()
        if end is None:
            return
        # A última tarefa MOVÍVEL cujo fim é o fim do dia.
        last = None
        for tid, (s, e) in day.position.items():
            if e == end and _movable(day.by_id[tid]) and not any(
                m["task_id"] == tid for m in moves
            ):
                last = tid
                break
        if last is None:
            return
        # Empate no fim do dia: mover só uma não adianta nada.
        if sum(1 for _, (s, e) in day.position.items() if e == end) > 1:
            return
        # O começo do dia (sem a última): o vão tem de estar depois dele.
        others = [(s, e) for tid, (s, e) in day.position.items() if tid != last]
        if not others:
            return  # só uma tarefa: não há vão entre o quê
        day_start = min(s for s, _ in others)
        task = day.by_id[last]
        dur = _duration(day, last)
        slot = day.best_slot(
            dur, _allowed(task), exclude=last, not_after=end - 1, not_before=day_start
        )
        if not slot:
            return
        # O movimento tem de adiantar o fim do dia o bastante para valer a pena.
        if end - slot[1] < _MIN_COMPACTION_GAIN_MIN:
            return
        # E não pode colar a tarefa no fim da anterior: a pausa do almoço (ou
        # qualquer respiro) é do usuário, não espaço vago a ser preenchido.
        prev_end = max((e for _, e in others if e <= slot[0]), default=None)
        if prev_end is not None and slot[0] - prev_end < _MIN_BREAK_AFTER_MIN:
            return
        _push(day, moves, task, slot, "compaction")


def _push(
    day: _Day,
    moves: list[dict],
    task: dict,
    slot: tuple[int, int],
    kind: str,
    swap_with: dict | None = None,
) -> None:
    old_s, old_e = day.position[task["id"]]
    if (old_s, old_e) == slot:
        return
    day.move(task["id"], *slot)
    moves.append(
        {
            "task_id": task["id"],
            "title": task.get("title") or "tarefa",
            "old_start": _hhmm(old_s),
            "old_end": _hhmm(old_e),
            "new_start": _hhmm(slot[0]),
            "new_end": _hhmm(slot[1]),
            "kind": kind,
            # Motivo provisório, determinístico; o Claude reescreve depois.
            "reason": _default_reason(kind, task, day, slot, swap_with),
        }
    )


def _default_reason(kind, task, day, slot, swap_with) -> str:
    level = day.level_at(slot[0]) or "bloco"
    label = chronotype_service.BLOCK_LEVELS.get(level, {}).get("label", level)
    if kind == "bad_block":
        return f"sai de um horário de baixa energia para {label.lower()}"
    if kind == "complexity_match":
        other = (swap_with or {}).get("title", "outra tarefa")
        return f"troca de lugar com '{other}' para casar com sua energia"
    if kind == "grouping":
        tags = [t["label"] for t in task.get("tags") or []]
        return f"junto das outras de {tags[0]}" if tags else "junto das parecidas"
    return "fecha um vão e o dia termina antes"


# ── Motivos pelo Claude ─────────────────────────────────────────────────────

def _write_reasons(moves: list[dict], user_name: str) -> None:
    """
    Pede ao Claude frases curtas por movimento. Os horários NÃO são enviados
    para ele decidir — já estão decididos; ele só descreve. Se falhar, ficam os
    motivos determinísticos, que são piores em redação e corretos em conteúdo.
    """
    if not moves:
        return
    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        listing = "\n".join(
            f"{i}. '{m['title']}' de {m['old_start']} para {m['new_start']} "
            f"— tipo: {m['kind']} — rascunho: {m['reason']}"
            for i, m in enumerate(moves)
        )
        prompt = f"""Você é o Axon, assistente de produtividade. O usuário {user_name} pediu para reorganizar o dia e os movimentos abaixo JÁ ESTÃO DECIDIDOS. Escreva, para cada um, um motivo de no máximo 8 palavras, em português do Brasil, tom de parceiro próximo. Não invente horários nem sugira outros.

Tipos: bad_block = saía de horário de baixa energia; complexity_match = trocou de lugar para casar a carga mental com a energia; grouping = juntou com tarefas parecidas; compaction = fechou um vão e o dia acaba antes.

{listing}

Retorne APENAS JSON válido: {{"reasons": ["motivo 0", "motivo 1", ...]}} com exatamente {len(moves)} itens, na mesma ordem."""
        resp = client.messages.create(
            model=_MODEL, max_tokens=600, messages=[{"role": "user", "content": prompt}]
        )
        parsed = notification_analyzer._parse_json(resp.content[0].text)
        reasons = parsed.get("reasons") or []
        if len(reasons) == len(moves):
            for m, r in zip(moves, reasons):
                r = str(r or "").strip()
                if r:
                    m["reason"] = r[:80]
    except Exception as e:
        print(f"[routine_analysis] motivos pelo Claude falharam: {e}", flush=True)


# ── Análise ─────────────────────────────────────────────────────────────────

def _load_day(user_id: str, tz_name: str, target_date: date) -> tuple[dict, list[dict], int | None]:
    """
    Contexto do dia alvo. _load_user_context só olha HOJE; para amanhã (análise
    agendada) usamos os blocos e o fuso dele e trocamos a lista de tarefas.
    Tags em UMA query (tags_for_tasks), nunca por tarefa.
    """
    ctx = notification_analyzer._load_user_context(user_id, tz_name)
    today = date.fromisoformat(str(ctx["today"]))
    if target_date == today:
        tasks = ctx["tasks_today"]
        now_min = notification_analyzer._to_minutes(ctx["now_hhmm"])
    elif target_date == today + timedelta(days=1):
        tasks = ctx["tasks_tomorrow"]
        now_min = None
    else:
        tasks = tasks_service.list_tasks(user_id, scheduled_date=str(target_date))
        now_min = None
    # list_tasks já anexa `tags` em bulk; garante a chave para quem vier sem.
    for t in tasks:
        t.setdefault("tags", [])
    return ctx, tasks, now_min


def count_manual_today(user_id: str, tz_name: str) -> int:
    """
    Trava de custo: toda análise manual do dia conta — pendente, aplicada,
    dispensada, expirada E 'nothing' (agenda já boa). O que não conta é
    devolver uma proposta que já estava aberta (não analisa, não chama o Claude).
    """
    tz = user_tz.zone(tz_name)
    midnight = datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        supabase.table("routine_analyses")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("source", "manual")
        .gte("created_at", midnight.astimezone(timezone.utc).isoformat())
        .execute()
    )
    return res.count or 0


def analyze(user_id: str, tz_name: str, target_date: date, source: str = "manual") -> dict:
    """
    Gera a proposta do dia. Devolve:
      {"status": "proposal", "analysis": {...}}      há o que melhorar
      {"status": "nothing", "message": "..."}        agenda já boa
      {"status": "limit"}                            trava de custo (manual)
      {"status": "pending", "analysis": {...}}       já existe proposta aberta
    """
    if source == "manual" and count_manual_today(user_id, tz_name) >= MAX_MANUAL_ANALYSES_PER_DAY:
        return {"status": "limit", "limit": MAX_MANUAL_ANALYSES_PER_DAY}

    existing = pending_for(user_id, tz_name, target_date)
    if existing:
        return {"status": "pending", "analysis": existing}

    ctx, tasks, now_min = _load_day(user_id, tz_name, target_date)
    day = _Day(tasks, ctx["blocks"], now_min)
    before_end = day.day_end()

    moves: list[dict] = []
    _gen_bad_block(day, moves)
    _gen_complexity_match(day, moves)
    _gen_grouping(day, moves)
    _gen_compaction(day, moves)

    after_end = day.day_end()
    freed = (before_end - after_end) if (before_end and after_end) else 0
    has_bad = any(m["kind"] == "bad_block" for m in moves)
    # Fim do dia das tarefas que NÃO entram na proposta. A tela de revisão
    # recalcula o fim projetado conforme o usuário desmarca linhas, e precisa
    # deste piso para não chutar: fim = max(fixo, fins das linhas conforme
    # marcadas). Sem isso o cabeçalho mentiria ao desmarcar.
    moved_ids = {m["task_id"] for m in moves}
    fixed_end = max(
        (e for tid, (_, e) in day.occupied.items() if tid not in moved_ids),
        default=None,
    )

    if not moves or (not has_bad and freed < MIN_FREED_WITHOUT_BAD_BLOCK):
        # "Nada a mudar" também é uma análise: grava com status 'nothing' para
        # contar na trava diária. Sem isso o botão era ilimitado num dia
        # organizado (Bernardo clicou 4 vezes seguidas em 18/09) — e cada
        # clique são ~8 queries. A linha nasce resolvida; pending_for/apply/
        # dismiss só olham 'pending', então ela não aparece em lugar nenhum.
        _record_nothing(user_id, target_date, source, before_end)
        return {
            "status": "nothing",
            "message": "Sua agenda já está bem distribuída — não encontrei nada que valesse mudar.",
        }

    _write_reasons(moves, ctx.get("user_name") or "você")

    row = {
        "user_id": user_id,
        "target_date": str(target_date),
        "status": "pending",
        "proposal": moves,
        "current_day_end": _hhmm(before_end) if before_end else None,
        "proposed_day_end": _hhmm(after_end) if after_end else None,
        "freed_minutes": max(0, freed),
        "source": source,
    }
    # Não é coluna: viaja dentro do proposal como metadado da proposta, para
    # não exigir mais uma migration por um número derivado.
    row["proposal"] = {"moves": moves, "fixed_day_end": _hhmm(fixed_end) if fixed_end else None}
    try:
        res = supabase.table("routine_analyses").insert(row).execute()
        saved = res.data[0] if res.data else row
    except Exception as e:
        # Índice único: outra análise gravou uma proposta aberta para o mesmo
        # dia enquanto esta rodava. Devolve a que existe.
        print(f"[routine_analysis] insert falhou user={user_id}: {e}", flush=True)
        existing = pending_for(user_id, tz_name, target_date)
        if existing:
            return {"status": "pending", "analysis": existing}
        raise
    return {"status": "proposal", "analysis": _serialize(saved)}


def _record_nothing(user_id: str, target_date: date, source: str, day_end: int | None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("routine_analyses").insert({
            "user_id": user_id,
            "target_date": str(target_date),
            "status": "nothing",
            "proposal": {"moves": [], "fixed_day_end": _hhmm(day_end) if day_end else None},
            "current_day_end": _hhmm(day_end) if day_end else None,
            "proposed_day_end": _hhmm(day_end) if day_end else None,
            "freed_minutes": 0,
            "source": source,
            "resolved_at": now,
        }).execute()
    except Exception as e:
        # Não gravar só afrouxa a trava; a resposta ao usuário segue igual.
        print(f"[routine_analysis] registro de 'nothing' falhou user={user_id}: {e}", flush=True)


def _serialize(row: dict) -> dict:
    raw = row.get("proposal") or {}
    # Compat: proposta pode ser lista crua (formato inicial) ou o dict com moves.
    if isinstance(raw, list):
        moves, fixed = raw, None
    else:
        moves, fixed = raw.get("moves") or [], raw.get("fixed_day_end")
    return {
        "id": str(row["id"]),
        "target_date": str(row["target_date"]),
        "status": row.get("status"),
        "proposal": moves,
        "fixed_day_end": fixed,
        "current_day_end": (str(row["current_day_end"])[:5] if row.get("current_day_end") else None),
        "proposed_day_end": (str(row["proposed_day_end"])[:5] if row.get("proposed_day_end") else None),
        "freed_minutes": int(row.get("freed_minutes") or 0),
        "source": row.get("source"),
        "created_at": str(row.get("created_at") or ""),
    }


def pending_for(user_id: str, tz_name: str, target_date: date | None = None) -> dict | None:
    """
    Proposta aberta, expirando as de dias que já passaram. Com `target_date`
    devolve só a daquele dia — o card do Planning acompanha o dia selecionado
    e não pode mostrar a proposta de amanhã enquanto o usuário olha hoje.
    """
    today = datetime.now(user_tz.zone(tz_name)).date()
    try:
        supabase.table("routine_analyses").update(
            {"status": "expired", "resolved_at": datetime.now(timezone.utc).isoformat()}
        ).eq("user_id", user_id).eq("status", "pending").lt("target_date", str(today)).execute()
        q = (
            supabase.table("routine_analyses")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "pending")
        )
        if target_date is not None:
            q = q.eq("target_date", str(target_date))
        res = q.order("created_at", desc=True).limit(1).execute()
    except Exception as e:
        print(f"[routine_analysis] pending_for falhou user={user_id}: {e}", flush=True)
        return None
    return _serialize(res.data[0]) if res.data else None


def silenced_dates(user_id: str, tz_name: str) -> set[str]:
    """
    Dias (ISO) sobre os quais a sugestão pontual deve ficar calada. UMA query,
    sem laço: isto é chamado em todo `analyze_and_notify`, que roda a cada
    abertura do app (cada query no Supabase custa ~105ms — ver a regra de N+1
    deste projeto).

    Dois motivos para calar, e os dois são o mesmo princípio — a análise completa
    é um ato deliberado do usuário e já cobriu aquele dia inteiro:

    1. Proposta `pending`: ele está decidindo sobre ela. Uma sugestão pontual
       sobre a mesma tarefa pode ser aceita em paralelo, e aí a proposta passa a
       retratar uma agenda que já mudou — pior, aplicá-la depois desfaria o que
       ele acabou de aceitar.
    2. Veredito `nothing` RECENTE: a análise acabou de dizer "seu dia está bem
       estruturado". Contradizer isso minutos depois com "seu dia pode acabar 1h
       mais cedo" é o app discordando de si mesmo na aba seguinte — foi o que
       aconteceu em 21/09/2026.

    O `nothing` cala por HORAS, não pelo dia inteiro: o veredito valia para a
    agenda daquele momento. Se o usuário criar uma tarefa às 03h depois da
    análise, a sugestão sobre ela é legítima e precisa voltar a existir. 6h é a
    mesma janela do cooldown da própria análise de notificações
    (notification_service.should_analyze), para não inventar um número novo.

    Propostas de dias que já passaram não entram — a expiração de verdade fica
    em `pending_for` (que roda no mesmo ciclo do app, pelo card do Planning);
    aqui só filtramos, para não pagar um UPDATE no caminho da notificação.
    """
    today = str(datetime.now(user_tz.zone(tz_name)).date())
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=_NOTHING_SILENCE_HOURS)).isoformat()
    try:
        res = (
            supabase.table("routine_analyses")
            .select("target_date, status, created_at")
            .eq("user_id", user_id)
            .in_("status", ["pending", "nothing"])
            .gte("target_date", today)
            .execute()
        )
    except Exception as e:
        # Não saber é o estado antigo: a pontual volta a sugerir. Preferível a
        # derrubar a análise de notificações inteira.
        print(f"[routine_analysis] silenced_dates falhou user={user_id}: {e}", flush=True)
        return set()
    out: set[str] = set()
    for r in res.data or []:
        if r.get("status") == "pending":
            out.add(str(r["target_date"]))
        elif str(r.get("created_at") or "") >= cutoff:
            out.add(str(r["target_date"]))
    return out


def expire_pending_for_date(user_id: str, target_date: str) -> int:
    """
    Expira as propostas `pending` de um dia e devolve quantas. Chamado quando o
    usuário aceita uma sugestão pontual: a agenda que a proposta retratou mudou,
    e aplicá-la depois poderia desfazer o que ele acabou de aceitar.
    """
    try:
        res = (
            supabase.table("routine_analyses")
            .update({"status": "expired", "resolved_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .eq("status", "pending")
            .eq("target_date", str(target_date))
            .execute()
        )
    except Exception as e:
        print(f"[routine_analysis] expire_pending_for_date falhou user={user_id}: {e}", flush=True)
        return 0
    return len(res.data or [])


def _get(user_id: str, analysis_id: str) -> dict | None:
    res = (
        supabase.table("routine_analyses")
        .select("*")
        .eq("user_id", user_id)
        .eq("id", analysis_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def apply(user_id: str, tz_name: str, analysis_id: str, accepted_task_ids: list[str]) -> dict:
    """
    Aplica SÓ os movimentos aceitos, revalidando conflito na hora: entre ver a
    proposta e clicar pode ter passado tempo. Movimento que conflita agora é
    PULADO e informado — não aborta o resto.

    Cada movimento aplicado vira uma linha em axon_optimizations (crédito de
    horas poupadas), com source='routine_analysis'. O freed de cada um é quanto
    o fim do dia adiantou naquele passo, calculado sobre a agenda REAL.
    """
    row = _get(user_id, analysis_id)
    if not row or row.get("status") != "pending":
        return {"ok": False, "reason": "proposta não encontrada ou já resolvida"}

    target = date.fromisoformat(str(row["target_date"]))
    accepted = {str(t) for t in accepted_task_ids}
    moves = [m for m in _serialize(row)["proposal"] if str(m["task_id"]) in accepted]

    applied, skipped = [], []
    for m in moves:
        tid = str(m["task_id"])
        conflict = tasks_service.find_conflicting_task(
            user_id, str(target), m["new_start"], m["new_end"], exclude_id=tid
        )
        if conflict:
            skipped.append({"task_id": tid, "title": m["title"],
                            "reason": f"agora conflita com '{conflict.get('title', 'outra tarefa')}'"})
            continue
        # Estado ATUAL da agenda (com os movimentos anteriores já aplicados)
        # para o freed de cada passo refletir o que de fato aconteceu.
        tasks_now = tasks_service.list_tasks(user_id, scheduled_date=str(target))
        current = next((t for t in tasks_now if t["id"] == tid), None)
        if not current or current.get("status") == "done":
            skipped.append({"task_id": tid, "title": m["title"], "reason": "tarefa concluída ou removida"})
            continue
        freed = saved_time_service.freed_by_move(tasks_now, target, tid, m["new_start"], m["new_end"])
        try:
            tasks_service.update_task(user_id, tid, {"start_time": m["new_start"], "end_time": m["new_end"]})
        except Exception as e:
            skipped.append({"task_id": tid, "title": m["title"], "reason": str(e)})
            continue
        saved_time_service.record_optimization(
            user_id, tid, target, freed,
            old_start=(current.get("start_time") or "")[:5] or None,
            old_end=(current.get("end_time") or "")[:5] or None,
            new_start=m["new_start"], new_end=m["new_end"],
            source="routine_analysis",
        )
        applied.append({"task_id": tid, "title": m["title"], "freed_minutes": freed})

    status = "applied" if applied else "dismissed"
    supabase.table("routine_analyses").update(
        {"status": status, "resolved_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", analysis_id).eq("user_id", user_id).execute()

    return {"ok": True, "applied": applied, "skipped": skipped, "status": status}


def dismiss(user_id: str, analysis_id: str) -> bool:
    res = (
        supabase.table("routine_analyses")
        .update({"status": "dismissed", "resolved_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", analysis_id).eq("user_id", user_id).eq("status", "pending")
        .execute()
    )
    return bool(res.data)


# ── Agendamento ─────────────────────────────────────────────────────────────

def run_scheduled(user_id: str, tz_name: str) -> dict | None:
    """
    Análise agendada: analisa AMANHÃ e notifica. NÃO aplica nada — o Axon sempre
    pediu permissão antes de mexer na agenda, e aplicar em lote sem o usuário
    ver seria o comportamento mais agressivo do app.
    """
    tomorrow = datetime.now(user_tz.zone(tz_name)).date() + timedelta(days=1)
    # A janela do scheduler repete por 15 min. Uma análise agendada por dia
    # alvo: se já existe linha 'scheduled' para amanhã (proposta OU 'nothing'),
    # não analisa de novo — nem gasta as ~8 queries por minuto que gastava.
    try:
        prior = (
            supabase.table("routine_analyses")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("source", "scheduled")
            .eq("target_date", str(tomorrow))
            .execute()
        )
        if (prior.count or 0) > 0:
            return None
    except Exception as e:
        print(f"[routine_analysis] checagem de agendada falhou user={user_id}: {e}", flush=True)
    result = analyze(user_id, tz_name, tomorrow, source="scheduled")
    if result.get("status") != "proposal":
        return None
    analysis = result["analysis"]
    n = len(analysis["proposal"])
    freed = analysis["freed_minutes"]
    h, mnt = divmod(freed, 60)
    ganho = f"{h}h{mnt:02d}" if h and mnt else (f"{h}h" if h else f"{mnt} min")
    body = (
        f"Encontrei {n} {'ajuste' if n == 1 else 'ajustes'} para amanhã"
        + (f" — seu dia terminaria {ganho} mais cedo" if freed > 0 else "")
        + ". Quer ver?"
    )
    notification_service.create_notification(
        user_id=user_id,
        notif_type="simple",
        title="Seu dia de amanhã pode ficar melhor",
        body=body,
        action={"kind": "routine_analysis", "analysis_id": analysis["id"]},
    )
    return analysis
