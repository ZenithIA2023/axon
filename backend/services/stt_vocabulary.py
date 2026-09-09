"""
Vocabulário que o reconhecedor de voz deve esperar ouvir.

O Google acerta português comum, mas erra justamente o que é específico deste
usuário: o nome "Axon", o nome de uma tarefa que só ele tem, o título de uma
rotina. São palavras de baixa frequência no idioma e alta frequência na boca
DELE — exatamente o caso que a adaptação de fala resolve.

O `stt_service` já aceitava `hints` desde a Fase 2, mas nada os preenchia. Este
módulo é quem os preenche.
"""

import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

from database import supabase

# Teto de frases enviadas. A API aceita 1200, mas o vocabulário útil é bem
# menor: encher a lista com títulos antigos dilui o boost dos termos que
# realmente aparecem na fala do dia.
_MAX_FRASES = 220

# O Google corta frases acima disto; um título longo entra truncado.
_MAX_CHARS_FRASE = 100

# Palavras curtas demais viram ruído: "ok", "ir", "eu" já são reconhecidas e
# dar boost nelas só aumenta falso positivo.
_MIN_CHARS_PALAVRA = 4

# Boost por categoria. O nome do assistente é o que mais erra e o que mais
# importa acertar, então leva o teto prático da API (20).
_BOOST_AXON = 20.0
_BOOST_COMANDO = 15.0
_BOOST_CONTEUDO = 12.0

# As 3 consultas de conteúdo custam ~105ms cada e rodam ANTES da transcrição,
# no caminho crítico da fala. Sem cache, seriam ~315ms somados à latência de
# cada frase dita. As tarefas do usuário não mudam a cada frase, então vale
# guardar por alguns minutos: o preço de um vocabulário levemente desatualizado
# (uma tarefa criada agora não entra na próxima fala) é muito menor que o de
# meio segundo a mais em toda gravação.
_CACHE_TTL_S = 300.0
_cache: dict[str, tuple[float, list[str]]] = {}
_cache_lock = threading.Lock()


def invalidate(user_id: str) -> None:
    """Descarta o vocabulário guardado deste usuário."""
    with _cache_lock:
        _cache.pop(user_id, None)

# Termos que o Axon "é": o nome próprio e as palavras do domínio que o usuário
# fala o tempo todo nesta página. Sem isto "Axon" vira "áxon", "hexagon",
# "action", "a som"...
_TERMOS_FIXOS = [
    "Axon",
    "Axon, ",
    "Oi Axon",
    "Olá Axon",
    "Axon, cria",
    "Axon, marca",
    "Axon, agenda",
]

# O vocabulário de comando da própria ferramenta: verbos e substantivos que
# aparecem em quase toda frase dita para o assistente.
_TERMOS_COMANDO = [
    "criar tarefa", "criar uma tarefa", "nova tarefa", "marcar tarefa",
    "concluir tarefa", "concluir a tarefa", "excluir tarefa", "adiar tarefa",
    "criar evento", "agendar evento", "marcar reunião", "remarcar",
    "criar rotina", "rotina da manhã", "rotina da noite",
    "criar objetivo", "meta", "objetivo",
    "bloco de foco", "modo foco", "sessão de foco",
    "registro diário", "meu dia", "minha agenda", "meu planejamento",
    "prioridade alta", "prioridade média", "prioridade baixa",
    "tarefa chave", "para hoje", "para amanhã", "essa semana",
    "de manhã", "à tarde", "à noite",
]


def _normalizar(texto: str) -> str:
    """Sem acento e em minúsculas, só para comparar duplicatas."""
    sem_acento = unicodedata.normalize("NFKD", texto)
    sem_acento = "".join(c for c in sem_acento if not unicodedata.combining(c))
    return sem_acento.lower().strip()


