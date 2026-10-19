"""
Camada comum do harness de avaliação de modelos do Axon.

Dois provedores:
- "anthropic": SDK oficial, direto pela nossa chave (mesmo caminho de produção,
  com o cache de prompt que o system já marca);
- "openrouter": API compatível com OpenAI (chat/completions), para os demais.

Toda chamada passa por `call()`, que devolve um formato único e soma o gasto.
A trava de orçamento interrompe tudo se o gasto do OpenRouter passar do teto.

Mora no repositório (testes_modelos_preços/), com os resultados em
../resultados — antes vivia fora dele e só neste Codespace; a primeira versão,
em /tmp, se perdeu num reinício.
"""

import fcntl
import json
import os
import sys
import time
from pathlib import Path

BACKEND = str(Path(__file__).resolve().parents[2] / "backend")
sys.path.insert(0, BACKEND)
os.chdir(BACKEND)
from dotenv import load_dotenv  # noqa: E402

load_dotenv(f"{BACKEND}/.env")

import anthropic  # noqa: E402
import httpx  # noqa: E402

from services.usage_service import claude_cost  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "resultados"
OUT.mkdir(exist_ok=True)

# Teto do OpenRouter nesta rodada de testes.
OPENROUTER_BUDGET = float(os.getenv("EVAL_OR_BUDGET", "2.5"))
SPEND_FILE = OUT / "spend.json"


def _load_spend() -> dict:
    if SPEND_FILE.exists():
        return json.loads(SPEND_FILE.read_text())
    return {"openrouter": 0.0, "anthropic": 0.0}


def _add_spend(provider: str, usd: float) -> None:
    # Vários processos rodam em paralelo: trava o arquivo no read-modify-write.
    with open(OUT / "spend.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        s = _load_spend()
        s[provider] = s.get(provider, 0.0) + (usd or 0.0)
        SPEND_FILE.write_text(json.dumps(s))


class BudgetExceeded(RuntimeError):
    pass


class OutOfCredit(RuntimeError):
    pass


def check_budget() -> None:
    s = _load_spend()
    if s["openrouter"] >= OPENROUTER_BUDGET:
        raise BudgetExceeded(f"gasto OpenRouter {s['openrouter']:.3f} >= teto {OPENROUTER_BUDGET}")


# ── Modelos ────────────────────────────────────────────────────────────────
MODELS = {
    "sonnet-4.6":        ("anthropic", "claude-sonnet-4-6", {}),
    "sonnet-5.5":        ("anthropic", "claude-sonnet-5-5", {"effort": "low"}),
    "haiku-4.5":         ("anthropic", "claude-haiku-4-5", {}),
    "gpt-6-luna":        ("openrouter", "openai/gpt-6-luna", {}),
    "gpt-6.1-sol":       ("openrouter", "openai/gpt-6.1-sol", {}),
    "gemini-3.8-flash":  ("openrouter", "google/gemini-3.8-flash", {}),
    "gemini-3.5-lite":   ("openrouter", "google/gemini-3.5-flash-lite", {}),
    "deepseek-v4.1-fl":  ("openrouter", "deepseek/deepseek-v4.1-flash", {}),
    "qwen-3.8-flash":    ("openrouter", "qwen/qwen3.8-flash", {}),
    "glm-5.3-flash":     ("openrouter", "z-ai/glm-5.3-flash", {}),
    "mistral-large-4":   ("openrouter", "mistralai/mistral-large-4-0", {}),
    "minimax-m3":        ("openrouter", "minimax/minimax-m3", {}),
}

_anthropic = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=3)
_or_key = os.environ["OPENROUTER_API_KEY"]


def _system_text(system) -> str:
    if isinstance(system, str):
        return system
    return "\n\n".join(b["text"] for b in system)


def to_openai_tools(tools: list[dict]) -> list[dict]:
    return [
        {"type": "function", "function": {
            "name": t["name"], "description": t["description"], "parameters": t["input_schema"],
        }}
        for t in tools
    ]


class Result:
    """Resposta normalizada de uma rodada."""

    def __init__(self):
        self.text = ""
        self.tool_calls: list[dict] = []   # [{id, name, input}]
        self.cost = 0.0
        self.usage: dict = {}
        self.latency = 0.0
        self.stop = None
        self.raw_assistant = None
        self.error = None


