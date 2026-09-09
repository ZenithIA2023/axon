"""
Transcrição de voz (áudio → texto) do Axon.

A síntese (texto → áudio) já mora em `tts_service`; aqui é o caminho inverso,
usando o Google Speech-to-Text v2 com a MESMA credencial de service account
que o `gcp_auth` já troca por token para o TTS — nenhuma chave nova.

Diferente do TTS, aqui existe um único provedor: é o Google quem abre a
"entrada" da voz (ouvir o usuário), e a escolha entre Google/ElevenLabs para a
"saída" (o Axon falando) não afeta isto — as duas pontas são independentes.

O recognizer usado é o "_" (auto, sem recurso dedicado no console) na região
"global": não exige criar nem manter nada além de habilitar a API.
"""

import base64
import os
from datetime import datetime, timezone

import httpx

from database import supabase
from services import gcp_auth, stt_vocabulary

# A transcrição entra no caminho da conversa falada — um provedor lento trava
# a resposta do Axon antes mesmo dela começar.
_TIMEOUT = 15.0

# O recorder da Fase 3 corta em 60s / 2MB; a Fase 2 já aplica o mesmo teto
# aqui, para que um curl direto não vire uma cobrança fora de controle.
_MAX_BYTES = 2 * 1024 * 1024

_RECOGNIZE_URL = (
    "https://speech.googleapis.com/v2/projects/{project}/locations/global/"
    "recognizers/_:recognize"
)

_DEFAULT_MONTHLY_LIMIT_SECONDS = 3600  # 1h de áudio/mês por usuário

# "long", e não "short": apesar de a documentação vender o "short" para falas
# de poucos segundos, MEDIMOS que ele trunca — numa frase de 5,6s ele devolveu
# só os primeiros 1,7s (26% das palavras). O "long" transcreve a frase inteira.
# Um comando falado passa fácil de 5s ("bom dia Axon, me lista tudo que eu
# tenho para fazer hoje"), então o "short" corta no meio do pedido.
# VOICE_STT_MODEL troca sem deploy. Note que "chirp_2"/"chirp_3" NÃO existem na
# location "global" que este recognizer usa — exigiriam outra região.
_DEFAULT_MODEL = "long"

# Provedor padrão. O Google ficou para trás: é o mais caro (US$0,024/min contra
# US$0,006 da OpenAI), ranqueia por último nos benchmarks independentes de
# acurácia, e o vocabulário dele não funciona (ver `_transcribe_google`). Na
# prática ele transcrevia "Axon" como "Jackson", "acson", "Akon", "yakisoba" —
# uma variante nova a cada gravação.
_DEFAULT_PROVIDER = "openai"
# "gpt-transcribe" (jul/2026) sucede o gpt-4o-transcribe: mais barato
# (US$0,0045/min contra 0,006) e MEDIDO melhor no nosso próprio comparativo em
# pt-BR — 100% de acerto contra 71% do gpt-4o-transcribe em frases com nomes
# próprios ("Zenith", "Potencializa", "Juliana"). Aceita `prompt` e tem
# streaming por WebSocket, que é o caminho da transcrição ao vivo.
_DEFAULT_OPENAI_MODEL = "gpt-transcribe"
# O mesmo modelo, com o prefixo que o OpenRouter usa.
_DEFAULT_OPENROUTER_MODEL = "openai/gpt-transcribe"


def _provider() -> str:
    return os.getenv("VOICE_STT_PROVIDER", _DEFAULT_PROVIDER)


def _model() -> str:
    return os.getenv("VOICE_STT_MODEL", _DEFAULT_MODEL)


def _usa_hints() -> bool:
    """O provedor ativo respeita o vocabulário?"""
    if _provider() == "openai":
        return True
    # OpenRouter aceita o campo e não repassa; Google ignora. Nos dois, montar
    # o vocabulário seria gastar 4 consultas ao banco por fala à toa.
    return _ADAPTATION_ATIVA


# Desligada porque não funciona (ver o comentário em `transcribe`). Enviar o
# campo à toa só gasta banda e dá a falsa impressão de que o vocabulário está
# agindo. VOICE_STT_ADAPTATION=1 religa para reavaliar sem deploy.
_ADAPTATION_ATIVA = os.getenv("VOICE_STT_ADAPTATION", "0") == "1"


class SttError(RuntimeError):
    """Falha ao transcrever. O router traduz para HTTP; o app avisa o usuário."""


class SttQuotaExceeded(RuntimeError):
    """Usuário estourou o limite mensal de segundos transcritos."""


def is_configured() -> bool:
    """Há credencial para o provedor ativo?"""
    p = _provider()
    if p == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    if p == "openrouter":
        return bool(os.getenv("OPENROUTER_API_KEY"))
    return gcp_auth.service_account() is not None


