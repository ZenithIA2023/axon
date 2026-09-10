"""
Rotas de voz do Axon.

Síntese (texto → áudio), transcrição (áudio → texto) e a mensagem completa por
voz — que junta as duas pontas com o agente, reusando exatamente o mesmo
caminho do chat de texto (`services/chat_context.py`). A voz não é um segundo
agente: é outra porta de entrada para o mesmo, por isso nada aqui duplica o
que `routers/chat.py` já faz.
"""

import asyncio
import base64
import binascii
import json
import os

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import Response, StreamingResponse

from auth_helper import get_current_user
from database import supabase_auth
from limiter import chat_limiter
from models.schemas import ChatMessage, TranscribeResponse, TtsRequest, VoiceTextRequest
from services import (
    chat_context,
    claude_service,
    stt_realtime,
    stt_service,
    stt_vocabulary,
    tts_service,
)

router = APIRouter(prefix="/voice", tags=["voice"])

_MAX_HISTORY = 50
_MAX_TRANSCRIPT_LEN = 4_000

# O que a pessoa lê (e ouve) quando o áudio não rendeu nenhuma palavra.
# Sem números nem termos técnicos: numa conversa falada, "recebido: 48000 bytes"
# não ajuda ninguém a falar de novo — só faz o Axon soar como um log de erro.
_ERRO_SEM_FALA = "Não consegui entender o áudio. Pode falar de novo?"

# Falha do provedor de transcrição. A mensagem crua ("OpenAI STT 429: {...}")
# é útil no log e péssima na tela — e na página de voz ela é LIDA EM VOZ ALTA.
_ERRO_PROVEDOR = "Tive um problema para processar seu áudio. Pode tentar de novo?"

# Mesmas funções que `routers/chat.py` usa para a conversa digitada — ver
# services/chat_context.py.
_load_perfil = chat_context.load_perfil
_load_conversation_type = chat_context.load_conversation_type
_stream_and_save = chat_context.stream_and_save


def _voice_thinking() -> bool:
    """
    Desligado por padrão: o raciocínio adaptativo melhora as decisões de
    ferramenta, mas atrasa o primeiro token em até alguns segundos — numa
    conversa falada isso é sentido como travamento (~0,8s de ganho real,
    medido). VOICE_THINKING=1 liga de volta sem precisar de deploy.
    """
    return os.getenv("VOICE_THINKING", "0") == "1"


def _parse_history(raw: str) -> list[dict]:
    """Decodifica o campo `history` (JSON dentro de um form multipart)."""
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="history inválido (JSON malformado)")
    if not isinstance(items, list):
        raise HTTPException(status_code=422, detail="history inválido (esperado uma lista)")

    parsed = []
    for item in items[-_MAX_HISTORY:]:
        try:
            msg = ChatMessage(**item)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="history inválido")
        parsed.append({"role": msg.role, "content": msg.content})
    return parsed


def _aquecer_vocabulario(user_id: str) -> None:
    """
    Preenche o cache de hints. Falha silenciosa: é otimização, não função.

    Não faz nada se o provedor ativo ignora o vocabulário (ver `stt_service`) —
    seriam 4 consultas ao banco para alimentar um cache que ninguém lê.
    """
    if not stt_service._usa_hints():
        return
    try:
        stt_vocabulary.build_hints(user_id)
    except Exception:
        pass


