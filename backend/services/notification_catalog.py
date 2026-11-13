"""
Catálogo de notificações do Axon (docs/NOTIFICACOES_AXON.md).

O DOCUMENTO É A FONTE DA VERDADE dos textos: foram revisados e aprovados pelo
Bernardo, e tests_notification_catalog.py lê o .md e falha se um texto daqui
divergir de lá. Para mudar um texto, mude os dois.

Tudo aqui é PURO — sem banco, sem relógio, sem Claude. Quem chama (o
planning_scheduler) lê os dados no momento do disparo, monta o `ctx` e pede uma
variação; este módulo decide quais são elegíveis, sorteia e redige.

Por que sorteio uniforme e não "a que funciona melhor": cada variação precisa
de uma amostra justa para que a comparação (seção 5 do documento) diga alguma
coisa. Escolher a "melhor" agora congelaria a escolha antes de haver dado.
"""

import random
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from services.chronotype import CHRONOTYPE_META

# Tipos de envio. `kind` agrupa as variações que concorrem entre si num sorteio.
REGISTRO = "reg"
REGISTRO_RISCO = "reg_risco"
MANHA = "man"
AMANHA = "ama"
TAREFA = "tar"
SEMANA = "sem"

PARCEIRO = "Parceiro"

# Quantos dias uma variação fica fora do sorteio depois de enviada (seção 5).
SEM_REPETIR_DIAS = 7

# Marcos da ofensiva (regra 5). O documento diz "7/30/100…"; os depois de 100
# são escolha minha, a confirmar com o Bernardo.
MARCOS = (7, 30, 100, 200, 365, 500, 1000)

# Regra 2: abaixo disto, a família Dados sai do sorteio.
MEDIA_MINIMA = 60
# Regra 1: dias da semana com tarefa (total > 0) para a média valer.
DIAS_MINIMOS = 3


@dataclass(frozen=True)
class Variant:
    id: str
    kind: str
    family: str
    title: str
    body: str


