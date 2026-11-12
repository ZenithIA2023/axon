from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import supabase_auth
from services import activity_service

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    try:
        res = supabase_auth.auth.get_user(token)
        if res.user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        user = {"id": res.user.id, "email": res.user.email}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado")

    # Atividade para o scheduler congelar o trabalho pago de quem sumiu (ver
    # services/activity_service). Fica DEPOIS e FORA do try da validação: só
    # conta quem passou na autenticação, e nada aqui pode mudar o resultado
    # dela. mark_seen já não lança; o try abaixo é a segunda garantia, porque
    # este é o caminho de login de todo mundo — uma falha nele não pode virar
    # 401 nem 500.
    try:
        activity_service.mark_seen(user["id"])
    except Exception:
        pass  # silencioso de propósito: ver o comentário acima
    return user
