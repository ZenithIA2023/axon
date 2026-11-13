"""
Testes do catálogo de notificações (services/notification_catalog.py).

Só funções puras: nada de banco. O fluxo do scheduler com o catálogo (ofensiva
em risco, falha de leitura, action gravado, toque) está em
tests_day_reminders.py, que tem o banco falso.

O primeiro bloco lê docs/NOTIFICACOES_AXON.md e compara com o código: o
documento é a fonte da verdade dos textos, e este teste impede os dois de
divergirem em silêncio.

    cd backend && python3 tests_notification_catalog.py
"""

import random
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from services import notification_catalog as cat
from services.chronotype import CHRONOTYPE_META

ok = 0
falhas = 0


def eq(nome, obtido, esperado):
    global ok, falhas
    if obtido == esperado:
        ok += 1
        print(f"  ok  {nome}")
    else:
        falhas += 1
        print(f"FALHA {nome}: obtido {obtido!r}, esperado {esperado!r}")


AGORA = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)

# ── 1. Código × documento ────────────────────────────────────────────────────

print("— catálogo × docs/NOTIFICACOES_AXON.md —")
md = (Path(__file__).resolve().parent.parent / "docs" / "NOTIFICACOES_AXON.md").read_text()
doc = {}
for linha in md.splitlines():
    m = re.match(r"^\|\s*([a-z][a-z0-9_]+)\s*\|(.*)\|\s*$", linha)
    if not m:
        continue
    cols = [c.strip() for c in m.group(2).split("|")]
    t = re.match(r"^\*\*(.+?)\*\*\s*/\s*(.+)$", cols[-1])
    if t:
        doc[m.group(1)] = {"family": cols[0] if len(cols) == 3 else None,
                           "title": t.group(1), "body": t.group(2)}

eq("o documento tem as 32 variações", len(doc), 32)
eq("todo id do documento existe no catálogo", sorted(set(doc) - set(cat.BY_ID)), [])
eq("nenhum id no catálogo que o documento não tenha", sorted(set(cat.BY_ID) - set(doc)), [])
for vid, d in doc.items():
    v = cat.BY_ID.get(vid)
    if v is None:
        continue
    eq(f"{vid}: título idêntico", v.title, d["title"])
    eq(f"{vid}: corpo idêntico", v.body, d["body"])
    if d["family"]:
        eq(f"{vid}: família idêntica", v.family, d["family"])

# ── 2. Tamanho (Android recolhido: título ~40, corpo ~90) ────────────────────

print("\n— tamanho com variáveis típicas —")
TIPICO = {
    "nome": "Bernardo", "n": 5, "hora": "14h30", "tarefa": "Reunião com o time",
    "streak": {"current": 12}, "media_semana": 78, "melhor_semana": 85,
    "feitas_hoje": 3, "total_hoje": 5, "pico": "10h", "faltam_calibrar": 4, "min": 30,
}
for evento in (False, True):
    for v in cat.CATALOG:
        titulo, corpo = cat.render(v, {**TIPICO, "tem_evento": evento})
        sufixo = " (com evento)" if evento else ""
        eq(f"{v.id}{sufixo}: título ≤ 40 ({len(titulo)})", len(titulo) <= 40, True)
        eq(f"{v.id}{sufixo}: corpo ≤ 90 ({len(corpo)})", len(corpo) <= 90, True)

# ── 3. Privacidade na tela de bloqueio ───────────────────────────────────────

print("\n— nenhum dado de sono, humor ou saúde (seção 3) —")
PERMITIDAS = {"nome", "n", "hora", "tarefa", "ofensiva", "media_semana", "melhor_semana",
              "feitas_hoje", "total_hoje", "pico", "faltam_calibrar", "min"}
usadas = {m for v in cat.CATALOG for m in re.findall(r"\{([a-z_]+)", v.title + v.body)}
eq("só variáveis da tabela do documento", sorted(usadas - PERMITIDAS), [])
SAUDE = re.compile(r"sono|humor|sleep|mood|sa[uú]de|energia_rating|ansied|estresse|cansa", re.I)
eq("nenhuma variável de sono/humor/saúde", [u for u in usadas if SAUDE.search(u)], [])
eq("nenhum texto fala de sono/humor/saúde",
   [v.id for v in cat.CATALOG if re.search(r"\bsono\b|\bhumor\b|sa[uú]de|dormiu", v.title + v.body, re.I)], [])

