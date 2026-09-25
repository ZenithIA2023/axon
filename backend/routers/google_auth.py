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


def _revoke_quietly(refresh_token: str | None) -> None:
    if not refresh_token:
        return
    try:
        google_service.revoke_token(refresh_token)
    except Exception:
        pass  # best-effort: o que importa é não gravar o token


def _stored_calendar_state(user_id: str) -> dict:
    res = (
        supabase.table("profiles")
        .select("calendar_setup_choice, google_refresh_token")
        .eq("id", user_id)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else {}


def _handle_calendar_denied_on_connect(user_id: str, refresh_token: str | None) -> None:
    """
    O usuário desmarcou a agenda no fluxo "conectar".

    Revogar derruba a concessão INTEIRA do Axon na conta Google, não só o token
    novo. Quem já tinha a agenda conectada perderia a conexão que funciona; por
    isso, nesse caso, o token novo só é descartado e nada muda no perfil.

    Quem não tinha conexão volta para o calendário independente. O frontend
    grava "google" ANTES de sair para o Google (não há como gravar depois, na
    web a página é descarregada); sem desfazer aqui, a escolha ficaria "google"
    sem token e o Planning mostraria "Google Calendar selecionado".
    """
    if _stored_calendar_state(user_id).get("google_refresh_token"):
        return
    _revoke_quietly(refresh_token)
    supabase.table("profiles").update(
        {"calendar_setup_choice": "independent"}
    ).eq("id", user_id).execute()


def _login_calendar_token(user_id: str, tokens: dict) -> str | None:
    """
    Refresh token que o login com Google deve gravar como conexão da agenda, ou
    None. O login em si não depende disto (usa o id_token). Há duas razões
    DISTINTAS para não gravar:

    1. O usuário escolheu o calendário independente (ou desconectou nas
       Configurações). O login pede o escopo da agenda com prompt=consent, então
       TODO login com Google traz um refresh token novo; entrar com Google não
       pode reconectar quem não quer. A concessão é revogada, para o Axon não
       aparecer com acesso à agenda na conta Google dele.
    2. O usuário desmarcou a caixa da agenda na tela de consentimento. O token
       só vale para os escopos básicos; gravá-lo faria o app dizer "Conectado"
       e sincronizar contra um 403 silencioso. Revoga-se também — exceto quando
       já existe uma agenda conectada, porque revogar derrubaria a concessão
       inteira, inclusive a conexão que funciona. Nesse caso o token gravado
       continua e o novo é só descartado.
    """
    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return None

    stored = _stored_calendar_state(user_id)
    if stored.get("calendar_setup_choice") == "independent":
        _revoke_quietly(refresh_token)
        return None

    if not google_service.granted_calendar(tokens):
        if not stored.get("google_refresh_token"):
            _revoke_quietly(refresh_token)
        return None

    return refresh_token


def _handle_connect_callback(code: str | None, state: str) -> RedirectResponse:
    """
    Fluxo 'conectar agenda' (usuário já logado). Reusa o redirect_uri do login.
    `code` None = o usuário cancelou na tela do Google.
    """
    entry = google_service.consume_connect_state(state)
    if entry is None:
        # Sem state válido não sabemos a origem: cai no destino web, que é o
        # comportamento seguro (uma URL http, nunca um deep link forjado).
        return RedirectResponse(f"{_base_for(google_service.PLATFORM_WEB)}/planning?google=error")

    user_id, platform = entry
    base = _base_for(platform)
    if code is None:
        try:
            _handle_calendar_denied_on_connect(user_id, None)
        except Exception:
            return RedirectResponse(f"{base}/planning?google=error")
        return RedirectResponse(f"{base}/planning?google=denied")
    try:
        tokens = google_service.exchange_code(code)
        refresh_token = tokens.get("refresh_token")
        if not google_service.granted_calendar(tokens):
            # Este fluxo existe só para conectar a agenda: sem o escopo, ele não
            # aconteceu, mesmo com token na mão. Recusar é escolha, não erro —
            # por isso "denied", e não "error".
            _handle_calendar_denied_on_connect(user_id, refresh_token)
            return RedirectResponse(f"{base}/planning?google=denied")
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

    # Fluxo "conectar agenda" (usuário já logado) — state com prefixo connect_.
    # Vem antes do teste de erro: quem cancela a tela do Google nesse fluxo já
    # está logado e deve voltar ao Planning, não cair na tela de login.
    if state and state.startswith("connect_"):
        return _handle_connect_callback(code if not error else None, state)

    if error or not code:
        return RedirectResponse(f"{web_url}/login?error=google_denied")

    # A plataforma vem do state guardado no servidor; state inválido cai no web.
    platform = google_service.verify_and_consume_state(state) if state else None
    if platform is None:
        return RedirectResponse(f"{web_url}/login?error=invalid_state")

    base = _base_for(platform)

    try:
        tokens = google_service.exchange_code(code)
        access_token = tokens["access_token"]
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
        calendar_token = _login_calendar_token(user_id, tokens)
        if calendar_token:
            update["google_refresh_token"] = calendar_token

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