def _limpar(titulo: str) -> str:
    """
    Deixa só o que é pronunciável. Emoji, markdown e pontuação decorativa não
    ajudam o reconhecedor e ainda gastam do teto de caracteres.
    """
    t = re.sub(r"[^\w\sÀ-ÿ-]", " ", titulo or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:_MAX_CHARS_FRASE]


def _titulos(tabela: str, user_id: str, limite: int, extra_eq: dict | None = None) -> list[str]:
    """Títulos recentes de uma tabela do usuário. Falha silenciosa: hints são
    um bônus — se a consulta cair, a transcrição continua funcionando sem eles."""
    try:
        q = (
            supabase.table(tabela)
            .select("title")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limite)
        )
        for coluna, valor in (extra_eq or {}).items():
            q = q.eq(coluna, valor)
        res = q.execute()
    except Exception:
        return []
    return [linha["title"] for linha in (res.data or []) if linha.get("title")]


def _nome_do_perfil(user_id: str) -> str | None:
    """Primeiro nome do usuário, para o reconhecedor não errar quando ele se
    identifica. Falha silenciosa, como as demais consultas daqui."""
    try:
        res = (
            supabase.table("profiles")
            .select("name")
            .eq("id", user_id)
            .single()
            .execute()
        )
    except Exception:
        return None
    return (res.data or {}).get("name")


def build_hints(user_id: str, nome_usuario: str | None = None) -> list[str]:
    """
    Monta a lista de frases para a adaptação de fala deste usuário.

    A ordem importa: o que vem primeiro sobrevive ao corte do teto. Nome do
    assistente e comandos vêm antes dos títulos, porque aparecem em toda frase
    enquanto um título específico aparece de vez em quando.

    O resultado fica em cache por `_CACHE_TTL_S` — ver o comentário na
    constante para o porquê.
    """
    agora = time.monotonic()
    with _cache_lock:
        guardado = _cache.get(user_id)
        if guardado and agora - guardado[0] < _CACHE_TTL_S:
            return guardado[1]

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_nome = pool.submit(_nome_do_perfil, user_id) if nome_usuario is None else None
        futuros = [
            pool.submit(_titulos, "tasks", user_id, 90),
            pool.submit(_titulos, "routines", user_id, 30),
            pool.submit(_titulos, "objectives", user_id, 20, {"status": "active"}),
        ]
        resultados_conteudo = [f.result() for f in futuros]
        if f_nome is not None:
            nome_usuario = f_nome.result()

    frases: list[str] = []
    vistos: set[str] = set()

    def add(texto: str) -> None:
        limpo = _limpar(texto)
        if len(limpo) < _MIN_CHARS_PALAVRA:
            return
        chave = _normalizar(limpo)
        if chave in vistos:
            return
        vistos.add(chave)
        frases.append(limpo)

    for termo in _TERMOS_FIXOS:
        add(termo)

    if nome_usuario:
        # O usuário costuma se identificar ("aqui é o Bernardo") e o Axon o
        # chama pelo nome — que também pode ser incomum para o reconhecedor.
        add(nome_usuario)

    for termo in _TERMOS_COMANDO:
        add(termo)

    # Conteúdo do usuário: é aqui que estão os nomes próprios que só ele usa.
    # Em série as consultas somariam ~1,2s ANTES da transcrição começar, o que
    # o usuário sente como travamento ao soltar o botão. São independentes
    # entre si, então vão juntas.
    for titulos in resultados_conteudo:
        for titulo in titulos:
            add(titulo)

    resultado = frases[:_MAX_FRASES]
    with _cache_lock:
        _cache[user_id] = (agora, resultado)
    return resultado


# "axon" como PALAVRA, não como pedaço: um título de tarefa chamado "Lançar o
# AxonWeb" não é o nome do assistente e não merece o boost máximo.
_RE_PALAVRA_AXON = re.compile(r"(?<![0-9a-z])axon(?![0-9a-z])")