# Textos copiados do documento, sem nenhuma alteração. As variações sem
# família no documento (risco da ofensiva e 30 min antes) ganharam uma aqui
# só para o campo `family` gravado no envio: "Ofensiva" para o risco (é a
# seção dele) e "Utilitário" para o 30 min (é como o documento o chama).
CATALOG: tuple[Variant, ...] = (
    # 4.1 Registro do dia
    Variant("reg_par_1", REGISTRO, "Parceiro", "Fechando o dia, {nome}?", "Me conta como foi. Amanhã eu organizo melhor pra você."),
    Variant("reg_par_2", REGISTRO, "Parceiro", "Antes de descansar…", "Como foi seu dia? Seu registro me ajuda a acertar seus horários."),
    Variant("reg_bri_1", REGISTRO, "Brincalhão", "O Axon tá de olho 👀", "Seu dia não vai se registrar sozinho. Um minutinho?"),
    Variant("reg_bri_2", REGISTRO, "Brincalhão", "Psiu, {nome}", "Faltou só uma coisa hoje: me contar como foi."),
    Variant("reg_cur_1", REGISTRO, "Curioso", "Hoje rendeu ou travou?", "Cada registro mostra mais do seu ritmo. Esse leva 30 segundos."),
    Variant("reg_cur_2", REGISTRO, "Curioso", "Seu dia teve cara de quê?", "Três toques e eu aprendo mais sobre você."),
    Variant("reg_ofe_1", REGISTRO, "Ofensiva", "🔥 {ofensiva} dias seguidos", "Não deixa a chama apagar hoje."),
    Variant("reg_ofe_2", REGISTRO, "Ofensiva", "{ofensiva} dias e contando", "Mais um registro e a sequência continua."),
    Variant("reg_marco", REGISTRO, "Ofensiva", "Hoje são {ofensiva+1} dias 🔥", "Um marco desses merece ser fechado."),
    Variant("reg_dad_cal", REGISTRO, "Dados", "Faltam {faltam_calibrar} registros", "Com eles eu calibro sua curva de energia de verdade."),
    Variant("reg_pri", REGISTRO, "Parceiro", "Seu primeiro registro, {nome}", "É assim que eu começo a entender seu ritmo. Leva 30 segundos."),
    # Ofensiva em risco: prioridade sobre o sorteio acima.
    Variant("reg_risco_1", REGISTRO_RISCO, "Ofensiva", "Sua ofensiva de {ofensiva} dias", "Ontem ficou sem registro. Ainda dá tempo de salvar."),
    Variant("reg_risco_2", REGISTRO_RISCO, "Ofensiva", "Ainda dá tempo 🔥", "Registra ontem e seus {ofensiva} dias continuam."),
    # 4.2 Resumo da manhã
    Variant("man_par_1", MANHA, "Parceiro", "Bom dia, {nome}!", "Hoje são {n} tarefas. A primeira às {hora}: {tarefa}."),
    Variant("man_bri_1", MANHA, "Brincalhão", "Café pronto? ☕", "Hoje são {n} tarefas te esperando. A primeira às {hora}."),
    Variant("man_rit_1", MANHA, "Ritmo", "Seu pico começa às {pico}", "Hoje são {n} tarefas. Guarde o mais difícil para esse horário."),
    Variant("man_dad_1", MANHA, "Dados", "{media_semana}% esta semana", "Mais um dia assim e a semana fecha forte. Hoje são {n}."),
    Variant("man_mem_1", MANHA, "Memória", "Sua melhor semana: {melhor_semana}%", "Você já mostrou que consegue. Hoje são {n} tarefas."),
    Variant("man_par_uni", MANHA, "Parceiro", "Bom dia, {nome}!", "Hoje o foco é um só: {tarefa}."),
    Variant("man_bri_uni", MANHA, "Brincalhão", "Café pronto? ☕", "Só uma missão hoje: {tarefa}."),
    Variant("man_rit_uni", MANHA, "Ritmo", "Seu pico começa às {pico}", "Um item só hoje: {tarefa}. Cabe direitinho nesse horário."),
    Variant("man_vaz_1", MANHA, "Parceiro", "Dia em branco, {nome}", "Quer que eu te ajude a organizar? Leva 2 minutos."),
    Variant("man_vaz_2", MANHA, "Curioso", "Dia livre hoje?", "Se for descanso, aproveita. Se não, posso te ajudar a organizar."),
    # 4.3 Organizar o amanhã
    Variant("ama_par_1", AMANHA, "Parceiro", "Que tal deixar amanhã pronto?", "Alguns minutos agora deixam a manhã bem mais leve."),
    Variant("ama_bri_1", AMANHA, "Brincalhão", "Amanhã tá em branco 👀", "Bora preencher antes de dormir? Eu te ajudo."),
    Variant("ama_rit_1", AMANHA, "Ritmo", "Amanhã seu pico é às {pico}", "Planejando agora, a tarefa mais pesada cai nele."),
    Variant("ama_mem_1", AMANHA, "Memória", "Hoje você fez {feitas_hoje} de {total_hoje}", "Fecha o dia deixando amanhã encaminhado?"),
    # 4.4 Trinta minutos antes
    Variant("tar_1", TAREFA, "Utilitário", "{tarefa}", "Começa em {min} minutos, às {hora}."),
    Variant("tar_pico", TAREFA, "Utilitário", "{tarefa}", "Começa às {hora}, bem no seu pico de energia."),
    # 4.5 Planejamento da semana
    Variant("sem_par_1", SEMANA, "Parceiro", "Semana nova, {nome}", "Vamos planejar juntos? Eu encaixo tudo no seu ritmo."),
    Variant("sem_dad_1", SEMANA, "Dados", "Semana passada: {media_semana}%", "Bora planejar a próxima no mesmo ritmo?"),
    Variant("sem_cur_1", SEMANA, "Curioso", "Como vai ser essa semana?", "Dez minutos agora e eu cuido do resto."),
)

BY_ID = {v.id: v for v in CATALOG}

# ── Reservas (fora do documento) ─────────────────────────────────────────────
# Só para falha de leitura. Com os dados lidos, sempre há variação elegível
# (n = 0, n = 1 e n ≥ 2 têm cada um as suas). man_reserva sai quando as médias
# falharam (só Parceiro) e nenhuma Parceiro cabe; man_generico, quando nem as
# tarefas foram lidas. Gravadas com estes ids para a análise separá-las.
RESERVA_RESUMO = "man_reserva"          # texto de day_reminders.day_summary
RESERVA_GENERICA = "man_generico"       # o _DAILY_BODY antigo, sem dado nenhum

