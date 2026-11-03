"""
Regras do onboarding novo (nov/2026): horários de sono, funil por tela e
distribuição de cronotipos.

O questionário novo pergunta HORÁRIOS (dormir/acordar em dia útil e em dia
livre) em vez das faixas da P5 e da P8. As faixas continuam alimentando a
pontuação — derivadas aqui, com os mesmos limites das opções antigas —, e os
horários ainda dão o jet lag social, que a tela 14 mostra no meio do
questionário.

Backend calcula, frontend só mostra: as funções de horário são puras e
testadas em tests_onboarding.py.
"""

import time
from typing import Optional

from database import supabase

# ---------------------------------------------------------------------------
# Horários
# ---------------------------------------------------------------------------

_DIA = 24 * 60


def _minutos(hhmm: str) -> int:
    """'23:30' → 1410. O formato já foi validado pelo schema (HH:MM)."""
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def faixa_p5(dormir_dia_livre: str) -> str:
    """
    Horário de dormir num dia livre → alternativa da P5 ("a que horas gostaria
    de deitar?").

    Opções antigas: A 21h–22h · B 22h–23h · C 23h–00h30 · D depois da 1h.
    Entre 00h30 e 1h nenhuma opção cobria; fica em C, porque a D diz
    explicitamente "depois da 1h". Antes das 21h cai em A (a mais cedo).

    A conta usa o relógio "a partir do meio-dia": 01h vira 25h, para que
    dormir depois da meia-noite seja MAIS TARDE que dormir às 23h. Ninguém
    responde que dorme às 14h num dia livre; se responder, cai em A.
    """
    m = _minutos(dormir_dia_livre)
    if m < 12 * 60:
        m += _DIA
    if m < 22 * 60:
        return "A"
    if m < 23 * 60:
        return "B"
    if m < 25 * 60:
        return "C"
    return "D"


def faixa_p8(acordar_dia_livre: str) -> str:
    """
    Horário de acordar num dia livre → alternativa da P8 ("a que horas
    preferiria acordar?").

    Opções antigas: A antes de 6h30 · B 6h30–8h · C 8h–9h30 · D depois de 9h30.
    Acordar à tarde (12h em diante) também é D — é o mais tarde que a escala
    antiga conseguia dizer.
    """
    m = _minutos(acordar_dia_livre)
    if m < 6 * 60 + 30:
        return "A"
    if m < 8 * 60:
        return "B"
    if m < 9 * 60 + 30:
        return "C"
    return "D"


