"""
Testes das funções puras do vocabulário de voz.

O ponto sensível é `corrigir_termos`: ela troca palavras no texto do usuário, e
uma troca errada é pior que a transcrição errada original — "mal de Parkinson"
virando "mal de Axon" seria um bug visível e constrangedor.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_stt_vocabulary.py
"""

import sys
import types

# O módulo importa `supabase` no topo, mas as funções testadas aqui são puras.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from services.stt_vocabulary import boost_de, corrigir_termos, _limpar  # noqa: E402

ok = 0
falhas = 0


def eq(nome: str, obtido, esperado) -> None:
    global ok, falhas
    if obtido == esperado:
        ok += 1
        print(f"  ok  {nome}")
    else:
        falhas += 1
        print(f"FALHA {nome}\n   obtido:   {obtido!r}\n   esperado: {esperado!r}")


print("— corrigir_termos: variantes que DEVEM virar Axon —")
# Estas saíram de transcrições REAIS: as três primeiras vieram de prints do
# app em uso, com voz humana. O Google devolveu "Jackson" para "Axon".
for entrada, esperado in [
    (
        "Banda Jackson tudo bem? Quero que tudo isso tudo que eu tenho para fazer hoje.",
        "Banda Axon tudo bem? Quero que tudo isso tudo que eu tenho para fazer hoje.",
    ),
    ("Bom dia Jackson, tudo bem?", "Bom dia Axon, tudo bem?"),
    (
        "não tô entendendo porque tá botando Jackson ao invés de Axon",
        "não tô entendendo porque tá botando Axon ao invés de Axon",
    ),
    ("Bom dia axon tudo bem?", "Bom dia Axon tudo bem?"),
    ("axon adia revisão do capítulo 2", "Axon adia revisão do capítulo 2"),
    ("Áxon, cria uma tarefa", "Axon, cria uma tarefa"),
    ("Jackson me lista as tarefas", "Axon me lista as tarefas"),
    ("Parkinson o que eu tenho hoje", "Axon o que eu tenho hoje"),
    ("Olá Hexagon, bom dia", "Olá Axon, bom dia"),
    ("Oi action, cria uma tarefa", "Oi Axon, cria uma tarefa"),
    ("Oi yakisoba marcar uma reunião", "Oi Axon marcar uma reunião"),
    ("Action, adia a revisão", "Axon, adia a revisão"),
    ("Action cria uma tarefa chamada revisar", "Axon cria uma tarefa chamada revisar"),
]:
    eq(entrada[:40], corrigir_termos(entrada), esperado)

print("\n— corrigir_termos: o que NÃO pode ser tocado —")
# Palavras legítimas e nomes próprios de verdade. Uma troca aqui corrompe o
# texto do usuário, que é pior que a transcrição imperfeita.
for texto in [
    "estudar taxonomia amanhã",
    "renderizar no Maxon Cinema",
    "axônio do neurônio",
    "marca consulta sobre mal de Parkinson",
    "ligar para o Jackson amanhã",
    "agendar show do Michael Jackson",
    "comprar action figure do Batman",
    "tomar uma ação sobre isso",
    "reunião na sede da Hexagon às 10h",
    "pedir yakisoba no almoço",
    "action movie na sexta",
]:
    eq(texto[:40], corrigir_termos(texto), texto)

print("\n— boost por categoria —")
eq("nome do assistente", boost_de("Axon"), 20.0)
eq("saudação com o nome", boost_de("Oi Axon"), 20.0)
eq("comando da ferramenta", boost_de("criar tarefa"), 15.0)
eq("título do usuário", boost_de("Reunião com a Camila"), 12.0)
# "AxonWeb" é um produto, não o vocativo: não merece o boost do nome.
eq("axon dentro de outra palavra", boost_de("Lançar o AxonWeb"), 12.0)

print("\n— limpeza de títulos —")
eq("emoji e pontuação saem", _limpar("🔥 Revisar capítulo 2!!!"), "Revisar capítulo 2")
eq("markdown sai", _limpar("**Reunião** com a Camila"), "Reunião com a Camila")
eq("corta em 100 chars", len(_limpar("a" * 200)), 100)

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
