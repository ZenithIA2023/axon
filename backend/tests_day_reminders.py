"""
Testes das notificações do item 10 (Migration 41): resumo do dia, 30 min
antes, registro do dia e organizar o amanhã.

As funções puras de services/day_reminders são testadas direto; o resto passa
pelo planning_scheduler REAL (run / _process_user / _send_task_reminders) com
um banco falso em memória que entende os filtros usados. Relógio controlado;
nada toca o Supabase, nada envia push.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_day_reminders.py
"""

import sys
import types
from datetime import datetime, timedelta, timezone


from fake_supabase import _Clock, _FakeDatetime, _FakeDB  # noqa: E402


DB = _FakeDB()
_fake = types.ModuleType("database")
_fake.supabase = DB
_fake.supabase_auth = None
sys.modules["database"] = _fake

from services import day_reminders as dr  # noqa: E402
from services import notification_service  # noqa: E402
from services import planning_scheduler as ps  # noqa: E402
from services import notification_catalog as cat  # noqa: E402
from services import notification_planner as npl  # noqa: E402

dr.datetime = _FakeDatetime
ps.datetime = _FakeDatetime
notification_service.datetime = _FakeDatetime
_push_real = notification_service._push
notification_service._push = lambda *a, **k: None  # nada de push de verdade

# tar_pico (o horário cai no pico do cronotipo) entra no sorteio com tar_1. Os
# casos deste arquivo falam de JANELA e de dedup, não de texto: com o pico
# desligado o texto é sempre o tar_1 e as asserções ficam exatas. O tar_pico
# tem seus próprios casos no fim e em tests_notification_catalog.py.
_in_peak_real = cat.in_peak
cat.in_peak = lambda *a, **k: False

CHAMADAS: list[str] = []
ps.daily_stats_service.reconcile = lambda *a, **k: CHAMADAS.append("reconcile")
ps.saved_time_service.close_day = lambda *a, **k: CHAMADAS.append("close_day")
ps.report_service.generate_weekly_report = lambda *a, **k: None
ps.report_service.generate_monthly_report = lambda *a, **k: None
ps.report_service.catch_up = lambda *a, **k: []
ps.routine_analysis_service.run_scheduled = lambda *a, **k: None

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


def at(y, mo, d, h, mi, s=0):
    _Clock.now = datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc)


def perfil(uid="u1", tz="UTC", **kw):
    p = {"id": uid, "name": "Bernardo Teste", "chronotype": "Misto", "timezone": tz,
         "daily_planning_enabled": False, "weekly_planning_enabled": False,
         "last_seen_at": _Clock.now.isoformat()}
    p.update(kw)
    DB.tables["profiles"].append(p)
    return p


_n = 0


def tarefa(uid, dia, hora, title="Gravar vídeo", **kw):
    global _n
    _n += 1
    t = {"id": f"t{_n}", "user_id": uid, "title": title, "task_type": "task", "status": "todo",
         "scheduled_date": dia, "start_time": hora, "routine_item_id": None}
    t.update(kw)
    DB.tables["tasks"].append(t)
    return t


def notifs(tipo=None, uid=None):
    return [n for n in DB.tables["notifications"]
            if (tipo is None or n["type"] == tipo) and (uid is None or n["user_id"] == uid)]


def reset(**kw):
    DB.reset(**kw)
    npl._end_of_day_decided.clear()
    CHAMADAS.clear()


# ── Funções puras ────────────────────────────────────────────────────────────

print("— horários e textos —")
eq("format_hour 9h", dr.format_hour("09:00"), "9h")
eq("format_hour 14h30", dr.format_hour("14:30"), "14h30")
eq("padrão matutino", dr.end_of_day_defaults("Matutino"), ("20:00", "20:30"))
eq("padrão intermediário", dr.end_of_day_defaults("Misto"), ("21:00", "21:30"))
eq("padrão bimodal", dr.end_of_day_defaults("bimodal"), ("21:00", "21:30"))
eq("padrão vespertino", dr.end_of_day_defaults("Vespertino"), ("22:00", "22:30"))
eq("padrão noturno", dr.end_of_day_defaults("night"), ("22:00", "22:30"))
eq("personalizado vence (coluna time HH:MM:SS)",
   dr.end_of_day_times({"chronotype": "Misto", "day_review_reminder_time": "19:45:00"}),
   ("19:45", "21:30"))
