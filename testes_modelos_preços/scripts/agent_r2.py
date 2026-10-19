"""
Rodada 2 do grupo A — cenários mais difíceis + configuração da voz.

Reaproveita o executor falso e a usuária fictícia da rodada 1 (agent_eval).
Os corretores daqui recebem também o ESTADO final do executor, para checar o
resultado (ex.: "a academia ficou amanhã às 18h") e não só a chamada.

Uso: python3 agent_r2.py <modelo> [...] [--runs N] [--voice] [--only H1,H3]
"""

import json
import sys
from datetime import timedelta

from common import MODELS, OUT, BudgetExceeded, OutOfCredit, call, tool_results_message

import agent_eval as A
from agent_eval import AMANHA, HOJE, FakeExecutor, _find, _hhmm, _mut
from services import agent_tools, prompts  # noqa: E402

# "Terça da semana que vem": a terça da semana (seg–dom) seguinte à atual.
SEG_PROXIMA = HOJE + timedelta(days=7 - HOJE.weekday())
TERCA_PROXIMA = SEG_PROXIMA + timedelta(days=1)


class Executor2(FakeExecutor):
    """Igual ao da rodada 1, mas deletar_tarefa remove de fato do estado."""

    def run(self, name, inp):
        out = super().run(name, inp)
        if name == "deletar_tarefa" and out.get("ok"):
            self.state["tasks"] = [t for t in self.state["tasks"] if t["id"] != inp.get("task_id")]
        return out


def _perguntou_sem_mutar(c, t):
    return not _mut(c) and "?" in t


def h1(c, t, st):
    dent = [i for i in _find(c, "criar_tarefa") if "dentist" in (i.get("title") or "").lower()
            and str(i.get("scheduled_date")) == str(AMANHA) and _hhmm(i.get("start_time")) == "09:00"]
    mov = [i for i in _find(c, "atualizar_tarefa") if i.get("task_id") == "t4" and _hhmm(i.get("start_time")) == "15:00"]
    return bool(dent and mov), f"mut={_mut(c)}"


def h2(c, t, st):
    ok = [i for i in _find(c, "criar_tarefa") if "carro" in (i.get("title") or "").lower()
          and str(i.get("scheduled_date")) == str(TERCA_PROXIMA) and _hhmm(i.get("start_time")) == "08:00"]
    datas = [i.get("scheduled_date") for i in _find(c, "criar_tarefa")]
    return bool(ok), f"datas={datas} esperado={TERCA_PROXIMA}"


def h3(c, t, st):
    acad = [x for x in st["tasks"] if "academia" in (x.get("title") or "").lower()]
    amanha = [x for x in acad if x["scheduled_date"] == str(AMANHA) and _hhmm(x.get("start_time")) == "18:00"]
    hoje_ativa = [x for x in acad if x["scheduled_date"] == str(HOJE) and x.get("status") == "todo"]
    return bool(amanha) and not hoje_ativa, f"mut={_mut(c)}"


def h5(c, t, st):
    mae = [i for i in _find(c, "criar_tarefa") if "mãe" in (i.get("title") or "").lower()
           and str(i.get("scheduled_date")) == str(AMANHA) and _hhmm(i.get("start_time")) == "19:00"]
    mem = [i for i in _find(c, "salvar_memoria") if "10" in (i.get("content") or "")]
    return bool(mae and mem), f"mut={_mut(c)}"


def h6(c, t, st):
    return bool(_find(c, "listar_objetivos")) and not _mut(c) and "217" in t, f"calls={[n for n, _ in c]}"


def h7(c, t, st):
    ok = [i for i in _find(c, "criar_tarefa") if "estud" in (i.get("title") or "").lower()
          and str(i.get("scheduled_date")) == str(AMANHA) and _hhmm(i.get("start_time")) == "13:00"
          and _hhmm(i.get("end_time")) == "15:00"]
    return bool(ok), f"mut={_mut(c)}"


def h8(c, t, st):
    return not _mut(c) and len(t.strip()) > 40, f"mut={_mut(c)}"


def h9(c, t, st):
    ok = [i for i in _find(c, "criar_tarefa") if i.get("confirmar_conflito")
          and str(i.get("scheduled_date")) == str(HOJE) and _hhmm(i.get("start_time")) == "14:30"]
    return bool(ok), f"mut={_mut(c)}"


def h10(c, t, st):
    for i in _find(c, "criar_rotina"):
        for it in i.get("items") or []:
            if (set(it.get("days_of_week") or []) == {0, 1, 2, 3, 4} and it.get("duration_minutes") == 30
                    and (it.get("not_before") or "") >= "12:00"):
                return True, ""
    return _perguntou_sem_mutar(c, t), f"mut={_mut(c)}"


