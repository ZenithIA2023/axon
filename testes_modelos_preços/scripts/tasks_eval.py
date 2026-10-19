"""
Grupos B (redação a partir de dados calculados) e C (textos curtos estruturados).

Os prompts vêm das funções REAIS do backend. Onde o prompt é montado dentro da
função (reescrita, notificação de alteração, motivos da rotina), um cliente
Anthropic falso captura a requisição e aborta — nada é enviado nem gravado.

Retomável: pula (modelo, tarefa) que já tem resultado sem erro.

Uso: python3 tasks_eval.py <modelo> [...] [--only insights,descobertas] | --show
"""

import json
import random
import sys
import types
from datetime import datetime, timedelta

from common import OUT, BudgetExceeded, OutOfCredit, call, parse_json

from services import (  # noqa: E402
    chronotype,
    correlations_service,
    insights_service,
    notification_analyzer,
    report_service,
    routine_analysis_service,
    user_tz,
)

TZ = "America/Sao_Paulo"
ZONE = user_tz.zone(TZ)
HOJE = datetime.now(ZONE).date()
AMANHA = HOJE + timedelta(days=1)


# ── Captura de prompts montados dentro das funções ──────────────────────────
class _Captured(Exception):
    pass


def _capture(fn, *args, **kwargs) -> dict:
    """Roda `fn` com um anthropic falso e devolve os kwargs de messages.create."""
    box = {}

    class _Msgs:
        def create(self, **kw):
            box.update(kw)
            raise _Captured()

    fake = types.SimpleNamespace(Anthropic=lambda **_: types.SimpleNamespace(messages=_Msgs()))
    mods = [notification_analyzer, routine_analysis_service]
    old = [m.anthropic for m in mods]
    old_create = notification_analyzer.notification_service.create_notification
    for m in mods:
        m.anthropic = fake
    notification_analyzer.notification_service.create_notification = lambda **k: k
    try:
        fn(*args, **kwargs)
    finally:
        for m, o in zip(mods, old):
            m.anthropic = o
        notification_analyzer.notification_service.create_notification = old_create
    assert box, "prompt não capturado"
    return box


# ── Usuária fictícia: 35 dias de registros com padrões plantados ────────────
def _fixture_rows():
    rnd = random.Random(42)
    logs, tasks = [], []
    labels = {"tela_antes_dormir": "Tela antes de dormir", "cafe_tarde": "Café à tarde",
              "reuniao_longa": "Reuniões longas", "focada": "Focada", "ansiosa": "Ansiosa"}
    for k in range(35, 0, -1):
        d = HOJE - timedelta(days=k)
        wd = d.weekday()
        tela = rnd.random() < 0.35
        cafe = rnd.random() < 0.3
        exerc = wd in (0, 2, 4) and rnd.random() < 0.85
        sono = round((5.6 if tela else 7.3) + (-0.5 if cafe else 0) + rnd.uniform(-0.4, 0.4), 1)
        q_sono = 2 if sono < 6.2 else (4 if sono > 7 else 3)
        prod = max(1, min(5, (4 if sono >= 6.8 else 2) + (-1 if wd == 0 else 0) + rnd.choice([0, 0, 1, -1])))
        humor = max(1, min(5, 3 + (1 if exerc else 0) + (-1 if sono < 6 else 0) + rnd.choice([0, 0, 1])))
        domingo = wd == 6
        dorme = "00:40" if tela else ("23:50" if cafe else "22:50")
        logs.append({
            "date": str(d), "sleep_time": dorme, "wake_time": "06:30",
            "hours_slept": sono, "sleep_rating": q_sono, "mood_rating": humor,
            "productivity_rating": prod, "exercised": exerc,
            "sleep_tags": [x for x, on in (("tela_antes_dormir", tela), ("cafe_tarde", cafe)) if on],
            "mood_tags": ["ansiosa"] if sono < 6 else (["focada"] if prod >= 4 else []),
            "productivity_tags": ["reuniao_longa"] if wd == 0 else [],
            "peak_periods": ["cedo_manha", "manha"] if sono >= 6.5 else ["manha", "inicio_tarde"],
            "is_day_off": domingo,
        })
        n_done = 0 if domingo else max(0, (5 if sono >= 6.8 else 2) + rnd.choice([-1, 0, 1]) - (1 if wd == 0 else 0))
        for j in range(n_done):
            tasks.append({"status": "done", "completed_at": f"{d}T{12 + j:02d}:00:00+00:00"})
    return insights_service.aggregate_daily(logs, tasks, ZONE, labels)


