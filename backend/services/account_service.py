"""
Serviço de exclusão de conta e bloqueio de e-mail.

Fluxo:
  1. DELETE /account → grava e-mail em deleted_accounts, deleta usuário do Auth.
     O CASCADE das FKs apaga todos os dados do usuário nas demais tabelas.
  2. POST /auth/register → check_email_blocked() rejeita cadastros dentro de 60 dias.
"""

from datetime import datetime, timezone, timedelta
from database import supabase
from services import apple_service

BLOCK_DAYS = 60


def check_email_blocked(email: str) -> dict | None:
    """
    Retorna dict com {email, can_reuse_at} se o e-mail estiver bloqueado,
    ou None se estiver liberado.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=BLOCK_DAYS)).isoformat()
    res = (
        supabase.table("deleted_accounts")
        .select("deleted_at")
        .eq("email", email.lower().strip())
        .gte("deleted_at", cutoff)
        .order("deleted_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None

    deleted_at = datetime.fromisoformat(res.data[0]["deleted_at"])
    can_reuse_at = deleted_at + timedelta(days=BLOCK_DAYS)
    return {"email": email, "can_reuse_at": can_reuse_at.isoformat()}


def delete_account(user_id: str, email: str) -> None:
    """
    1. Revoga a autorização na Apple, se o usuário entrou pela Apple.
    2. Registra o e-mail em deleted_accounts.
    3. Remove o usuário do Supabase Auth (cascade apaga todos os dados).
    """
    # Antes do delete_user: o cascade apaga o perfil, e com ele o refresh token.
    # Falha na Apple NÃO impede a exclusão — o usuário pediu para apagar os
    # dados, e isso vale mais que a revogação. Registra só o tipo do erro, sem
    # dado pessoal.
    try:
        apple_service.revoke_for_user(user_id)
    except Exception as e:
        print(f"[account] revogação na Apple falhou: {type(e).__name__}")

    supabase.table("deleted_accounts").insert({
        "email": email.lower().strip(),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # admin.delete_user exige service_role — nosso cliente já usa service_role.
    supabase.auth.admin.delete_user(user_id)