def boost_de(frase: str) -> float:
    """Peso da frase. Chamado pelo `stt_service` ao montar o phrase set."""
    n = _normalizar(frase)
    if _RE_PALAVRA_AXON.search(n):
        return _BOOST_AXON
    if any(_normalizar(t) == n for t in _TERMOS_COMANDO):
        return _BOOST_COMANDO
    return _BOOST_CONTEUDO


# ---------------------------------------------------------------------------
# Correção pós-transcrição
# ---------------------------------------------------------------------------
# A adaptação reduz o erro, não o elimina: "Axon" é uma palavra que não existe
# no português, e o reconhecedor sempre terá um vizinho plausível para ela.
# Estas são as trocas observadas na prática — corrigi-las depois é barato e
# não tem o falso positivo que um boost ainda maior traria.

# Observadas em teste A/B real contra a API do Google (frases sintetizadas e
# transcritas de volta). "Parkinson" e "Jackson" saíram de gravações reais —
# não foram inventadas.
#
# Duas listas, porque o risco é diferente:
#
#  - SEMPRE: grafias que não são palavra nenhuma do português ("áxon", "axom")
#    ou que ninguém diria numa frase sobre a agenda. Trocar é seguro em
#    qualquer posição.
#  - VOCATIVO: palavras que EXISTEM e têm uso legítimo ("Parkinson", "Jackson",
#    "action"). Trocar em qualquer lugar quebraria "mal de Parkinson". Só valem
#    quando aparecem onde se chama o assistente: no começo da fala ou logo
#    depois de um cumprimento.
_VARIANTES_SEMPRE = [
    "axon", "áxon", "axón", "axom", "áxom", "axone", "exxon",
    "áxons", "axons", "axões", "áxion", "axion", "éxon",
    "ax on", "ache on", "áxo", "ax som",
]

# Palavras que EXISTEM e podem ser ditas de verdade: só viram "Axon" em
# posição de vocativo. Ver `corrigir_termos`.
_VARIANTES_VOCATIVO = [
    "parkinson", "jackson", "hexagon", "exon",
    "axo", "a som", "à som", "há som", "aqui som", "e som",
    # observadas em teste real contra a API — a lista nunca fica completa: o
    # reconhecedor inventa uma variante nova a cada gravação. Acrescente as que
    # aparecerem, mas não conte com ela para resolver o problema sozinha.
    "yakisoba", "axolote", "ashton", "axel", "acson", "axson", "aixon", "akson",
]

# Ainda mais ambíguas: "action" e "ação" aparecem em frases comuns ("comprar
# action figure"). Só são trocadas depois de um cumprimento explícito, nunca
# pela regra de início de fala.
_VARIANTES_SO_APOS_CUMPRIMENTO = ["action", "áction", "ação"]

# `\b` não fecha bem com acento em algumas engines; a classe explícita evita
# casar no meio de outra palavra (ex.: "taxon", "maxon").
_LIMITE = r"(?<![0-9A-Za-zÀ-ÿ]){}(?![0-9A-Za-zÀ-ÿ])"

_RE_SEMPRE = [
    re.compile(_LIMITE.format(re.escape(v)), re.IGNORECASE) for v in _VARIANTES_SEMPRE
]

# Cumprimentos que costumam preceder o vocativo. "banda" está aqui porque foi
# o que o Google devolveu para "bom dia" numa gravação real ("Banda Jackson").
_CUMPRIMENTOS = r"(?:oi|ol[áa]|ei|e a[íi]|bom dia|boa tarde|boa noite|banda)"

# Depois de um cumprimento, em qualquer posição da fala.
_RE_APOS_CUMPRIMENTO = [
    re.compile(
        r"(" + _CUMPRIMENTOS + r"[\s,]+)" + _LIMITE.format(re.escape(v)) + r"(?=[\s,.!?]|$)",
        re.IGNORECASE,
    )
    for v in _VARIANTES_VOCATIVO + _VARIANTES_SO_APOS_CUMPRIMENTO
]