ROWS = _fixture_rows()
FINDINGS = correlations_service.find_correlations(ROWS)

REPORT_DATA = {
    "period_start": str(HOJE - timedelta(days=6)), "period_end": str(HOJE), "generated_at": str(HOJE),
    "avg_completion_rate": 72, "completion_delta": 9, "completed_items": 26, "total_items": 36,
    "time_saved_minutes": 95,
    "most_productive_day": {"date": str(HOJE - timedelta(days=4)), "completion_rate": 100},
    "plan_vs_real": [{"label": "Horas registradas", "done": 18.5, "planned": 24.0, "unit": "h"},
                     {"label": "Tarefas", "done": 22, "planned": 30},
                     {"label": "Eventos", "done": 4, "planned": 6}],
    "objectives": [{"id": "o1", "title": "Aprender alemão", "progress": 18, "delta": 4},
                   {"id": "o2", "title": "Ler Sapiens", "progress": 35, "delta": 12}],
    "routines": [], "routine_consistency": [],
    "key_tasks": {"defined": 5, "done": 3},
    "sleep": {"avg_minutes": 392, "delta_minutes": -25, "avg_sleep_time": "23:40", "avg_wake_time": "06:35"},
    "wellbeing": {"scores": [{"key": "mood_rating", "label": "Humor", "value": 3.6},
                             {"key": "productivity_rating", "label": "Produtividade", "value": 3.2},
                             {"key": "sleep_rating", "label": "Qualidade do sono", "value": 2.9}],
                  "logs_count": 6},
}

_BLOCKS = chronotype.CHRONOTYPE_BLOCKS["morning"]


def _bad_time() -> str:
    for i in range(15, -1, -1):
        if _BLOCKS[i][0] in notification_analyzer._BAD_BLOCKS:
            m = i * 90 + 30
            return f"{m // 60:02d}:{m % 60:02d}"
    raise RuntimeError("sem bloco ruim")


BAD = _bad_time()


def _ctx(all_done: bool):
    hoje = [
        {"id": "a1", "title": "Relatório trimestral", "status": "done" if all_done else "todo",
         "start_time": "09:00:00", "end_time": "11:00:00", "task_type": "task", "scheduled_date": str(HOJE)},
        {"id": "a2", "title": "Reunião com o Pedro", "status": "done" if all_done else "todo",
         "start_time": "14:00:00", "end_time": "15:00:00", "task_type": "event", "scheduled_date": str(HOJE)},
    ]
    amanha = [] if all_done else [
        {"id": "a3", "title": "Estudar alemão", "status": "todo", "start_time": f"{BAD}:00",
         "end_time": None, "task_type": "task", "scheduled_date": str(AMANHA)},
    ]
    return {"user_name": "Marina", "chronotype": "Matutino", "curve_key": "morning", "blocks": _BLOCKS,
            "current_block_idx": 7, "tasks_today": hoje, "tasks_tomorrow": amanha,
            "memories": ["Prefere tarefas difíceis logo cedo, antes das 11h."],
            "recent_notifications": [], "today": str(HOJE), "now_hhmm": "11:20", "timezone": TZ}


def _flags(ctx):
    todo = [t for t in ctx["tasks_today"] if t["status"] in ("todo", "progress")]
    bad = notification_analyzer._has_tasks_in_bad_blocks(ctx["tasks_today"] + ctx["tasks_tomorrow"], ctx["blocks"])
    return {"has_tasks_today": True, "all_done": not todo, "none_started": len(todo) == len(ctx["tasks_today"]),
            "no_tasks_today": False, "bad_block_tasks": bad, "has_improvement_candidate": bool(bad),
            "compaction_candidate": None, "consecutive_rejections": 0}