def meio_do_sono(dormir: str, acordar: str) -> int:
    """
    Minuto do dia (0–1439) no meio do sono. Dormir 23h e acordar 7h → 3h (180).
    Atravessar a meia-noite é o caso comum, por isso a duração é módulo 24h.
    """
    inicio = _minutos(dormir)
    duracao = (_minutos(acordar) - inicio) % _DIA
    return (inicio + duracao // 2) % _DIA


def jet_lag_social_min(
    dormir_util: str, acordar_util: str, dormir_livre: str, acordar_livre: str
) -> int:
    """
    Jet lag social (Wittmann/Roenneberg, 2006): distância, em minutos, entre o
    meio do sono no dia livre e no dia útil.

    A diferença é circular — meio do sono às 23h50 e às 00h10 estão a 20 min,
    não a 23h40 —, então pega o menor dos dois lados do relógio.
    """
    diff = abs(meio_do_sono(dormir_livre, acordar_livre) - meio_do_sono(dormir_util, acordar_util))
    return min(diff, _DIA - diff)


def completar_respostas(respostas: dict[str, str], horarios: Optional[dict]) -> dict[str, str]:
    """
    Preenche a P5 e a P8 a partir dos horários de dia livre quando elas não
    vieram. Resposta explícita nunca é sobrescrita: o APK antigo manda as
    faixas, e elas valem como o usuário escolheu.
    """
    if not horarios:
        return respostas
    completas = dict(respostas)
    completas.setdefault("P5", faixa_p5(horarios["freeday_sleep"]))
    completas.setdefault("P8", faixa_p8(horarios["freeday_wake"]))
    return completas


def jet_lag_dos_horarios(horarios: Optional[dict]) -> Optional[int]:
    if not horarios:
        return None
    return jet_lag_social_min(
        horarios["workday_sleep"], horarios["workday_wake"],
        horarios["freeday_sleep"], horarios["freeday_wake"],
    )


def campos_de_perfil(
    horarios: Optional[dict],
    schedule_type: Optional[str],
    work_start: Optional[str],
    work_end: Optional[str],
    onboarding: Optional[dict],
) -> dict:
    """
    Colunas de `profiles` (Migration 38) que o onboarding novo grava no
    cadastro. Só inclui o que veio: o APK antigo não manda nada disso, e um
    update com None apagaria dado de quem já tinha.

    Horário flexível limpa o expediente: quem trocou de fixo para flexível ao
    refazer o teste não pode continuar com o planejamento evitando um
    expediente que não existe mais.
    """
    campos: dict = {}
    if horarios:
        campos.update({
            "workday_sleep": horarios["workday_sleep"],
            "workday_wake": horarios["workday_wake"],
            "freeday_sleep": horarios["freeday_sleep"],
            "freeday_wake": horarios["freeday_wake"],
        })
    if schedule_type == "flexible":
        campos["work_start"] = None
        campos["work_end"] = None
    elif work_start and work_end:
        campos["work_start"] = work_start
        campos["work_end"] = work_end
    if onboarding:
        campos["onboarding_profile"] = onboarding
    return campos


# ---------------------------------------------------------------------------
# Funil (onboarding_events)
# ---------------------------------------------------------------------------

def registrar_eventos(
    anon_id: str, flow_version: str, platform: str, eventos: list[dict]
) -> None:
    """
    Grava um lote de eventos de tela. Sem user_id: o funil quase todo acontece
    antes da conta existir. A ligação com o usuário é feita no cadastro por
    `vincular_eventos`.
    """
    if not eventos:
        return
    linhas = [
        {
            "anon_id": anon_id,
            "flow_version": flow_version,
            "platform": platform,
            "step": e["step"],
            "event": e["event"],
            "option_id": e.get("option_id"),
        }
        for e in eventos
    ]
    supabase.table("onboarding_events").insert(linhas).execute()


def vincular_eventos(user_id: str, anon_id: str) -> None:
    """
    Liga ao usuário os eventos anteriores ao cadastro.

    Só toca linhas ainda sem dono: um anon_id já vinculado a outra conta nunca
    muda de mãos. Quem mandasse o anon_id de outra pessoa (um UUID aleatório,
    que só existe no navegador dela) levaria, no pior caso, eventos sem dado
    pessoal — tela, evento e id de opção.

    Eventos enviados DEPOIS do cadastro continuam com user_id NULL; a análise
    do funil agrupa por anon_id, então isso não perde nada.
    """
    (
        supabase.table("onboarding_events")
        .update({"user_id": user_id})
        .eq("anon_id", anon_id)
        .is_("user_id", "null")
        .execute()
    )


# ---------------------------------------------------------------------------
# Distribuição de cronotipos (prova social da tela 28)
# ---------------------------------------------------------------------------

# Abaixo disso a porcentagem não é mostrada: com poucas respostas ela oscila
# muito e, na fase de testes, reflete o time, não o público.
AMOSTRA_MINIMA = 200
_TTL_SEGUNDOS = 3600
_CRONOTIPOS = ["Matutino", "Vespertino", "Noturno", "Misto", "Bimodal"]

# Cache em memória: há um único worker em produção (ver AGENTS.md §3), e a
# rota é pública — sem cache, cada abertura da tela 28 custaria 5 queries.
_cache: dict = {"em": 0.0, "valor": None}


def distribuicao_cronotipos() -> dict:
    """
    Porcentagem de cada cronotipo entre todos os perfis.

    É a única leitura do onboarding que NÃO filtra por user_id, de propósito:
    devolve só agregados, nunca uma linha de usuário. O total absoluto também
    não sai daqui (é número de negócio, e a tela não precisa dele).
    """
    agora = time.monotonic()
    if _cache["valor"] is not None and agora - _cache["em"] < _TTL_SEGUNDOS:
        return _cache["valor"]

    contagens = {}
    for tipo in _CRONOTIPOS:
        res = (
            supabase.table("profiles")
            .select("id", count="exact", head=True)
            .eq("chronotype", tipo)
            .execute()
        )
        contagens[tipo] = res.count or 0

    total = sum(contagens.values())
    if total < AMOSTRA_MINIMA:
        valor = {"disponivel": False, "porcentagens": {}}
    else:
        valor = {
            "disponivel": True,
            "porcentagens": {t: round(100 * n / total) for t, n in contagens.items()},
        }

    _cache.update(em=agora, valor=valor)
    return valor