DAILY_FALLBACK_BODY = {
    "morning":      "Seu período de maior clareza está começando. Reserve alguns minutos para definir o que é essencial hoje — vai fazer diferença no aproveitamento do dia.",
    "intermediate": "É um bom momento para organizar suas prioridades. Definir suas tarefas agora vai te ajudar a manter o foco ao longo do dia.",
    "evening":      "Você ainda tem bastante energia pela frente. Planejar o dia agora garante que você vai aproveitar bem os próximos blocos.",
    "night":        "Antes de entrar em ritmo pleno, reserve alguns minutos para definir o que é essencial hoje.",
    "bimodal":      "Você tem dois picos de energia hoje. Planejar agora garante que você vai aproveitá-los ao máximo.",
}


# ── Condições (seção 2 e tabelas da seção 4) ────────────────────────────────

def _dados_ok(ctx: dict) -> bool:
    """Regra 2: média conhecida abaixo de 60% tira a família Dados inteira."""
    media = ctx.get("media_semana")
    return media is None or media >= MEDIA_MINIMA


def _ofensiva(ctx: dict) -> int:
    return int((ctx.get("streak") or {}).get("current") or 0)


_CONDITIONS = {
    "reg_ofe_1": lambda c: _ofensiva(c) >= 2,
    "reg_ofe_2": lambda c: _ofensiva(c) >= 2,
    # Regra 5: só quando o registro de HOJE leva exatamente ao marco. A ofensiva
    # atual conta até ontem (hoje ainda não foi registrado — senão este aviso
    # nem sairia), então o registro de hoje a leva a current + 1.
    "reg_marco": lambda c: c.get("streak") is not None and _ofensiva(c) + 1 in MARCOS,
    "reg_dad_cal": lambda c: c.get("faltam_calibrar") is not None
    and 1 <= c["faltam_calibrar"] <= 10 and _dados_ok(c),
    # "Seu primeiro registro" só é verdade para quem nunca registrou. False
    # explícito: sem a leitura (None), não dá para afirmar.
    "reg_pri": lambda c: c.get("tem_registro") is False,
    "reg_risco_1": lambda c: _ofensiva(c) >= 1,
    # "seus 1 dias continuam" não cabe no singular sem reescrever a frase.
    "reg_risco_2": lambda c: _ofensiva(c) >= 2,
    # n ≥ 2 pelo documento (o dia com um item só tem as *_uni). E só quando o
    # próximo item é mesmo o primeiro do dia: se o lembrete saiu depois de
    # algum já ter passado, "a primeira às 9h" apontaria a errada.
    "man_par_1": lambda c: c.get("n", 0) >= 2 and c.get("hora") is not None and c.get("proximo_e_primeiro"),
    "man_bri_1": lambda c: c.get("n", 0) >= 2 and c.get("hora") is not None and c.get("proximo_e_primeiro"),
    "man_rit_1": lambda c: c.get("n", 0) >= 2 and bool(c.get("pico")),
    "man_dad_1": lambda c: c.get("n", 0) >= 2 and c.get("media_semana") is not None
    and c["media_semana"] >= MEDIA_MINIMA,
    # Regra 3. O título diz "Sua melhor semana", verdade para qualquer uma
    # das 8 — não precisa ser a passada.
    "man_mem_1": lambda c: c.get("n", 0) >= 2 and c.get("melhor_semana") is not None
    and c.get("media_semana") is not None and c["melhor_semana"] > c["media_semana"],
    "man_par_uni": lambda c: c.get("n", 0) == 1 and bool(c.get("tarefa")),
    "man_bri_uni": lambda c: c.get("n", 0) == 1 and bool(c.get("tarefa")),
    # "Cabe direitinho nesse horário" (o pico): falso para uma tarefa marcada
    # fora dele. Sem horário, ela pode ir para o pico — aí é verdade.
    "man_rit_uni": lambda c: c.get("n", 0) == 1 and bool(c.get("tarefa")) and bool(c.get("pico"))
    and bool(c.get("unica_cabe_no_pico")),
    "man_vaz_1": lambda c: c.get("n", 0) == 0,
    "man_vaz_2": lambda c: c.get("n", 0) == 0,
    "ama_rit_1": lambda c: bool(c.get("pico")),
    "ama_mem_1": lambda c: (c.get("feitas_hoje") or 0) >= 1 and c.get("total_hoje") is not None,
    "tar_pico": lambda c: bool(c.get("em_pico")),
    "sem_dad_1": lambda c: c.get("media_semana") is not None and c["media_semana"] >= MEDIA_MINIMA,
}


