"""
Testes do backend/scripts/simular_notificacoes.py, com o banco falso
(fake_supabase) e relógio controlado. Nada toca o Supabase nem envia push.

O principal: a simulação de um dia inteiro tem que dar a MESMA linha do tempo
que o run() real do scheduler daria nesse dia — é o que prova que o script não
diverge do scheduler. Os outros provam que a simulação não escreve, que o
teste real só toca o usuário informado e apaga a linha, e que nada exige
confirmação para ser cancelado.

    cd backend && python3 tests_simular_notificacoes.py
"""

import copy
import importlib.util
import random
import sys
import types
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from fake_supabase import _Clock, _FakeDatetime, _FakeDB

DB = _FakeDB()
_fake = types.ModuleType("database")
_fake.supabase = DB
_fake.supabase_auth = None
sys.modules["database"] = _fake

# Push falso: registra o que seria entregue. Instalado antes de tudo para o
# _push real (usado no teste de envio) cair nele.
ENTREGUES: list[dict] = []
fake_push = types.ModuleType("services.push_service")
fake_push.CONFIGURADO = True
fake_push.is_configured = lambda: fake_push.CONFIGURADO
fake_push.send_to_user = lambda uid, title, body, data=None: ENTREGUES.append({"uid": uid, "title": title, **(data or {})})
sys.modules["services.push_service"] = fake_push

import services  # noqa: E402
services.push_service = fake_push
from services import day_reminders as dr  # noqa: E402
from services import notification_planner as npl  # noqa: E402
from services import notification_service  # noqa: E402
from services import planning_scheduler as ps  # noqa: E402

dr.datetime = _FakeDatetime
ps.datetime = _FakeDatetime
notification_service.datetime = _FakeDatetime
_push_real = notification_service._push
notification_service._push = lambda *a, **k: None   # ligado só nos testes de envio
ps.daily_stats_service.reconcile = lambda *a, **k: None
ps.saved_time_service.close_day = lambda *a, **k: None
ps.report_service.generate_weekly_report = lambda *a, **k: None
ps.report_service.generate_monthly_report = lambda *a, **k: None
ps.report_service.catch_up = lambda *a, **k: []
ps.routine_analysis_service.run_scheduled = lambda *a, **k: None

_spec = importlib.util.spec_from_file_location(
    "simular_notificacoes", Path(__file__).resolve().parent / "scripts" / "simular_notificacoes.py")
sim = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sim)
sim.datetime = _FakeDatetime   # o "agora" do script vem do relógio controlado

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


SP = ZoneInfo("America/Sao_Paulo")
DIA = date(2026, 11, 16)          # segunda: dia padrão do semanal
U, OUTRO = "u-bernardo", "u-outra-pessoa"


