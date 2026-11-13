"""
Banco falso do Supabase para os testes do scheduler e do script de simulação.

Entende os filtros que o código usa (eq, neq, gte, lte, is_, not_, in_,
action->>chave, order, range, limit, single), insert/update/delete, a
restrição de tipos de notificação e colunas ausentes (migrations não
aplicadas). O relógio é controlado por _Clock.now.

Compartilhado (e não copiado) por tests_day_reminders.py e
tests_simular_notificacoes.py: o teste que compara o scheduler com a
simulação precisa que os dois rodem sobre o MESMO banco.
"""

import random
from datetime import datetime, timezone


# ── Relógio ──────────────────────────────────────────────────────────────────

class _Clock:
    now = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)


class _FakeDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return _Clock.now.astimezone(tz) if tz else _Clock.now.replace(tzinfo=None)


# ── Banco falso ──────────────────────────────────────────────────────────────

def _get(row, col):
    if "->>" in col:
        base, key = col.split("->>")
        v = (row.get(base) or {}).get(key)
        return None if v is None else str(v)
    return row.get(col)


class _Res:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.cols, self.preds, self.neg = "*", [], False
        self.ins = self.upd = None
        self.dele = False
        self.lim = self.rng = self.ord = None
        self.is_single = False

    # filtros
    @property
    def not_(self):
        self.neg = True
        return self

    def _add(self, pred):
        neg, self.neg = self.neg, False
        self.preds.append((lambda r: not pred(r)) if neg else pred)
        return self

    def select(self, cols, count=None):
        self.cols = cols
        return self

    def eq(self, c, v):  return self._add(lambda r: str(_get(r, c)) == str(v))
    def neq(self, c, v): return self._add(lambda r: str(_get(r, c)) != str(v))
    def gte(self, c, v): return self._add(lambda r: _get(r, c) is not None and str(_get(r, c)) >= str(v))
    def lte(self, c, v): return self._add(lambda r: _get(r, c) is not None and str(_get(r, c)) <= str(v))
    def is_(self, c, v): return self._add(lambda r: _get(r, c) is None)
    def in_(self, c, vs): return self._add(lambda r: str(_get(r, c)) in {str(x) for x in vs})

    def order(self, col, desc=False, **k):
        self.ord = (col, desc)
        return self
    def limit(self, n):
        self.lim = n
        return self
    def range(self, a, b):
        self.rng = (a, b)
        return self
    def single(self):
        self.is_single = True
        return self

    def insert(self, row):
        self.ins = row
        return self

    def update(self, data):
        self.upd = data
        return self

    def delete(self):
        self.dele = True
        return self

    def upsert(self, *a, **k):
        # Nenhum código testado usa upsert em tabela deste banco; se passar a
        # usar, o teste precisa saber (e não passar em silêncio).
        raise NotImplementedError("upsert não simulado")

    def execute(self):
        db = self.db
        if self.table in db.falhar:
            raise RuntimeError(f"leitura de {self.table} falhou")
        if (self.table == "notifications" and self.upd is not None
                and "tapped_at" in self.upd and not db.migration_42):
            raise RuntimeError("column notifications.tapped_at does not exist")
        if self.table == "profiles" and self.cols != "*":
            faltando = [c.strip() for c in self.cols.split(",") if c.strip() not in db.profile_columns]
            if faltando:
                raise RuntimeError(f"column profiles.{faltando[0]} does not exist")
        rows = db.tables.setdefault(self.table, [])
        if self.ins is not None:
            row = dict(self.ins)
            if self.table == "notifications":
                if row["type"] not in db.allowed_types:
                    raise RuntimeError('new row violates check constraint "notifications_type_check"')
                row.setdefault("created_at", _Clock.now.isoformat())
                db.next_id += 1
                row["id"] = f"n{db.next_id}"
            rows.append(row)
            db.writes.append(("insert", self.table, row.get("id")))
            return _Res([row])
        hit = [r for r in rows if all(p(r) for p in self.preds)]
        if self.upd is not None:
            for r in hit:
                r.update(self.upd)
            db.writes.append(("update", self.table, [r.get("id") for r in hit]))
            return _Res(hit)
        if self.dele:
            db.tables[self.table] = [r for r in rows if r not in hit]
            db.writes.append(("delete", self.table, [r.get("id") for r in hit]))
            return _Res(hit)
        db.reads[self.table] = db.reads.get(self.table, 0) + 1
        if db.reads[self.table] > db.max_reads:
            raise RuntimeError(f"laço infinito lendo {self.table}")
        if self.ord:
            col, desc = self.ord
            hit = sorted(hit, key=lambda r: str(_get(r, col) or ""), reverse=desc)
        elif self.rng:
            # Sem .order() o Postgres não garante a ordem entre uma página e
            # outra; aqui ela muda a cada leitura, para a falta do .order()
            # aparecer como repetidos/pulados no teste.
            hit = list(hit)
            random.Random(db.reads[self.table]).shuffle(hit)
        if self.rng:
            hit = hit[self.rng[0] : self.rng[1] + 1]
        elif self.lim is None and not self.is_single:
            # db-max-rows do PostgREST: sem .range(), a resposta é cortada
            # em 1.000 linhas sem nenhum erro.
            hit = hit[:1000]
        if self.lim is not None:
            hit = hit[: self.lim]
        if self.is_single:
            return _Res(hit[0] if hit else None)
        return _Res(hit, count=len(hit))


class _FakeDB:
    def __init__(self):
        self.reset()

    def reset(self, migration_41=True, migration_40=True, migration_42=True):
        self.tables = {"profiles": [], "tasks": [], "notifications": [], "daily_logs": []}
        self.reads = {}
        self.writes: list[tuple] = []   # (operação, tabela, ids): o teste do script prova que fica vazio
        self.next_id = 0
        # Guarda contra laço infinito de paginação. Um dia inteiro simulado
        # (288 ciclos) lê bem mais que isso: quem simula o dia aumenta.
        self.max_reads = 100
        self.falhar: set[str] = set()   # tabelas cuja leitura lança
        self.migration_42 = migration_42
        base = {"id", "name", "chronotype", "timezone", "created_at", "daily_planning_enabled",
                "daily_planning_time", "daily_use_chronotype", "weekly_planning_enabled",
                "weekly_planning_day", "weekly_use_chronotype", "routine_analysis_enabled",
                "routine_analysis_time"} | ({"last_seen_at"} if migration_40 else set())
        novas = {"task_reminder_enabled", "day_review_reminder_enabled",
                 "plan_tomorrow_reminder_enabled", "day_review_reminder_time",
                 "plan_tomorrow_reminder_time"}
        self.profile_columns = base | (novas if migration_41 else set())
        # Restrição antiga do supabase_schema.sql (comentada lá; aqui, aplicada).
        antigos = {"simple", "improvement", "change", "planning_daily", "planning_weekly"}
        novos = {"task_reminder", "day_review_reminder", "plan_tomorrow_reminder"}
        self.allowed_types = antigos | (novos if migration_41 else set())

    def table(self, name):
        return _Query(self, name)
