"""
Testes de `streak_service.yesterday_reviewable`: o pop-up automático só pede o
registro de ontem se a conta já existia ontem, no fuso do usuário.

O caso que importa é o de fuso: created_at é UTC e "ontem" é local. Errar a
conversão quebra nos dois sentidos — UTC-3 à noite (o dia de criação parece
"amanhã" em UTC) e UTC+9 de manhã (parece "ontem" em UTC).

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_streak_reviewable.py
"""

import sys
import types
from datetime import date
from zoneinfo import ZoneInfo

# O módulo importa `supabase` no topo, mas a função testada é pura.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services.streak_service import yesterday_reviewable  # noqa: E402

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


SP = ZoneInfo("America/Sao_Paulo")   # UTC-3
TOKYO = ZoneInfo("Asia/Tokyo")       # UTC+9
HOJE = date(2026, 11, 12)

print("— conta nova x antiga —")
eq("criada hoje: não pede ontem",
   yesterday_reviewable("2026-11-12T13:00:00+00:00", SP, HOJE), False)
eq("criada ontem: pede ontem",
   yesterday_reviewable("2026-11-11T15:00:00+00:00", SP, HOJE), True)
eq("conta antiga: pede ontem (como antes)",
   yesterday_reviewable("2026-03-01T10:00:00+00:00", SP, HOJE), True)
eq("formato do Supabase com microssegundos",
   yesterday_reviewable("2026-11-12T13:00:00.123456+00:00", SP, HOJE), False)
eq("sufixo Z", yesterday_reviewable("2026-11-11T15:00:00Z", SP, HOJE), True)

print("\n— fuso —")
# 22h de 11/11 em São Paulo = 01h de 12/11 em UTC. Em UTC parece criada HOJE.
eq("UTC-3: criada às 22h de ontem → pede ontem",
   yesterday_reviewable("2026-11-12T01:00:00+00:00", SP, HOJE), True)
eq("UTC-3: criada às 00h30 de hoje (03h30 UTC) → não pede",
   yesterday_reviewable("2026-11-12T03:30:00+00:00", SP, HOJE), False)
# 08h de 12/11 em Tóquio = 23h de 11/11 em UTC. Em UTC parece criada ONTEM.
eq("UTC+9: criada às 08h de hoje (ontem em UTC) → não pede",
   yesterday_reviewable("2026-11-11T23:00:00+00:00", TOKYO, HOJE), False)

print("\n— dado ausente ou ilegível: comportamento de antes —")
eq("None", yesterday_reviewable(None, SP, HOJE), True)
eq("vazio", yesterday_reviewable("", SP, HOJE), True)
eq("lixo", yesterday_reviewable("não é data", SP, HOJE), True)
eq("sem fuso é lido como UTC",
   yesterday_reviewable("2026-11-12T01:00:00", SP, HOJE), True)

print(f"\n{ok} passaram, {falhas} falharam")
sys.exit(1 if falhas else 0)
