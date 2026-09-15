from fastapi import APIRouter, Depends, HTTPException, Request, status
from auth_helper import get_current_user
from services import account_service
from limiter import limiter

router = APIRouter(prefix="/account", tags=["account"])


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user=Depends(get_current_user)):
    """
    Exclui permanentemente a conta autenticada.
    - Registra o e-mail em deleted_accounts (bloqueio de 60 dias).
    - Remove o usuário do Supabase Auth.
    - O CASCADE das FKs apaga todos os dados (tarefas, rotinas, conversas, etc.).
    """
    try:
        account_service.delete_account(user["id"], user["email"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Não foi possível excluir a conta: {e}",
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
