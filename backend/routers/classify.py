from fastapi import APIRouter, Depends, Request
from models.schemas import ClassifyRequest, ClassifyResponse
from services.chronotype import classificar_cronotipo
from services import onboarding_service
from auth_helper import get_current_user
from database import supabase
from limiter import limiter

router = APIRouter(prefix="/classify", tags=["classify"])


# Público de propósito: o questionário roda antes do cadastro. Só faz cálculo,
# sem banco — o rate limit por IP é higiene contra abuso, não proteção de dado.
@router.post("/", response_model=ClassifyResponse)
@limiter.limit("20/minute")
def classify(request: Request, body: ClassifyRequest):
    horarios = body.horarios.model_dump() if body.horarios else None
    respostas = onboarding_service.completar_respostas(body.respostas, horarios)
    cronotipo, pontos = classificar_cronotipo(respostas)
    return ClassifyResponse(
        cronotipo=cronotipo,
        pontos=pontos,
        jet_lag_social_min=onboarding_service.jet_lag_dos_horarios(horarios),
    )


@router.post("/save", response_model=ClassifyResponse)
def classify_and_save(
    body: ClassifyRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]

    horarios = body.horarios.model_dump() if body.horarios else None
    # As faixas derivadas dos horários são gravadas em `respostas` como se o
    # usuário as tivesse escolhido: assim um recálculo futuro da pontuação
    # (scripts/simular_pontuacao_reduzida.py) enxerga o mesmo que o app viu.
    respostas = onboarding_service.completar_respostas(body.respostas, horarios)
    cronotipo, pontos = classificar_cronotipo(respostas)

    rows = [
        {"user_id": user_id, "pergunta": pergunta, "alternativa": alternativa}
        for pergunta, alternativa in respostas.items()
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
    profile_update.update(
        onboarding_service.campos_de_perfil(
            horarios,
            body.schedule_type,
            body.work_start,
            body.work_end,
            body.onboarding.model_dump(exclude_none=True) if body.onboarding else None,
        )
    )

    supabase.table("profiles").update(profile_update).eq("id", user_id).execute()

    if body.anon_id:
        # O funil é secundário: falhar ao ligar os eventos não pode desfazer o
        # cadastro do cronotipo, que já foi gravado acima.
        try:
            onboarding_service.vincular_eventos(user_id, str(body.anon_id))
        except Exception as e:
            print(f"[classify] falha ao vincular eventos do onboarding: {type(e).__name__}")

    return ClassifyResponse(
        cronotipo=cronotipo,
        pontos=pontos,
        jet_lag_social_min=onboarding_service.jet_lag_dos_horarios(horarios),
    )
