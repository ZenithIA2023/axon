"""
Testes do onboarding novo (nov/2026): faixas derivadas dos horários, jet lag
social, gatilho do Misto na P17-F e validação dos schemas.

O ponto sensível é a derivação da P5/P8: ela substitui duas perguntas de peso 3
na pontuação. Uma faixa errada muda o cronotipo do usuário sem ninguém notar.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_onboarding.py
"""

import sys
import types

# Os módulos importam `supabase` no topo, mas o que se testa aqui é puro.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from pydantic import ValidationError  # noqa: E402

from models.schemas import ClassifyRequest, OnboardingEventsRequest  # noqa: E402
from services.chronotype import classificar_cronotipo, energia_do_dia, segmentos_do_dia  # noqa: E402
from services.onboarding_service import (  # noqa: E402
    campos_de_perfil,
    completar_respostas,
    faixa_p5,
    faixa_p8,
    jet_lag_social_min,
    meio_do_sono,
)

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


def recusa(nome: str, modelo, dados: dict) -> None:
    global ok, falhas
    try:
        modelo(**dados)
    except ValidationError:
        ok += 1
        print(f"  ok  {nome}")
        return
    falhas += 1
    print(f"FALHA {nome}: deveria ter sido recusado")


print("— faixa_p5: dormir no dia livre → alternativa da P5 —")
# Limites das opções antigas: A 21–22h · B 22–23h · C 23h–00h30 · D depois da 1h.
for hora, esperado in [
    ("20:00", "A"),   # antes das 21h: a opção mais cedo
    ("21:30", "A"),
    ("21:59", "A"),
    ("22:00", "B"),
    ("22:59", "B"),
    ("23:00", "C"),
    ("00:00", "C"),   # meia-noite é mais tarde que 23h, não mais cedo
    ("00:45", "C"),   # buraco das opções antigas (00h30–1h) fica em C
    ("00:59", "C"),
    ("01:00", "D"),
    ("03:30", "D"),
    ("11:59", "D"),
]:
    eq(f"dormir {hora}", faixa_p5(hora), esperado)

print("\n— faixa_p8: acordar no dia livre → alternativa da P8 —")
# A antes de 6h30 · B 6h30–8h · C 8h–9h30 · D depois de 9h30.
for hora, esperado in [
    ("05:00", "A"),
    ("06:29", "A"),
    ("06:30", "B"),
    ("07:59", "B"),
    ("08:00", "C"),
    ("09:29", "C"),
    ("09:30", "D"),
    ("13:00", "D"),   # acordar à tarde é o mais tarde que a escala diz
]:
    eq(f"acordar {hora}", faixa_p8(hora), esperado)

print("\n— meio_do_sono —")
eq("23h → 7h = 3h", meio_do_sono("23:00", "07:00"), 3 * 60)
eq("22h → 6h = 2h", meio_do_sono("22:00", "06:00"), 2 * 60)
eq("01h → 9h = 5h", meio_do_sono("01:00", "09:00"), 5 * 60)
eq("dia: 08h → 16h = 12h", meio_do_sono("08:00", "16:00"), 12 * 60)
eq("minuto ímpar arredonda para baixo", meio_do_sono("23:00", "06:31"), 2 * 60 + 45)

print("\n— jet_lag_social_min —")
eq("rotina igual = 0", jet_lag_social_min("23:00", "07:00", "23:00", "07:00"), 0)
eq("dia livre 2h mais tarde = 120",
   jet_lag_social_min("23:00", "06:00", "01:00", "08:00"), 120)
eq("ordem não importa (livre mais cedo)",
   jet_lag_social_min("01:00", "08:00", "23:00", "06:00"), 120)
# Meios do sono às 23h50 e 00h10: 20 min de distância, não 23h40.
eq("diferença atravessando a meia-noite é circular",
   jet_lag_social_min("19:50", "03:50", "20:10", "04:10"), 20)

print("\n— completar_respostas —")
horarios = {"workday_sleep": "23:00", "workday_wake": "06:30",
            "freeday_sleep": "01:30", "freeday_wake": "10:00"}
eq("deriva P5 e P8 quando faltam",
   completar_respostas({"P1": "A"}, horarios), {"P1": "A", "P5": "D", "P8": "D"})