# ── 4. Singular e plural ─────────────────────────────────────────────────────

print("\n— resumo da manhã com n = 1 e n = 5 —")
ERRADO = re.compile(r"\b1 (tarefas|compromissos|dias|registros|minutos)\b|são 1\b|Faltam 1\b|Hoje são 1\.")
base_man = {"nome": "Bernardo", "hora": "9h", "tarefa": "Gravar vídeo", "pico": "9h",
            "proximo_e_primeiro": True, "media_semana": 80, "melhor_semana": 90,
            "unica_cabe_no_pico": True}
for n in (1, 5):
    for evento in (False, True):
        ctx = {**base_man, "n": n, "tem_evento": evento}
        for v in cat.eligible(cat.MANHA, ctx):
            texto = " / ".join(cat.render(v, ctx))
            eq(f"n={n}{' evento' if evento else ''} {v.id}: concordância certa", ERRADO.search(texto), None)
eq("n=1: só as *_uni (as de n ≥ 2 ficam fora)",
   sorted(v.id for v in cat.eligible(cat.MANHA, {**base_man, "n": 1, "tem_evento": False})),
   ["man_bri_uni", "man_par_uni", "man_rit_uni"])
eq("n=2: nenhuma *_uni", [v.id for v in cat.eligible(cat.MANHA, {**base_man, "n": 2}) if v.id.endswith("_uni")], [])
eq("n=1 man_par_uni", cat.render(cat.BY_ID["man_par_uni"], {**base_man, "n": 1}), ("Bom dia, Bernardo!", "Hoje o foco é um só: Gravar vídeo."))
eq("n=5 man_par_1", cat.render(cat.BY_ID["man_par_1"], {**base_man, "n": 5})[1],
   "Hoje são 5 tarefas. A primeira às 9h: Gravar vídeo.")
eq("n=5 com evento man_par_1", cat.render(cat.BY_ID["man_par_1"], {**base_man, "n": 5, "tem_evento": True})[1],
   "Hoje são 5 compromissos. O primeiro às 9h: Gravar vídeo.")
eq("n=5 com evento man_mem_1", cat.render(cat.BY_ID["man_mem_1"], {**base_man, "n": 5, "tem_evento": True})[1],
   "Você já mostrou que consegue. Hoje são 5 compromissos.")

print("\n— man_rit_uni: só quando 'cabe direitinho nesse horário' é verdade —")
um = lambda hora: cat.summary_vars([{"title": "Gravar", "task_type": "task", "start_time": hora}],
                                   datetime(2026, 11, 16, 7, 0), "Misto")   # pico do Misto: 9h–15h
for nome, hora, esperado_rit in (("sem horário", None, True), ("às 10h, no pico", "10:00:00", True),
                                 ("às 20h, fora do pico", "20:00", False)):
    ctx = {"nome": "B", "pico": "9h", **um(hora)}
    ids = [v.id for v in cat.eligible(cat.MANHA, ctx)]
    eq(f"n=1 {nome}: man_rit_uni {'entra' if esperado_rit else 'fica fora'}", "man_rit_uni" in ids, esperado_rit)
    eq(f"n=1 {nome}: par_uni e bri_uni entram", {"man_par_uni", "man_bri_uni"} <= set(ids), True)
eq("{tarefa} da única é ela mesma, mesmo sem horário", um(None)["tarefa"], "Gravar")
eq("próximo não é o primeiro do dia: 'A primeira' fica fora",
   {v.id for v in cat.eligible(cat.MANHA, {**base_man, "n": 5, "proximo_e_primeiro": False})} & {"man_par_1", "man_bri_1"},
   set())
eq("ofensiva 1: 'Sua ofensiva de 1 dia'", cat.render(cat.BY_ID["reg_risco_1"], {"streak": {"current": 1}})[0],
   "Sua ofensiva de 1 dia")
eq("ofensiva 1: reg_risco_2 ('seus 1 dias continuam') fica fora",
   [v.id for v in cat.eligible(cat.REGISTRO_RISCO, {"streak": {"current": 1}})], ["reg_risco_1"])
