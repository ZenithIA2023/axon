"""
Transcrição ao vivo: a ponte entre o navegador e a API realtime da OpenAI.

Por que uma ponte e não conexão direta do navegador: a chave da OpenAI não pode
sair do servidor, a cota por usuário precisa continuar valendo, e o vocabulário
do usuário (`stt_vocabulary`) mora aqui, no backend, junto do banco. O preço é
um salto de rede a mais — medido em dezenas de milissegundos, contra parciais
que chegam em ~1s.

O formato é imposto pela OpenAI e foi confirmado por sondagem, não por
documentação: **só PCM de 16 bits, mono, a 24kHz** ("audio/pcm", rate 24000).
`audio/webm` e `audio/opus` são recusados explicitamente, e rate 16000 também
("integer below minimum"). É por isso que o navegador precisa capturar PCM cru
por AudioWorklet em vez de reusar o MediaRecorder da gravação normal.

Protocolo (também confirmado por sondagem):
    conecta   wss://api.openai.com/v1/realtime?intent=transcription
    envia     session.update  -> configura formato, modelo, idioma e keywords
    envia     input_audio_buffer.append  (áudio PCM em base64)
    envia     input_audio_buffer.commit  -> fecha o trecho e pede a transcrição
    recebe    conversation.item.input_audio_transcription.delta      (parcial)
    recebe    conversation.item.input_audio_transcription.completed  (final)

O ponto que define o desenho desta tela: **a API não transcreve continuamente.**
Ela transcreve por TURNO, e um turno só fecha quando o detector de fala (VAD) vê
uma pausa. Medido numa frase de 13s: sem intervenção, o primeiro texto chega aos
13,5s — depois da pessoa terminar de falar. Não é transcrição ao vivo.

Quem corta os turnos é o cliente, com `commit`, nas pausas naturais da fala (o
navegador já mede o volume do microfone). Aí o primeiro texto chega aos ~7s da
mesma frase. Cortar por relógio fixo foi testado e descartado: a cada 3s partia
palavra ao meio ("uma tarefa" virou "uma tarefa." + "Efa para revisar") e
duplicava o último trecho.
"""

import base64
import json
import os
from typing import AsyncIterator

import websockets

from services import stt_vocabulary

_URL = "wss://api.openai.com/v1/realtime?intent=transcription"

# O mesmo modelo do caminho não-streaming, pelo mesmo motivo (medição própria em
# pt-BR: 100% contra 71% do gpt-4o-transcribe). Manter os dois iguais evita que
# a transcrição ao vivo e a final discordem entre si.
_DEFAULT_MODEL = "gpt-transcribe"

# 24kHz é o único aceito. Não é ajustável: está aqui como nome, não como opção.
SAMPLE_RATE = 24_000

# `keywords` é um campo dedicado a nomes próprios, e é mais direto que enfiar os
# termos no `prompt`. Sondagem: com ele, "Thaynara Bezerril" e "Zenith" saem
# certos; sem ele, viram "Tainara" e "Zenit". O eco da sessão NÃO devolve o
# campo — parece ignorado e não é.
_MAX_KEYWORDS = 100

# Pausa que fecha o turno quando o cliente não corta antes. Curto demais corta
# quem pensa no meio da frase; longo demais atrasa o texto final. No
# push-to-talk soltar o botão também encerra, então isto é rede de segurança.
_SILENCIO_MS = 500

# A OpenAI recusa `commit` com menos de 100ms no buffer ("buffer too small").
# 120ms dá margem para o arredondamento dos pacotes do navegador.
_MIN_BYTES_COMMIT = int(SAMPLE_RATE * 2 * 0.12)


class RealtimeError(RuntimeError):
    """Falha ao abrir ou manter a sessão de transcrição ao vivo."""


def is_configured() -> bool:
    """
    Só a OpenAI direta tem streaming.

    O OpenRouter serve o mesmo modelo em requisição única, mas não expõe a API
    realtime; o Google tem streaming próprio, com outro protocolo, que não
    implementamos. Em ambos, o app cai para a transcrição no fim da gravação.
    """
    return bool(os.getenv("OPENAI_API_KEY")) and os.getenv("VOICE_STT_PROVIDER", "openai") == "openai"


def _config_sessao(user_id: str, nome_usuario: str | None, language: str) -> dict:
    """Monta o `session.update`, já com o vocabulário do usuário."""
    transcription: dict = {
        "model": os.getenv("OPENAI_STT_MODEL", _DEFAULT_MODEL),
        # A API quer "pt", não "pt-BR".
        "language": language.split("-")[0],
    }

    # O vocabulário vem do cache de 5 minutos do `stt_vocabulary`; na prática
    # custa uma leitura de dicionário, não 4 consultas ao banco.
    try:
        hints = stt_vocabulary.build_hints(user_id, nome_usuario)
    except Exception:
        # Vocabulário é melhoria, não requisito: uma falha no banco não pode
        # derrubar a transcrição inteira.
        hints = []
    if hints:
        transcription["keywords"] = [h for h in hints if len(h) > 3][:_MAX_KEYWORDS]

    return {
        "type": "session.update",
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": SAMPLE_RATE},
                    "transcription": transcription,
                    "turn_detection": {
                        "type": "server_vad",
                        "silence_duration_ms": _SILENCIO_MS,
                    },
                }
            },
        },
    }


