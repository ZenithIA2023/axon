"""
Grupo A — agente com ferramentas (chat/voz).

Prompt de sistema e ferramentas REAIS (prompts.build_agent_prompt e
agent_tools.tools_for_conversation). As ferramentas NÃO executam: um executor
falso responde com o estado de uma usuária fictícia (Marina), no mesmo formato
das respostas reais, e registra o que o modelo pediu. As datas passam pelo
mesmo `_resolve_date_fields` de produção antes da correção.

Retomável: pula (modelo, cenário, run) que já tem resultado sem erro.

Uso: python3 agent_eval.py <modelo> [<modelo> ...] [--runs N] [--only S1,S3]
"""

import copy
import json
import sys
from datetime import date, datetime, timedelta

from common import MODELS, OUT, BudgetExceeded, OutOfCredit, call, tool_results_message

from services import agent_tools, prompts, user_tz  # noqa: E402

TZ = "America/Sao_Paulo"
HOJE = datetime.now(user_tz.zone(TZ)).date()
AMANHA = HOJE + timedelta(days=1)


def _proxima(weekday: int) -> date:
    """Próxima ocorrência do dia da semana (0=seg), a partir de amanhã."""
    d = HOJE + timedelta(days=1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d


SEXTA = _proxima(4)

ESTADO = {
    "tasks": [
        {"id": "t1", "title": "Relatório trimestral", "status": "todo", "task_type": "task",
         "priority": "high", "scheduled_date": str(HOJE), "start_time": "09:00:00", "end_time": "11:00:00"},
        {"id": "t2", "title": "Reunião com o Pedro", "status": "todo", "task_type": "event",
         "priority": "medium", "scheduled_date": str(HOJE), "start_time": "14:00:00", "end_time": "15:00:00"},
        {"id": "t3", "title": "Academia", "status": "todo", "task_type": "task",
         "priority": "medium", "scheduled_date": str(HOJE), "start_time": "18:00:00", "end_time": "19:00:00"},
        {"id": "t4", "title": "Revisar contrato", "status": "todo", "task_type": "task",
         "priority": "medium", "scheduled_date": str(AMANHA), "start_time": "10:00:00", "end_time": "11:00:00"},
    ],
    "routines": [
        {"id": "r1", "name": "Inglês", "status": "active", "items_count": 2, "streak": 5},
        {"id": "r2", "name": "Leitura", "status": "active", "items_count": 1, "streak": 12},
    ],
    "objectives": [
        {"id": "o1", "title": "Aprender alemão", "done_steps": 40, "total_steps": 257, "step_label": "aulas"},
    ],
    "memories": [{"id": "m1", "content": "Prefere tarefas difíceis logo cedo, antes das 11h."}],
    "tags": [{"id": "tg1", "name": "Trabalho"}, {"id": "tg2", "name": "Saúde"}],
}


def _hhmm(t: str | None) -> str:
    return (t or "")[:5]


def _to_min(t: str) -> int:
    h, m = t[:5].split(":")
    return int(h) * 60 + int(m)


class FakeExecutor:
    def __init__(self):
        self.state = copy.deepcopy(ESTADO)
        self.calls: list[tuple[str, dict]] = []

    def run(self, name: str, inp: dict) -> dict:
        try:
            inp = agent_tools._resolve_date_fields(dict(inp), TZ)
        except Exception:
            pass
        self.calls.append((name, inp))
        st = self.state
        tid = inp.get("task_id")
        if name == "listar_tarefas":
            ts = st["tasks"]
            if inp.get("scheduled_date"):
                ts = [t for t in ts if t["scheduled_date"] == str(inp["scheduled_date"])]
            if inp.get("status"):
                ts = [t for t in ts if t["status"] == inp["status"]]
            return {"ok": True, "count": len(ts), "tasks": ts}
        if name == "criar_tarefa":
            d = str(inp.get("scheduled_date") or HOJE)
            s, e = inp.get("start_time"), inp.get("end_time")
            if s and not inp.get("confirmar_conflito"):
                try:
                    s_m = _to_min(s)
                    e_m = _to_min(e) if e else s_m + 60
                except (ValueError, AttributeError):
                    s_m = e_m = None
                for t in st["tasks"] if s_m is not None else []:
                    if t["scheduled_date"] == d and t.get("start_time"):
                        if s_m < _to_min(t["end_time"]) and _to_min(t["start_time"]) < e_m:
                            return {"ok": False, "erro": "conflito_de_horario",
                                    "conflito": {"title": t["title"], "start_time": t["start_time"],
                                                 "end_time": t["end_time"], "scheduled_date": d},
                                    "instrucao": ("A tarefa NÃO foi criada. Avise o usuário que esse "
                                                  "horário se sobrepõe à tarefa acima e pergunte se ele "
                                                  "quer manter assim mesmo ou escolher outro horário. "
                                                  "Se ele quiser manter, repita esta chamada com "
                                                  "confirmar_conflito=true. Se preferir outro horário, "
                                                  "chame de novo com o horário novo.")}
            nova = {"id": f"t{len(st['tasks']) + 1}", "status": "todo", "task_type": "task",
                    **{k: v for k, v in inp.items() if k != "confirmar_conflito"}, "scheduled_date": d}
            st["tasks"].append(nova)
            return {"ok": True, "task": nova}
        if name in ("atualizar_tarefa", "deletar_tarefa", "listar_subtarefas", "criar_subtarefa"):
            alvo = next((t for t in st["tasks"] if t["id"] == tid), None)
            if not alvo:
                return {"ok": False, "error": "Tarefa não encontrada"}
            if name == "atualizar_tarefa":
                alvo.update({k: v for k, v in inp.items() if k != "task_id"})
                return {"ok": True, "task": alvo}
            if name == "deletar_tarefa":
                return {"ok": True, "deleted": tid}
            if name == "listar_subtarefas":
                return {"ok": True, "count": 0, "subtasks": []}
            return {"ok": True, "subtask": {"id": f"s{len(self.calls)}", "task_id": tid,
                                            "title": inp.get("title"), "done": False}}
        if name == "listar_rotinas":
            return {"ok": True, "count": len(st["routines"]), "routines": st["routines"]}
        if name in ("pausar_rotina", "retomar_rotina", "deletar_rotina"):
            r = next((x for x in st["routines"] if x["id"] == inp.get("routine_id")), None)
            if not r:
                return {"ok": False, "error": "Rotina não encontrada"}
            return {"ok": True, "routine": {**r, "status": "paused" if name == "pausar_rotina" else r["status"]}}
        if name == "criar_rotina":
            return {"ok": True, "routine": {"id": "r9", "name": inp.get("name"), "status": "active",
                                            "items": inp.get("items")}}
        if name == "listar_objetivos":
            return {"ok": True, "count": len(st["objectives"]), "objectives": st["objectives"]}
        if name in ("criar_objetivo", "atualizar_objetivo"):
            return {"ok": True, "objective": {"id": inp.get("objective_id", "o9"), **inp}}
        if name == "listar_memorias":
            return {"ok": True, "count": len(st["memories"]), "memories": st["memories"]}
        if name in ("salvar_memoria", "atualizar_memoria"):
            return {"ok": True, "memory": {"id": inp.get("memory_id", "m9"),
                                           "content": inp.get("content") or inp.get("new_content")}}
        if name == "listar_tags":
            return {"ok": True, "count": 2, "tags": st["tags"]}
        if name == "listar_etapas":
            return {"ok": True, "objective": st["objectives"][0], "entries": []}
        return {"ok": True}


MUT = agent_tools.MUTATING_TOOLS | {"salvar_memoria", "atualizar_memoria"}


def _mut(calls):
    return [(n, i) for n, i in calls if n in MUT]


def _find(calls, name):
    return [i for n, i in calls if n == name]


# ── Cenários: (id, mensagem, corretor(calls, texto) -> (passou, nota)) ──────
def g_s1(c, t):
    ok = [i for i in _find(c, "criar_tarefa") if "dentist" in (i.get("title") or "").lower()
          and str(i.get("scheduled_date")) == str(AMANHA) and _hhmm(i.get("start_time")) == "15:00"]
    return bool(ok) and len(_mut(c)) == 1, f"mut={_mut(c)}"


def g_s2(c, t):
    tl = t.lower()
    ok = bool(_find(c, "listar_tarefas")) and not _mut(c) and all(
        k in tl for k in ("relatório", "pedro", "academia"))
    return ok, f"calls={[n for n, _ in c]}"


def g_s3(c, t):
    ok = [i for i in _find(c, "atualizar_tarefa") if i.get("task_id") == "t2" and _hhmm(i.get("start_time")) == "16:00"]
    return bool(ok) and all(n == "atualizar_tarefa" for n, _ in _mut(c)), f"mut={_mut(c)}"


def g_s4(c, t):
    ok = [i for i in _find(c, "atualizar_tarefa") if i.get("task_id") == "t1" and i.get("status") == "done"]
    return bool(ok) and len(_mut(c)) == 1, f"mut={_mut(c)}"


def g_s5(c, t):
    for i in _find(c, "criar_rotina"):
        for it in i.get("items") or []:
            if set(it.get("days_of_week") or []) == {0, 2, 4} and _hhmm(it.get("start_time")) == "07:00":
                return True, ""
    return False, f"mut={_mut(c)}"


def g_s6(c, t):
    ok = [i for i in _find(c, "criar_objetivo") if "sapiens" in (i.get("title") or "").lower()
          and int(i.get("total_steps") or 0) == 450 and str(i.get("deadline") or "").startswith(f"{HOJE.year}-12-31")]
    return bool(ok), f"mut={_mut(c)}"


def g_s7(c, t):
    ok = [i for i in _find(c, "pausar_rotina") if i.get("routine_id") == "r1"
          and str(i.get("paused_until") or "").startswith(f"{HOJE.year}-10-20")]
    return bool(ok) and len(_mut(c)) == 1, f"mut={_mut(c)}"


def g_s8(c, t):
    mem = [i for n, i in c if n in ("salvar_memoria", "atualizar_memoria")
           and "21" in (i.get("content") or i.get("new_content") or "")]
    return bool(mem) and not _find(c, "criar_tarefa"), f"mut={_mut(c)}"


def g_s9(c, t):
    return not _mut(c) and len(t.strip()) > 40, f"mut={_mut(c)} len={len(t)}"


def g_s10(c, t):
    confirmou = [i for i in _find(c, "criar_tarefa") if i.get("confirmar_conflito")]
    tl = t.lower()
    avisou = any(k in tl for k in ("pedro", "reunião", "conflit", "sobrep", "choca", "mesmo horário"))
    return bool(_find(c, "criar_tarefa")) and not confirmou and avisou, f"mut={_mut(c)}"


def g_s11(c, t):
    return not _find(c, "deletar_tarefa") and len(t.strip()) > 0, f"mut={_mut(c)}"


def g_s12(c, t):
    ok = [i for i in _find(c, "criar_tarefa") if "aluguel" in (i.get("title") or "").lower()
          and str(i.get("scheduled_date")) == str(SEXTA) and i.get("priority") == "high"
          and (not i.get("start_time") or _to_min(i["start_time"]) < 12 * 60)]
    return bool(ok), f"mut={_mut(c)}"


def g_s13(c, t):
    subs = [i for i in _find(c, "criar_subtarefa") if i.get("task_id") == "t1"]
    titles = " ".join((i.get("title") or "").lower() for i in subs)
    return len(subs) == 2 and "colet" in titles and "gráfico" in titles, f"mut={_mut(c)}"


SCENARIOS = [
    ("S1", "Marca dentista amanhã às 15h", g_s1),
    ("S2", "O que eu tenho pra hoje?", g_s2),
    ("S3", "Muda a reunião com o Pedro pra 16h", g_s3),
    ("S4", "Já terminei o relatório trimestral", g_s4),
    ("S5", "Cria uma rotina de academia segunda, quarta e sexta às 7h", g_s5),
    ("S6", "Quero ler o livro Sapiens, são 450 páginas, até o fim do ano", g_s6),
    ("S7", "Pausa minha rotina de inglês até dia 20", g_s7),
    ("S8", "A partir de agora não marque nada pra mim depois das 21h, é meu horário com a família", g_s8),
    ("S9", "Tô me sentindo meio cansada hoje, alguma dica pra render melhor?", g_s9),
    ("S10", "Marca uma call com o cliente hoje às 14h30", g_s10),
    ("S11", "Apaga aquela tarefa", g_s11),
    ("S12", "Coloca pagar aluguel na sexta de manhã, é prioridade alta", g_s12),
    ("S13", "Adiciona na tarefa do relatório os passos: coletar dados e montar os gráficos", g_s13),
]

PERFIL = {"nome": "Marina", "cronotipo": "Matutino", "timezone": TZ, "schedule_type": "flexible",
          "qualidade_sono": "B", "respostas": {}}


def run_one(model_key: str, sid: str, msg: str, grader, voice: bool = False) -> dict:
    prov = MODELS[model_key][0]
    system = prompts.build_agent_prompt(PERFIL, [m["content"] for m in ESTADO["memories"]], voice=voice)
    tools = agent_tools.tools_for_conversation("regular", voice=voice)
    ex = FakeExecutor()
    convo = [{"role": "user", "content": msg}]
    text, cost, rounds, lat_first, lat_total, err = "", 0.0, 0, None, 0.0, None
    usage_rounds = []
    # Sonnet 4.6 com thinking (é o que o chat usa em produção); voz desliga.
    thinking = "off" if voice else "adaptive"
    for _ in range(5):
        r = call(model_key, system, convo, tools=tools, max_tokens=4096, thinking=thinking)
        rounds += 1
        cost += r.cost
        lat_total += r.latency
        usage_rounds.append(r.usage)
        if lat_first is None:
            lat_first = r.latency
        if r.error:
            err = r.error
            break
        text += r.text
        if not r.tool_calls:
            break
        convo.append(r.raw_assistant)
        outs = [(tc["id"], ex.run(tc["name"], tc["input"])) for tc in r.tool_calls]
        convo.extend(tool_results_message(prov, outs))
    passed, note = (False, f"erro: {err}") if err else grader(ex.calls, text)
    return {"model": model_key, "scenario": sid, "passed": passed, "note": note,
            "calls": ex.calls, "text": text, "cost": cost, "rounds": rounds,
            "lat_first": round(lat_first or 0, 2), "lat_total": round(lat_total, 2),
            "usage": usage_rounds, "error": err}


def _done_keys(outf):
    if not outf.exists():
        return set()
    keys = set()
    for l in outf.read_text().splitlines():
        r = json.loads(l)
        if not r.get("error"):
            keys.add((r["model"], r["scenario"], r.get("run", 0)))
    return keys


def main():
    args = sys.argv[1:]
    runs, only, models = 1, None, []
    i = 0
    while i < len(args):
        if args[i] == "--runs":
            runs = int(args[i + 1]); i += 2
        elif args[i] == "--only":
            only = set(args[i + 1].split(",")); i += 2
        else:
            models.append(args[i]); i += 1
    outf = OUT / "agent.jsonl"
    feitos = _done_keys(outf)
    for m in models:
        for run in range(runs):
            for sid, msg, g in SCENARIOS:
                if (only and sid not in only) or (m, sid, run) in feitos:
                    continue
                try:
                    res = run_one(m, sid, msg, g)
                except (BudgetExceeded, OutOfCredit) as e:
                    print("PARADO:", e, flush=True); return
                res["run"] = run
                with outf.open("a") as f:
                    f.write(json.dumps(res, ensure_ascii=False, default=str) + "\n")
                print(f"{m:18s} {sid:4s} {'OK ' if res['passed'] else 'xx '} "
                      f"${res['cost']:.4f} r={res['rounds']} {res['lat_total']}s {res['note'][:90]}", flush=True)


if __name__ == "__main__":
    main()