def call(model_key: str, system, messages: list, *, tools: list[dict] | None = None,
         max_tokens: int = 4096, thinking: str | None = None) -> Result:
    """
    Uma rodada. `messages` já no formato do provedor do modelo. `thinking` só
    vale para a Anthropic: "adaptive", "off" ou None (= config do modelo).
    """
    check_budget()
    prov, mid, cfg = MODELS[model_key]
    r = Result()
    t0 = time.time()
    if prov == "anthropic":
        kw = dict(model=mid, max_tokens=max_tokens, system=system, messages=messages)
        if tools:
            kw["tools"] = tools
        if mid == "claude-sonnet-5-5":
            # Sonnet 5.5 não aceita thinking disabled; "between_tools" é o
            # equivalente sem raciocínio. Effort baixo no resto (chat).
            if thinking == "off":
                kw["thinking"] = {"type": "between_tools"}
            else:
                kw["thinking"] = {"type": "adaptive"}
                kw["output_config"] = {"effort": cfg.get("effort", "low")}
        elif thinking == "adaptive" and mid != "claude-haiku-4-5":
            kw["thinking"] = {"type": "adaptive"}
        try:
            with _anthropic.messages.stream(**kw) as s:
                msg = s.get_final_message()
        except Exception as e:
            if "credit balance is too low" in str(e):
                # Sem crédito: para tudo em vez de gravar dezenas de erros.
                raise OutOfCredit(str(e)[:200])
            r.error = f"{type(e).__name__}: {e}"[:300]
            r.latency = time.time() - t0
            return r
        r.latency = time.time() - t0
        r.stop = msg.stop_reason
        u = msg.usage
        r.usage = {"in": u.input_tokens, "out": u.output_tokens,
                   "cache_read": u.cache_read_input_tokens or 0,
                   "cache_write": u.cache_creation_input_tokens or 0}
        r.cost = claude_cost(mid, u.input_tokens, u.output_tokens,
                             u.cache_read_input_tokens or 0, u.cache_creation_input_tokens or 0) or 0.0
        content = []
        for b in msg.content:
            if b.type == "text":
                r.text += b.text
                content.append({"type": "text", "text": b.text})
            elif b.type == "thinking":
                content.append({"type": "thinking", "thinking": b.thinking, "signature": b.signature})
            elif b.type == "redacted_thinking":
                content.append({"type": "redacted_thinking", "data": b.data})
            elif b.type == "tool_use":
                r.tool_calls.append({"id": b.id, "name": b.name, "input": b.input})
                content.append({"type": "tool_use", "id": b.id, "name": b.name, "input": b.input})
        r.raw_assistant = {"role": "assistant", "content": content}
        _add_spend("anthropic", r.cost)
        return r

    # OpenRouter
    body = {
        "model": mid, "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": _system_text(system)}] + messages,
        "usage": {"include": True},
        "reasoning": {"effort": "low"},
    }
    if tools:
        body["tools"] = to_openai_tools(tools)
    data = None
    for tentativa in range(3):
        try:
            resp = httpx.post("https://openrouter.ai/api/v1/chat/completions",
                              headers={"Authorization": f"Bearer {_or_key}"},
                              json=body, timeout=180)
            data = resp.json()
            if resp.status_code == 200 and data.get("choices"):
                break
            r.error = f"HTTP {resp.status_code}: {json.dumps(data)[:300]}"
        except Exception as e:
            r.error = f"{type(e).__name__}: {e}"[:300]
        time.sleep(3 * (tentativa + 1))
        data = None
    r.latency = time.time() - t0
    if data is None:
        return r
    r.error = None
    ch = data["choices"][0]
    m = ch["message"]
    r.stop = ch.get("finish_reason")
    r.text = m.get("content") or ""
    for tc in m.get("tool_calls") or []:
        try:
            args = json.loads(tc["function"].get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {"__invalid_json__": tc["function"].get("arguments")}
        r.tool_calls.append({"id": tc["id"], "name": tc["function"]["name"], "input": args})
    u = data.get("usage") or {}
    r.usage = {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0),
               "cache_read": (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
               "reasoning": (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)}
    r.cost = float(u.get("cost") or 0.0)
    # Reenvia a mensagem do assistente como veio (inclui reasoning_details,
    # que alguns provedores exigem de volta numa rodada de ferramenta).
    keep = {k: v for k, v in m.items() if k in ("role", "content", "tool_calls", "reasoning_details")}
    keep["role"] = "assistant"
    r.raw_assistant = keep
    _add_spend("openrouter", r.cost)
    return r


def tool_results_message(prov: str, results: list[tuple[str, dict]]) -> list[dict]:
    """[(tool_call_id, output_dict)] -> mensagens de resultado no formato do provedor."""
    if prov == "anthropic":
        return [{"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "content": json.dumps(out, ensure_ascii=False)}
            for tid, out in results
        ]}]
    return [{"role": "tool", "tool_call_id": tid, "content": json.dumps(out, ensure_ascii=False)}
            for tid, out in results]


def parse_json(text: str) -> dict | None:
    """Mesma tolerância do backend: acha do primeiro { ao último }."""
    if not text:
        return None
    t = text.strip()
    i, j = t.find("{"), t.rfind("}")
    if i < 0 or j < 0:
        return None
    try:
        return json.loads(t[i:j + 1])
    except json.JSONDecodeError:
        return None