# Abrindo a fala, sem nada antes: "Jackson, me lista as tarefas". Exigir a
# primeira posição é o que separa o vocativo de um uso legítimo no meio da
# frase ("pedir yakisoba no almoço" não casa).
_RE_INICIO = [
    re.compile(
        r"^([\s]*)" + _LIMITE.format(re.escape(v)) + r"(?=[\s,.!?]|$)",
        re.IGNORECASE,
    )
    for v in _VARIANTES_VOCATIVO
]

# As muito ambíguas ("action") também valem no começo ABSOLUTO da fala quando
# vêm seguidas de vírgula: "Action, adia a revisão" é o assistente sendo
# chamado, enquanto "comprar action figure" não casa aqui.
# Verbos com que um comando falado começa. "Action cria uma tarefa" é o
# assistente sendo chamado; "action figure do Batman" não é.
# Inclui formas que o reconhecedor costuma partir em duas ("adia" -> "A dia").
_VERBOS_COMANDO = (
    r"(?:cria|crie|criar|marca|marque|marcar|agenda|agende|agendar|adia|adie|"
    r"adiar|a\s+dia|lista|liste|listar|mostra|mostre|mostrar|remove|remova|"
    r"remover|apaga|apague|apagar|conclui|conclua|concluir|muda|mude|mudar|"
    r"me\s|o\s+que|qual|quais)"
)

_RE_INICIO_ESTRITO = [
    re.compile(
        # começo absoluto, seguido de vírgula OU de um verbo de comando
        r"^([\s]*)" + _LIMITE.format(re.escape(v)) + r"(?=\s*,|\s+" + _VERBOS_COMANDO + r")",
        re.IGNORECASE,
    )
    for v in _VARIANTES_SO_APOS_CUMPRIMENTO
]

# "Axon" escrito certo em algum ponto da fala.
_RE_AXON_CERTO = re.compile(r"(?<![0-9a-zà-ÿ])axon(?![0-9a-zà-ÿ])", re.IGNORECASE)

_RE_VARIANTE_SOLTA = [
    re.compile(_LIMITE.format(re.escape(v)), re.IGNORECASE) for v in _VARIANTES_VOCATIVO
]


def corrigir_termos(texto: str) -> str:
    """
    Devolve `texto` com as variantes conhecidas de "Axon" normalizadas.

    Três camadas, da mais segura para a mais arriscada:

    1. Grafias impossíveis ("áxon", "axom") — troca em qualquer posição.
    2. Palavras reais ("Jackson", "Parkinson") quando a fala JÁ contém "Axon"
       escrito certo: é o mesmo nome dito duas vezes, e o Google acertou uma e
       errou a outra. Foi o caso de "está botando Jackson ao invés de Axon".
    3. As mesmas palavras em posição de vocativo — no começo da fala ou logo
       depois de um cumprimento.

    Fora disso, "mal de Parkinson" e "ligar para o Jackson" ficam como estão:
    corromper o texto do usuário é pior que uma transcrição imperfeita.
    """
    if not texto:
        return texto

    for regex in _RE_SEMPRE:
        texto = regex.sub("Axon", texto)

    # (2) A própria fala prova qual é o nome certo.
    if _RE_AXON_CERTO.search(texto):
        for regex in _RE_VARIANTE_SOLTA:
            texto = regex.sub("Axon", texto)
        return _RE_AXON_CERTO.sub("Axon", texto)

    # (3) Vocativo.
    for regex in _RE_APOS_CUMPRIMENTO:
        novo = regex.sub(lambda m: f"{m.group(1)}Axon", texto, count=1)
        if novo != texto:
            return novo

    for regex in _RE_INICIO:
        novo = regex.sub(lambda m: f"{m.group(1)}Axon", texto, count=1)
        if novo != texto:
            return novo

    for regex in _RE_INICIO_ESTRITO:
        novo = regex.sub(lambda m: f"{m.group(1)}Axon", texto, count=1)
        if novo != texto:
            return novo

    return texto
