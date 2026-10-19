"""Consolida agent.jsonl, tasks.jsonl e judge.jsonl em tabelas por grupo."""

import json
import statistics as st
from collections import defaultdict

from common import MODELS, OUT

GRUPOS = {
    "B_redacao": ["insights", "descobertas", "relatorio"],
    "C_curtos": ["notif_analise_bloco_ruim", "notif_analise_tudo_feito", "notif_reescrita_amanha",
                 "notif_reescrita_compactacao", "notif_alteracao", "rotina_motivos"],
}


def _load(name):
    p = OUT / name
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


agent, tasks, judge = _load("agent.jsonl"), _load("tasks.jsonl"), _load("judge.jsonl")

# S5 ("rotina de academia seg/qua/sex às 7h") não diz a duração. Perguntar
# antes de criar é tão válido quanto assumir 1h — o corretor original só
# aceitava criar. Recorrige: passa quem criou certo OU perguntou sem mutar.
_MUT_S5 = {"criar_rotina", "criar_tarefa", "atualizar_tarefa", "deletar_tarefa"}
for r in agent:
    if r["scenario"] == "S5" and not r["passed"] and not r.get("error"):
        mutou = any(c[0] in _MUT_S5 for c in r["calls"])
        if not mutou and "?" in r["text"]:
            r["passed"] = True
notas = defaultdict(dict)  # case -> model -> nota
coment = defaultdict(dict)
for j in judge:
    for m, v in j["notas"].items():
        notas[j["case"]][m] = v.get("nota")
        coment[j["case"]][m] = v.get("comentario")


def media(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.mean(xs), 1) if xs else None


print("\n=== A. Agente (chat/voz) — 13 cenários ===")
print(f"{'modelo':18s} {'acerto':>7s} {'nota':>5s} {'US$/msg':>8s} {'lat.1ª':>7s} {'lat.tot':>8s} falhas")
linhas = []
for m in MODELS:
    rs = [r for r in agent if r["model"] == m and not r.get("error")]
    if not rs:
        continue
    ok = sum(r["passed"] for r in rs)
    nota = media([notas[s].get(m) for s in ("S2", "S9", "S10")])
    custo = st.mean(r["cost"] for r in rs)
    l1 = st.median(r["lat_first"] for r in rs)
    lt = st.median(r["lat_total"] for r in rs)
    falhas = ",".join(r["scenario"] for r in rs if not r["passed"])
    erros = sum(1 for r in agent if r["model"] == m and r.get("error"))
    linhas.append((ok / len(rs), m, f"{m:18s} {ok:>3d}/{len(rs):<3d} {str(nota):>5s} {custo:8.4f} {l1:6.1f}s {lt:7.1f}s {falhas}"
                   + (f" (+{erros} erros)" if erros else "")))
for _, _, l in sorted(linhas, reverse=True):
    print(l)

for g, cases in GRUPOS.items():
    print(f"\n=== {g} ===")
    print(f"{'modelo':18s} {'auto':>6s} {'nota':>5s} {'US$/caso':>9s} {'lat':>6s}  " + " ".join(c[:10] for c in cases))
    linhas = []
    for m in MODELS:
        rs = [r for r in tasks if r["model"] == m and r["task"] in cases and not r.get("error")]
        if not rs:
            continue
        ok = sum(r["passed"] for r in rs)
        n = media([notas[c].get(m) for c in cases])
        custo = st.mean(r["cost"] for r in rs)
        lat = st.median(r["latency"] for r in rs)
        por = " ".join(f"{('✓' if next((r['passed'] for r in rs if r['task'] == c), False) else '✗')}{notas[c].get(m, '-')!s:>2}".ljust(10) for c in cases)
        linhas.append((n or 0, f"{m:18s} {ok:>2d}/{len(rs):<3d} {str(n):>5s} {custo:9.5f} {lat:5.1f}s  {por}"))
    for _, l in sorted(linhas, reverse=True):
        print(l)

print("\nGasto:", json.loads((OUT / "spend.json").read_text()))
