from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest
from auth_helper import get_current_user
from services import claude_service, chat_context
from limiter import chat_limiter

router = APIRouter(prefix="/chat", tags=["chat"])

_MAX_MESSAGE_LEN = 4_000
_MAX_HISTORY = 50

# Carregar o perfil, descobrir o tipo da conversa e streamar salvando no banco
# vivem em `services/chat_context.py` — a conversa por voz usa exatamente o mesmo
# caminho, então nada disso pode ficar preso a este router.
_load_perfil = chat_context.load_perfil
_load_conversation_type = chat_context.load_conversation_type
_stream_and_save = chat_context.stream_and_save


@router.post("/message")
@chat_limiter.limit("30/minute")
def chat_message(
    request: Request,
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    from fastapi import HTTPException

    if not body.conversation_id:
        raise HTTPException(status_code=400, detail="conversation_id é obrigatório")

    if len(body.message) > _MAX_MESSAGE_LEN:
        raise HTTPException(status_code=400, detail="Mensagem muito longa (máximo 4000 caracteres)")

    user_id = current_user["id"]

    perfil = _load_perfil(user_id, request.headers.get("X-Timezone"))
    perfil["conversation_type"] = _load_conversation_type(body.conversation_id, user_id)
    system_prompt = claude_service.build_agent_prompt(perfil, perfil.get("memories", []))

    history = [{"role": m.role, "content": m.content} for m in body.history[-_MAX_HISTORY:]]
    history.append({"role": "user", "content": body.message})

    return StreamingResponse(
        _stream_and_save(
            user_id, body.conversation_id, body.message, history, system_prompt,
            perfil.get("timezone"), perfil["conversation_type"],
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