def _parse_offset(value: str | None) -> float:
    """'12.340s' -> 12.34. Formato de Duration da API do Google em JSON."""
    if not value:
        return 0.0
    try:
        return float(value.rstrip("s"))
    except (TypeError, ValueError):
        return 0.0


def _transcribe_google(
    audio: bytes,
    mime: str,
    language: str = "pt-BR",
    hints: list[str] | None = None,
) -> dict:
    """
    Provedor Google Speech-to-Text v2.

    Transcreve `audio` e devolve {"text", "confidence", "duration_seconds"}.

    `hints` são palavras que o reconhecedor deve favorecer quando a fala for
    ambígua (ex.: "Axon", nomes de tarefas do usuário) — sem custo se vier
    vazio.

    `duration_seconds` vem do `resultEndOffset` do último resultado: é o
    próprio Google dizendo até onde no áudio ele reconheceu fala. Não dá para
    confiar no tamanho em bytes para isso — varia com silêncio, ruído e taxa
    de bits do aparelho — e é este valor que alimenta o contador de uso.
    """
    if not audio:
        raise SttError("áudio vazio")
    if len(audio) > _MAX_BYTES:
        raise SttError(f"áudio acima de {_MAX_BYTES // 1024 // 1024}MB")

    cred = gcp_auth.service_account()
    if not cred:
        raise SttError("Google Speech-to-Text sem credencial configurada")
    token = gcp_auth.access_token(cred, gcp_auth.SCOPE_CLOUD_PLATFORM)
    if not token:
        raise SttError("Google Speech-to-Text: falha ao obter access token")

    project = gcp_auth.project_id(cred)
    if not project:
        raise SttError("Google Speech-to-Text: projeto GCP não identificado")

    config: dict = {
        # Detecta o formato pelo cabeçalho do próprio arquivo (WebM/Opus do
        # navegador, mas serve para qualquer container suportado) — evita ter
        # que acertar sampleRateHertz/encoding na mão para cada aparelho.
        "autoDecodingConfig": {},
        "languageCodes": [language],
        "model": _model(),
        "features": {"enableAutomaticPunctuation": True},
    }
    if hints and _ADAPTATION_ATIVA:
        # ATENÇÃO: medimos que o Google IGNORA este campo com o recognizer "_"
        # (tanto em "global" quanto no endpoint regional). A prova: uma palavra
        # inventada com boost 20 sai exatamente igual a sem hints nenhum.
        #
        # O código fica aqui, desligado, porque a API aceita o campo sem erro e
        # a documentação diz que deveria funcionar — se o Google corrigir, ou
        # se um dia criarmos um recognizer dedicado no console (que é o que a
        # documentação de adaptação pressupõe), basta ligar de volta pela env.
        config["adaptation"] = {
            "phraseSets": [
                {
                    "inlinePhraseSet": {
                        "phrases": [
                            {"value": h, "boost": stt_vocabulary.boost_de(h)}
                            for h in hints
                        ]
                    }
                }
            ]
        }

    corpo = {"config": config, "content": base64.b64encode(audio).decode("ascii")}

    with httpx.Client(timeout=_TIMEOUT) as client:
        r = client.post(
            _RECOGNIZE_URL.format(project=project),
            headers={"Authorization": f"Bearer {token}"},
            json=corpo,
        )
    if r.status_code >= 400:
        raise SttError(f"Google STT {r.status_code}: {r.text[:200]}")

    resultados = r.json().get("results") or []
    if not resultados:
        return {"text": "", "confidence": 0.0, "duration_seconds": 0.0}

    trechos: list[str] = []
    confidencias: list[float] = []
    duracao = 0.0
    for resultado in resultados:
        alternativas = resultado.get("alternatives") or []
        if not alternativas:
            continue
        melhor = alternativas[0]
        texto = (melhor.get("transcript") or "").strip()
        if texto:
            trechos.append(texto)
        if "confidence" in melhor:
            confidencias.append(melhor["confidence"])
        duracao = max(duracao, _parse_offset(resultado.get("resultEndOffset")))

    return {
        "text": " ".join(trechos).strip(),
        "confidence": (sum(confidencias) / len(confidencias)) if confidencias else 0.0,
        "duration_seconds": round(duracao, 2),
    }