def h11(c, t, st):
    listou = [i for i in _find(c, "listar_tarefas") if str(i.get("scheduled_date")) == str(AMANHA)] \
        or bool(_find(c, "listar_tarefas"))
    return bool(listou) and not _mut(c) and "contrato" in t.lower(), f"calls={[n for n, _ in c]}"


SCENARIOS = [
    ("H1", "Amanhã de manhã tenho dentista às 9h, então empurra o revisar contrato pra tarde, umas 15h", h1),
    ("H2", "Marca a revisão do carro na terça da semana que vem às 8h", h2),
    ("H3", "Hoje não vai dar pra ir na academia, joga pra amanhã no mesmo horário", h3),
    ("H5", "Me lembra de ligar pra minha mãe amanhã às 19h. Ah, e guarda que eu prefiro reuniões só depois das 10h", h5),
    ("H6", "Quantas aulas de alemão ainda faltam?", h6),
    ("H7", "Bloqueia das 13h às 15h amanhã pra eu estudar", h7),
    ("H8", "Se eu marcar academia às 6h amanhã, isso atrapalha meu sono?", h8),
    ("H9", [
        {"role": "user", "content": "Marca uma call com o cliente hoje às 14h30"},
        {"role": "assistant", "content": "Esse horário se sobrepõe à Reunião com o Pedro (14h–15h). "
                                         "Quer manter assim mesmo ou prefere outro horário?"},
        {"role": "user", "content": "Pode manter assim mesmo"},
    ], h9),
    ("H10", "Quero estudar inglês 30 minutos todo dia útil, à tarde", h10),
    ("H11", "O que tenho amanhã? Dá pra encaixar uma corrida de 40 minutos de manhã?", h11),
]

# Na voz: um subconjunto, incluindo os da rodada 1 mais usados por voz.
VOICE_SET = {"S1", "S3", "H1", "H3", "H6", "H9"}


def run_one(model_key, sid, msg, grader, voice):
    prov = A.MODELS[model_key][0]
    system = prompts.build_agent_prompt(A.PERFIL, [m["content"] for m in A.ESTADO["memories"]], voice=voice)
    tools = agent_tools.tools_for_conversation("regular", voice=voice)
    ex = Executor2()
    convo = list(msg) if isinstance(msg, list) else [{"role": "user", "content": msg}]
    text, cost, rounds, lat_first, lat_total, err = "", 0.0, 0, None, 0.0, None
    for _ in range(5):
        r = call(model_key, system, convo, tools=tools, max_tokens=4096, thinking="off" if voice else "adaptive")
        rounds += 1
        cost += r.cost
        lat_total += r.latency
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
    if err:
        passed, note = False, f"erro: {err}"
    else:
        try:
            passed, note = grader(ex.calls, text, ex.state)
        except TypeError:
            passed, note = grader(ex.calls, text)
    return {"model": model_key, "scenario": sid, "voice": voice, "passed": passed, "note": note,
            "calls": ex.calls, "text": text, "cost": cost, "rounds": rounds,
            "lat_first": round(lat_first or 0, 2), "lat_total": round(lat_total, 2), "error": err}


def main():
    args = sys.argv[1:]
    runs, only, voice, models = 1, None, False, []
    i = 0
    while i < len(args):
        if args[i] == "--runs":
            runs = int(args[i + 1]); i += 2
        elif args[i] == "--only":
            only = set(args[i + 1].split(",")); i += 2
        elif args[i] == "--voice":
            voice = True; i += 1
        else:
            models.append(args[i]); i += 1
    cenarios = SCENARIOS
    if voice:
        cenarios = [s for s in A.SCENARIOS + SCENARIOS if s[0] in VOICE_SET]
    outf = OUT / "agent_r2.jsonl"
    feitos = set()
    if outf.exists():
        for l in outf.read_text().splitlines():
            r = json.loads(l)
            if not r.get("error"):
                feitos.add((r["model"], r["scenario"], r["voice"], r["run"]))
    for m in models:
        for run in range(runs):
            for sid, msg, g in cenarios:
                if (only and sid not in only) or (m, sid, voice, run) in feitos:
                    continue
                try:
                    res = run_one(m, sid, msg, g, voice)
                except (BudgetExceeded, OutOfCredit) as e:
                    print("PARADO:", e, flush=True); return
                res["run"] = run
                with outf.open("a") as f:
                    f.write(json.dumps(res, ensure_ascii=False, default=str) + "\n")
                print(f"{m:18s} {'voz' if voice else 'txt'} {sid:4s} r{run} {'OK ' if res['passed'] else 'xx '} "
                      f"${res['cost']:.4f} {res['lat_first']}s/{res['lat_total']}s {res['note'][:80]}", flush=True)


if __name__ == "__main__":
    main()