def cenario():
    """
    Um dia que exercita tudo: resumo e semanal de manhã, dois "30 min antes",
    registro com a ofensiva em risco (14/11 registrado, 15/11 não), organizar o
    amanhã (amanhã vazio), médias de semana e histórico real de 3 dias atrás.
    E OUTRA pessoa no banco, com dados de todo tipo, que nada pode tocar.
    """
    DB.reset()
    DB.max_reads = 10_000                 # um dia inteiro são 288 ciclos
    agora = datetime(2026, 11, 16, 3, 0, tzinfo=timezone.utc)
    DB.tables["profiles"] = [
        {"id": U, "name": "Bernardo Teste", "chronotype": "Misto", "timezone": "America/Sao_Paulo",
         "daily_planning_enabled": True, "weekly_planning_enabled": True,
         "last_seen_at": agora.isoformat()},
    ]
    DB.tables["tasks"] = [
        {"id": "t1", "user_id": U, "title": "Gravar vídeo", "task_type": "task", "status": "todo",
         "scheduled_date": "2026-11-16", "start_time": "09:00:00", "routine_item_id": None},
        {"id": "t2", "user_id": U, "title": "Reunião", "task_type": "event", "status": "todo",
         "scheduled_date": "2026-11-16", "start_time": "19:00:00", "routine_item_id": None},
        {"id": "t3", "user_id": U, "title": "Ler", "task_type": "task", "status": "done",
         "scheduled_date": "2026-11-16", "start_time": None, "routine_item_id": None},
    ]
    DB.tables["daily_logs"] = [
        {"user_id": U, "date": d, "sleep_rating": 4, "mood_rating": 4, "productivity_rating": 4}
        for d in ("2026-11-12", "2026-11-13", "2026-11-14")
    ]
    DB.tables["daily_task_stats"] = [
        {"user_id": U, "date": d, "total": 4, "completion_rate": r}
        for d, r in (("2026-11-09", 80), ("2026-11-10", 90), ("2026-11-11", 70))
    ]
    DB.tables["notifications"] = [
        {"id": "real1", "user_id": U, "type": "day_review_reminder", "status": "read",
         "title": "x", "body": "x", "created_at": "2026-11-13T00:05:00+00:00",
         "action": {"variant_id": "reg_par_1", "family": "Parceiro"}},
    ]
    # A outra pessoa: perfil, tarefas no mesmo horário, notificações, registros.
    DB.tables["profiles"].append(
        {"id": OUTRO, "name": "Outra Pessoa", "chronotype": "Matutino", "timezone": "America/Sao_Paulo",
         "daily_planning_enabled": True, "weekly_planning_enabled": True, "last_seen_at": agora.isoformat()})
    DB.tables["tasks"].append(
        {"id": "o1", "user_id": OUTRO, "title": "Da outra", "task_type": "task", "status": "todo",
         "scheduled_date": "2026-11-16", "start_time": "09:00:00", "routine_item_id": None})
    DB.tables["notifications"].append(
        {"id": "o-n1", "user_id": OUTRO, "type": "planning_daily", "status": "unread", "title": "y",
         "body": "y", "created_at": "2026-11-15T10:00:00+00:00", "action": {"variant_id": "man_par_1"}})
    DB.tables["device_tokens"] = [{"user_id": U, "platform": "android"}, {"user_id": OUTRO, "platform": "ios"}]
    return copy.deepcopy(DB.tables)


def cheias(tabelas):
    """O banco falso cria a tabela vazia na primeira LEITURA; isso não é escrita."""
    return {k: v for k, v in tabelas.items() if v}


def so(uid, rows):
    return [r for r in rows if r.get("user_id") == uid]


# ── 1. A simulação dá a mesma linha do tempo que o run() real ────────────────

# Três dias seguidos: no 2º e no 3º, o sorteio depende do que saiu antes (a
# exclusão de 7 dias) — num dia só, cada tipo sai uma vez e o histórico nunca
# decide nada, e a simulação poderia ignorá-lo sem o teste perceber.
DIAS = 3
print(f"— {DIAS} dias inteiros: simulação × run() real do scheduler —")
inicial = cenario()
# O run() processa TODOS os usuários (é o scheduler); a comparação é do que
# sai para o Bernardo. A outra pessoa sorteia com outro gerador — senão os
# sorteios dela consumiriam a sequência e os dois lados divergiriam por
# motivo que não é do código.
SEMENTE = 11
rng_por_usuario = {U: random.Random(SEMENTE), OUTRO: random.Random(99)}
_pick_real = npl.catalog.pick_explained


def pick_por_usuario(kind, ctx, history, now_utc, rng=None):
    return _pick_real(kind, ctx, history, now_utc, rng_por_usuario[_usuario_atual[0]])


_usuario_atual = [U]
_resolve_real, _task_choice_real = npl.resolve, npl.task_choice


def resolve_marcado(user_id, *a, **k):
    _usuario_atual[0] = str(user_id)
    return _resolve_real(user_id, *a, **k)


def task_choice_marcado(user, *a, **k):
    _usuario_atual[0] = str(user["id"])
    return _task_choice_real(user, *a, **k)


npl.resolve, npl.task_choice = resolve_marcado, task_choice_marcado
npl.catalog.pick_explained = pick_por_usuario

inicio = datetime.combine(DIA, datetime.min.time(), SP)
for k in range(DIAS * 24 * 12):
    _Clock.now = (inicio + timedelta(minutes=5 * k)).astimezone(timezone.utc)
    ps.run()

npl.resolve, npl.task_choice = _resolve_real, _task_choice_real
npl.catalog.pick_explained = _pick_real


