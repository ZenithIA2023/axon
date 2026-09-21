"""
Análise completa de rotina (Migration 32): o Axon reorganiza o dia inteiro e
devolve uma proposta INSPECIONÁVEL. Nada é aplicado sem o usuário marcar linha
a linha e confirmar — ver routine_analysis_service.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException

from auth_helper import get_current_user
from models.schemas import RoutineAnalysisApply, RoutineAnalysisRequest
from services import routine_analysis_service, user_tz

router = APIRouter(prefix="/routine-analysis", tags=["routine-analysis"])


@router.post("")
def run_analysis(
    payload: RoutineAnalysisRequest | None = None,
    x_timezone: str | None = Header(default=None),
    current_user: dict = Depends(get_current_user),
):
    """
    Dispara a análise manual. Devolve um de:
      status=proposal  → `analysis` com os movimentos
      status=nothing   → agenda já boa (`message` para exibir)
      status=pending   → já havia proposta aberta para o dia (`analysis`)
      status=limit     → trava de custo do dia (`limit`)
    """
    user_id = current_user["id"]
    tz_name = user_tz.resolve(user_id, x_timezone)
    raw = (payload.target_date if payload else None)
    if raw:
        try:
            target = date.fromisoformat(raw)
        except ValueError:
            raise HTTPException(status_code=400, detail="target_date inválida (YYYY-MM-DD)")
    else:
        target = datetime.now(user_tz.zone(tz_name)).date()
    # Dia passado não se reorganiza: o card do Planning já se esconde nele, e a
    # API não pode aceitar o que a tela não oferece.
    if target < datetime.now(user_tz.zone(tz_name)).date():
        raise HTTPException(status_code=400, detail="não dá para reorganizar um dia que já passou")
    return routine_analysis_service.analyze(user_id, tz_name, target, source="manual")


@router.get("/pending")
def get_pending(
    target_date: str | None = None,
    x_timezone: str | None = Header(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Proposta aberta — de um dia específico (`target_date`) ou a mais recente."""
    tz_name = user_tz.resolve(current_user["id"], x_timezone)
    target = None
    if target_date:
        try:
            target = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="target_date inválida (YYYY-MM-DD)")
    return {
        "analysis": routine_analysis_service.pending_for(current_user["id"], tz_name, target)
    }


@router.post("/{analysis_id}/apply")
def apply_analysis(
    analysis_id: str,
    payload: RoutineAnalysisApply,
    x_timezone: str | None = Header(default=None),
    current_user: dict = Depends(get_current_user),
):
    tz_name = user_tz.resolve(current_user["id"], x_timezone)
    result = routine_analysis_service.apply(
        current_user["id"], tz_name, analysis_id, payload.accepted_task_ids
    )
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("reason", "proposta não encontrada"))
    return result


@router.post("/{analysis_id}/dismiss")
def dismiss_analysis(analysis_id: str, current_user: dict = Depends(get_current_user)):
    if not routine_analysis_service.dismiss(current_user["id"], analysis_id):
        raise HTTPException(status_code=404, detail="proposta não encontrada ou já resolvida")
    return {"ok": True}