def eligible(kind: str, ctx: dict) -> list[Variant]:
    """
    Variações do `kind` cuja condição é verdadeira. Com `so_parceiro` (alguma
    leitura de dado falhou), só a família Parceiro: genérico é melhor que um
    número errado.
    """
    out = []
    for v in CATALOG:
        if v.kind != kind:
            continue
        if ctx.get("so_parceiro") and v.family != PARCEIRO:
            continue
        cond = _CONDITIONS.get(v.id)
        if cond is not None and not cond(ctx):
            continue
        out.append(v)
    return out


# ── Redação ──────────────────────────────────────────────────────────────────

_VAR = re.compile(r"\{([a-z_]+)(\+1)?\}")

# Singular de contagem: (trecho do texto aprovado, variável, trecho com 1).
# É concordância, não reescrita — o sentido é o mesmo.
_SINGULAR = (
    ("{ofensiva} dias", "ofensiva", "1 dia"),
    ("Faltam {faltam_calibrar} registros", "faltam_calibrar", "Falta 1 registro"),
    ("{min} minutos", "min", "1 minuto"),
)


def _fill(text: str, v: Variant, ctx: dict) -> str:
    valores = {**ctx, "ofensiva": _ofensiva(ctx)}
    if v.kind == MANHA:
        # "Tarefas" vira "compromissos" quando há evento no dia (regra que já
        # existia no resumo), e o artigo acompanha.
        plural, singular = ("compromissos", "compromisso") if ctx.get("tem_evento") else ("tarefas", "tarefa")
        if ctx.get("n") == 1:
            text = text.replace("são {n} tarefas", f"é 1 {singular}")
        text = text.replace("{n} tarefas", "{n} " + plural)
        if ctx.get("tem_evento"):
            text = text.replace("A primeira", "O primeiro")
    for trecho, var, sing in _SINGULAR:
        if valores.get(var) == 1:
            text = text.replace(trecho, sing)

    def sub(m: re.Match) -> str:
        val = valores.get(m.group(1))
        if val is None:
            raise KeyError(m.group(1))
        return str(int(val) + 1) if m.group(2) else str(val)

    return _VAR.sub(sub, text)


def render(v: Variant, ctx: dict) -> tuple[str, str]:
    """(título, corpo) com as variáveis preenchidas. KeyError se faltar alguma."""
    return _fill(v.title, v, ctx), _fill(v.body, v, ctx)


# ── Sorteio ──────────────────────────────────────────────────────────────────

def choose(options: list[Variant], history: list[tuple[str, datetime]],
           now_utc: datetime, rng: random.Random | None = None) -> Variant | None:
    """
    Sorteio uniforme entre as opções que esta pessoa NÃO recebeu nos últimos
    7 dias (neste tipo de notificação). Se todas foram usadas, a menos recente.
    `history` = [(variant_id, enviada_em)] dos últimos 7 dias ou mais.
    """
    if not options:
        return None
    rng = rng or random
    limite = now_utc - timedelta(days=SEM_REPETIR_DIAS)
    ultimo: dict[str, datetime] = {}
    for vid, quando in history:
        if vid and (vid not in ultimo or quando > ultimo[vid]):
            ultimo[vid] = quando
    livres = [v for v in options if v.id not in ultimo or ultimo[v.id] < limite]
    if livres:
        return rng.choice(livres)
    return min(options, key=lambda v: ultimo[v.id])


def recently_used(options: list[Variant], history: list[tuple[str, datetime]],
                  now_utc: datetime) -> list[str]:
    """Ids das opções enviadas a esta pessoa nos últimos 7 dias (fora do sorteio)."""
    limite = now_utc - timedelta(days=SEM_REPETIR_DIAS)
    usados = {vid for vid, quando in history if quando >= limite}
    return [v.id for v in options if v.id in usados]


def pick_explained(kind: str, ctx: dict, history: list[tuple[str, datetime]],
                   now_utc: datetime, rng: random.Random | None = None) -> dict | None:
    """
    O sorteio com o porquê: a variação, o texto, as elegíveis, as excluídas
    pelos 7 dias e as fora pela condição (com o motivo). É o que o scheduler
    usa (via pick) e o que o script de simulação mostra — a mesma função, para
    a simulação não poder divergir do envio.

    Uma variação que não consegue ser redigida (variável faltando) sai e o
    sorteio se repete: melhor outra variação que um texto com buraco.
    """
    options = eligible(kind, ctx)
    ok_ids = {v.id for v in options}
    fora = [(v.id, why_not(v, ctx)) for v in CATALOG if v.kind == kind and v.id not in ok_ids]
    elegiveis = [v.id for v in options]
    excluidas = recently_used(options, history, now_utc)
    while options:
        v = choose(options, history, now_utc, rng)
        try:
            title, body = render(v, ctx)
        except KeyError as e:
            fora.append((v.id, f"variável {{{e.args[0]}}} sem valor"))
            options = [o for o in options if o.id != v.id]
            continue
        return {"variant": v, "title": title, "body": body, "elegiveis": elegiveis,
                "excluidas_7d": excluidas, "fora": fora}
    return None


