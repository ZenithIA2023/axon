"""
Testes da trava de horário passado (`tasks_service.is_in_past`).

A regra existe porque os modelos do agente não percebem sozinhos que um
horário já venceu — na avaliação de 07/10/2026, três de quatro criaram "hoje às
14h30" às 20h44 sem avisar. Os casos de borda que importam: a margem do
"agora", o compromisso em andamento e o que atravessa a meia-noite.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_tasks_past.py
"""

import sys
import types
from datetime import datetime

# O módulo importa `supabase` no topo, mas a função testada é pura.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services.tasks_service import is_in_past  # noqa: E402

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


AGORA = datetime(2026, 10, 7, 20, 44)  # o horário da avaliação
HOJE, ONTEM, AMANHA = "2026-10-07", "2026-10-06", "2026-10-08"

print("— data —")
eq("ontem sem horário é passado", is_in_past(ONTEM, None, None, AGORA), True)
eq("ontem com horário é passado", is_in_past(ONTEM, "23:00", None, AGORA), True)
eq("amanhã cedo não é passado", is_in_past(AMANHA, "06:00", None, AGORA), False)
eq("sem data não é passado", is_in_past(None, "08:00", None, AGORA), False)
eq("data inválida não bloqueia", is_in_past("amanhã-ish", "08:00", None, AGORA), False)

print("\n— hoje —")
eq("o caso da avaliação: 14h30 às 20h44", is_in_past(HOJE, "14:30", None, AGORA), True)
eq("hoje sem horário é tarefa do dia", is_in_past(HOJE, None, None, AGORA), False)
eq("mais tarde hoje", is_in_past(HOJE, "21:30", None, AGORA), False)
eq("formato HH:MM:SS", is_in_past(HOJE, "14:30:00", "15:00:00", AGORA), True)
eq("string vazia (GPT preenche assim) não quebra", is_in_past(HOJE, "", "", AGORA), False)

print("\n— margem do agora (15 min) —")
eq("começou há 10 min: ainda vale", is_in_past(HOJE, "20:34", None, AGORA), False)
eq("começou há 20 min: passado", is_in_past(HOJE, "20:24", None, AGORA), True)

print("\n— em andamento —")
eq("20h–21h às 20h44 está acontecendo", is_in_past(HOJE, "20:00", "21:00", AGORA), False)
eq("19h–20h às 20h44 já acabou", is_in_past(HOJE, "19:00", "20:00", AGORA), True)
eq("23h–00h30 atravessa a meia-noite", is_in_past(HOJE, "23:00", "00:30", datetime(2026, 10, 7, 23, 50)), False)

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
