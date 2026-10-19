"""
Roteamento de modelos por tipo de tarefa: um modelo principal e uma reserva em
OUTRO provedor.

Por que existe: a avaliação de modelos de outubro/2026 mostrou que nenhum modelo
é o melhor custo-benefício em tudo, e o Sonnet 4.6 perdia para modelos mais
baratos em cada funcionalidade. Cada tarefa ganhou o seu modelo, e a reserva
fica em outro provedor porque a falha típica é do provedor inteiro (fora do ar,
sem crédito, chave ausente), não de um modelo só — uma reserva no mesmo
provedor cairia junto.

Uma chamada vai para a reserva quando o principal: lança erro (rede, HTTP,
timeout), devolve texto vazio, é cortado por teto de tokens ou, se a tarefa pede
JSON, devolve algo que não é um objeto JSON. Sem OPENROUTER_API_KEY no .env, as
rotas da OpenRouter são puladas e a reserva atende direto.

Privacidade: pela OpenRouter, só provedores que não treinam com os dados
(`data_collection: deny`) e não os retêm (`zdr`). Com o zdr, o GPT é servido
pela Azure em vez da OpenAI; o preço é o mesmo.

As chamadas com ferramentas (chat e voz) ainda não passam por aqui; seguem em
claude_service.stream_chat_with_tools.
"""

import json
import os

import httpx

from services import claude_service, usage_service

_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# O GPT-6.1 Sol levou até ~32s nos insights na avaliação; 60s dá folga sem
# deixar o usuário esperando o dobro antes de a reserva assumir.
_OPENROUTER_TIMEOUT_S = 60

# Rota = lista ordenada de (provedor, modelo). A primeira que responder vence.
# Escolhas e números em memory/avaliacao-modelos-out-2026 (rodada 2, 07/10/2026):
#   redação — GPT-6.1 Sol nota 8,4 a US$0,008 contra Sonnet 5.5 nota 7,0.
_ROUTES: dict[str, list[tuple[str, str]]] = {
    "redacao": [
        ("openrouter", "openai/gpt-6.1-sol"),
        ("anthropic", "claude-sonnet-5-5"),
    ],
}


class _RouteFailed(Exception):
    """O provedor respondeu, mas a resposta não serve (vazia, cortada, JSON inválido)."""


def _check(text: str, json_schema: dict | None) -> str:
    """Valida a resposta antes de aceitá-la; levanta _RouteFailed se não serve."""
    if not text or not text.strip():
        raise _RouteFailed("resposta vazia")
    if json_schema is not None:
        try:
            parsed = json.loads(text)
        except ValueError:
            raise _RouteFailed("JSON inválido") from None
        if not isinstance(parsed, dict):
            raise _RouteFailed("JSON não é objeto")
    return text


def _call_openrouter(model: str, system_prompt: str, user_message: str, *, json_schema: dict | None,
                     max_tokens: int, user_id: str | None, feature: str) -> str:
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise _RouteFailed("sem OPENROUTER_API_KEY")
    provider = {"data_collection": "deny", "zdr": True}
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        # Esforço baixo: foi a configuração avaliada. O raciocínio conta dentro
        # de max_tokens, como o thinking do Claude.
        "reasoning": {"effort": "low"},
        "usage": {"include": True},
        "provider": provider,
    }
    if json_schema is not None:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "saida", "strict": True, "schema": json_schema},
        }
        # Sem isto a OpenRouter pode escolher um provedor que ignora o schema.
        provider["require_parameters"] = True

    resp = httpx.post(_OPENROUTER_URL, json=body, timeout=_OPENROUTER_TIMEOUT_S,
                      headers={"Authorization": f"Bearer {key}"})
    data = resp.json()
    # O uso é registrado antes de validar: uma resposta cortada também foi cobrada.
    usage_service.record_openrouter(user_id, feature, model, data.get("usage"))
    if resp.status_code != 200 or "error" in data:
        msg = (data.get("error") or {}).get("message", "") if isinstance(data.get("error"), dict) else ""
        raise _RouteFailed(f"HTTP {resp.status_code} {msg[:120]}")
    choice = data["choices"][0]
    if choice.get("finish_reason") == "length":
        raise _RouteFailed("cortada por max_tokens")
    return choice["message"].get("content") or ""


def _call_anthropic(model: str, system_prompt: str, user_message: str, *, json_schema: dict | None,
                    max_tokens: int, user_id: str | None, feature: str) -> str:
    return claude_service.call_chat(
        messages=[{"role": "user", "content": user_message}],
        system_prompt=system_prompt,
        thinking=False,
        max_tokens=max_tokens,
        user_id=user_id,
        feature=feature,
        json_schema=json_schema,
        model=model,
    )


_PROVIDERS = {"openrouter": _call_openrouter, "anthropic": _call_anthropic}


def complete(
    task: str,
    system_prompt: str,
    user_message: str,
    *,
    feature: str,
    user_id: str | None = None,
    json_schema: dict | None = None,
    max_tokens: int = 4096,
) -> str:
    """
    Gera o texto de uma tarefa sem ferramentas, tentando a rota de `task` em
    ordem. Devolve o texto da primeira resposta válida.

    Sem thinking/raciocínio estendido em nenhum provedor: estas tarefas redigem a
    partir de números já calculados (AGENTS.md §8). `json_schema` liga a saída
    estruturada; a raiz tem de ser um objeto com `additionalProperties: false`
    e todos os campos em `required` — a regra mais rígida entre os provedores
    (a da OpenAI), que os outros também aceitam.

    Levanta RuntimeError se todas as rotas falharem.
    """
    falhas = []
    for provider, model in _ROUTES[task]:
        try:
            text = _PROVIDERS[provider](
                model, system_prompt, user_message, json_schema=json_schema,
                max_tokens=max_tokens, user_id=user_id, feature=feature,
            )
            return _check(text, json_schema)
        except Exception as e:
            # Sem conteúdo do usuário no log: só a rota e o motivo.
            motivo = f"{type(e).__name__}: {e}"[:200]
            print(f"[llm] {feature} via {provider}/{model} falhou ({motivo}); tentando a próxima rota", flush=True)
            falhas.append(f"{provider}/{model}: {motivo}")
    raise RuntimeError(f"Todas as rotas de '{task}' falharam: " + " | ".join(falhas))