def _transcribe_openai(
    audio: bytes,
    mime: str,
    language: str = "pt-BR",
    hints: list[str] | None = None,
) -> dict:
    """
    Provedor OpenAI (gpt-4o-transcribe e família).

    A diferença que importa em relação ao Google: o campo `prompt` funciona
    como vocabulário de verdade. O Google aceita `adaptation` e ignora (medido:
    uma palavra inventada com boost 20 sai igual a sem hint nenhum); aqui o
    modelo é um LLM e realmente leva o prompt em conta ao decidir entre duas
    transcrições plausíveis. É o que faz "Axon" parar de virar "Jackson".

    Não devolve duração: a API não informa. Estimamos pelo tamanho do arquivo
    só para o contador de cota — ver `_duracao_estimada`.
    """
    chave = os.getenv("OPENAI_API_KEY")
    if not chave:
        raise SttError("OpenAI sem OPENAI_API_KEY")

    ext = _extensao(mime)

    data = {
        "model": os.getenv("OPENAI_STT_MODEL", _DEFAULT_OPENAI_MODEL),
        "language": language.split("-")[0],  # a API quer "pt", não "pt-BR"
        "response_format": "json",
    }
    prompt = _montar_prompt(hints)
    if prompt:
        data["prompt"] = prompt

    with httpx.Client(timeout=_TIMEOUT) as client:
        r = client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {chave}"},
            files={"file": (f"voz.{ext}", audio, mime or "audio/webm")},
            data=data,
        )
    if r.status_code >= 400:
        raise SttError(f"OpenAI STT {r.status_code}: {r.text[:200]}")

    texto = (r.json().get("text") or "").strip()
    return {
        "text": texto,
        # A API não devolve confiança; 1.0 evita que quem lê o campo trate uma
        # transcrição boa como duvidosa.
        "confidence": 1.0 if texto else 0.0,
        "duration_seconds": _duracao_estimada(audio),
    }


def _extensao(mime: str) -> str:
    """
    Formato do áudio a partir do mime. O nome do arquivo (ou o campo `format`)
    é o que informa o codec à API — o mime cru do navegador
    ("audio/webm;codecs=opus") não serve como extensão.
    """
    if "mp4" in mime or "m4a" in mime:
        return "m4a"
    if "ogg" in mime:
        return "ogg"
    if "mpeg" in mime or "mp3" in mime:
        return "mp3"
    if "wav" in mime:
        return "wav"
    return "webm"


def _montar_prompt(hints: list[str] | None) -> str:
    """
    Transforma o vocabulário numa instrução em linguagem natural.

    O `prompt` da OpenAI não é uma lista de termos com peso, é contexto: o
    modelo lê como se fosse a continuação de uma transcrição anterior. Uma
    frase explicando quem é quem funciona melhor que palavras soltas.
    """
    base = (
        "Transcrição de um comando falado para um assistente pessoal brasileiro "
        "chamado Axon (escreve-se A-X-O-N). O usuário fala sobre tarefas, "
        "eventos, rotinas, objetivos e sua agenda."
    )
    if not hints:
        return base
    # Só os termos próprios do usuário; os genéricos já estão na frase acima.
    termos = [h for h in hints if len(h) > 3][:60]
    if not termos:
        return base
    return f"{base} Termos que podem aparecer: {', '.join(termos)}."


def _duracao_estimada(audio: bytes) -> float:
    """
    Segundos aproximados a partir do tamanho, para o contador de cota.

    O Google informava a duração real; a OpenAI não. O áudio do navegador é
    Opus em ~24kbps (o padrão do MediaRecorder), o que dá ~3KB/s. É uma
    estimativa grosseira, mas o contador existe para barrar abuso — alguém
    esquecendo o microfone ligado —, não para faturar ao segundo.
    """
    return round(len(audio) / 3000.0, 2)


def _transcribe_openrouter(
    audio: bytes,
    mime: str,
    language: str = "pt-BR",
    hints: list[str] | None = None,
) -> dict:
    """
    Provedor OpenRouter — o MESMO `gpt-transcribe`, por outra porta.

    Existe para testar sem abrir conta na OpenAI: quem já tem crédito no
    OpenRouter usa a chave que tem. Para produção prefira "openai" direto,
    porque o OpenRouter **aceita e ignora** o `prompt` (o vocabulário não
    chega ao modelo) e não oferece streaming — que é o caminho da transcrição
    ao vivo.

    Diferente da OpenAI, aqui o áudio vai em base64 num JSON, não em multipart.
    """
    chave = os.getenv("OPENROUTER_API_KEY")
    if not chave:
        raise SttError("OpenRouter sem OPENROUTER_API_KEY")

    corpo = {
        "model": os.getenv("OPENROUTER_STT_MODEL", _DEFAULT_OPENROUTER_MODEL),
        "input_audio": {
            "data": base64.b64encode(audio).decode("ascii"),
            "format": _extensao(mime),
        },
        "language": language.split("-")[0],
    }
    # Mandado mesmo sabendo que é ignorado hoje: se o OpenRouter passar a
    # repassar o campo, o vocabulário volta a funcionar sem mudar nada aqui.
    prompt = _montar_prompt(hints)
    if prompt:
        corpo["prompt"] = prompt

    with httpx.Client(timeout=_TIMEOUT) as client:
        r = client.post(
            "https://openrouter.ai/api/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {chave}"},
            json=corpo,
        )
    if r.status_code >= 400:
        raise SttError(f"OpenRouter STT {r.status_code}: {r.text[:200]}")

    d = r.json()
    texto = (d.get("text") or "").strip()
    # O OpenRouter informa a duração real do áudio; melhor que estimar.
    segundos = float((d.get("usage") or {}).get("seconds") or 0) or _duracao_estimada(audio)
    return {
        "text": texto,
        "confidence": 1.0 if texto else 0.0,
        "duration_seconds": round(segundos, 2),
    }


