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


def _normalize_email(value: str | None) -> str:
    # Mesma regra do diálogo no frontend: ignora espaços nas pontas e caixa.
    return (value or "").strip().lower()


def confirmation_matches(user_id: str, auth_email: str | None, typed: str) -> bool:
    """
    O e-mail digitado na confirmação de exclusão é o desta conta?

    Aceita o e-mail do Supabase Auth e também o de `profiles.email`, que é o
    que o diálogo MOSTRA ao usuário (GET /profile prefere o do perfil). Se os
    dois divergirem — uma troca de e-mail que atualizou só um lado —,
    comparar com um só trancaria a pessoa fora da exclusão digitando
    exatamente o que a tela pede. O perfil só é lido nesse caso.
    """
    alvo = _normalize_email(typed)
    if not alvo:
        return False
    if alvo == _normalize_email(auth_email):
        return True
    # O .single() LEVANTA quando não há linha em profiles (conta sem perfil),
    # e a exceção subia como 500 por estar fora do try do router. Sem perfil
    # não há segundo e-mail a aceitar: a resposta certa é "não confere", e a
    # falha continua FECHADA — nada é apagado. Mesmo molde de
    # user_tz.stored_tz. Só o tipo do erro vai ao log, sem dado pessoal.
    try:
        res = (
            supabase.table("profiles")
            .select("email")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        print(f"[account] perfil não lido na confirmação: {type(e).__name__}")
        return False
    return alvo == _normalize_email((res.data or {}).get("email"))


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