def connect(user_id: str, nome_usuario: str | None = None, language: str = "pt-BR"):
    """
    Abre a sessão. Devolve um gerenciador de contexto assíncrono com a conexão
    já configurada — quem chama só manda áudio e lê eventos.
    """
    chave = os.getenv("OPENAI_API_KEY")
    if not chave:
        raise RealtimeError("transcrição ao vivo sem OPENAI_API_KEY")
    return _Sessao(chave, _config_sessao(user_id, nome_usuario, language))


class _Sessao:
    def __init__(self, chave: str, config: dict):
        self._chave = chave
        self._config = config
        self._ws = None
        # Quanto áudio ainda não foi fechado por um commit. A OpenAI recusa um
        # commit com menos de 100ms acumulados.
        self._bytes_no_buffer = 0

    async def __aenter__(self) -> "_Sessao":
        try:
            self._ws = await websockets.connect(
                _URL,
                additional_headers={"Authorization": f"Bearer {self._chave}"},
                # Os eventos são pequenos; o teto evita que uma resposta
                # inesperadamente grande estoure a memória do processo.
                max_size=4 * 1024 * 1024,
                open_timeout=10,
            )
        except Exception as e:
            raise RealtimeError(f"não foi possível conectar: {e}") from e

        await self._ws.recv()  # session.created
        await self._ws.send(json.dumps(self._config))
        return self

    async def __aexit__(self, *_exc) -> None:
        if self._ws:
            await self._ws.close()

    async def enviar_audio(self, pcm: bytes) -> None:
        """Manda um pedaço de PCM 16-bit mono 24kHz."""
        if not self._ws:
            raise RealtimeError("sessão fechada")
        self._bytes_no_buffer += len(pcm)
        await self._ws.send(
            json.dumps(
                {
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm).decode(),
                }
            )
        )

    async def encerrar_turno(self) -> None:
        """
        Fecha o turno sem esperar o VAD.

        No push-to-talk soltar o botão JÁ é o fim da fala: esperar os 500ms de
        silêncio do detector seria meio segundo de espera sem motivo.

        Não faz nada se o buffer estiver curto demais. Sem esta guarda, uma fala
        que termina numa pausa (o buffer acabou de ser esvaziado) emite
        "buffer too small" — e como o app trata `error` caindo para o modo sem
        streaming, um caso comum derrubaria a transcrição ao vivo inteira.

        O contador é zerado tanto aqui quanto em `eventos`, porque o buffer
        esvazia por dois caminhos: o nosso commit e o VAD do servidor fechando o
        turno sozinho. Contar só os nossos deixaria o contador mentindo.
        """
        if not self._ws or self._bytes_no_buffer < _MIN_BYTES_COMMIT:
            return
        self._bytes_no_buffer = 0
        await self._ws.send(json.dumps({"type": "input_audio_buffer.commit"}))

    async def eventos(self) -> AsyncIterator[dict]:
        """
        Traduz os eventos da OpenAI para o que a tela precisa:

            {"partial": "..."}  trecho novo do que está sendo dito
            {"final": "..."}    transcrição fechada do turno
            {"error": "..."}    a sessão morreu
        """
        if not self._ws:
            return
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                tipo = msg.get("type", "")

                # O VAD fechou o turno por conta própria: o buffer do servidor
                # está vazio agora, mesmo sem termos mandado commit.
                if tipo == "input_audio_buffer.committed":
                    self._bytes_no_buffer = 0
                    continue

                if tipo.endswith("input_audio_transcription.delta"):
                    delta = msg.get("delta", "")
                    if delta:
                        yield {"partial": delta}

                elif tipo.endswith("input_audio_transcription.completed"):
                    texto = (msg.get("transcript") or "").strip()
                    # Turno sem fala (só silêncio) volta vazio: emitir isso
                    # apagaria da tela o texto que já estava lá.
                    if not texto:
                        continue
                    # A mesma rede de segurança do caminho não-streaming: "Axon"
                    # não existe em português e sempre tem um vizinho plausível.
                    yield {"final": stt_vocabulary.corrigir_termos(texto)}

                elif tipo == "error":
                    mensagem = (msg.get("error") or {}).get("message", "erro na transcrição")
                    # "buffer too small" é uma corrida inofensiva entre o nosso
                    # commit e o VAD: os dois fecham o mesmo turno e o segundo
                    # chega num buffer já vazio. Propagar isso faria o app cair
                    # para o modo sem streaming sem nenhum motivo real.
                    if "buffer too small" in mensagem:
                        continue
                    yield {"error": mensagem}
        except websockets.ConnectionClosed:
            # Fim normal quando quem chama fecha a sessão: não é erro.
            return