def linha(quando, tipo, title, body, action):
    return (str(quando)[:16], tipo, title, body, tuple(sorted((action or {}).items())))


reais = [linha(datetime.fromisoformat(n["created_at"]).astimezone(SP), n["type"], n["title"], n["body"], n.get("action"))
         for n in so(U, DB.tables["notifications"]) if n["id"] != "real1"]

# Mesma partida para a simulação: o banco como estava antes do dia.
DB.tables = copy.deepcopy(inicial)
DB.writes.clear()
npl._end_of_day_decided.clear()
saida: list[str] = []
caixa = sim.simular(U, DIA, DIAS, SEMENTE, saida=saida.append)
simulados = [linha(ev["quando"].astimezone(SP), ev["tipo"], ev["title"], ev["body"], ev["action"])
             for ev in caixa.timeline if ev["sai"]]

eq("simulação = run() real, envio a envio (horário, tipo, texto, action)", simulados, reais)
tipos = sorted({r[1] for r in reais})
eq("…num dia que exercita todos os tipos", tipos,
   ["day_review_reminder", "plan_tomorrow_reminder", "planning_daily", "planning_weekly", "task_reminder"])
print(f"     {len(reais)} envios comparados: " + ", ".join(f"{r[0][8:]} {r[1]}" for r in reais))
eq("…e o 7 dias decide: nenhuma variação repetida no mesmo tipo dentro dos 3 dias quando havia outra livre",
   all(len({dict(r[4])["variant_id"] for r in reais if r[1] == t}) == len([r for r in reais if r[1] == t])
       for t in ("planning_daily", "day_review_reminder")), True)
eq("registro do 1º dia com a ofensiva em risco: reg_risco_*, toque para ontem",
   [dict(r[4])["registro"] for r in reais if r[1] == "day_review_reminder"][0], "ontem")

print("\n— a simulação não escreve e não lê dados de outra pessoa —")
eq("nenhuma escrita no banco durante a simulação", DB.writes, [])
eq("nenhum bloqueio da guarda (nenhuma consulta sem filtro, nenhuma de outra pessoa)", sim.VIOLACOES, [])
eq("o banco ficou idêntico ao de antes", cheias(DB.tables), cheias(inicial))
texto = "\n".join(saida)
eq("a tarefa da outra pessoa, no mesmo horário, não aparece", "Da outra" in texto, False)
eq("cabeçalho: primeiro nome, fuso e tokens; sem e-mail",
   ("Usuário: Bernardo · fuso America/Sao_Paulo" in texto, "Push: 1 token(s) android" in texto,
    "iPhone não recebe nada até o item 37" in texto, "@" in texto), (True, True, True, False))
eq("mostra o destino do toque e o porquê do sorteio",
   ("toque → Dashboard → registro de ONTEM" in texto, "elegíveis:" in texto, "fora do sorteio:" in texto),
   (True, True, True))
eq("a guarda nunca foi aberta para escrita: os módulos voltaram ao banco original",
   all(getattr(m, "supabase", DB) is DB for n, m in list(sys.modules.items())
       if m is not None and (n == "database" or n.startswith("services."))), True)

print("\n— o que não sai, e por quê —")
cenario()
DB.tables["tasks"].append({"id": "t9", "user_id": U, "title": "Amanhã", "task_type": "task", "status": "todo",
                           "scheduled_date": "2026-11-17", "start_time": None, "routine_item_id": None})
DB.tables["profiles"][0]["last_seen_at"] = "2026-10-01T00:00:00+00:00"   # inativa
DB.tables["daily_task_stats"] = [{"user_id": U, "date": d, "total": 4, "completion_rate": 55}
                                 for d in ("2026-11-09", "2026-11-10", "2026-11-11")]
saida = []
caixa = sim.simular(U, DIA, 1, 3, saida=saida.append)
texto = "\n".join(saida)
eq("organizar o amanhã: não sai — amanhã já tem tarefa", "Organizar o amanhã: não sai — amanhã já tem tarefa" in texto, True)
eq("30 min antes: fora — conta inativa", "30 min antes: não sai — Gravar vídeo (09:00): conta inativa" in texto, True)
eq("Dados fora com o motivo", "média 55% (abaixo de 60%, regra 2)" in texto, True)
eq("cada motivo aparece uma vez, não a cada ciclo", texto.count("amanhã já tem tarefa"), 1)

