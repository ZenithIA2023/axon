from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from auth_helper import get_current_user
from services import account_service
from limiter import limiter
from models.schemas import AccountDeleteRequest

router = APIRouter(prefix="/account", tags=["account"])


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: Optional[AccountDeleteRequest] = None,
    user=Depends(get_current_user),
):
    """
    Exclui permanentemente a conta autenticada.
    - Registra o e-mail em deleted_accounts (bloqueio de 60 dias).
    - Remove o usuário do Supabase Auth.
    - O CASCADE das FKs apaga todos os dados (tarefas, rotinas, conversas, etc.).

    `confirm_email` (opcional) é o e-mail que o usuário digitou no diálogo
    final. Quando vem, precisa bater com o da conta, ou nada é apagado. Não é
    credencial — o dono da conta já está autenticado —, é uma segunda barreira:
    um bug em qualquer tela que chame api.deleteAccount() não apaga a conta de
    um cliente atualizado sem a confirmação. Sem o campo, exclui como antes:
    o app das lojas chama sem corpo e a exclusão é exigência da Play Store.
    """
    if body is not None and body.confirm_email is not None:
        if not account_service.confirmation_matches(
            user["id"], user["email"], body.confirm_email
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O e-mail digitado não é o desta conta.",
            )
    try:
        account_service.delete_account(user["id"], user["email"])
    except Exception as e:
        # O detalhe da exceção (Supabase, Apple) fica no log, sem dado pessoal;
        # o usuário vê a mensagem dentro do diálogo e pode tentar de novo.
        print(f"[account] exclusão falhou: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível excluir a conta agora. Tente novamente em instantes.",
        )


# Público de propósito (fluxo de exclusão exigido pela Play Store), mas permite
# descobrir e-mails de contas apagadas — o rate limit por IP é o freio.
@router.get("/deletion-info")
@limiter.limit("10/minute")
def deletion_info(request: Request, email: str):
    """
    Consulta opcional: informa se um e-mail está bloqueado e quando poderá ser reutilizado.
    Retorna 200 com can_reuse_at se bloqueado, ou 404 se liberado.
    """
    blocked = account_service.check_email_blocked(email)
    if not blocked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="E-mail disponível")
    return blocked