eq("falta 1 para calibrar", cat.render(cat.BY_ID["reg_dad_cal"], {"faltam_calibrar": 1})[0], "Falta 1 registro")
eq("1 minuto", cat.render(cat.BY_ID["tar_1"], {"tarefa": "X", "min": 1, "hora": "10h"})[1], "Começa em 1 minuto, às 10h.")
eq("marco: {ofensiva+1}", cat.render(cat.BY_ID["reg_marco"], {"streak": {"current": 6}})[0], "Hoje são 7 dias 🔥")

# ── 5. Regras de honestidade ─────────────────────────────────────────────────

print("\n— regras 1, 2 e 3 —")
HOJE = date(2026, 11, 19)                      # quinta; semana começa na segunda 16


def linhas(datas_taxas):
    return [{"date": d, "total": 3, "completion_rate": t} for d, t in datas_taxas]


def dados(kind, ctx):
    return [v.id for v in cat.eligible(kind, ctx) if v.family == "Dados"]


eq("média 55% → nenhuma de Dados (resumo)", dados(cat.MANHA, {**base_man, "n": 5, "media_semana": 55}), [])
eq("média 55% → nenhuma de Dados (registro, nem a da calibração)",
   dados(cat.REGISTRO, {"media_semana": 55, "faltam_calibrar": 4}), [])
dois = cat.week_averages(linhas([("2026-11-16", 80), ("2026-11-17", 80)]), HOJE)
eq("80% com 2 dias → sem média", dois["atual"], None)
eq("…e nenhuma de Dados com média", dados(cat.MANHA, {**base_man, "n": 5, "media_semana": dois["atual"]}), [])
tres = cat.week_averages(linhas([("2026-11-16", 80), ("2026-11-17", 80), ("2026-11-18", 80)]), HOJE)
eq("80% com 3 dias → média 80", tres["atual"], 80)
eq("…e Dados entra", dados(cat.MANHA, {**base_man, "n": 5, "media_semana": tres["atual"]}), ["man_dad_1"])
eq("dia com total 0 não conta para os 3",
   cat.week_averages(linhas([("2026-11-16", 80), ("2026-11-17", 80)])
                     + [{"date": "2026-11-18", "total": 0, "completion_rate": 0}], HOJE)["atual"], None)
eq("hoje fica fora da média (dia em aberto)",
   cat.week_averages(linhas([("2026-11-16", 80), ("2026-11-17", 80), ("2026-11-19", 10)]), HOJE)["atual"], None)

semanas = linhas([("2026-11-09", 90), ("2026-11-10", 90), ("2026-11-11", 90),      # semana passada: 90
                  ("2026-10-26", 70), ("2026-10-27", 70), ("2026-10-28", 70)])     # 3 semanas atrás: 70
m = cat.week_averages(semanas + linhas([("2026-11-16", 80), ("2026-11-17", 80), ("2026-11-18", 80)]), HOJE)
eq("melhor das 8 semanas = a passada (90)", (m["melhor"], m["passada"]), (90, 90))
ctx_mem = {**base_man, "n": 5, "melhor_semana": m["melhor"]}
eq("melhor 90 > atual 80 → man_mem_1 entra", "man_mem_1" in [v.id for v in cat.eligible(cat.MANHA, {**ctx_mem, "media_semana": 80})], True)
eq("melhor 90 < atual 95 → man_mem_1 fora", "man_mem_1" in [v.id for v in cat.eligible(cat.MANHA, {**ctx_mem, "media_semana": 95})], False)
# 5 semanas antes da semana de HOJE (seg 16/11): a semana de 12/10.
velha = cat.week_averages(linhas([("2026-10-12", 95), ("2026-10-13", 95), ("2026-10-14", 95),
                                  ("2026-11-09", 70), ("2026-11-10", 70), ("2026-11-11", 70)]), HOJE)
eq("melhor semana de 5 semanas atrás (95), passada 70", (velha["melhor"], velha["passada"]), (95, 70))
eq("…man_mem_1 entra ('Sua melhor semana' vale para qualquer uma das 8)",
   "man_mem_1" in [v.id for v in cat.eligible(cat.MANHA, {**base_man, "n": 5, "media_semana": 60,
                   "melhor_semana": velha["melhor"]})], True)
