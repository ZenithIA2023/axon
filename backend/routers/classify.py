from fastapi import APIRouter, Depends, Request
from models.schemas import ClassifyRequest, ClassifyResponse
from services.chronotype import classificar_cronotipo
from auth_helper import get_current_user
from database import supabase
from limiter import limiter

router = APIRouter(prefix="/classify", tags=["classify"])


# Público de propósito: o questionário roda antes do cadastro. Só faz cálculo,
# sem banco — o rate limit por IP é higiene contra abuso, não proteção de dado.
@router.post("/", response_model=ClassifyResponse)
@limiter.limit("20/minute")
def classify(request: Request, body: ClassifyRequest):
    cronotipo, pontos = classificar_cronotipo(body.respostas)
    return ClassifyResponse(cronotipo=cronotipo, pontos=pontos)


@router.post("/save", response_model=ClassifyResponse)
def classify_and_save(
    body: ClassifyRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]

    cronotipo, pontos = classificar_cronotipo(body.respostas)

    rows = [
        {"user_id": user_id, "pergunta": pergunta, "alternativa": alternativa}
        for pergunta, alternativa in body.respostas.items()
    ]
    # Refazer o questionário substitui as respostas: sem o delete cada refação
    # acumulava um conjunto novo e o perfil carregado ficava indefinido.
    supabase.table("respostas").delete().eq("user_id", user_id).execute()
    supabase.table("respostas").insert(rows).execute()

    profile_update = {
        "chronotype": cronotipo,
        "qualidade_sono": body.qualidade_sono,
        "onboarding_completed": True,
    }
    if body.schedule_type:
        profile_update["schedule_type"] = body.schedule_type

    supabase.table("profiles").update(profile_update).eq("id", user_id).execute()

    return ClassifyResponse(cronotipo=cronotipo, pontos=pontos)