eq("interruptor ausente = ligado", dr.enabled({}, "task_reminder_enabled"), True)
eq("interruptor False = desligado", dr.enabled({"task_reminder_enabled": False}, "task_reminder_enabled"), False)

manha = datetime(2026, 11, 16, 8, 30)
print("\n— resumo do dia —")
eq("0 itens", dr.day_summary("Bernardo", [], manha),
   ("Bom dia, Bernardo!", "Seu dia está livre. Quer planejar?"))
eq("1 item com horário",
   dr.day_summary("Bernardo", [{"title": "Gravar vídeo", "task_type": "task", "start_time": "09:00:00"}], manha)[1],
   "Hoje você tem 1 tarefa: Gravar vídeo, às 9h.")
eq("1 item sem horário",
   dr.day_summary("Bernardo", [{"title": "Ler", "task_type": "task", "start_time": None}], manha)[1],
   "Hoje você tem 1 tarefa: Ler.")
varios = [
    {"title": "Almoço", "task_type": "task", "start_time": "12:00"},
    {"title": "Gravar vídeo", "task_type": "task", "start_time": "09:00"},
    {"title": "Ler", "task_type": "task", "start_time": None},
    {"title": "Treino", "task_type": "task", "start_time": "18:00"},
    {"title": "Email", "task_type": "task", "start_time": None},
]
eq("vários: a primeira", dr.day_summary("Bernardo", varios, manha)[1],
   "Hoje você tem 5 tarefas — a primeira às 9h: Gravar vídeo.")
eq("vários, lembrete saiu às 10h: a próxima",
   dr.day_summary("Bernardo", varios, datetime(2026, 11, 16, 10, 0))[1],
   "Hoje você tem 5 tarefas — a próxima às 12h: Almoço.")
eq("vários sem horário futuro",
   dr.day_summary("Bernardo", varios, datetime(2026, 11, 16, 19, 0))[1],
   "Hoje você tem 5 tarefas.")
eq("com evento: 'compromissos'",
   dr.day_summary("Bernardo", varios + [{"title": "Reunião", "task_type": "event", "start_time": "08:45"}], manha)[1],
   "Hoje você tem 6 compromissos — o primeiro às 8h45: Reunião.")
eq("saudação à tarde", dr.day_summary("Bernardo", [], datetime(2026, 11, 16, 15, 0))[0], "Boa tarde, Bernardo!")

# ── 30 min antes, pelo scheduler ─────────────────────────────────────────────

def ciclo():
    """Um ciclo do scheduler real."""
    ps.run()


print("\n— 30 min antes —")
reset(); at(2026, 11, 16, 9, 32)
perfil("u1")
tarefa("u1", "2026-11-16", "10:00:00")
ciclo()
t = notifs("task_reminder")
eq("ciclo 09:32, tarefa às 10:00: avisa", len(t), 1)
eq("…com 'em 28 minutos'", t[0]["body"] if t else None, "Começa em 28 minutos, às 10h.")
eq("…e a chave no action, com a variação sorteada", t[0]["action"] if t else None,
   {"task_id": "t1", "date": "2026-11-16", "start_time": "10:00",
    "variant_id": "tar_1", "family": "Utilitário"})
at(2026, 11, 16, 9, 37); ciclo()
eq("ciclo 09:37: não avisa de novo", len(notifs("task_reminder")), 1)

reset(); at(2026, 11, 16, 9, 25)
perfil("u1")
ciclo()
at(2026, 11, 16, 9, 50); tarefa("u1", "2026-11-16", "10:00")  # criada às 09:50
at(2026, 11, 16, 9, 52); ciclo()
eq("criada 09:50 para 10:00: avisa no ciclo seguinte", [n["body"] for n in notifs("task_reminder")],
   ["Começa em 8 minutos, às 10h."])