eq("não sobrescreve resposta explícita (APK antigo)",
   completar_respostas({"P5": "A", "P8": "A"}, horarios), {"P5": "A", "P8": "A"})
eq("sem horários não muda nada", completar_respostas({"P1": "A"}, None), {"P1": "A"})

print("\n— classificação: P17 —")
eq("P17-E continua sendo Bimodal direto",
   classificar_cronotipo({"P17": "E", "P1": "A"})[0], "Bimodal")
# Respostas matutinas moderadas: o Matutino ganha por pouco do Misto. Com
# "muda de um dia para o outro" (P17-F) a regra do candidato a Misto vira o
# resultado, como a P18-G fazia no questionário antigo.
moderado = {"P1": "B", "P2": "B", "P4": "B", "P7": "B"}
eq("sem P17-F o moderado é Matutino",
   classificar_cronotipo(moderado)[0], "Matutino")
eq("com P17-F o moderado vira Misto",
   classificar_cronotipo({**moderado, "P17": "F"})[0], "Misto")
eq("P18-G do APK antigo ainda aciona o Misto",
   classificar_cronotipo({**moderado, "P18": "G"})[0], "Misto")
# A regra só puxa para Misto quando a vantagem é pequena (≤ 3 pontos).
forte = {"P1": "A", "P2": "A", "P3": "A", "P4": "A", "P5": "A", "P7": "A", "P8": "A"}
eq("P17-F não derruba um Matutino claro",
   classificar_cronotipo({**forte, "P17": "F"})[0], "Matutino")

print("\n— campos_de_perfil —")
trabalho = [{"activity": "Trabalho", "days": ["seg", "sex"], "start": "09:00", "end": "18:00"}]
eq("APK antigo (nada novo) não grava nada",
   campos_de_perfil(None, "fixed", None, None), {})
eq("fixo grava os compromissos",
   campos_de_perfil(None, "fixed", trabalho, None), {"fixed_commitments": trabalho})
eq("flexível não apaga os compromissos guardados",
   campos_de_perfil(None, "flexible", trabalho, None), {})
eq("horários e perfil entram juntos",
   sorted(campos_de_perfil(horarios, None, None, {"goals": ["study"]})),
   ["freeday_sleep", "freeday_wake", "onboarding_profile", "workday_sleep", "workday_wake"])

print("\n— segmentos_do_dia —")
seg = segmentos_do_dia("Matutino")
eq("cobre as 24h sem buraco",
   all(seg[i]["end"] == seg[(i + 1) % len(seg)]["start"] for i in range(len(seg))), True)
eq("sono que atravessa a meia-noite é um trecho só",
   [s["start"] + "-" + s["end"] for s in seg if s["level"] == "sono"], ["22:30-06:00"])
eq("pico do matutino de manhã",
   [s["start"] + "-" + s["end"] for s in seg if s["level"] == "pico"], ["07:30-12:00"])
eq("energia tem 24 horas", len(energia_do_dia("Noturno")), 24)
eq("cronotipo desconhecido cai no Misto", segmentos_do_dia("xyz") == segmentos_do_dia("Misto"), True)

print("\n— schemas: o que o APK antigo manda continua aceito —")
antigo = ClassifyRequest(respostas={"P1": "A", "P18": "G"}, qualidade_sono="B",
                         schedule_type="fixed")
eq("pedido antigo é válido", antigo.horarios is None and antigo.onboarding is None, True)

print("\n— schemas: entradas recusadas —")
base = {"respostas": {"P1": "A"}, "qualidade_sono": "A"}
recusa("hora inválida (25:00)", ClassifyRequest,
       {**base, "horarios": {**horarios, "workday_sleep": "25:00"}})
recusa("hora sem zero (7:00)", ClassifyRequest,
       {**base, "horarios": {**horarios, "workday_wake": "7:00"}})
recusa("quatro objetivos (máx. 3)", ClassifyRequest,
       {**base, "onboarding": {"goals": ["work", "study", "energy", "balance"]}})
recusa("dor que não existe", ClassifyRequest,
       {**base, "onboarding": {"pains": ["outra coisa"]}})
