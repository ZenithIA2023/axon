"""Consolida a rodada 2: acerto com repetições, consistência, notas, custo e latência."""

import json
import statistics as st
from collections import Counter, defaultdict

from common import OUT


def _load(name):
    return [json.loads(l) for l in (OUT / name).read_text().splitlines()]


agent, tasks, judge = _load("agent_r2.jsonl"), _load("tasks_r2.jsonl"), _load("judge_r2.jsonl")
notas = defaultdict(dict)
for j in judge:
    for m, v in j["notas"].items():
        notas[j["case"]][m] = v.get("nota")


def med(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(st.mean(xs), 1) if xs else None


AG = ["sonnet-5.5", "gemini-3.8-flash", "gemini-3.5-lite", "gpt-6-luna"]

for voice, titulo, casos_j in ((False, "A. Agente — TEXTO (10 cenários novos × 3)", ("H6", "H8", "H11")),
                               (True, "A. Agente — VOZ (6 cenários × 2)", ("VOZ_H3", "VOZ_H6"))):
    print(f"\n=== {titulo} ===")
    print(f"{'modelo':18s} {'acerto':>7s} {'nota':>5s} {'US$/msg':>8s} {'1ª resp':>8s} {'total':>7s}  falhas (cenário×vezes)")
    for m in AG:
        rs = [r for r in agent if r["model"] == m and r["voice"] == voice]
        ok = sum(r["passed"] for r in rs)
        falhas = Counter(r["scenario"] for r in rs if not r["passed"])
        print(f"{m:18s} {ok:>3d}/{len(rs):<3d} {str(med([notas[c].get(m) for c in casos_j])):>5s} "
              f"{st.mean(r['cost'] for r in rs):8.4f} {st.median(r['lat_first'] for r in rs):7.1f}s "
              f"{st.median(r['lat_total'] for r in rs):6.1f}s  {dict(falhas) or '-'}")

print("\n=== B. Redação (3 tarefas × 3 repetições) — nota média [mín–máx] por tarefa ===")
B = ["insights", "descobertas", "relatorio"]
for m in ["gpt-6.1-sol", "sonnet-5.5", "gemini-3.8-flash", "gemini-3.5-lite", "gpt-6-luna"]:
    rs = [r for r in tasks if r["model"] == m and r["task"] in B]
    ok = sum(r["passed"] for r in rs)
    partes, todas = [], []
    for t in B:
        ns = [notas[f"{t}#r{k}"].get(m) for k in range(3)]
        ns = [n for n in ns if isinstance(n, (int, float))]
        todas += ns
        partes.append(f"{t[:11]} {med(ns)} [{min(ns)}–{max(ns)}]")
    print(f"{m:18s} auto {ok}/{len(rs)}  geral {med(todas):>4}  US$ {st.mean(r['cost'] for r in rs):.4f}  "
          f"{st.median(r['latency'] for r in rs):5.1f}s  " + " | ".join(partes))

print("\n=== C. Curtos (6 tarefas × 3 repetições; juiz na repetição 0) ===")
C = ["notif_analise_bloco_ruim", "notif_analise_tudo_feito", "notif_reescrita_amanha",
     "notif_reescrita_compactacao", "notif_alteracao", "rotina_motivos"]
for m in AG:
    rs = [r for r in tasks if r["model"] == m and r["task"] in C]
    ok = sum(r["passed"] for r in rs)
    falhas = Counter(r["task"] for r in rs if not r["passed"])
    print(f"{m:18s} auto {ok}/{len(rs)}  nota {med([notas[c].get(m) for c in C])}  "
          f"US$ {st.mean(r['cost'] for r in rs):.5f}  {st.median(r['latency'] for r in rs):.1f}s  falhas {dict(falhas) or '-'}")

print("\nGasto rodada 2:", json.loads((OUT / "spend.json").read_text()))
