import os

from fastapi import APIRouter, Form, Request
from fastapi.responses import RedirectResponse

from database import supabase, supabase_auth
from limiter import limiter
from services import apple_service, google_service

router = APIRouter(prefix="/auth/apple", tags=["apple-auth"])


def _web_base() -> str:
    # Só a web por enquanto: o botão some no Android e o iOS nativo (Fase 2) não
    # passa por este redirect.
    return os.getenv("FRONTEND_URL", "http://localhost:5173")


def _redirect(url: str) -> RedirectResponse:
    # 303, não o 307 padrão: o callback chega por POST, e um 307 faria o
    # navegador repetir o POST (com code e id_token no corpo) contra o frontend.
    return RedirectResponse(url, status_code=303)


@router.get("")
@limiter.limit("10/minute")
def apple_login(request: Request):
    state, raw_nonce = apple_service.generate_state_and_nonce()
    return RedirectResponse(apple_service.build_auth_url(state, raw_nonce))


@router.post("/callback")
@limiter.limit("20/minute")
def apple_callback(
    request: Request,
    code: str | None = Form(None),
    id_token: str | None = Form(None),
    state: str | None = Form(None),
    user: str | None = Form(None),
    error: str | None = Form(None),
):
    """
    A Apple devolve por POST de formulário (form_post). `user` só vem na
    primeira autorização, com o nome; depois disso nunca mais.
    """
    base = _web_base()

    if error or not code or not id_token:
        return _redirect(f"{base}/login?error=apple_denied")

    raw_nonce = apple_service.consume_state(state) if state else None
    if raw_nonce is None:
        return _redirect(f"{base}/login?error=invalid_state")

    try:
        # O Supabase valida assinatura, aud e o nonce do id_token. Nenhum campo
        # do token é usado antes disto; o e-mail vem do usuário que ele devolve.
        supabase_session = supabase_auth.auth.sign_in_with_id_token({
            "provider": "apple",
            "token": id_token,
            "nonce": raw_nonce,
        })
        user_id = supabase_session.user.id
        email = supabase_session.user.email or ""

        # Sem refresh token não há como revogar na exclusão de conta, que a
        # Apple exige. Falhar aqui é melhor que criar uma conta irrevogável:
        # o próximo login tenta de novo com um code novo.
        client_id = apple_service.services_id()
        tokens = apple_service.exchange_code(code, client_id)
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            raise ValueError("Apple não devolveu refresh_token")

        update = {
            "email": email,
            "apple_refresh_token": refresh_token,
            "apple_client_id": client_id,
        }
        # O nome só vem no primeiro login. Gravar "" nos seguintes (como o login
        # do Google faz, porque o Google sempre manda o nome) apagaria o nome
        # para sempre: a Apple não o envia de novo.
        name = apple_service.parse_user_name(user)
        if name:
            update["name"] = name

        # update/insert separados em vez de upsert: profiles.name é NOT NULL em
        # produção, e o Postgres checa o NOT NULL da linha proposta ANTES de
        # resolver o conflito — um upsert sem name falha mesmo com o perfil já
        # existente (era o que quebrava o segundo login).
        existing = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if existing.data:
            supabase.table("profiles").update(update).eq("id", user_id).execute()
        else:
            supabase.table("profiles").insert(
                {**update, "id": user_id, "name": name or ""}
            ).execute()

        profile = (
            supabase.table("profiles")
            .select("name, chronotype")
            .eq("id", user_id)
            .single()
            .execute()
        )
        profile_data = profile.data or {}

        # Mesmo código de uso único do Google: o frontend troca em
        # /auth/google/session pela rota /auth/callback de sempre.
        session_code = google_service.store_session({
            "access_token": supabase_session.session.access_token,
            "refresh_token": supabase_session.session.refresh_token,
            "user_id": user_id,
            "email": email,
            "name": profile_data.get("name") or "",
            "has_chronotype": bool(profile_data.get("chronotype")),
        })
        return _redirect(f"{base}/auth/callback?session_code={session_code}")

    except Exception as e:
        # Sem dado pessoal no log: só o tipo da falha.
        print(f"[apple_auth] falha no callback: {type(e).__name__}")
        return _redirect(f"{base}/login?error=authentication_failed")
