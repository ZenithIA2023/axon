import base64
import json
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from models.schemas import (
    RegisterRequest, LoginRequest, RefreshRequest, AuthResponse,
    ForgotPasswordRequest, ResetPasswordRequest, MessageResponse,
)
from database import supabase, supabase_auth
from limiter import limiter
from services import account_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest):
    blocked = account_service.check_email_blocked(body.email)
    if blocked:
        from datetime import datetime, timezone
        can_reuse = datetime.fromisoformat(blocked["can_reuse_at"])
        days_left = (can_reuse - datetime.now(timezone.utc)).days + 1
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Este e-mail poderá ser utilizado novamente apenas após {days_left} dias. "
                   f"Data disponível: {can_reuse.strftime('%d/%m/%Y')}.",
        )

    try:
        res = supabase_auth.auth.sign_up({"email": body.email, "password": body.password})
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível criar a conta")

    if res.user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não foi possível criar a conta")

    user_id = res.user.id

    supabase.table("profiles").upsert({
        "id": user_id,
        "name": body.name,
        "email": body.email,
    }).execute()

    return AuthResponse(
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
        user_id=user_id,
        email=body.email,
        name=body.name,
        has_chronotype=False,
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest):
    try:
        res = supabase_auth.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos")

    if res.user is None or res.session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha incorretos")

    user_id = res.user.id

    profile = supabase.table("profiles").select("name, chronotype").eq("id", user_id).single().execute()
    profile_data = profile.data or {}

    return AuthResponse(
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
        user_id=user_id,
        email=body.email,
        name=profile_data.get("name"),
        has_chronotype=bool(profile_data.get("chronotype")),
    )


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/minute")
def refresh_session(request: Request, body: RefreshRequest):
    try:
        res = supabase_auth.auth.refresh_session(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")

    if res.user is None or res.session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")

    user_id = res.user.id
    profile = supabase.table("profiles").select("name, chronotype, email").eq("id", user_id).single().execute()
    profile_data = profile.data or {}

    return AuthResponse(
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
        user_id=user_id,
        email=profile_data.get("email") or res.user.email or "",
        name=profile_data.get("name"),
        has_chronotype=bool(profile_data.get("chronotype")),
    )


# ---------------------------------------------------------------------------
# Recuperação de senha
# ---------------------------------------------------------------------------

_RECOVERY_SENT = "Se houver uma conta com esse e-mail, enviamos o link."
_RECOVERY_INVALID = (
    "Este link de recuperação é inválido, expirou ou já foi usado. "
    "Peça um novo em \"Esqueci minha senha\"."
)


def _send_recovery_email(email: str) -> None:
    """
    Pede ao Supabase o e-mail de recuperação. Roda DEPOIS da resposta (tarefa
    em segundo plano), para o tempo de resposta não denunciar se o e-mail
    existe: com conta, o Supabase envia e demora mais; sem conta, volta rápido.

    O link volta com o token no FRAGMENTO da URL (#access_token=...): a lib
    instalada não manda code_challenge no /recover, então o fluxo é implícito
    mesmo com o cliente em modo PKCE.
    """
    frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
    try:
        # Cliente de DADOS de propósito (ver o comentário em reset_password).
        supabase.auth.reset_password_for_email(
            email, {"redirect_to": f"{frontend}/reset-password"}
        )
    except Exception as e:
        # Engolido DE PROPÓSITO: a resposta ao usuário é sempre a mesma, exista
        # ou não a conta — mudar a resposta permitiria descobrir quem tem conta
        # no Axon testando endereços (enumeração de usuários). Registra só o
        # tipo do erro, nunca o e-mail (dado pessoal), para uma falha de envio
        # não passar despercebida.
        print(f"[auth] falha ao pedir e-mail de recuperação: {type(e).__name__}")


# Métodos que o Supabase grava no claim `amr` de uma sessão aberta por link de
# e-mail. Medido em 25/09/2026: o link de recuperação gera "otp", não
# "recovery" — "recovery" fica só como folga para versões futuras do Supabase.
_EMAIL_LINK_METHODS = {"otp", "recovery"}


def _is_recovery_token(access_token: str) -> bool:
    """
    O token veio de um link de e-mail? O get_user só diz que o token é válido;
    sem esta checagem, QUALQUER sessão logada (senha, Google) trocaria a senha
    sem saber a atual — um token vazado viraria a conta tomada de vez.

    A assinatura já foi validada pelo get_user; aqui só lemos o claim `amr`
    (métodos de autenticação da sessão). O Axon não oferece login por link
    mágico, então uma sessão "otp" só nasce do link de recuperação.
    """
    try:
        payload = access_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return False
    return any(
        isinstance(entry, dict) and entry.get("method") in _EMAIL_LINK_METHODS
        for entry in claims.get("amr") or []
    )


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/hour")
def forgot_password(
    request: Request, body: ForgotPasswordRequest, background_tasks: BackgroundTasks
):
    # 3 por hora (e não 5/minuto como o resto): sem isso, alguém dispararia
    # centenas de e-mails para a caixa de outra pessoa pelo nosso remetente,
    # queimando a reputação do domínio de envio.
    background_tasks.add_task(_send_recovery_email, body.email)
    return MessageResponse(message=_RECOVERY_SENT)


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordRequest):
    # 400 e nunca 401 para token ruim: no frontend, 401 dispara o logout
    # global e mandaria o usuário ao login no meio da troca de senha.
    try:
        res = supabase_auth.auth.get_user(body.access_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_RECOVERY_INVALID)
    if res is None or res.user is None or not _is_recovery_token(body.access_token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_RECOVERY_INVALID)

    # Caminho admin, e não set_session + update_user: set_session gravaria a
    # sessão deste usuário num cliente global (ver database.py — o timer de
    # refresh já deslogou todo mundo uma vez).
    #
    # E o admin vai pelo cliente de DADOS (`supabase`), não pelo `supabase_auth`,
    # como já faz o account_service. A cada login, a lib troca o Authorization
    # do cliente que logou pelo JWT do usuário (Client._listen_to_auth_events),
    # e o admin herda esse header: pelo `supabase_auth`, depois do primeiro
    # login no processo, o Supabase responde 403 "User not allowed". O cliente
    # de dados nunca faz login, então segue com a service key. Medido em
    # 25/09/2026.
    try:
        supabase.auth.admin.update_user_by_id(res.user.id, {"password": body.password})
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível alterar sua senha. Tente novamente.",
        )

    # Não é preciso encerrar a sessão de recuperação: a troca de senha pelo
    # admin já derruba TODAS as sessões do usuário (a de recuperação e as dos
    # outros aparelhos), então o mesmo link não troca a senha de novo e quem
    # tinha a senha antiga sai da conta. Medido em 25/09/2026.
    return MessageResponse(message="Senha alterada.")