print("\n— --seed repete o sorteio —")
a = [ev.get("action") for ev in sim.simular(U, DIA, 2, 5, saida=lambda *_: None).timeline]
b = [ev.get("action") for ev in sim.simular(U, DIA, 2, 5, saida=lambda *_: None).timeline]
eq("mesma semente, mesma linha do tempo (2 dias)", a, b)

print("\n— a guarda —")
cenario()
DB.writes.clear()
sim.VIOLACOES.clear()
with sim.banco_restrito(U):
    for nome, f in (
        ("create_notification", lambda: notification_service.create_notification(
            user_id=U, notif_type="planning_daily", title="x", body="x")),
        ("update", lambda: notification_service.mark_read(U, "real1")),
        ("consulta sem filtro de usuário", lambda: npl.fetch_users()),
        ("consulta de outra pessoa", lambda: dr.open_items_on(OUTRO, DIA)),
    ):
        try:
            f()
            eq(f"bloqueia {nome}", "passou", "Proibido")
        except sim.Proibido:
            eq(f"bloqueia {nome}", "Proibido", "Proibido")
eq("nada escrito", DB.writes, [])
sim.VIOLACOES.clear()

# ── 2. Teste real ────────────────────────────────────────────────────────────

print("\n— --enviar-teste sem a confirmação digitada —")
inicial = cenario()
_Clock.now = datetime(2026, 11, 16, 11, 0, tzinfo=timezone.utc)
notification_service._push = _push_real
ENTREGUES.clear()
for tipo in sorted(sim.TIPOS_TESTE):
    r = sim.enviar_teste(U, tipo, seed=1, entrada=lambda _: "nao", espera=0, saida=lambda *_: None)
    eq(f"{tipo}: cancelado sem 'enviar'", r, {"enviado": False, "motivo": "sem confirmação"})
eq("nada escrito em nenhum dos cinco", (DB.writes, cheias(DB.tables) == cheias(inicial), ENTREGUES), ([], True, []))

print("\n— --enviar-teste sem credencial do Firebase —")
fake_push.CONFIGURADO = False
perguntou = []
r = sim.enviar_teste(U, "resumo", entrada=lambda p: perguntou.append(p) or "enviar", espera=0, saida=lambda *_: None)
eq("avisa e não envia (nem pergunta)", (r["motivo"], perguntou, DB.writes), ("sem firebase", [], []))
fake_push.CONFIGURADO = True

print("\n— --enviar-teste confirmado: só o informado é tocado, e a linha some —")
for tipo in sorted(sim.TIPOS_TESTE):
    inicial = cenario()
    ENTREGUES.clear()
    saida = []
    r = sim.enviar_teste(U, tipo, seed=1, entrada=lambda _: "enviar", espera=0, saida=saida.append)
    ops = [(op, tab) for op, tab, _ in DB.writes]
    eq(f"{tipo}: um insert e um delete em notifications, nada mais", ops,
       [("insert", "notifications"), ("delete", "notifications")])
    eq(f"{tipo}: o delete apagou exatamente a linha criada", DB.writes[1][2], [r["id"]])
    eq(f"{tipo}: banco igual ao de antes (inclusive a outra pessoa)", cheias(DB.tables), cheias(inicial))
    eq(f"{tipo}: push só para o informado, com o tipo certo",
       [(e["uid"], e["type"]) for e in ENTREGUES], [(U, sim.TIPOS_TESTE[tipo])])
    eq(f"{tipo}: confirma a exclusão", (r["apagada"], "Linha de teste apagada" in "\n".join(saida)), (True, True))
eq("nenhum bloqueio da guarda no envio", sim.VIOLACOES, [])
notification_service._push = lambda *a, **k: None

print("\n— proibições estruturais —")
eq("o main nunca foi importado", "main" in sys.modules, False)
eq("o APScheduler nunca foi importado", any(n.startswith("apscheduler") for n in sys.modules), False)

print(f"\n{ok} passaram, {falhas} falharam")
sys.exit(1 if falhas else 0)
