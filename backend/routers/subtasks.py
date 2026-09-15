from fastapi import APIRouter, Depends, HTTPException
from auth_helper import get_current_user
from services import subtasks_service
from models.schemas import SubtaskCreate, SubtaskUpdate, SubtaskResponse

router = APIRouter(prefix="/subtasks", tags=["subtasks"])


@router.get("", response_model=list[SubtaskResponse])
def list_all_subtasks(user=Depends(get_current_user)):
    return subtasks_service.list_all(user["id"])


@router.get("/task/{task_id}", response_model=list[SubtaskResponse])
def list_task_subtasks(task_id: str, user=Depends(get_current_user)):
    return subtasks_service.list_for_task(user["id"], task_id)


@router.post("/task/{task_id}", response_model=SubtaskResponse, status_code=201)
def create_subtask(task_id: str, body: SubtaskCreate, user=Depends(get_current_user)):
    try:
        return subtasks_service.create_subtask(user["id"], task_id, body.model_dump())
    except ValueError as e:
        code = 404 if "não encontrada" in str(e) else 400
        raise HTTPException(status_code=code, detail=str(e))


@router.patch("/{subtask_id}", response_model=SubtaskResponse)
def update_subtask(subtask_id: str, body: SubtaskUpdate, user=Depends(get_current_user)):
    try:
        return subtasks_service.update_subtask(
            user["id"], subtask_id, body.model_dump(exclude_none=True)
        )
    except ValueError as e:
        code = 404 if "não encontrada" in str(e) else 400
        raise HTTPException(status_code=code, detail=str(e))


@router.delete("/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: str, user=Depends(get_current_user)):
    try:
        subtasks_service.delete_subtask(user["id"], subtask_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