reset(); at(2026, 11, 16, 9, 32)
perfil("u1")
tk = tarefa("u1", "2026-11-16", "10:00")
ciclo()
tk["start_time"] = "10:20"  # remarcada depois do aviso
at(2026, 11, 16, 9, 52); ciclo()
eq("horário mudado depois do aviso: avisa de novo", [n["action"]["start_time"] for n in notifs("task_reminder")],
   ["10:00", "10:20"])

print("\n— 30 min antes: quem não recebe —")
reset(); at(2026, 11, 16, 9, 40)
perfil("u1")
tarefa("u1", "2026-11-16", "10:00", status="done")
tarefa("u1", "2026-11-16", "10:00", routine_item_id="ri1", title="Rotina")
ciclo()
eq("concluída e item de rotina: nada", len(notifs("task_reminder")), 0)
reset(); at(2026, 11, 16, 9, 40)
perfil("u1", last_seen_at=(_Clock.now - timedelta(days=30)).isoformat())
tarefa("u1", "2026-11-16", "10:00")
ciclo()
eq("conta inativa: nada", len(notifs("task_reminder")), 0)
reset(); at(2026, 11, 16, 9, 40)
perfil("u1", task_reminder_enabled=False)
tarefa("u1", "2026-11-16", "10:00")
ciclo()
eq("interruptor desligado: nada", len(notifs("task_reminder")), 0)

print("\n— dois fusos no mesmo ciclo —")
reset(); at(2026, 11, 16, 12, 40)   # 09:40 em São Paulo; 21:40 em Tóquio
perfil("sp", tz="America/Sao_Paulo")
perfil("tk", tz="Asia/Tokyo")
tarefa("sp", "2026-11-16", "10:00", title="SP 10h")
tarefa("tk", "2026-11-16", "22:00", title="Tóquio 22h")
tarefa("tk", "2026-11-16", "10:00", title="Tóquio 10h (já passou)")
tarefa("sp", "2026-11-16", "22:00", title="SP 22h (longe)")
ciclo()
eq("cada um avisado no próprio fuso",
   sorted((n["user_id"], n["title"], n["body"]) for n in notifs("task_reminder")),
   [("sp", "SP 10h", "Começa em 20 minutos, às 10h."), ("tk", "Tóquio 22h", "Começa em 20 minutos, às 22h.")])

print("\n— paginação da consulta em lote —")
reset(); at(2026, 11, 16, 9, 40)
perfil("u1")
for i in range(2300):
    tarefa("u0", "2026-11-16", "15:00", title=f"ruído {i}")
tarefa("u1", "2026-11-16", "10:00", title="depois do corte")
ciclo()
eq("tarefa depois das 1.000 primeiras linhas ainda é avisada",
   [n["title"] for n in notifs("task_reminder")], ["depois do corte"])

# ── Fim do dia ───────────────────────────────────────────────────────────────

print("\n— registro do dia e organizar o amanhã (Misto: 21:00 / 21:30) —")
reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
ciclo()
eq("21:02: registro sai", [n["type"] for n in notifs()], ["day_review_reminder"])
at(2026, 11, 16, 21, 7); ciclo()
eq("21:07: não repete", len(notifs("day_review_reminder")), 1)
at(2026, 11, 16, 21, 32); ciclo()
eq("21:32: organizar o amanhã sai", [n["type"] for n in notifs()], ["day_review_reminder", "plan_tomorrow_reminder"])
a = notifs("plan_tomorrow_reminder")[0]["action"]
eq("…com o dia de amanhã no action", a["date"], "2026-11-17")
eq("…e a variação gravada (id + família do catálogo)",
   (a["variant_id"] in cat.BY_ID and a["family"] == cat.BY_ID[a["variant_id"]].family
    and cat.BY_ID[a["variant_id"]].kind == cat.AMANHA), True)

reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
DB.tables["daily_logs"].append({"user_id": "u1", "date": "2026-11-16", "sleep_rating": 4,
                                "mood_rating": 4, "productivity_rating": 3})
ciclo()
eq("registro de hoje completo: sem aviso de registro", len(notifs("day_review_reminder")), 0)

reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
DB.tables["daily_logs"].append({"user_id": "u1", "date": "2026-11-16", "sleep_rating": 4,
                                "mood_rating": None, "productivity_rating": None})
ciclo()
eq("registro incompleto (só o sono): avisa", len(notifs("day_review_reminder")), 1)

