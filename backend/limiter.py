import base64
import json

from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request


def _jwt_sub(token: str) -> str | None:
    """
    Lê o `sub` (id do usuário) do payload do JWT, SEM validar a assinatura.

    Sem validar é seguro aqui porque a chave só decide em qual balde a
    requisição conta: todo endpoint com `chat_limiter` também depende de
    `get_current_user`, que valida o token antes de o limite ser checado — um
    token forjado é recusado com 401 e nunca chega a gastar nada.
    """
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    except (IndexError, ValueError):
        return None
    sub = payload.get("sub") if isinstance(payload, dict) else None
    return sub if isinstance(sub, str) and sub else None


def _user_or_ip(request: Request) -> str:
    # A versão anterior usava os 16 primeiros caracteres do token como chave.
    # Esse trecho é o CABEÇALHO do JWT ({"alg": ...}), idêntico para todos os
    # usuários: o limite de 30/min era dividido pela base inteira, não por
    # pessoa. A chave agora é o id do usuário.
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        sub = _jwt_sub(auth[7:])
        if sub:
            return f"u:{sub}"
    return get_remote_address(request)


limiter = Limiter(key_func=get_remote_address)
chat_limiter = Limiter(key_func=_user_or_ip)