CTX_BAD, CTX_DONE = _ctx(False), _ctx(True)
BUSY = {t["start_time"][:5] for t in CTX_BAD["tasks_today"] + CTX_BAD["tasks_tomorrow"]}

MOVES = [
    {"task_id": "a3", "title": "Estudar alemão", "old_start": "21:30", "new_start": "08:00", "kind": "bad_block",
     "reason": "saía de horário de baixa energia"},
    {"task_id": "a4", "title": "Responder e-mails", "old_start": "08:00", "new_start": "16:30",
     "kind": "complexity_match", "reason": "tarefa leve para o fim da tarde"},
    {"task_id": "a5", "title": "Ligar para o contador", "old_start": "17:30", "new_start": "16:00",
     "kind": "compaction", "reason": "fecha o vão e o dia acaba antes"},
]


# ── Corretores automáticos ──────────────────────────────────────────────────
def chk_insights(text):
    items = insights_service.parse_insights(text)
    return len(items) >= 3, f"{len(items)} insights válidos", items


def chk_descobertas(text):
    items = correlations_service._parse_written_findings(text)
    validos = [w for w in items if isinstance(w.get("source_index"), int) and 0 <= w["source_index"] < len(FINDINGS)]
    return bool(validos) and len(validos) == len(items), f"{len(validos)}/{len(items)} com source_index válido", items


def chk_relatorio(text):
    t = text.strip()
    return 200 < len(t) < 4000, f"{len(t)} chars", None


def chk_notif_bad(text):
    p = parse_json(text)
    if not p:
        return False, "JSON inválido", None
    a = p.get("action") or {}
    st = (a.get("new_start_time") or "")[:5]
    lvl = notification_analyzer._block_level_at(_BLOCKS, st) if st else None
    ok = (p.get("should_notify") and p.get("type") == "improvement" and a.get("task_id") == "a3"
          and lvl in notification_analyzer._GOOD_BLOCKS and st not in BUSY)
    return bool(ok), f"type={p.get('type')} task={a.get('task_id')} novo={st} bloco={lvl}", p


def chk_notif_done(text):
    p = parse_json(text)
    if not p:
        return False, "JSON inválido", None
    ok = p.get("type") != "improvement" and not (p.get("should_notify") and not p.get("body"))
    return bool(ok), f"notify={p.get('should_notify')} type={p.get('type')}", p


def _chk_rewrite(new_start):
    def f(text):
        p = parse_json(text)
        if not p:
            return False, "JSON inválido", None
        t, b = (p.get("title") or "").strip(), (p.get("body") or "").strip()
        # Mesma regra de produção (_rewrite_suggestion_text).
        ok = bool(t and b and (new_start in b or new_start in t))
        return ok, f"cita {new_start}={ok}", p
    return f


def chk_alteracao(text):
    p = parse_json(text)
    if not p:
        return False, "JSON inválido", None
    b = (p.get("title") or "") + " " + (p.get("body") or "")
    ok = bool(p.get("title") and p.get("body")) and any(k in b for k in ("08:00", "8h", "08h", "8:00"))
    return ok, f"cita horário={ok}", p


def chk_motivos(text):
    p = parse_json(text)
    rs = (p or {}).get("reasons") or []
    ok = len(rs) == len(MOVES) and all(0 < len(str(r).split()) <= 10 for r in rs)
    return ok, f"{len(rs)} motivos, palavras={[len(str(r).split()) for r in rs]}", rs


