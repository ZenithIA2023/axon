"""
Registro do uso de APIs pagas: Claude, transcrição e síntese de voz.

Cada chamada vira uma linha em `api_usage_events` (Migration 36), com o usuário,
a funcionalidade que gastou e as unidades cobradas pelo provedor (tokens,
segundos de áudio, caracteres). É a base para medir o custo real por usuário e
por funcionalidade e, depois, para as cotas por plano — sem isso o custo só
aparece somado na fatura de cada provedor, sem dizer quem nem o quê.

Duas regras:

- **As unidades são a fonte da verdade, não o `cost_usd`.** O custo é gravado já
  calculado para facilitar a consulta, mas usa a tabela de preços abaixo no
  momento da chamada. Se um preço mudar ou estiver errado, recalcule a partir
  das unidades.
- **Registrar nunca atrasa nem derruba o fluxo principal.** O insert roda numa
  thread separada (cada query custa ~105ms, e no chat isso cairia entre as
  rodadas de ferramenta) e qualquer falha só vai para o log. Perder uma linha
  de medição é aceitável; atrasar ou quebrar a resposta ao usuário, não.
"""

from concurrent.futures import ThreadPoolExecutor

from database import supabase

# ── Preços ──────────────────────────────────────────────────────────────────
# Claude, em US$ por milhão de tokens (entrada, saída). Conferidos em 07/10/2026.
# Gravar no cache custa 1,25× a entrada (TTL de 5 min, o que usamos) e ler do
# cache custa 0,1× — multiplicadores iguais para todos os modelos.
_CLAUDE_PRICES: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}
_CACHE_WRITE_MULT = 1.25
_CACHE_READ_MULT = 0.10

# Transcrição, em US$ por minuto de áudio. Valores de stt_service: o
# gpt-transcribe medido em jul/2026, o Google pelo comentário do provedor.
_STT_PRICES_PER_MIN: dict[str, float] = {
    "gpt-transcribe": 0.0045,
    "openai/gpt-transcribe": 0.0045,
    "gpt-4o-transcribe": 0.006,
    "long": 0.024,  # Google Speech-to-Text v2, recognizer "long"
}

# Síntese de voz, em US$ por milhão de caracteres. A OpenAI cobra o
# gpt-4o-mini-tts por token de áudio gerado; o valor aqui é a conversão
# aproximada (~US$ 0,015/min de fala), por isso o custo dela é estimativa.
_TTS_PRICES_PER_MCHAR: dict[str, float] = {
    "google:chirp3-hd": 30.00,
    "google:neural2": 16.00,
    "openai:gpt-4o-mini-tts": 16.00,
}

# Uma thread basta: o volume é de poucas linhas por segundo no pico, e uma fila
# única mantém a ordem e não disputa conexões com as requisições.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="usage")


def _insert(row: dict) -> None:
    try:
        supabase.table("api_usage_events").insert(row).execute()
    except Exception as e:
        # Sem dados do usuário no log: só a funcionalidade e o erro.
        print(f"[usage] registro falhou feature={row.get('feature')}: {e}", flush=True)


def _submit(row: dict) -> None:
    try:
        _executor.submit(_insert, row)
    except RuntimeError:
        # Executor encerrado (desligamento do servidor): a linha se perde, a
        # resposta ao usuário não.
        pass


def claude_cost(model: str, input_tokens: int, output_tokens: int,
                cache_read: int = 0, cache_write: int = 0) -> float | None:
    """Custo em US$ de uma chamada ao Claude. None se o modelo não tem preço cadastrado."""
    prices = _CLAUDE_PRICES.get(model)
    if prices is None:
        return None
    p_in, p_out = prices
    return (
        input_tokens * p_in
        + cache_write * p_in * _CACHE_WRITE_MULT
        + cache_read * p_in * _CACHE_READ_MULT
        + output_tokens * p_out
    ) / 1_000_000


def record_claude(user_id: str | None, feature: str, model: str, usage) -> None:
    """
    Registra uma chamada ao Claude a partir do `response.usage` do SDK.

    `usage` é o objeto do SDK (`Message.usage`); os campos de cache podem vir
    None quando a chamada não usa cache. Os tokens de thinking já estão contados
    em `output_tokens`.
    """
    if usage is None:
        return
    inp = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    c_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    c_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    _submit({
        "user_id": user_id,
        "feature": feature,
        "provider": "anthropic",
        "model": model,
        "input_tokens": inp,
        "output_tokens": out,
        "cache_read_tokens": c_read,
        "cache_write_tokens": c_write,
        "cost_usd": claude_cost(model, inp, out, c_read, c_write),
    })


def record_stt(user_id: str, feature: str, provider: str, model: str, seconds: float) -> None:
    """Registra segundos de áudio transcritos."""
    if seconds <= 0:
        return
    price = _STT_PRICES_PER_MIN.get(model)
    _submit({
        "user_id": user_id,
        "feature": feature,
        "provider": provider,
        "model": model,
        "audio_seconds": round(seconds, 1),
        "cost_usd": (seconds / 60 * price) if price is not None else None,
    })


def _tts_price_key(provider: str, voice: str) -> str:
    if provider == "google":
        return "google:neural2" if "Neural2" in voice else "google:chirp3-hd"
    if provider == "openai":
        return "openai:gpt-4o-mini-tts"
    return f"{provider}:{voice}"


def record_tts(user_id: str, provider: str, voice: str, characters: int) -> None:
    """
    Registra caracteres sintetizados. Só para áudio gerado de fato: o que veio
    do cache não foi cobrado pelo provedor e não deve ser registrado.
    """
    if characters <= 0:
        return
    price = _TTS_PRICES_PER_MCHAR.get(_tts_price_key(provider, voice))
    _submit({
        "user_id": user_id,
        "feature": "voz_sintese",
        "provider": provider,
        "model": voice,
        "characters": characters,
        "cost_usd": (characters * price / 1_000_000) if price is not None else None,
    })
