"""
CRUD do vocabulário de tags de tarefas (ver Migration 31).

O vínculo tarefa↔tag NÃO fica aqui: ele viaja no corpo da própria tarefa
(`tag_ids` em TaskCreate/TaskUpdate), para que criar uma tarefa com categoria
seja uma requisição só.
"""

from fastapi import APIRouter, Depends, HTTPException

from auth_helper import get_current_user
from models.schemas import TagCreate, TagResponse, TagUpdate
from services import task_tags_service

router = APIRouter(prefix="/task-tags", tags=["task-tags"])


@router.get("", response_model=list[TagResponse])
def list_task_tags(current_user: dict = Depends(get_current_user)):
    """As tags do usuário. Semeia a lista padrão no primeiro acesso."""
    return task_tags_service.list_tags(current_user["id"])


@router.post("", response_model=TagResponse)
def create_task_tag(
    payload: TagCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Cria a tag. Nome que já existe (mesmo slug) devolve a EXISTENTE com 200 —
    quem digita "estudos" quer a tag de estudos, não um erro de duplicidade.
    """
    tag = task_tags_service.create_tag(
        current_user["id"], payload.label, payload.color
    )
    if not tag:
        raise HTTPException(status_code=400, detail="Nome de tag inválido")
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
def update_task_tag(
    tag_id: str,
    payload: TagUpdate,
    current_user: dict = Depends(get_current_user),
):
    tag = task_tags_service.update_tag(
        current_user["id"], tag_id, payload.label, payload.color
    )
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
    return tag


@router.get("/{tag_id}/usage")
def task_tag_usage(tag_id: str, current_user: dict = Depends(get_current_user)):
    """
    Quantas tarefas usam esta tag — o frontend mostra na confirmação de exclusão.

    Excluir a tag apaga os vínculos em cascata, e o usuário precisa ver o alcance
    ANTES de confirmar.
    """
    return {
        "tag_id": tag_id,
        "task_count": task_tags_service.count_tasks_with_tag(
            current_user["id"], tag_id
        ),
    }


@router.delete("/{tag_id}")
def delete_task_tag(tag_id: str, current_user: dict = Depends(get_current_user)):
    if not task_tags_service.delete_tag(current_user["id"], tag_id):
        raise HTTPException(status_code=400, detail="Não foi possível excluir a tag")
    return {"ok": True}
