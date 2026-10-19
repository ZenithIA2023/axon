"""
A correção de 19/10/2026 (saída estruturada + descobertas sem thinking) vale
fora do Sonnet 4.6? Roda o prompt, o schema e o parser REAIS de produção nos
modelos da recomendação.

Anthropic: output_config.format (como claude_service.call_chat).
OpenRouter: response_format json_schema strict + require_parameters (só cai
em provedor que suporte o schema).

Uso: python3 structured_eval.py [--runs N]
"""

import json
import sys
import time

import httpx

import common
from common import OUT, _add_spend, _anthropic, _or_key, check_budget
from services.usage_service import claude_cost
import tasks_eval as T
from services import correlations_service as C, insights_service as I

TAREFAS = {
    "insights": (I.SYSTEM_PROMPT, I.build_user_message(T.ROWS), I.OUTPUT_SCHEMA, 8192,
                 lambda t: I.parse_insights(t)),
    "descobertas": (C._WRITER_SYSTEM_PROMPT, C._findings_to_user_message(T.FINDINGS),
                    C._WRITER_OUTPUT_SCHEMA, 4096, lambda t: C._parse_written_findings(t)),
}

# (rótulo, provedor, id, thinking) — thinking só para a Anthropic:
#   None = omitido (o que call_chat(thinking=False) faz hoje)
CONFIGS = [
    ("sonnet-4.6 (prod)", "anthropic", "claude-sonnet-4-6", None),
    ("sonnet-5.5 omitido", "anthropic", "claude-sonnet-5-5", None),
    ("sonnet-5.5 between_tools", "anthropic", "claude-sonnet-5-5", {"type": "between_tools"}),
    ("gpt-6.1-sol", "openrouter", "openai/gpt-6.1-sol", None),
    ("gpt-6-luna", "openrouter", "openai/gpt-6-luna", None),
    ("gemini-3.5-lite", "openrouter", "google/gemini-3.5-flash-lite", None),
    ("gemini-3.8-flash", "openrouter", "google/gemini-3.8-flash", None),
]


def anth(mid, thinking, system, user, schema, max_tokens):
    kw = dict(model=mid, max_tokens=max_tokens, system=system,
              messages=[{"role": "user", "content": user}],
              output_config={"format": {"type": "json_schema", "schema": schema}})
    if thinking:
        kw["thinking"] = thinking
    m = _anthropic.messages.create(**kw)
    u = m.usage
    cost = claude_cost(mid, u.input_tokens, u.output_tokens, u.cache_read_input_tokens or 0,
                       u.cache_creation_input_tokens or 0) or 0.0
    _add_spend("anthropic", cost)
    txt = "".join(b.text for b in m.content if b.type == "text")
    pensou = any(b.type in ("thinking", "redacted_thinking") for b in m.content)
    return txt, m.stop_reason, u.output_tokens, cost, pensou, None


def orouter(mid, system, user, schema, max_tokens):
    check_budget()
    body = {
        "model": mid, "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema",
                            "json_schema": {"name": "saida", "strict": True, "schema": schema}},
        "provider": {"require_parameters": True},
        "usage": {"include": True}, "reasoning": {"effort": "low"},
    }
    r = httpx.post("https://openrouter.ai/api/v1/chat/completions", json=body, timeout=180,
                   headers={"Authorization": f"Bearer {_or_key}"})
    d = r.json()
    if "error" in d:
        return "", "erro", 0, 0.0, False, str(d["error"])[:200]
    u = d.get("usage") or {}
    _add_spend("openrouter", u.get("cost") or 0.0)
    ch = d["choices"][0]
    rz = (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
    return (ch["message"].get("content") or ""), ch.get("finish_reason"), u.get("completion_tokens", 0), \
        u.get("cost") or 0.0, bool(rz), None


def main():
    runs = int(sys.argv[sys.argv.index("--runs") + 1]) if "--runs" in sys.argv else 2
    outf = OUT / "structured.jsonl"
    for label, prov, mid, th in CONFIGS:
        for tarefa, (sp, um, schema, mt, parse) in TAREFAS.items():
            for run in range(runs):
                t0 = time.time()
                try:
                    if prov == "anthropic":
                        txt, stop, out, cost, pensou, err = anth(mid, th, sp, um, schema, mt)
                    else:
                        txt, stop, out, cost, pensou, err = orouter(mid, sp, um, schema, mt)
                except Exception as e:  # noqa: BLE001
                    txt, stop, out, cost, pensou, err = "", "exc", 0, 0.0, False, f"{type(e).__name__}: {e}"[:200]
                try:
                    json.loads(txt)
                    valido = True
                except ValueError:
                    valido = False
                itens = parse(txt) if txt else []
                aspas = sum('"' in (i.get("title", "") + i.get("detail", "")) for i in itens)
                rec = dict(cfg=label, tarefa=tarefa, run=run, json_valido=valido, itens=len(itens),
                           com_aspas=aspas, stop=stop, out_tokens=out, pensou=pensou, cost=cost,
                           s=round(time.time() - t0, 1), erro=err)
                with outf.open("a") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                print(f"{label:26s} {tarefa:11s} r{run} json={valido!s:5s} itens={len(itens)} "
                      f"stop={stop} out={out} pensou={pensou} ${cost:.4f} {rec['s']}s {err or ''}", flush=True)


if __name__ == "__main__":
    main()