eq("…com o título novo", cat.render(cat.BY_ID["man_mem_1"], {**base_man, "n": 5, "melhor_semana": 95})[0],
   "Sua melhor semana: 95%")
eq("man_mem_1 com n = 1: fora", "man_mem_1" in [v.id for v in cat.eligible(cat.MANHA, {**ctx_mem, "n": 1, "media_semana": 80})], False)
eq("semana fora das 8 completas não conta",
   cat.week_averages(linhas([("2026-09-01", 99), ("2026-09-02", 99), ("2026-09-03", 99)]), HOJE)["melhor"], None)

print("\n— outras condições —")
eq("ofensiva 1 → sem reg_ofe_*", [v.id for v in cat.eligible(cat.REGISTRO, {"streak": {"current": 1}}) if v.id.startswith("reg_ofe")], [])
eq("ofensiva 2 → reg_ofe_* entram", [v.id for v in cat.eligible(cat.REGISTRO, {"streak": {"current": 2}}) if v.id.startswith("reg_ofe")], ["reg_ofe_1", "reg_ofe_2"])
eq("marco só quando hoje leva a 7", ["reg_marco" in [v.id for v in cat.eligible(cat.REGISTRO, {"streak": {"current": c}})] for c in (5, 6, 7, 29)],
   [False, True, False, True])
eq("calibração: faltam 11 → fora; 10 → entra; 0 → fora",
   ["reg_dad_cal" in [v.id for v in cat.eligible(cat.REGISTRO, {"faltam_calibrar": f})] for f in (11, 10, 0)], [False, True, False])
eq("reg_pri: conta de 1 dia COM um registro → fora",
   "reg_pri" in [v.id for v in cat.eligible(cat.REGISTRO, {"dias_de_conta": 1, "tem_registro": True})], False)
eq("reg_pri: conta de 10 dias SEM registro → dentro",
   "reg_pri" in [v.id for v in cat.eligible(cat.REGISTRO, {"dias_de_conta": 10, "tem_registro": False})], True)
eq("reg_pri: registros não lidos → fora (não dá para afirmar 'primeiro')",
   "reg_pri" in [v.id for v in cat.eligible(cat.REGISTRO, {})], False)
eq("feitas_hoje 0 → sem ama_mem_1", "ama_mem_1" in [v.id for v in cat.eligible(cat.AMANHA, {"feitas_hoje": 0, "total_hoje": 4, "pico": "9h"})], False)
eq("dia vazio → só as de dia vazio", sorted(v.id for v in cat.eligible(cat.MANHA, {**base_man, "n": 0})), ["man_vaz_1", "man_vaz_2"])
eq("só Parceiro (leitura falhou)", {v.family for k in (cat.REGISTRO, cat.MANHA, cat.AMANHA, cat.SEMANA)
                                    for v in cat.eligible(k, {**base_man, "n": 5, "so_parceiro": True, "streak": {"current": 9}})},
   {"Parceiro"})

# ── 6. Sorteio ───────────────────────────────────────────────────────────────

print("\n— sorteio —")
reg = cat.eligible(cat.REGISTRO, {"nome": "B"})
rng = random.Random(42)
hist = [("reg_par_1", AGORA - timedelta(days=3))]
eq("usada há 3 dias → fora", any(cat.choose(reg, hist, AGORA, rng).id == "reg_par_1" for _ in range(300)), False)
hist = [("reg_par_1", AGORA - timedelta(days=8))]
eq("usada há 8 dias → volta", any(cat.choose(reg, hist, AGORA, rng).id == "reg_par_1" for _ in range(300)), True)
todas = [(v.id, AGORA - timedelta(days=i + 1)) for i, v in enumerate(reg)]   # a última é a mais antiga
eq("todas usadas nos 7 dias → a menos recente", cat.choose(reg, todas, AGORA, rng).id, reg[-1].id)
eq("nenhuma elegível → None", cat.choose([], [], AGORA, rng), None)

cont = Counter(cat.choose(reg, [], AGORA, rng).id for _ in range(1000))
esperado = 1000 / len(reg)
eq(f"1000 sorteios entre {len(reg)}: todas aparecem", len(cont), len(reg))
eq(f"…cada uma perto de {esperado:.0f} (±40%)", all(abs(c - esperado) <= 0.4 * esperado for c in cont.values()), True)
print(f"     contagem: {dict(cont)}")