recusa("'outro' longo demais", ClassifyRequest,
       {**base, "onboarding": {"pains_other": "x" * 121}})
recusa("compromisso sem dia", ClassifyRequest,
       {**base, "fixed_commitments": [{"activity": "Trabalho", "days": [], "start": "09:00", "end": "18:00"}]})
recusa("compromisso sem nome", ClassifyRequest,
       {**base, "fixed_commitments": [{"activity": "   ", "days": ["seg"], "start": "09:00", "end": "18:00"}]})
recusa("compromisso de 0 minutos", ClassifyRequest,
       {**base, "fixed_commitments": [{"activity": "Aula", "days": ["seg"], "start": "09:00", "end": "09:00"}]})

print("\n— schemas: limpeza das respostas —")
limpo = ClassifyRequest(**{**base, "onboarding": {
    "pains": ["distraction", "procrastination", "distraction"],
    "pains_other": "  muitas   reuniões\n ",
    "goals_other": "   ",
}}).onboarding
eq("ordem preservada, duplicata removida", limpo.pains, ["distraction", "procrastination"])
eq("'outro' com espaços normalizados", limpo.pains_other, "muitas reuniões")
eq("'outro' vazio vira None", limpo.goals_other, None)
turno = ClassifyRequest(**{**base, "fixed_commitments": [
    {"activity": " Plantão ", "days": ["dom", "seg", "seg"], "start": "22:00", "end": "06:00"}]}).fixed_commitments[0]
eq("turno que passa da meia-noite é aceito", (turno.start, turno.end), ("22:00", "06:00"))
eq("dias em ordem e sem repetição", turno.days, ["seg", "dom"])
eq("atividade sem espaços nas pontas", turno.activity, "Plantão")
recusa("texto livre na resposta", ClassifyRequest,
       {**base, "respostas": {"P1": "acordo cedo sempre"}})
recusa("respostas demais", ClassifyRequest,
       {**base, "respostas": {f"P{i}": "A" for i in range(40)}})

print("\nfaixas novas do sono e da tarefa difícil")
eq("depois da 1h30 pontua só Noturno", classificar_cronotipo({"P7": "H5"})[1]["Noturno"], 9)
eq("antes das 21h pontua só Matutino", classificar_cronotipo({"P7": "H1"})[1]["Matutino"], 9)
eq("resposta antiga da P7 ainda pontua (APK instalado)", classificar_cronotipo({"P7": "D"})[1]["Noturno"], 9)
eq("A9 pontua como A", classificar_cronotipo({"P10": "A9"})[1], classificar_cronotipo({"P10": "A"})[1])
eq("B9 pontua como B", classificar_cronotipo({"P10": "B9"})[1], classificar_cronotipo({"P10": "B"})[1])
com_texto = ClassifyRequest(**{**base, "onboarding": {"sleep_other": "  durmo   em dois turnos ", "current_focus_time": "early_morning"}}).onboarding
eq("texto do sono limpo", com_texto.sleep_other, "durmo em dois turnos")
eq("bem cedo aceito", com_texto.current_focus_time, "early_morning")

evento_ok = {"anon_id": "0b6f6f0e-3c1e-4c5a-9f3e-2f1a7c9d8e11", "flow_version": "v1",
             "platform": "web", "events": [{"step": "t03_nome", "event": "view"}]}
eq("lote de eventos válido", OnboardingEventsRequest(**evento_ok).platform, "web")
recusa("texto livre no option_id", OnboardingEventsRequest,
       {**evento_ok, "events": [{"step": "t03_nome", "event": "answer", "option_id": "Maria Silva"}]})
recusa("evento desconhecido", OnboardingEventsRequest,
       {**evento_ok, "events": [{"step": "t03_nome", "event": "clicou"}]})
recusa("lote vazio", OnboardingEventsRequest, {**evento_ok, "events": []})
recusa("lote acima de 50", OnboardingEventsRequest,
       {**evento_ok, "events": [{"step": "t01", "event": "view"}] * 51})
recusa("anon_id que não é UUID", OnboardingEventsRequest, {**evento_ok, "anon_id": "abc"})

print(f"\n{ok} ok, {falhas} falha(s)")
sys.exit(1 if falhas else 0)