reset(); at(2026, 11, 16, 21, 32)
perfil("u1")
DB.tables["notifications"].append({"user_id": "u1", "type": "day_review_reminder",
                                   "created_at": "2026-11-16T21:02:00+00:00"})
tarefa("u1", "2026-11-17", None, title="Amanhã sem horário")
ciclo()
eq("amanhã com tarefa: sem organizar o amanhã", len(notifs("plan_tomorrow_reminder")), 0)

print("\n— os dois nunca saem juntos —")
reset(); at(2026, 11, 16, 21, 40)   # servidor voltou tarde: os dois na janela
perfil("u1")
ciclo()
eq("21:40: só o registro", [n["type"] for n in notifs()], ["day_review_reminder"])
at(2026, 11, 16, 21, 55); ciclo()
eq("21:55: amanhã ainda espera (registro há 15 min)", len(notifs("plan_tomorrow_reminder")), 0)
at(2026, 11, 16, 22, 10); ciclo()
eq("22:10: agora sai (30 min depois)", len(notifs("plan_tomorrow_reminder")), 1)

print("\n— cada interruptor só desliga o seu —")
for desligado, tipo in (("day_review_reminder_enabled", "day_review_reminder"),
                        ("plan_tomorrow_reminder_enabled", "plan_tomorrow_reminder")):
    reset(); at(2026, 11, 16, 21, 2)
    perfil("u1", **{desligado: False})
    tarefa("u1", "2026-11-16", "21:20", title="Às 21h20")
    ciclo(); at(2026, 11, 16, 22, 5); ciclo()
    tipos = {n["type"] for n in notifs()}
    eq(f"{desligado}=False: {tipo} some", tipo in tipos, False)
    eq(f"{desligado}=False: os outros seguem",
       tipos, {"day_review_reminder", "plan_tomorrow_reminder", "task_reminder"} - {tipo})

print("\n— resumo da manhã no planning_daily —")
reset(); at(2026, 11, 16, 8, 32)
perfil("u1", daily_planning_enabled=True)
tarefa("u1", "2026-11-16", "09:00:00")
tarefa("u1", "2026-11-16", None, title="Ler")
ciclo()
d = notifs("planning_daily")
vid = d[0]["action"]["variant_id"] if d else None
# 2 itens, o das 9h é o primeiro, sem dado de semana: Parceiro, Brincalhão
# e Ritmo são as elegíveis (Dados e Memória não têm dado).
eq("resumo: variação elegível sorteada", vid in {"man_par_1", "man_bri_1", "man_rit_1"}, True)
esperado = {
    "man_par_1": ("Bom dia, Bernardo!", "Hoje são 2 tarefas. A primeira às 9h: Gravar vídeo."),
    "man_bri_1": ("Café pronto? ☕", "Hoje são 2 tarefas te esperando. A primeira às 9h."),
    "man_rit_1": ("Seu pico começa às 9h", "Hoje são 2 tarefas. Guarde o mais difícil para esse horário."),
}
eq("resumo: texto do catálogo com o dia real", (d[0]["title"], d[0]["body"]) if d else None, esperado.get(vid))

reset(); at(2026, 11, 16, 8, 32)
perfil("u1", daily_planning_enabled=True)
tarefa("u1", "2026-11-16", "09:00:00")
ciclo()
d = notifs("planning_daily")
# Misto: pico 9h–15h; a única tarefa às 9h está no pico → as três *_uni.
eq("resumo com 1 tarefa: uma das *_uni (o man_reserva ficou só para falha de leitura)",
   d[0]["action"]["variant_id"] in {"man_par_uni", "man_bri_uni", "man_rit_uni"} if d else None, True)
eq("…com o texto do catálogo", (d[0]["action"]["variant_id"], d[0]["body"]) in {
    ("man_par_uni", "Hoje o foco é um só: Gravar vídeo."),
    ("man_bri_uni", "Só uma missão hoje: Gravar vídeo."),
    ("man_rit_uni", "Um item só hoje: Gravar vídeo. Cabe direitinho nesse horário."),
} if d else None, True)