v, t, b = cat.pick(cat.REGISTRO_RISCO, {"streak": {"current": 4}}, [], AGORA, rng)
eq("pick devolve variação e texto", (v.kind, t.startswith("Sua ofensiva") or t.startswith("Ainda dá tempo")), (cat.REGISTRO_RISCO, True))
eq("pick sem nada elegível → None", cat.pick(cat.MANHA, {"n": 1, "so_parceiro": True}, [], AGORA, rng), None)

print("\n— pick_explained: o porquê de cada sorteio —")
r = cat.pick_explained(cat.MANHA, {**base_man, "n": 5, "media_semana": 55, "melhor_semana": None},
                       [("man_bri_1", AGORA - timedelta(days=2))], AGORA, random.Random(1))
eq("elegíveis", sorted(r["elegiveis"]), ["man_bri_1", "man_par_1", "man_rit_1"])
eq("excluídas pelos 7 dias", r["excluidas_7d"], ["man_bri_1"])
eq("sorteada fora das excluídas", r["variant"].id in {"man_par_1", "man_rit_1"}, True)
eq("Dados fora com o motivo da média", dict(r["fora"])["man_dad_1"], "média 55% (abaixo de 60%, regra 2)")
eq("pick e pick_explained são o mesmo sorteio (mesma semente, mesma escolha)",
   cat.pick(cat.REGISTRO, {"nome": "B"}, [], AGORA, random.Random(9))[0].id,
   cat.pick_explained(cat.REGISTRO, {"nome": "B"}, [], AGORA, random.Random(9))["variant"].id)

# ── 7. Variáveis derivadas ───────────────────────────────────────────────────

print("\n— pico = o que o Dashboard mostra —")
for crono, esperado_pico in (("Matutino", "7h"), ("Misto", "9h"), ("Vespertino", "14h"),
                             ("Noturno", "20h"), ("Bimodal", "9h"), (None, "10h")):
    eq(f"{crono}: {{pico}} = início de '{CHRONOTYPE_META.get(crono or 'intermediate')['energy_peak']}'",
       cat.peak_start(crono), esperado_pico)
eq("Matutino: 10h no pico, 11h fora", (cat.in_peak("Matutino", "10:00"), cat.in_peak("Matutino", "11:00")), (True, False))
eq("Noturno (20h–01h): 23h30 e 00h30 no pico, 01h fora",
   (cat.in_peak("Noturno", "23:30"), cat.in_peak("Noturno", "00:30"), cat.in_peak("Noturno", "01:00")), (True, True, False))
eq("Bimodal: 10h e 17h no pico, 13h fora",
   (cat.in_peak("Bimodal", "10:00"), cat.in_peak("Bimodal", "17:00"), cat.in_peak("Bimodal", "13:00")), (True, True, False))
eq("horário ilegível → fora do pico", cat.in_peak("Misto", "xx"), False)

print("\n— resumo: {n}, {hora}, {tarefa} —")
itens = [{"title": "Almoço", "task_type": "task", "start_time": "12:00"},
         {"title": "Gravar", "task_type": "task", "start_time": "09:00:00"},
         {"title": "Ler", "task_type": "task", "start_time": None}]
s8 = cat.summary_vars(itens, datetime(2026, 11, 16, 8, 30))
eq("8h30: próxima = 9h Gravar, e é a primeira", (s8["n"], s8["hora"], s8["tarefa"], s8["proximo_e_primeiro"]), (3, "9h", "Gravar", True))
s10 = cat.summary_vars(itens, datetime(2026, 11, 16, 10, 0))
eq("10h: próxima = 12h Almoço, não é a primeira", (s10["hora"], s10["tarefa"], s10["proximo_e_primeiro"]), ("12h", "Almoço", False))
eq("evento no dia", cat.summary_vars(itens + [{"title": "R", "task_type": "event", "start_time": None}], datetime(2026, 11, 16, 8))["tem_evento"], True)

print(f"\n{ok} passaram, {falhas} falharam")
sys.exit(1 if falhas else 0)
