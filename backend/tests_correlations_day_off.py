"""
Testes do motor de Descobertas com dias livres (`correlations_service`).

O bug: quem descansa todo domingo recebia "nos seus domingos a produtividade
vai a zero" — o motor contava o dia livre como desempenho. Agora o dia livre
fica fora das métricas de tarefas e produtividade, mas continua no humor.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_correlations_day_off.py
"""

import random
import sys
import types
from datetime import date, timedelta

# O módulo importa claude_service (que importa supabase), mas o motor é puro.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services.correlations_service import _metric_value, find_correlations  # noqa: E402

ok = 0
falhas = 0


def eq(nome: str, obtido, esperado) -> None:
    global ok, falhas
    if obtido == esperado:
        ok += 1
        print(f"  ok  {nome}")
    else:
        falhas += 1
        print(f"FALHA {nome}: obtido {obtido!r}, esperado {esperado!r}")


def _rows(marcar_dia_livre: bool) -> list[dict]:
    """6 semanas; domingo é descanso (0 tarefas, produtividade 1, humor alto)."""
    rnd = random.Random(7)
    inicio = date(2026, 8, 3)  # segunda-feira
    rows = []
    for k in range(42):
        d = inicio + timedelta(days=k)
        domingo = d.weekday() == 6
        rows.append({
            "data": str(d),
            "dia_semana": "Domingo" if domingo else "Outro",
            "tarefas_concluidas": 0 if domingo else rnd.choice([3, 4, 4, 5]),
            "produtividade_percebida_1a5": 1 if domingo else rnd.choice([3, 4]),
            "humor_1a5": 5 if domingo else rnd.choice([3, 3, 4]),
            "dia_livre": domingo and marcar_dia_livre,
        })
    return rows


def _sobre_domingo(findings, metrica):
    return [f for f in findings if "domingo" in f["condition"] and f["metric"].startswith(metrica)]


print("— _metric_value —")
livre = {"tarefas_concluidas": 0, "produtividade_percebida_1a5": 1, "humor_1a5": 5, "dia_livre": True}
eq("dia livre não conta tarefas", _metric_value(livre, "tasks_completed"), None)
eq("dia livre não conta produtividade", _metric_value(livre, "productivity_rating"), None)
eq("dia livre conta humor", _metric_value(livre, "mood_rating"), 5.0)
eq("dia normal conta tarefas", _metric_value({**livre, "dia_livre": False}, "tasks_completed"), 0.0)
eq("linha sem a chave dia_livre conta (dado antigo)",
   _metric_value({"tarefas_concluidas": 2}, "tasks_completed"), 2.0)

print("\n— find_correlations —")
controle = find_correlations(_rows(marcar_dia_livre=False))
eq("controle: sem a marcação, o domingo vira 'queda de tarefas'",
   bool(_sobre_domingo(controle, "tarefas")), True)

corrigido = find_correlations(_rows(marcar_dia_livre=True))
eq("o bug: domingo livre não vira queda de tarefas", _sobre_domingo(corrigido, "tarefas"), [])
eq("domingo livre não vira queda de produtividade", _sobre_domingo(corrigido, "produtividade"), [])
eq("domingo livre ainda pode aparecer no humor", bool(_sobre_domingo(corrigido, "humor")), True)

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