reset(); at(2026, 11, 16, 8, 32)
perfil("u1", daily_planning_enabled=True)
tarefa("u1", "2026-11-16", "09:00:00")
DB.falhar = {"tasks"}
ciclo()
d = notifs("planning_daily")
eq("resumo com a leitura das tarefas falhando → texto genérico antigo, sem número",
   (d[0]["action"]["variant_id"], d[0]["title"]) if d else None,
   ("man_generico", "Planejamento do dia, Bernardo"))

# ── Migration 41 não aplicada ────────────────────────────────────────────────

print("\n— Migration 41 não aplicada —")
reset(migration_41=False); at(2026, 11, 16, 0, 12)
perfil("u1")
ciclo()
eq("o ciclo não morre: reconcile e close_day rodam", sorted(CHAMADAS), ["close_day", "reconcile"])
at(2026, 11, 16, 8, 32)
DB.tables["profiles"][0]["daily_planning_enabled"] = True
ciclo()
eq("lembrete antigo (planning_daily) sai", len(notifs("planning_daily")), 1)
at(2026, 11, 16, 21, 2); ciclo()
eq("tipo novo recusado pela restrição antiga: engolido, ciclo segue", len(notifs("day_review_reminder")), 0)
DB.allowed_types |= {"task_reminder", "day_review_reminder", "plan_tomorrow_reminder"}  # aplica a migration
npl._end_of_day_decided.clear()
at(2026, 11, 16, 21, 7); ciclo()
eq("depois da migration: o tipo novo entra", len(notifs("day_review_reminder")), 1)

print("\n— nem a 40 nem a 41 aplicadas (último degrau do fallback) —")
reset(migration_41=False, migration_40=False); at(2026, 11, 16, 0, 12)
perfil("u1")
ciclo()
eq("o ciclo não morre: reconcile e close_day rodam", sorted(CHAMADAS), ["close_day", "reconcile"])

# ── Busca de perfis paginada ─────────────────────────────────────────────────

def processados(n, **kw):
    """Roda um ciclo com n perfis; devolve (ids processados, leituras de perfis)."""
    reset(**kw); at(2026, 11, 16, 3, 2)
    DB.tables["profiles"] = [
        {"id": f"u{i:05d}", "name": "Teste", "chronotype": "Misto", "timezone": "UTC"}
        for i in range(n)
    ]
    vistos = []
    original, original_tr = ps._process_user, ps._send_task_reminders
    ps._process_user = lambda user, now: vistos.append(user["id"])
    ps._send_task_reminders = lambda *a, **k: None
    try:
        ciclo()
    finally:
        ps._process_user, ps._send_task_reminders = original, original_tr
    return vistos, DB.reads.get("profiles", 0)


print("\n— busca de perfis paginada —")
esperado = {f"u{i:05d}" for i in range(2500)}
for nome, kw in (
    ("40 e 41 aplicadas", {}),
    ("só a 40 (degrau 2)", {"migration_41": False}),
    ("nenhuma (degrau 3)", {"migration_41": False, "migration_40": False}),
):
    vistos, _ = processados(2500, **kw)
    eq(f"2.500 perfis, {nome}: todos processados", set(vistos) == esperado, True)
    eq(f"2.500 perfis, {nome}: nenhum repetido", len(vistos), 2500)

vistos, leituras = processados(1000)
eq("exatamente 1.000: todos processados", len(set(vistos)), 1000)
eq("exatamente 1.000: duas leituras (a segunda vem vazia) e para", leituras, 2)
vistos, leituras = processados(0)
eq("nenhum perfil: uma leitura, ciclo vazio", (len(vistos), leituras), (0, 1))

# ── Catálogo no scheduler ────────────────────────────────────────────────────

def logs(uid, *dias):
    for dia in dias:
        DB.tables["daily_logs"].append({"user_id": uid, "date": dia, "sleep_rating": 4,
                                        "mood_rating": 4, "productivity_rating": 4})


print("\n— ofensiva em risco: reg_risco_* sempre, toque para ontem —")
vistos = set()
for _ in range(30):
    reset(); at(2026, 11, 16, 21, 2)
    perfil("u1")
    logs("u1", "2026-11-13", "2026-11-14")          # 15 em branco: congelada, 2 dias
    ciclo()
    r = notifs("day_review_reminder")
    vistos.add((r[0]["action"]["variant_id"], r[0]["action"]["registro"], r[0]["action"]["date"]) if r else None)
