"""
Testes do corte por inatividade (Migration 40): services/activity_service e o
portão em planning_scheduler._process_user.

Regra: 21 dias sem usar o app congela SÓ os três blocos que chamam o Claude
(relatórios semanal/mensal, catch-up, análise de rotina). Reconcile,
close_day e os lembretes de push continuam. Nulo = ativo.

Banco falso em memória; nada toca o Supabase nem chama o Claude.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_activity.py
"""

import sys
import types
from datetime import datetime, timedelta, timezone


# ── Banco falso ─────────────────────────────────────────────────────────────

class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db, table):
        self.db, self.table, self.cols, self.upd, self.filters = db, table, "", None, {}
        self.rng = None

    @property
    def not_(self):
        return self

    def is_(self, *a):
        return self

    def select(self, cols):
        self.cols = cols
        return self

    # O _fetch_users pagina (ordem por id + faixa); a ordem aqui já é estável.
    def order(self, *a, **k):
        return self

    def range(self, a, b):
        self.rng = (a, b)
        return self

    def update(self, data):
        self.upd = data
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def execute(self):
        if self.db.falhar_escrita and self.upd is not None:
            raise RuntimeError("banco fora do ar")
        if self.db.sem_coluna and "last_seen_at" in self.cols:
            raise RuntimeError("column profiles.last_seen_at does not exist")
        if self.upd is not None:
            self.db.writes.append((self.filters.get("id"), self.upd))
            for row in self.db.profiles:
                if row["id"] == self.filters.get("id"):
                    row.update(self.upd)
            return _Res([])
        cols = [c.strip() for c in self.cols.split(",")]
        rows = [{k: v for k, v in r.items() if k in cols} for r in self.db.profiles]
        if self.rng:
            rows = rows[self.rng[0] : self.rng[1] + 1]
        return _Res(rows)


class _FakeDB:
    def __init__(self):
        self.profiles, self.writes = [], []
        self.falhar_escrita = self.sem_coluna = False

    def table(self, name):
        return _Query(self, name)


DB = _FakeDB()
_fake = types.ModuleType("database")
_fake.supabase = DB
_fake.supabase_auth = None
sys.modules["database"] = _fake

from services import activity_service as act  # noqa: E402
from services import planning_scheduler as ps  # noqa: E402
import auth_helper  # noqa: E402

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


# ── Chamadas registradas do scheduler ───────────────────────────────────────

CHAMADAS: list[str] = []
CLAUDE = {"weekly_report", "monthly_report", "catch_up", "routine_analysis"}

ps.daily_stats_service.reconcile = lambda *a, **k: CHAMADAS.append("reconcile")
ps.saved_time_service.close_day = lambda *a, **k: CHAMADAS.append("close_day")
ps.report_service.generate_weekly_report = lambda *a, **k: CHAMADAS.append("weekly_report")
ps.report_service.generate_monthly_report = lambda *a, **k: CHAMADAS.append("monthly_report")
ps.report_service.catch_up = lambda *a, **k: CHAMADAS.append("catch_up") or []
ps.routine_analysis_service.run_scheduled = lambda *a, **k: CHAMADAS.append("routine_analysis")
ps.notification_service.has_planning_reminder_today = lambda *a, **k: False
ps.notification_service.has_planning_reminder_this_week = lambda *a, **k: False
ps.notification_service.create_notification = (
    lambda **k: CHAMADAS.append(k["notif_type"])
)

# Instantes (UTC, usuário em UTC) que, juntos, abrem TODAS as janelas:
# domingo 29/11/2026 → 00:10 (reconcile), 09:00 (catch-up, lembrete diário),
# 20:00 (semanal + análise de rotina); segunda 30/11 20:00 (último dia do mês:
# mensal; segunda é o dia padrão do lembrete semanal).
INSTANTES = [
    datetime(2026, 11, 29, 0, 12, tzinfo=timezone.utc),
    datetime(2026, 11, 29, 9, 2, tzinfo=timezone.utc),
    datetime(2026, 11, 29, 20, 2, tzinfo=timezone.utc),
    datetime(2026, 11, 30, 20, 2, tzinfo=timezone.utc),
]


def usuario(last_seen):
    u = {"id": "u1", "name": "Teste", "chronotype": "Misto", "timezone": "UTC",
         "routine_analysis_enabled": True, "routine_analysis_time": "20:00"}
    if last_seen is not ...:
        u["last_seen_at"] = last_seen
    return u


def ciclo(dias_sem_uso):
    """Roda _process_user nos quatro instantes; devolve o conjunto de chamadas."""
    CHAMADAS.clear()
    for agora in INSTANTES:
        if dias_sem_uso is None:
            visto = None
        elif dias_sem_uso is ...:
            visto = ...
        else:
            visto = (agora - timedelta(days=dias_sem_uso)).isoformat()
        ps._process_user(usuario(visto), agora)
    return set(CHAMADAS)


TUDO = CLAUDE | {"reconcile", "close_day", "planning_daily", "planning_weekly"}

# ── is_active (pura) ────────────────────────────────────────────────────────

