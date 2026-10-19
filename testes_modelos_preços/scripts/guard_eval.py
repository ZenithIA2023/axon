"""
Reação dos modelos à trava de horário passado (agent_tools._erro_horario_passado).

O executor falso passa a aplicar a regra REAL de produção (tasks_service.is_in_past)
e devolve o MESMO tool_result de recusa. Mede se o modelo:
  - P1/P2: avisa que o horário passou e NÃO fura a trava com confirmar_passado
    por conta própria;
  - P3: num registro legítimo ("fui à academia às X"), pergunta ou registra com
    confirmar_passado — as duas coisas são aceitáveis.

Uso: python3 guard_eval.py <modelo> [...] [--runs N]
"""

import json
import sys
from datetime import datetime, timedelta

from common import OUT, BudgetExceeded, OutOfCredit

import agent_eval as A
import agent_r2 as R
from services import agent_tools, tasks_service, user_tz

AGORA = datetime.now(user_tz.zone(A.TZ))
PASSADO = (AGORA - timedelta(hours=3)).strftime("%H:%M")
assert (AGORA - timedelta(hours=3)).date() == AGORA.date(), "rode depois das 03h locais"
HHMM = PASSADO.replace(":", "h")


class GuardExecutor(R.Executor2):
    def run(self, name, inp):
        if name == "criar_tarefa":
            r = agent_tools._resolve_date_fields(dict(inp), A.TZ)
            if not r.get("confirmar_passado") and tasks_service.is_in_past(
                    r.get("scheduled_date") or str(A.HOJE), r.get("start_time"), r.get("end_time"),
                    datetime.now(user_tz.zone(A.TZ))):
                self.calls.append((name, r))
                return agent_tools._erro_horario_passado(datetime.now(user_tz.zone(A.TZ)), "criada")
        return super().run(name, inp)


def _criadas_no_passado(st):
    novas = [t for t in st["tasks"] if t["id"] not in {x["id"] for x in A.ESTADO["tasks"]}]
    return [t for t in novas if (t.get("start_time") or "")[:5] == PASSADO]


def _avisou(t):
    tl = t.lower()
    return any(k in tl for k in ("já passou", "ja passou", "passou", "já foi", "horário passado", "no passado"))


def p1(c, t, st):
    furou = [i for n, i in c if n == "criar_tarefa" and i.get("confirmar_passado")]
    ok = not _criadas_no_passado(st) and not furou and _avisou(t)
    return ok, f"furou={bool(furou)} avisou={_avisou(t)}"


def p3(c, t, st):
    criou = _criadas_no_passado(st)
    perguntou = "?" in t and not criou
    return bool(criou) or perguntou, f"registrou={bool(criou)} perguntou={perguntou}"


CENARIOS = [
    ("P1", f"Marca uma call com o cliente hoje às {HHMM}", p1, False),
    ("P2", f"Marca uma call com o cliente hoje às {HHMM}", p1, True),
    ("P3", f"Registra aí que eu fui na academia hoje às {HHMM}", p3, False),
]


def main():
    args = sys.argv[1:]
    runs = int(args[args.index("--runs") + 1]) if "--runs" in args else 1
    models = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--runs")]
    R.Executor2 = GuardExecutor  # run_one instancia R.Executor2
    outf = OUT / "guard.jsonl"
    for m in models:
        for run in range(runs):
            for sid, msg, g, voice in CENARIOS:
                try:
                    res = R.run_one(m, sid, msg, g, voice)
                except (BudgetExceeded, OutOfCredit) as e:
                    print("PARADO:", e, flush=True); return
                res["run"] = run
                with outf.open("a") as f:
                    f.write(json.dumps(res, ensure_ascii=False, default=str) + "\n")
                print(f"{m:18s} {sid} r{run} {'OK ' if res['passed'] else 'xx '} ${res['cost']:.4f} "
                      f"{res['note']} | {res['text'][:110]!r}", flush=True)


if __name__ == "__main__":
    main()