eq("30 envios com a ofensiva congelada: só reg_risco_*, sempre para ontem",
   vistos <= {("reg_risco_1", "ontem", "2026-11-15"), ("reg_risco_2", "ontem", "2026-11-15")}, True)
eq("…e as duas aparecem (sorteio, não escolha fixa)", len(vistos), 2)
r = notifs("day_review_reminder")[0]
eq("texto com a ofensiva real", (r["title"], r["body"]) in {
    ("Sua ofensiva de 2 dias", "Ontem ficou sem registro. Ainda dá tempo de salvar."),
    ("Ainda dá tempo 🔥", "Registra ontem e seus 2 dias continuam."),
}, True)

reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
logs("u1", "2026-11-14", "2026-11-15")                # ontem registrado: não congelada
ciclo()
r = notifs("day_review_reminder")[0]["action"]
eq("sem risco: sorteio normal, toque para hoje",
   (r["variant_id"].startswith("reg_risco"), r["registro"], r["date"]), (False, "hoje", "2026-11-16"))

print("\n— falha na leitura de dados → família Parceiro —")
_get_streak_real = npl.streak_service.get_streak
for tabela in ("daily_task_stats", "user_energy_profiles", "daily_logs"):
    fams = set()
    for _ in range(15):
        reset(); at(2026, 11, 16, 21, 2)
        perfil("u1")
        DB.falhar = {tabela} if tabela != "daily_logs" else set()
        if tabela == "daily_logs":
            # daily_logs é lido também pelo "registro completo?": falhar ali
            # cancela o aviso. Aqui só a ofensiva falha.
            npl.streak_service.get_streak = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x"))
        ciclo()
        r = notifs("day_review_reminder")
        fams.add(r[0]["action"]["family"] if r else None)
        if tabela == "daily_logs":
            npl.streak_service.get_streak = _get_streak_real
    eq(f"registro com {tabela} falhando: só Parceiro", fams, {"Parceiro"})

fams = set()
for _ in range(10):
    reset(); at(2026, 11, 16, 21, 32)
    perfil("u1")
    DB.tables["notifications"].append({"user_id": "u1", "type": "day_review_reminder",
                                       "created_at": "2026-11-16T21:02:00+00:00"})
    DB.falhar = {"notifications_hist"}
    original_vh = dr.variant_history
    dr.variant_history = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x"))
    ciclo()
    dr.variant_history = original_vh
    r = notifs("plan_tomorrow_reminder")
    fams.add(r[0]["action"]["family"] if r else None)
eq("amanhã com o histórico de variações falhando: só Parceiro", fams, {"Parceiro"})

print("\n— semanal pelo catálogo —")
reset(); at(2026, 11, 16, 8, 32)   # segunda: dia padrão do semanal
perfil("u1", weekly_planning_enabled=True)
for d_, taxa in (("2026-11-10", 80), ("2026-11-11", 70), ("2026-11-12", 90)):
    DB.tables.setdefault("daily_task_stats", []).append({"user_id": "u1", "date": d_, "total": 4, "completion_rate": taxa})
vs = set()
for _ in range(30):
    DB.tables["notifications"] = []
    ciclo()
    w = notifs("planning_weekly")
    vs.add((w[0]["action"]["variant_id"], w[0]["title"]) if w else None)
eq("semanal: sem_dad_1 com a média da semana passada entre as sorteadas",
   ("sem_dad_1", "Semana passada: 80%") in vs, True)
eq("semanal: só variações do catálogo", {v for v, _ in vs} <= {"sem_par_1", "sem_dad_1", "sem_cur_1"}, True)

print("\n— 30 min: tar_pico quando o horário cai no pico —")
cat.in_peak = _in_peak_real
vs = set()
for _ in range(30):
    reset(); at(2026, 11, 16, 9, 32)
    perfil("u1")                                    # Misto: pico entre 9h e 15h
    tarefa("u1", "2026-11-16", "10:00:00")
    ciclo()
    t = notifs("task_reminder")
    vs.add((t[0]["action"]["variant_id"], t[0]["body"]) if t else None)