# ── Tarefas ─────────────────────────────────────────────────────────────────
def _tasks():
    T = []
    # B. Redação — config de produção: insights sem thinking; descobertas e
    # relatório com thinking (call_chat padrão).
    T.append(("insights", insights_service.SYSTEM_PROMPT, insights_service.build_user_message(ROWS),
              8192, "off", chk_insights))
    T.append(("descobertas", correlations_service._WRITER_SYSTEM_PROMPT,
              correlations_service._findings_to_user_message(FINDINGS), 4096, "adaptive", chk_descobertas))
    T.append(("relatorio", report_service._NARRATOR_SYSTEM_PROMPT,
              report_service._period_summary_message(REPORT_DATA), 4096, "adaptive", chk_relatorio))
    # C. Curtos — sem thinking em produção. max_tokens com folga (1024) para
    # não reprovar modelos de raciocínio pelo teto apertado de produção; o
    # consumo real de saída fica registrado.
    T.append(("notif_analise_bloco_ruim", None,
              notification_analyzer._build_analysis_prompt(CTX_BAD, _flags(CTX_BAD)), 1024, "off", chk_notif_bad))
    T.append(("notif_analise_tudo_feito", None,
              notification_analyzer._build_analysis_prompt(CTX_DONE, _flags(CTX_DONE)), 1024, "off", chk_notif_done))
    kw = _capture(notification_analyzer._rewrite_suggestion_text, user_id="x", ctx=CTX_BAD, task_id="a3",
                  new_date=str(AMANHA), new_start="08:00", reason="horário de pico de energia")
    T.append(("notif_reescrita_amanha", None, kw["messages"][0]["content"], 1024, "off", _chk_rewrite("08:00")))
    kw = _capture(notification_analyzer._rewrite_suggestion_text, user_id="x", ctx=CTX_BAD, task_id="a2",
                  new_date=str(HOJE), new_start="12:30", reason="fecha o vão do almoço",
                  compaction_end="15:30")
    T.append(("notif_reescrita_compactacao", None, kw["messages"][0]["content"], 1024, "off", _chk_rewrite("12:30")))
    kw = _capture(notification_analyzer.generate_change_notification, user_id="x", task_title="Estudar alemão",
                  old_time="21:30", new_time="08:00", reason="saía do horário de sono")
    T.append(("notif_alteracao", None, kw["messages"][0]["content"], 1024, "off", chk_alteracao))
    kw = _capture(routine_analysis_service._write_reasons, "x", [dict(m) for m in MOVES], "Marina")
    T.append(("rotina_motivos", None, kw["messages"][0]["content"], 1024, "off", chk_motivos))
    return T


TASKS = _tasks()


def main():
    args = sys.argv[1:]
    only, models, runs, outname = None, [], 1, "tasks.jsonl"
    i = 0
    while i < len(args):
        if args[i] == "--only":
            only = set(args[i + 1].split(",")); i += 2
        elif args[i] == "--runs":
            runs = int(args[i + 1]); i += 2
        elif args[i] == "--out":
            outname = args[i + 1]; i += 2
        else:
            models.append(args[i]); i += 1
    outf = OUT / outname
    feitos = set()
    if outf.exists():
        for l in outf.read_text().splitlines():
            r = json.loads(l)
            if not r.get("error"):
                feitos.add((r["model"], r["task"], r.get("run", 0)))
    for m in models:
        for run in range(runs):
            for name, system, user, mx, thinking, chk in TASKS:
                if (only and name not in only) or (m, name, run) in feitos:
                    continue
                try:
                    r = call(m, system or "", [{"role": "user", "content": user}], max_tokens=mx, thinking=thinking)
                except (BudgetExceeded, OutOfCredit) as e:
                    print("PARADO:", e, flush=True); return
                ok, note, parsed = (False, f"erro: {r.error}", None) if r.error else chk(r.text)
                rec = {"model": m, "task": name, "run": run, "passed": ok, "note": note, "text": r.text,
                       "cost": r.cost, "latency": round(r.latency, 2), "usage": r.usage, "stop": r.stop,
                       "error": r.error}
                with outf.open("a") as f:
                    f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
                print(f"{m:18s} r{run} {name:28s} {'OK ' if ok else 'xx '} ${r.cost:.4f} {r.latency:.1f}s {note[:70]}",
                      flush=True)


if __name__ == "__main__":
    if "--show" in sys.argv:
        print("rows:", len(ROWS), "findings:", len(FINDINGS), "BAD:", BAD)
    else:
        main()