_PROVIDERS = {
    "google": _transcribe_google,
    "openai": _transcribe_openai,
    "openrouter": _transcribe_openrouter,
}


def transcribe(
    audio: bytes,
    mime: str,
    language: str = "pt-BR",
    hints: list[str] | None = None,
) -> dict:
    """
    Transcreve `audio` com o provedor configurado.

    Devolve {"text", "confidence", "duration_seconds"}. `hints` são termos que
    o reconhecedor deve favorecer — respeitados pela OpenAI, ignorados pelo
    Google (ver `_transcribe_openai`).
    """
    if not audio:
        raise SttError("áudio vazio")
    if len(audio) > _MAX_BYTES:
        raise SttError(f"áudio acima de {_MAX_BYTES // 1024 // 1024}MB")

    nome = _provider()
    fn = _PROVIDERS.get(nome)
    if fn is None:
        raise SttError(f"provedor de STT desconhecido: {nome}")
    return fn(audio, mime, language, hints)


# ---------------------------------------------------------------------------
# Contador de uso mensal
# ---------------------------------------------------------------------------
# "Antes de abrir para usuários, senão o custo só aparece na fatura" — o teto
# é por usuário/mês, não por request: o risco real é alguém esquecendo o
# microfone gravando, não uma frase isolada de vez em quando.

def _monthly_limit_seconds() -> int:
    return int(
        os.getenv("VOICE_STT_MONTHLY_LIMIT_SECONDS", _DEFAULT_MONTHLY_LIMIT_SECONDS)
    )


def _year_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def seconds_used_this_month(user_id: str) -> int:
    res = (
        supabase.table("voice_stt_usage")
        .select("seconds_used")
        .eq("user_id", user_id)
        .eq("year_month", _year_month())
        .execute()
    )
    linhas = res.data or []
    return linhas[0]["seconds_used"] if linhas else 0


def check_quota(user_id: str) -> None:
    """
    Levanta `SttQuotaExceeded` se o usuário já estourou o teto do mês.

    Limite <= 0 desliga o teto (útil em desenvolvimento, onde não faz sentido
    contar).
    """
    limite = _monthly_limit_seconds()
    if limite <= 0:
        return
    if seconds_used_this_month(user_id) >= limite:
        raise SttQuotaExceeded(f"limite mensal de {limite}s de transcrição atingido")


def transcribe_billed(
    user_id: str,
    audio: bytes,
    mime: str,
    language: str = "pt-BR",
    hints: list[str] | None = None,
    nome_usuario: str | None = None,
) -> dict:
    """
    `check_quota` + `transcribe` + `record_usage` em sequência — usados juntos
    tanto por `/voice/transcribe` quanto por `/voice/message`, sempre nesta
    ordem (checa ANTES de gastar a chamada ao Google, cobra DEPOIS de saber a
    duração real).

    `hints` omitido monta o vocabulário do próprio usuário (nome do assistente,
    comandos, títulos das tarefas e rotinas dele). É o padrão porque os dois
    endpoints querem isso; passar `[]` explicitamente desliga.
    """
    check_quota(user_id)

    # Só monta o vocabulário se o provedor ativo for de fato usá-lo: são 4
    # consultas ao banco, e no Google (que ignora hints) seriam 400ms jogados
    # fora em cada fala.
    if hints is None and _usa_hints():
        hints = stt_vocabulary.build_hints(user_id, nome_usuario)

    resultado = transcribe(audio, mime, language, hints)

    # Rede de segurança depois do boost: "Axon" não existe no português e o
    # reconhecedor sempre terá um vizinho plausível para ela.
    resultado["text"] = stt_vocabulary.corrigir_termos(resultado["text"])

    record_usage(user_id, resultado["duration_seconds"])
    return resultado


def record_usage(user_id: str, seconds: float) -> None:
    """Soma `seconds` ao contador do mês corrente. Idempotente pela PK composta."""
    if seconds <= 0:
        return
    mes = _year_month()
    usado = seconds_used_this_month(user_id)
    supabase.table("voice_stt_usage").upsert(
        {
            "user_id": user_id,
            "year_month": mes,
            "seconds_used": usado + round(seconds),
        },
        on_conflict="user_id,year_month",
    ).execute()
