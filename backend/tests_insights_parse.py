"""
Testes dos parsers de insights e descobertas (formato da saída estruturada).

O bug que motivou a mudança: o modelo escreveu aspas sem escape dentro de uma
string do JSON ("title": ""Tela antes de dormir""...) e o parser descartava a
resposta inteira — a aba Insights mostrava "não foi possível gerar". Com a
saída estruturada a resposta vem como {"items": [...]} com as aspas escapadas;
o formato antigo (lista solta) continua aceito como rede de segurança.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_insights_parse.py
"""

import json
import sys
import types

# Os módulos importam `supabase` no topo, mas os parsers são puros.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services.correlations_service import _parse_written_findings  # noqa: E402
from services.insights_service import OUTPUT_SCHEMA, parse_insights  # noqa: E402

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


ITEM = {"title": '"Tela antes de dormir" pesa no sono', "detail": "Nos dias com tela, você dormiu menos.",
        "type": "sleep"}

print("— insights —")
estruturado = json.dumps({"items": [ITEM]}, ensure_ascii=False)
eq("objeto da saída estruturada", parse_insights(estruturado)[0]["title"], ITEM["title"])
eq("aspas escapadas sobrevivem", '"Tela antes de dormir"' in parse_insights(estruturado)[0]["title"], True)
eq("formato antigo (lista solta) segue aceito", len(parse_insights(json.dumps([ITEM]))), 1)
eq("formato antigo com cerca ```json", len(parse_insights("```json\n" + json.dumps([ITEM]) + "\n```")), 1)
quebrado = '[{"title": ""Tela antes de dormir" pesa", "detail": "x", "type": "sleep"}]'
eq("o bug original: aspa sem escape → nada (por isso a saída estruturada)", parse_insights(quebrado), [])
eq("tipo desconhecido vira general", parse_insights(json.dumps({"items": [{**ITEM, "type": "xyz"}]}))[0]["type"],
   "general")
eq("item sem detail é descartado", parse_insights(json.dumps({"items": [{"title": "a", "detail": ""}]})), [])
eq("objeto sem items → vazio", parse_insights('{"outra": 1}'), [])
eq("schema exige raiz objeto", OUTPUT_SCHEMA["type"], "object")

print("\n— descobertas —")
desc = json.dumps({"items": [{"source_index": 2, "title": "Treino ajuda", "detail": "Você rende 30% mais."}]})
eq("objeto da saída estruturada", _parse_written_findings(desc)[0]["source_index"], 2)
eq("formato antigo segue aceito",
   _parse_written_findings('[{"source_index": 0, "title": "a", "detail": "b"}]')[0]["source_index"], 0)
eq("source_index não inteiro vira None",
   _parse_written_findings(json.dumps({"items": [{"source_index": "1", "title": "a", "detail": "b"}]}))[0]
   ["source_index"], None)

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
