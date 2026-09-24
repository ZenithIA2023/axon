import os

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import RedirectResponse

from database import supabase, supabase_auth
from auth_helper import get_current_user
from models.schemas import GoogleConnectResponse, ProfileResponse
from routers.profile import _build_profile_response, _fetch_profile_data
from services import calendar_sync, google_service

router = APIRouter(prefix="/auth/google", tags=["google-auth"])

# Esquema de deep link do app Android. Tem que casar com o intent-filter do
# AndroidManifest.xml e com o applicationId (com.axon.app).
MOBILE_SCHEME = "com.axon.app"


def _base_for(platform: str) -> str:
    """
    Raiz para onde o callback redireciona no final do fluxo.

    Web: a URL http(s) do frontend, como sempre foi.
    Mobile: o deep link do app. O caminho leva "/#" porque no app o React Router
    roda em modo hash (decisão da fase 1) — sem isso o app abre na raiz e a rota
    de callback nunca monta.
    """
    if platform == google_service.PLATFORM_MOBILE:
        return f"{MOBILE_SCHEME}:///#"
    return os.getenv("FRONTEND_URL", "http://localhost:5173")


@router.get("")
def google_login(platform: str | None = None):
    """
    `platform=mobile` marca que o fluxo partiu do app. O valor é guardado no
    servidor junto ao state (não viaja na URL de volta), então o destino do
    redirect final não pode ser forjado por quem chama o callback.
    """
    state = google_service.generate_and_store_state(platform)
    return RedirectResponse(google_service.build_auth_url(state))


@router.get("/connect", response_model=GoogleConnectResponse)
def google_connect(
    platform: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Inicia o fluxo de conexão do Google Agenda para um usuário JÁ logado
    (ex.: quem entrou com email/senha). Amarra o state ao user_id.
    """
    state = google_service.store_connect_state(current_user["id"], platform)
    return GoogleConnectResponse(auth_url=google_service.build_auth_url(state))


def _handle_connect_callback(code: str, state: str) -> RedirectResponse:
    """Fluxo 'conectar agenda' (usuário já logado). Reusa o redirect_uri do login."""
    entry = google_service.consume_connect_state(state)
    if entry is None:
        # Sem state válido não sabemos a origem: cai no destino web, que é o
        # comportamento seguro (uma URL http, nunca um deep link forjado).
        return RedirectResponse(f"{_base_for(google_service.PLATFORM_WEB)}/planning?google=error")

    user_id, platform = entry
    base = _base_for(platform)
    try:
        tokens = google_service.exchange_code(code)
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            return RedirectResponse(f"{base}/planning?google=error")
        # A escolha acompanha o token: quem vincula (pelo Planning ou pelas
        # Configurações, depois de ter desconectado) passa a "google" aqui, no
        # servidor, sem depender de o frontend ter gravado antes de sair.
        supabase.table("profiles").update(
            {"google_refresh_token": refresh_token, "calendar_setup_choice": "google"}
        ).eq("id", user_id).execute()
        return RedirectResponse(f"{base}/planning?google=connected")
    except Exception:
        return RedirectResponse(f"{base}/planning?google=error")


@router.delete("/connection", response_model=ProfileResponse)
def google_disconnect(current_user: dict = Depends(get_current_user)):
    """
    Desconecta o Google Agenda. Os eventos já criados permanecem na agenda do
    usuário (ver calendar_sync.disconnect). Idempotente: desconectar o que já
    está desconectado devolve 200.
    """
    user_id = current_user["id"]
    calendar_sync.disconnect(user_id)
    return _build_profile_response(_fetch_profile_data(user_id), current_user)


@router.get("/callback")
def google_callback(code: str = None, error: str = None, state: str = None):
    web_url = _base_for(google_service.PLATFORM_WEB)

    if error or not code:
        return RedirectResponse(f"{web_url}/login?error=google_denied")

    # Fluxo "conectar agenda" (usuário já logado) — state com prefixo connect_
    if state and state.startswith("connect_"):
        return _handle_connect_callback(code, state)

    # A plataforma vem do state guardado no servidor; state inválido cai no web.
    platform = google_service.verify_and_consume_state(state) if state else None
    if platform is None:
        return RedirectResponse(f"{web_url}/login?error=invalid_state")

    base = _base_for(platform)

    try:
        tokens = google_service.exchange_code(code)
        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token")
        id_token = tokens.get("id_token")

        user_info = google_service.get_user_info(access_token)
        email = user_info["email"]
        name = user_info.get("name", "")

        supabase_session = supabase_auth.auth.sign_in_with_id_token({
            "provider": "google",
            "token": id_token,
        })

        user_id = supabase_session.user.id
        supabase_access = supabase_session.session.access_token
        supabase_refresh = supabase_session.session.refresh_token

        update = {"id": user_id, "name": name, "email": email}
        if refresh_token:
            # O login pede o escopo da agenda com prompt=consent, então TODO
            # login com Google traz um refresh token novo. Quem escolheu o
            # calendário independente (ou desconectou nas Configurações) não
            # pode voltar a ser sincronizado só por ter entrado com Google:
            # nesse caso o token não é gravado e a concessão é revogada, para
            # o Axon não aparecer com acesso à agenda na conta Google dele.
            current = (
                supabase.table("profiles")
                .select("calendar_setup_choice")
                .eq("id", user_id)
                .execute()
            )
            rows = current.data or []
            if rows and rows[0].get("calendar_setup_choice") == "independent":
                try:
                    google_service.revoke_token(refresh_token)
                except Exception:
                    pass  # best-effort: o que importa é não gravar o token
            else:
                update["google_refresh_token"] = refresh_token

        supabase.table("profiles").upsert(update).execute()

        profile = supabase.table("profiles").select("chronotype").eq("id", user_id).single().execute()
        has_chronotype = bool((profile.data or {}).get("chronotype"))

        # Armazena a sessão temporariamente e redireciona com código de uso único
        session_code = google_service.store_session({
            "access_token": supabase_access,
            "refresh_token": supabase_refresh,
            "user_id": user_id,
            "email": email,
            "name": name,
            "has_chronotype": has_chronotype,
        })

        return RedirectResponse(f"{base}/auth/callback?session_code={session_code}")

    except Exception:
        return RedirectResponse(f"{base}/login?error=authentication_failed")


@router.get("/session")
def exchange_session_code(code: str):
    data = google_service.consume_session(code)
    if data is None:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado")
    return data
