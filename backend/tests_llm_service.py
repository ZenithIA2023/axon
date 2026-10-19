"""
Testes do roteamento principal → reserva (`llm_service.complete`) e da
tradução de "sem thinking" por modelo (`claude_service._thinking_kwargs`).

Os provedores são trocados por funções falsas: o que se testa é QUANDO a
reserva assume, não a rede.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_llm_service.py
"""

import sys
import types

_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services import claude_service, llm_service  # noqa: E402

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


SCHEMA = {"type": "object", "properties": {"items": {"type": "array"}}, "required": ["items"],
          "additionalProperties": False}
chamadas: list[str] = []


def _prov(nome, resposta):
    def fn(model, *a, **k):
        chamadas.append(nome)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta
    return fn


def rodar(principal, reserva, schema=SCHEMA):
    chamadas.clear()
    llm_service._PROVIDERS = {"openrouter": _prov("principal", principal),
                              "anthropic": _prov("reserva", reserva)}
    llm_service._ROUTES["teste"] = [("openrouter", "m1"), ("anthropic", "m2")]
    try:
        return llm_service.complete("teste", "sys", "msg", feature="teste", json_schema=schema)
    except RuntimeError:
        return "ERRO"


print("— roteamento —")
eq("principal válido: reserva nem é chamada", (rodar('{"items": []}', '{"items": [1]}'), chamadas),
   ('{"items": []}', ["principal"]))
eq("principal lança erro → reserva", rodar(TimeoutError("x"), '{"items": [1]}'), '{"items": [1]}')
eq("principal vazio → reserva", rodar("   ", '{"items": [1]}'), '{"items": [1]}')
eq("JSON inválido (chave sem aspas) → reserva", rodar("{items: []}", '{"items": [1]}'), '{"items": [1]}')
eq("JSON que não é objeto → reserva", rodar("[1, 2]", '{"items": [1]}'), '{"items": [1]}')
eq("texto livre sem schema é aceito", rodar("Uma semana boa.", "x", schema=None), "Uma semana boa.")
eq("as duas falham → RuntimeError", rodar(ValueError("a"), ValueError("b")), "ERRO")
eq("_RouteFailed do provedor (sem chave) → reserva",
   rodar(llm_service._RouteFailed("sem OPENROUTER_API_KEY"), '{"items": []}'), '{"items": []}')

print("\n— thinking por modelo —")
eq("Sonnet 4.6 sem thinking: omite", claude_service._thinking_kwargs("claude-sonnet-4-6", False), {})
eq("Sonnet 5.5 sem thinking: between_tools",
   claude_service._thinking_kwargs("claude-sonnet-5-5", False), {"thinking": {"type": "between_tools"}})
eq("com thinking: adaptive em qualquer um",
   claude_service._thinking_kwargs("claude-sonnet-5-5", True), {"thinking": {"type": "adaptive"}})

print("\n— rotas de produção —")
for rota in ("redacao", "curtos"):
    eq(f"{rota}: principal e reserva em provedores diferentes",
       len({p for p, _ in llm_service._ROUTES[rota]}), 2)

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
