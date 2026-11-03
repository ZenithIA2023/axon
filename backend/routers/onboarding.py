from fastapi import APIRouter, HTTPException, Request

from limiter import limiter
from models.schemas import ChronotypeDistributionResponse, OnboardingEventsRequest
from services import onboarding_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# Público: quase todo o funil acontece antes de existir conta. O corpo só
# aceita ids curtos (tela, evento, opção) — nenhum texto livre chega ao banco.
# 60/min por IP cobre com folga um fluxo de ~41 telas enviado em lotes.
@router.post("/events", status_code=204)
@limiter.limit("60/minute")
def registrar_eventos(request: Request, body: OnboardingEventsRequest):
    try:
        onboarding_service.registrar_eventos(
            str(body.anon_id),
            body.flow_version,
            body.platform,
            [e.model_dump() for e in body.events],
        )
    except Exception as e:
        print(f"[onboarding] falha ao gravar eventos: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Não foi possível registrar os eventos.")


# Público e com cache de 1h no serviço; o rate limit é só higiene.
@router.get("/distribution", response_model=ChronotypeDistributionResponse)
@limiter.limit("30/minute")
def distribuicao(request: Request):
    try:
        return onboarding_service.distribuicao_cronotipos()
    except Exception as e:
        print(f"[onboarding] falha ao calcular distribuição: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Não foi possível carregar a distribuição.")
