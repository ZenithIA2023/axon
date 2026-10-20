"""
Sign in with Apple (web). O fluxo nativo do iOS entra na Fase 2, quando houver
projeto iOS no repositório.

Diferenças em relação ao Google que moldam este módulo:

- O callback é um POST de formulário (`response_mode=form_post`), exigido pela
  Apple quando o scope pede `name email`.
- O client secret não é fixo: é um JWT ES256 assinado com a chave .p8, gerado
  sob demanda com validade curta. Um fixo venceria em silêncio (máx. 6 meses).
- O nome vem UMA vez só, no campo `user` do formulário da primeira autorização,
  e não está no id_token. Não há endpoint para buscá-lo depois.
- A exclusão de conta tem que revogar o token na Apple (diretriz 5.1.1(v)).
"""

import hashlib
import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx
from jose import jwt

from database import supabase

_AUTHORIZE_URL = "https://appleid.apple.com/auth/authorize"
_TOKEN_URL = "https://appleid.apple.com/auth/token"
_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
_AUDIENCE = "https://appleid.apple.com"

_STATE_TTL = 600            # 10 min para o usuário completar o login na Apple
_CLIENT_SECRET_TTL = 300    # o secret só vive o bastante para a chamada que o usa
_NAME_MAX = 100             # o nome vem do cliente, sem assinatura: limite o tamanho

# state -> (nonce cru, timestamp). Em memória, como os states do Google: há um
# único worker em produção (AGENTS.md §3).
_pending_states: dict[str, tuple[str, float]] = {}


def services_id() -> str:
    """Client ID da web (Services ID)."""
    return os.getenv("APPLE_SERVICES_ID", "")


def _redirect_uri() -> str:
    return os.getenv("APPLE_REDIRECT_URI", "https://api.axonapp.tech/auth/apple/callback")


def _private_key() -> str:
    # Num .env de uma linha a .p8 costuma vir com "\n" literais; o PEM precisa
    # das quebras reais.
    return os.getenv("APPLE_PRIVATE_KEY", "").replace("\\n", "\n")


def _cleanup() -> None:
    now = time.time()
    for k in [k for k, (_, ts) in list(_pending_states.items()) if now - ts > _STATE_TTL]:
        del _pending_states[k]


def generate_state_and_nonce() -> tuple[str, str]:
    """
    Gera o state e o nonce do login e guarda o nonce CRU no servidor, amarrado
    ao state. A Apple recebe só o SHA-256 (ver build_auth_url) e o devolve dentro
    do id_token assinado; o Supabase compara o hash do cru com ele. Assim um
    id_token capturado não pode ser reapresentado em outro login.
    """
    _cleanup()
    state = secrets.token_urlsafe(16)
    raw_nonce = secrets.token_urlsafe(32)
    _pending_states[state] = (raw_nonce, time.time())
    return state, raw_nonce


def consume_state(state: str) -> str | None:
    """Valida o state (uso único) e devolve o nonce cru, ou None se inválido/expirado."""
    entry = _pending_states.pop(state, None)
    if entry is None:
        return None
    raw_nonce, ts = entry
    if (time.time() - ts) > _STATE_TTL:
        return None
    return raw_nonce


def build_auth_url(state: str, raw_nonce: str) -> str:
    params = {
        "client_id": services_id(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code id_token",
        "response_mode": "form_post",
        "scope": "name email",
        "state": state,
        "nonce": hashlib.sha256(raw_nonce.encode()).hexdigest(),
    }
    return f"{_AUTHORIZE_URL}?{urlencode(params)}"


def client_secret(client_id: str) -> str:
    """
    JWT ES256 assinado com a chave .p8, exigido pela Apple como client_secret.

    O `sub` é o client ID que vai na mesma chamada (Services ID na web, Bundle
    ID no nativo). Gerado a cada uso com validade curta, em vez de um fixo que
    venceria em silêncio.
    """
    now = int(time.time())
    claims = {
        "iss": os.getenv("APPLE_TEAM_ID", ""),
        "iat": now,
        "exp": now + _CLIENT_SECRET_TTL,
        "aud": _AUDIENCE,
        "sub": client_id,
    }
    return jwt.encode(
        claims,
        _private_key(),
        algorithm="ES256",
        headers={"kid": os.getenv("APPLE_KEY_ID", "")},
    )


def exchange_code(code: str, client_id: str) -> dict:
    """Troca o `code` pelos tokens da Apple; o que interessa é o refresh_token."""
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            _TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret(client_id),
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": _redirect_uri(),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    resp.raise_for_status()
    return resp.json()


def parse_user_name(user_field: str | None) -> str | None:
    """
    Nome de exibição a partir do campo `user` do form_post, ou None.

    O campo só existe na PRIMEIRA autorização e não é assinado pela Apple: serve
    para mostrar o nome, nunca para decidir acesso.
    """
    if not user_field:
        return None
    try:
        data = json.loads(user_field)
    except ValueError:
        return None
    name = data.get("name") if isinstance(data, dict) else None
    if not isinstance(name, dict):
        return None
    parts = [name.get("firstName"), name.get("lastName")]
    full = " ".join(p.strip() for p in parts if isinstance(p, str) and p.strip())
    return full[:_NAME_MAX] or None


def revoke_for_user(user_id: str) -> bool:
    """
    Revoga na Apple a autorização do usuário, se ele entrou pela Apple.

    Devolve True se havia token e a Apple aceitou a revogação, False se não
    havia token. Levanta exceção se a revogação falhar — quem chama decide se a
    falha bloqueia algo (na exclusão de conta, não bloqueia).
    """
    res = (
        supabase.table("profiles")
        .select("apple_refresh_token, apple_client_id")
        .eq("id", user_id)
        .execute()
    )
    row = (res.data or [{}])[0]
    token = row.get("apple_refresh_token")
    if not token:
        return False

    # Contas anteriores à coluna de client ID só podem ter vindo da web.
    client_id = row.get("apple_client_id") or services_id()
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            _REVOKE_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret(client_id),
                "token": token,
                "token_type_hint": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    resp.raise_for_status()
    return True
