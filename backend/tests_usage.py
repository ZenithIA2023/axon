"""
Testes das funções puras do registro de uso e da chave do rate limit.

Dois pontos sensíveis:
- a chave do `chat_limiter` tem de ser diferente para cada usuário (a versão
  anterior usava o cabeçalho do JWT, igual para todos, e o limite virava global);
- o cálculo de custo é a base da análise de custo por usuário e das cotas.

Sem runner configurado no backend; roda direto:

    cd backend && python3 tests_usage.py
"""

import base64
import json
import sys
import types

# Os módulos importam `supabase` no topo, mas as funções testadas aqui são puras.
_fake = types.ModuleType("database")
_fake.supabase = None
sys.modules.setdefault("database", _fake)

from limiter import _jwt_sub, _user_or_ip  # noqa: E402
from services.usage_service import _tts_price_key, claude_cost  # noqa: E402

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


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def _token(sub: str) -> str:
    # Mesmo formato do Supabase: cabeçalho idêntico para todos, payload com o sub.
    header = _b64({"alg": "ES256", "kid": "chave-1", "typ": "JWT"})
    return f"{header}.{_b64({'sub': sub, 'role': 'authenticated'})}.assinatura"


class _Req:
    def __init__(self, auth: str = "", ip: str = "203.0.113.7"):
        self.headers = {"Authorization": auth} if auth else {}
        self.client = types.SimpleNamespace(host=ip)
        self.scope = {"client": (ip, 0)}


print("— chave do rate limit —")
a, b = _token("user-a"), _token("user-b")
eq("o cabeçalho dos dois tokens é igual (premissa do bug)", a[:16], b[:16])
eq("usuário A tem chave própria", _user_or_ip(_Req(f"Bearer {a}")), "u:user-a")
eq("usuário B tem chave própria", _user_or_ip(_Req(f"Bearer {b}")), "u:user-b")
eq("sem token cai no IP", _user_or_ip(_Req()), "203.0.113.7")
eq("token malformado cai no IP", _user_or_ip(_Req("Bearer lixo")), "203.0.113.7")
eq("payload que não é JSON", _jwt_sub("a.bm9wZQ.c"), None)
eq("payload sem sub", _jwt_sub(f"x.{_b64({'role': 'anon'})}.y"), None)

print("\n— custo do Claude —")
# 1M de entrada + 1M de saída no Sonnet 4.6 = 3 + 15.
eq("sonnet sem cache", claude_cost("claude-sonnet-4-6", 1_000_000, 1_000_000), 18.0)
# Gravar no cache custa 1,25× a entrada; ler custa 0,1×.
eq("sonnet gravando cache", claude_cost("claude-sonnet-4-6", 0, 0, cache_write=1_000_000), 3.75)
eq("sonnet lendo cache", round(claude_cost("claude-sonnet-4-6", 0, 0, cache_read=1_000_000), 6), 0.3)
eq("haiku", claude_cost("claude-haiku-4-5", 1_000_000, 1_000_000), 6.0)
eq("modelo sem preço devolve None", claude_cost("modelo-inexistente", 10, 10), None)

print("\n— preço da síntese de voz —")
eq("chirp3", _tts_price_key("google", "pt-BR-Chirp3-HD-Fenrir"), "google:chirp3-hd")
eq("neural2", _tts_price_key("google", "pt-BR-Neural2-C"), "google:neural2")
eq("openai", _tts_price_key("openai", "nova"), "openai:gpt-4o-mini-tts")

print(f"\n{ok} passaram, {falhas} falharam")
if falhas:
    sys.exit(1)