def pick(kind: str, ctx: dict, history: list[tuple[str, datetime]],
         now_utc: datetime, rng: random.Random | None = None):
    """(variação, título, corpo) para este envio, ou None se nada for elegível."""
    r = pick_explained(kind, ctx, history, now_utc, rng)
    return (r["variant"], r["title"], r["body"]) if r else None


# ── Por que uma variação ficou fora (para a simulação) ───────────────────────

def _media_txt(c: dict) -> str:
    m = c.get("media_semana")
    if m is None:
        return "média sem 3 dias com tarefa na semana (regra 1)"
    return f"média {m}% (abaixo de {MEDIA_MINIMA}%, regra 2)" if m < MEDIA_MINIMA else f"média {m}%"


def _n_txt(c: dict) -> str:
    return f"n = {c.get('n', 0)}"


_WHY = {
    "reg_ofe_1": lambda c: f"ofensiva {_ofensiva(c)} (precisa de 2+)",
    "reg_ofe_2": lambda c: f"ofensiva {_ofensiva(c)} (precisa de 2+)",
    "reg_marco": lambda c: f"ofensiva {_ofensiva(c)} + 1 não é marco",
    "reg_dad_cal": lambda c: "calibração não lida" if c.get("faltam_calibrar") is None
    else (_media_txt(c) if not _dados_ok(c) else f"faltam {c['faltam_calibrar']} para calibrar (precisa de 1 a 10)"),
    "reg_pri": lambda c: "já tem registro" if c.get("tem_registro") else "registros não lidos",
    "reg_risco_1": lambda c: f"ofensiva {_ofensiva(c)}",
    "reg_risco_2": lambda c: f"ofensiva {_ofensiva(c)} (\"seus 1 dias\" não tem singular)",
    "man_par_1": lambda c: _n_txt(c) if c.get("n", 0) < 2 else "o próximo item não é o primeiro do dia",
    "man_bri_1": lambda c: _n_txt(c) if c.get("n", 0) < 2 else "o próximo item não é o primeiro do dia",
    "man_rit_1": _n_txt,
    "man_dad_1": lambda c: _n_txt(c) if c.get("n", 0) < 2 else _media_txt(c),
    "man_mem_1": lambda c: _n_txt(c) if c.get("n", 0) < 2 else (
        "sem semana completa com 3 dias nas últimas 8" if c.get("melhor_semana") is None
        else _media_txt(c) if c.get("media_semana") is None
        else f"melhor semana {c['melhor_semana']}% não passa a atual {c['media_semana']}% (regra 3)"),
    "man_par_uni": _n_txt,
    "man_bri_uni": _n_txt,
    "man_rit_uni": lambda c: _n_txt(c) if c.get("n", 0) != 1 else "a tarefa tem horário fora do pico",
    "man_vaz_1": _n_txt,
    "man_vaz_2": _n_txt,
    "ama_rit_1": lambda c: "sem pico",
    "ama_mem_1": lambda c: f"feitas hoje: {c.get('feitas_hoje') or 0}",
    "tar_pico": lambda c: "o horário não cai no pico",
    "sem_dad_1": _media_txt,
}


def why_not(v: Variant, ctx: dict) -> str:
    """Motivo, em uma linha, de a variação estar fora do sorteio. Pura."""
    if ctx.get("so_parceiro") and v.family != PARCEIRO:
        return "leitura de dados falhou: só Parceiro"
    f = _WHY.get(v.id)
    return f(ctx) if f else "condição não atendida"


# ── Variáveis derivadas (puras) ──────────────────────────────────────────────

def format_hour(hhmm: str) -> str:
    """'09:00' → '9h', '14:30' → '14h30' — o {hora} e o {pico} dos textos."""
    h, m = int(hhmm[:2]), int(hhmm[3:5])
    return f"{h}h" if m == 0 else f"{h}h{m:02d}"