eq("10h no pico do Misto: tar_1 e tar_pico sorteadas", vs, {
    ("tar_1", "Começa em 28 minutos, às 10h."),
    ("tar_pico", "Começa às 10h, bem no seu pico de energia."),
})
reset(); at(2026, 11, 16, 19, 32)
perfil("u1")
tarefa("u1", "2026-11-16", "20:00:00")
ciclo()
eq("20h fora do pico do Misto: só tar_1", notifs("task_reminder")[0]["action"]["variant_id"], "tar_1")
reset(); at(2026, 11, 16, 9, 32)
perfil("u1")
tarefa("u1", "2026-11-16", "10:00:00", title="A")
tarefa("u1", "2026-11-16", "10:00:00", title="B")
DB.tables["notifications"].append({"user_id": "u1", "type": "task_reminder", "id": "old",
                                   "created_at": "2026-11-14T10:00:00+00:00",
                                   "action": {"variant_id": "tar_pico", "family": "Utilitário"}})
ciclo()
# A primeira do ciclo: tar_pico foi usada há 2 dias → só tar_1 está livre. A
# segunda: as duas já foram usadas nos 7 dias (tar_1 agora) → a menos recente.
eq("histórico do lote: 1ª sai tar_1 (tar_pico usada há 2 dias), 2ª a menos recente",
   [n["action"]["variant_id"] for n in notifs("task_reminder") if n.get("id") != "old"], ["tar_1", "tar_pico"])
cat.in_peak = lambda *a, **k: False

print("\n— push leva o id; toque marca lida + horário —")
enviados = []
fake_push = types.ModuleType("services.push_service")
fake_push.send_to_user = lambda uid, title, body, data: enviados.append(data)
sys.modules["services.push_service"] = fake_push
import services  # noqa: E402
services.push_service = fake_push
notification_service._push = _push_real
reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
logs("u1", "2026-11-13", "2026-11-14")
ciclo()
n = notifs("day_review_reminder")[0]
eq("push com notification_id, registro=ontem e a data", (enviados[-1].get("notification_id"),
   enviados[-1].get("registro"), enviados[-1].get("date"), enviados[-1].get("type")),
   (n["id"], "ontem", "2026-11-15", "day_review_reminder"))
notification_service._push = lambda *a, **k: None

at(2026, 11, 16, 21, 9)
eq("toque de OUTRO usuário não marca", notification_service.mark_tapped("u2", n["id"]), {})
eq("…e a notificação segue não lida", n["status"], "unread")
res = notification_service.mark_tapped("u1", n["id"])
eq("toque marca como lida", res.get("status"), "read")
eq("…com read_at e tapped_at no horário do toque", (res.get("read_at"), res.get("tapped_at")),
   ("2026-11-16T21:09:00+00:00", "2026-11-16T21:09:00+00:00"))
reset(migration_42=False); at(2026, 11, 16, 21, 2)
perfil("u1")
ciclo()
n = notifs("day_review_reminder")[0]
res = notification_service.mark_tapped("u1", n["id"])
eq("sem a Migration 42: marca como lida mesmo assim, sem tapped_at",
   (res.get("status"), "tapped_at" in res), ("read", False))

print("\n— rota POST /notifications/{id}/tap —")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from routers import notifications as notif_router  # noqa: E402
from auth_helper import get_current_user  # noqa: E402
app = FastAPI()
app.include_router(notif_router.router)
app.dependency_overrides[get_current_user] = lambda: {"id": "u1", "email": "x@x"}
reset(); at(2026, 11, 16, 21, 2)
perfil("u1")
ciclo()
n = notifs("day_review_reminder")[0]
cli = TestClient(app)
r = cli.post(f"/notifications/{n['id']}/tap")
eq("rota responde 200 com a notificação lida", (r.status_code, r.json().get("status")), (200, "read"))
eq("rota grava tapped_at", bool(n.get("tapped_at")), True)
r = cli.post("/notifications/nao-existe/tap")
eq("id de outra pessoa/inexistente: 404", r.status_code, 404)

print(f"\n{ok} passaram, {falhas} falharam")
sys.exit(1 if falhas else 0)