print("— is_active —")
AGORA = datetime(2026, 11, 29, 12, 0, tzinfo=timezone.utc)
eq("hoje", act.is_active((AGORA - timedelta(hours=1)).isoformat(), AGORA), True)
eq("20 dias", act.is_active((AGORA - timedelta(days=20)).isoformat(), AGORA), True)
eq("21 dias menos 1 minuto", act.is_active((AGORA - timedelta(days=21, minutes=-1)).isoformat(), AGORA), True)
eq("21 dias exatos: corte", act.is_active((AGORA - timedelta(days=21)).isoformat(), AGORA), False)
eq("22 dias", act.is_active((AGORA - timedelta(days=22)).isoformat(), AGORA), False)
eq("nulo = ativo", act.is_active(None, AGORA), True)
eq("ilegível = ativo", act.is_active("ontem", AGORA), True)
eq("formato do Supabase (+00:00, microssegundos)",
   act.is_active("2026-11-01T10:00:00.123456+00:00", AGORA), False)
eq("sufixo Z", act.is_active("2026-11-28T10:00:00Z", AGORA), True)

# ── portão no _process_user ─────────────────────────────────────────────────

print("\n— scheduler: quem roda —")
eq("último uso hoje: tudo roda", ciclo(0), TUDO)
eq("20 dias: tudo roda", ciclo(20), TUDO)
r = ciclo(22)
eq("22 dias: os três blocos de Claude são pulados", r & CLAUDE, set())
eq("22 dias: reconcile, close_day e lembretes rodam",
   r, {"reconcile", "close_day", "planning_daily", "planning_weekly"})
eq("last_seen_at nulo: ativo (contas antigas)", ciclo(None), TUDO)
eq("coluna ausente na linha: ativo", ciclo(...), TUDO)

# ── mark_seen ───────────────────────────────────────────────────────────────

print("\n— mark_seen: uma escrita por dia —")
act._last_written.clear(); DB.writes.clear()
DIA1 = datetime(2026, 11, 29, 8, 0, tzinfo=timezone.utc)
for minutos in range(0, 600, 37):   # várias requisições ao longo do dia
    act.mark_seen("u1", DIA1 + timedelta(minutes=minutos))
eq("várias requisições no mesmo dia → 1 escrita", len(DB.writes), 1)
act.mark_seen("u1", DIA1 + timedelta(days=1))
eq("no dia seguinte → mais uma", len(DB.writes), 2)
act.mark_seen("u2", DIA1)
eq("outro usuário escreve o dele", [w[0] for w in DB.writes], ["u1", "u1", "u2"])
eq("grava o instante em ISO", DB.writes[0][1]["last_seen_at"], DIA1.isoformat())

print("\n— mark_seen: concorrência (abertura do app dispara várias requisições) —")
import threading  # noqa: E402
act._last_written.clear(); DB.writes.clear()
threads = [threading.Thread(target=act.mark_seen, args=("u9", DIA1)) for _ in range(20)]
[t.start() for t in threads]; [t.join() for t in threads]
eq("20 requisições simultâneas → 1 escrita", len(DB.writes), 1)

print("\n— falha na escrita não quebra a autenticação —")
act._last_written.clear(); DB.writes.clear(); DB.falhar_escrita = True
try:
    act.mark_seen("u1", DIA1)
    eq("mark_seen engole a falha", True, True)
except Exception as e:  # noqa: BLE001
    eq("mark_seen engole a falha", repr(e), "nenhuma exceção")


class _User:
    id, email = "u1", "u1@exemplo.com"


auth_helper.supabase_auth = types.SimpleNamespace(
    auth=types.SimpleNamespace(get_user=lambda token: types.SimpleNamespace(user=_User()))
)
cred = types.SimpleNamespace(credentials="token")
act._last_written.clear()
eq("get_current_user devolve o usuário com o banco falhando",
   auth_helper.get_current_user(cred), {"id": "u1", "email": "u1@exemplo.com"})
original = act.mark_seen
act.mark_seen = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("bug no mark_seen"))
eq("…e até com o próprio mark_seen lançando",
   auth_helper.get_current_user(cred), {"id": "u1", "email": "u1@exemplo.com"})
act.mark_seen = original
DB.falhar_escrita = False

# ── volta de quem estava congelado (run() real) ─────────────────────────────

print("\n— congelado volta → religa sozinho —")
ps.datetime = type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: INSTANTES[2])})
antigo = (INSTANTES[2] - timedelta(days=40)).isoformat()
DB.profiles = [usuario(antigo)]
CHAMADAS.clear(); ps.run()
eq("antes de voltar: domingo 20h sem relatório nem análise", set(CHAMADAS) & CLAUDE, set())
# a pessoa abre o app: uma requisição autenticada qualquer
act._last_written.clear()
act.mark_seen("u1", INSTANTES[2] - timedelta(minutes=1))
CHAMADAS.clear(); ps.run()
eq("ciclo seguinte: relatório semanal e análise voltam",
   set(CHAMADAS) & CLAUDE, {"weekly_report", "routine_analysis"})

print("\n— migration ainda não aplicada (coluna não existe) —")
DB.sem_coluna = True
DB.profiles = [usuario(...)]
CHAMADAS.clear(); ps.run()
eq("o ciclo não morre: tudo roda como antes", set(CHAMADAS),
   {"weekly_report", "routine_analysis", "planning_daily"})
DB.sem_coluna = False

print(f"\n{ok} passaram, {falhas} falharam")
sys.exit(1 if falhas else 0)