@router.get("/voices")
def list_voices(
    background: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """
    Vozes que podem ser usadas agora — só as dos provedores com credencial.
    O app usa isto para montar o seletor; uma voz que não pode falar não aparece.

    Aproveita para aquecer o vocabulário de voz do usuário em segundo plano:
    montá-lo custa ~400ms de banco, e esta rota é chamada quando a tela de voz
    ABRE — bem antes da primeira fala. Sem isto, esses 400ms cairiam em cima da
    primeira gravação, que é justamente quando o usuário está esperando.
    """
    background.add_task(_aquecer_vocabulario, current_user["id"])
    return {
        "voices": tts_service.available_voices(),
        "default": tts_service.DEFAULT_VOICE,
        "configured": tts_service.is_configured(),
    }


@router.post("/tts")
@chat_limiter.limit("120/minute")
def synthesize(
    request: Request,
    body: TtsRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Devolve o áudio MP3 da frase.

    O limite é generoso (120/min) porque a fala é cortada em FRASES: uma única
    resposta do Axon vira várias chamadas seguidas, e é isso que permite a voz
    começar antes de a resposta terminar.
    """
    try:
        audio, do_cache = tts_service.synthesize(body.text, body.voice_id, body.speed)
    except tts_service.TtsError as e:
        # 502: quem falhou foi o provedor, não o pedido do usuário. O app trata
        # isso caindo para o texto na tela em vez de quebrar a conversa.
        raise HTTPException(status_code=502, detail=str(e))

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            # A mesma frase com a mesma voz é sempre o mesmo áudio: o navegador
            # pode guardar sem risco, e isso evita cobrança repetida.
            "Cache-Control": "private, max-age=86400",
            "X-Tts-Cache": "hit" if do_cache else "miss",
        },
    )


@router.post("/transcribe", response_model=TranscribeResponse)
@chat_limiter.limit("30/minute")
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("pt-BR"),
    current_user: dict = Depends(get_current_user),
):
    """
    Transcreve uma gravação do usuário, sem envolver o agente.

    O limite (30/min) é bem mais apertado que o do TTS: lá cada chamada é uma
    frase da resposta do Axon, aqui é uma gravação inteira do usuário.
    """
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="Envie um arquivo de áudio.")

    conteudo = await audio.read()

    try:
        resultado = stt_service.transcribe_billed(current_user["id"], conteudo, audio.content_type, language)
    except stt_service.SttQuotaExceeded as e:
        raise HTTPException(status_code=429, detail=str(e))
    except stt_service.SttError as e:
        # 502: quem falhou foi o provedor, não o pedido do usuário.
        raise HTTPException(status_code=502, detail=str(e))

    return resultado


@router.post("/message")
@chat_limiter.limit("30/minute")
async def voice_message(
    request: Request,
    audio: UploadFile = File(...),
    conversation_id: str = Form(...),
    history: str = Form("[]"),
    language: str = Form("pt-BR"),
    current_user: dict = Depends(get_current_user),
):
    """
    Uma gravação inteira vira uma rodada completa da conversa: transcreve,
    manda para o agente (mesmas ferramentas do chat de texto, exceto as de
    exclusão — ver agent_tools.tools_for_conversation) e devolve a resposta em
    streaming. Multipart entra, SSE sai — mesmo formato do `/chat/message`,
    com UM evento a mais na frente.

    Eventos SSE emitidos, nesta ordem:
      - {"transcript": "..."}  o que foi entendido — primeiro evento, para o
                                usuário ver de imediato que foi ouvido direito
      - {"text": "..."}        delta de texto da resposta (igual ao chat)
      - {"tool": ...}          mesmo formato do chat de texto
      - [DONE]
    """
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="Envie um arquivo de áudio.")

    user_id = current_user["id"]
    history_msgs = _parse_history(history)
    conteudo = await audio.read()

    try:
        resultado = stt_service.transcribe_billed(user_id, conteudo, audio.content_type, language)
    except stt_service.SttQuotaExceeded as e:
        # A de cota já é escrita para o usuário ("limite mensal de ...s"): diz o
        # que aconteceu e não expõe nada de interno.
        raise HTTPException(status_code=429, detail=str(e))
    except stt_service.SttError as e:
        print(f"[voz] falha na transcrição: {e}", flush=True)
        raise HTTPException(status_code=502, detail=_ERRO_PROVEDOR)

    transcript = resultado["text"].strip()[:_MAX_TRANSCRIPT_LEN]
    if not transcript:
        # Os números vão para o log, não para a tela: bytes e segundos
        # diferenciam "gravou pouco ou nada" (bug de captura, ambos próximos de
        # zero) de "gravou normal, mas não tinha fala reconhecível" (mic mudo,
        # ruído, silêncio) — é diagnóstico nosso, e para quem está falando com o
        # Axon só atrapalha.
        print(
            f"[voz] transcrição vazia: {len(conteudo)} bytes, "
            f"{resultado['duration_seconds']}s processados",
            flush=True,
        )
        raise HTTPException(status_code=422, detail=_ERRO_SEM_FALA)

    perfil = _load_perfil(user_id, request.headers.get("X-Timezone"))
    perfil["conversation_type"] = _load_conversation_type(conversation_id, user_id)
    system_prompt = claude_service.build_agent_prompt(perfil, perfil.get("memories", []), voice=True)

    history_msgs.append({"role": "user", "content": transcript})

    def _stream():
        yield f"data: {json.dumps({'transcript': transcript}, ensure_ascii=False)}\n\n"
        yield from _stream_and_save(
            user_id, conversation_id, transcript, history_msgs, system_prompt,
            perfil.get("timezone"), perfil["conversation_type"],
            thinking=_voice_thinking(), voice=True,
        )

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )



@router.post("/message-text")
@chat_limiter.limit("30/minute")
async def voice_message_text(
    request: Request,
    payload: VoiceTextRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Mesma rodada do `/voice/message`, mas o texto já vem transcrito.

    É o par da transcrição ao vivo: o WebSocket já entregou a frase enquanto a
    pessoa falava, então re-enviar o áudio significaria transcrever (e pagar)
    duas vezes e somar ~1s de espera antes de o Axon começar a responder.

    A resposta é idêntica à do `/voice/message` — inclusive o primeiro evento
    `transcript` —, para que o app consuma os dois caminhos com o mesmo código.
    """
    user_id = current_user["id"]
    transcript = payload.text.strip()[:_MAX_TRANSCRIPT_LEN]
    if not transcript:
        raise HTTPException(status_code=422, detail="Texto vazio.")

    history_msgs = _parse_history(payload.history)

    perfil = _load_perfil(user_id, request.headers.get("X-Timezone"))
    perfil["conversation_type"] = _load_conversation_type(payload.conversation_id, user_id)
    system_prompt = claude_service.build_agent_prompt(perfil, perfil.get("memories", []), voice=True)

    history_msgs.append({"role": "user", "content": transcript})

    def _stream():
        yield f"data: {json.dumps({'transcript': transcript}, ensure_ascii=False)}\n\n"
        yield from _stream_and_save(
            user_id, payload.conversation_id, transcript, history_msgs, system_prompt,
            perfil.get("timezone"), perfil["conversation_type"],
            thinking=_voice_thinking(), voice=True,
        )

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ---------------------------------------------------------------------------
# Transcrição ao vivo
# ---------------------------------------------------------------------------

# Teto por conexão. O `recorder` do navegador já para sozinho em 60s; isto é a
# rede de segurança do lado do servidor, para um cliente adulterado não deixar
# uma sessão aberta gastando transcrição indefinidamente.
_WS_MAX_SEGUNDOS = 300

# PCM 16-bit mono a 24kHz = 48.000 bytes por segundo. Um pacote muito acima
# disso não veio do nosso cliente (que manda ~100ms por vez).
_WS_MAX_PACOTE = 48_000 * 2


@router.websocket("/realtime")
async def realtime(ws: WebSocket):
    """
    Ponte de transcrição ao vivo entre o navegador e a OpenAI.

    Por que o backend fica no meio, em vez do navegador falar direto com a
    OpenAI: a chave nunca sai do servidor, a cota mensal por usuário continua
    valendo e o vocabulário do usuário (que mora no banco) entra na sessão.

    Autenticação **na primeira mensagem**, não no cabeçalho: a API de WebSocket
    do navegador não deixa mandar `Authorization` no handshake. A conexão é
    aceita e imediatamente fechada se o primeiro quadro não for um token válido.

    Protocolo com o cliente:
        recebe  {"token": "..."}          autenticação (obrigatória, primeira)
        recebe  {"audio": "<base64 PCM>"} pedaço de áudio
        recebe  {"commit": true}          fecha o trecho (pausa detectada)
        recebe  {"done": true}            fim da fala (soltou o botão)
        envia   {"partial": "..."}        trecho novo, para a tela
        envia   {"final": "..."}          transcrição fechada de um trecho
        envia   {"error": "..."}          deu errado; o app cai para o modo normal
    """
    await ws.accept()

    # --- autenticação -------------------------------------------------------
    try:
        primeira = await asyncio.wait_for(ws.receive_json(), timeout=10)
    except (asyncio.TimeoutError, WebSocketDisconnect, json.JSONDecodeError, ValueError):
        await ws.close(code=1008)
        return

    token = (primeira or {}).get("token")
    if not token or not isinstance(token, str):
        await ws.send_json({"error": "não autenticado"})
        await ws.close(code=1008)
        return

    try:
        # Mesmo caminho que `get_current_user`, mas sem Depends: aqui o token
        # veio do corpo da mensagem, não do cabeçalho.
        res = supabase_auth.auth.get_user(token)
        if res.user is None:
            raise ValueError("sem usuário")
        user_id = res.user.id
    except Exception:
        await ws.send_json({"error": "token inválido ou expirado"})
        await ws.close(code=1008)
        return

    if not stt_realtime.is_configured():
        # O app trata isto caindo para a transcrição no fim da gravação.
        await ws.send_json({"error": "transcrição ao vivo indisponível"})
        await ws.close(code=1011)
        return

    # A mesma cota do caminho não-streaming: quem estourou o mês não abre sessão.
    try:
        stt_service.check_quota(user_id)
    except stt_service.SttQuotaExceeded as e:
        await ws.send_json({"error": str(e)})
        await ws.close(code=1011)
        return

    nome = (primeira.get("nome") or None) if isinstance(primeira, dict) else None
    segundos_enviados = 0.0

    try:
        async with stt_realtime.connect(user_id, nome) as sessao:

            async def repassar_eventos():
                """OpenAI -> navegador."""
                async for ev in sessao.eventos():
                    await ws.send_json(ev)

            bombeando = asyncio.create_task(repassar_eventos())

            try:
                while True:
                    msg = await ws.receive_json()

                    if msg.get("done"):
                        await sessao.encerrar_turno()
                        # Dá tempo do último trecho voltar antes de fechar.
                        await asyncio.sleep(1.5)
                        break

                    if msg.get("commit"):
                        await sessao.encerrar_turno()
                        continue

                    audio_b64 = msg.get("audio")
                    if not audio_b64:
                        continue
                    try:
                        pcm = base64.b64decode(audio_b64)
                    except (binascii.Error, ValueError):
                        continue
                    if not pcm or len(pcm) > _WS_MAX_PACOTE:
                        continue

                    segundos_enviados += len(pcm) / (stt_realtime.SAMPLE_RATE * 2)
                    if segundos_enviados > _WS_MAX_SEGUNDOS:
                        await ws.send_json({"error": "sessão de voz longa demais"})
                        break

                    await sessao.enviar_audio(pcm)

            except (WebSocketDisconnect, json.JSONDecodeError, ValueError):
                # Cliente sumiu ou mandou lixo: encerra sem barulho.
                pass
            finally:
                bombeando.cancel()

    except stt_realtime.RealtimeError as e:
        try:
            await ws.send_json({"error": str(e)})
        except Exception:
            pass
    finally:
        # Cobra o que foi realmente enviado, mesmo se a conexão caiu no meio —
        # senão uma queda no fim viraria transcrição de graça.
        if segundos_enviados > 0:
            try:
                stt_service.record_usage(user_id, round(segundos_enviados, 1))
            except Exception:
                pass
        try:
            await ws.close()
        except Exception:
            pass