def _peak_text(chronotype: str | None) -> str:
    # MESMA leitura do GET /dashboard (routers/dashboard.py: CHRONOTYPE_META
    # pelo cronotipo cru, "intermediate" se vazio). A notificação e a tela
    # nunca podem dizer horários de pico diferentes. O Dashboard NÃO usa a
    # curva calibrada para o pico — só para o percentual de energia —, então
    # aqui também não.
    return CHRONOTYPE_META.get(chronotype or "intermediate", CHRONOTYPE_META["intermediate"])["energy_peak"]


def _peak_hours(chronotype: str | None) -> list[int]:
    return [int(h) for h in re.findall(r"(\d{1,2})h", _peak_text(chronotype))]


def peak_start(chronotype: str | None) -> str | None:
    """'entre 7h e 11h' → '7h'. O {pico} dos textos."""
    horas = _peak_hours(chronotype)
    return f"{horas[0]}h" if horas else None


def in_peak(chronotype: str | None, hhmm: str) -> bool:
    """
    O horário cai em algum pico do texto do Dashboard? Pares (início, fim):
    'entre 9h–11h e 16h–18h' → [9,11) e [16,18); 'entre 20h e 01h' vira a noite.
    """
    horas = _peak_hours(chronotype)
    try:
        m = int(hhmm[:2]) * 60 + int(hhmm[3:5])
    except (ValueError, IndexError):
        return False
    for ini, fim in zip(horas[0::2], horas[1::2]):
        a, b = ini * 60, fim * 60
        if (a <= m < b) if a < b else (m >= a or m < b):
            return True
    return False


def summary_vars(items: list[dict], now_local: datetime, chronotype: str | None = None) -> dict:
    """
    {n}, {hora}, {tarefa} e afins do resumo da manhã, a partir dos itens de
    HOJE ainda não concluídos. {hora}/{tarefa} = próximo item com horário; com
    um item só, {tarefa} é ele, tenha horário ou não (as *_uni).
    """
    timed = sorted((i for i in items if i.get("start_time")), key=lambda i: str(i["start_time"])[:5])
    agora = now_local.strftime("%H:%M")
    proximos = [i for i in timed if str(i["start_time"])[:5] >= agora]
    out = {
        "n": len(items),
        "tem_evento": any(i.get("task_type") == "event" for i in items),
        "hora": None, "tarefa": None, "proximo_e_primeiro": False,
    }
    if proximos:
        nxt = proximos[0]
        out.update(
            hora=format_hour(str(nxt["start_time"])[:5]),
            tarefa=nxt["title"],
            proximo_e_primeiro=nxt is timed[0],
        )
    if len(items) == 1:
        unica = items[0]
        hora = str(unica.get("start_time") or "")[:5]
        out["tarefa"] = unica.get("title")
        out["unica_cabe_no_pico"] = not hora or in_peak(chronotype, hora)
    return out


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def week_averages(rows: list[dict], today: date) -> dict:
    """
    Médias de `completion_rate` por semana (segunda a domingo), contando só os
    dias com total > 0. Uma semana sem pelo menos 3 desses dias não tem média
    (regra 1).

    - atual: segunda desta semana até ONTEM. Hoje fica fora: o dia está em
      aberto, e de manhã ele puxaria a média para baixo sem motivo.
    - passada: a última semana completa.
    - melhor: a maior das últimas 8 semanas completas (regra 3).
    """
    taxa = {}
    for r in rows:
        if (r.get("total") or 0) > 0 and r.get("completion_rate") is not None:
            taxa[str(r["date"])[:10]] = float(r["completion_rate"])

    def media(ini: date, fim: date) -> int | None:
        vals = [taxa[str(ini + timedelta(days=i))] for i in range((fim - ini).days)
                if str(ini + timedelta(days=i)) in taxa]
        return round(sum(vals) / len(vals)) if len(vals) >= DIAS_MINIMOS else None

    seg = week_start(today)
    semanas = [media(seg - timedelta(days=7 * k), seg - timedelta(days=7 * (k - 1))) for k in range(1, 9)]
    validas = [s for s in semanas if s is not None]
    melhor = max(validas) if validas else None
    return {"atual": media(seg, today), "passada": semanas[0], "melhor": melhor}


def stats_window(today: date) -> tuple[date, date]:
    """Faixa de datas que week_averages precisa: 8 semanas completas + esta."""
    return week_start(today) - timedelta(days=56), today - timedelta(days=1)
