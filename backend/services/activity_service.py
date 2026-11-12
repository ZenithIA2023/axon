"""
Atividade do usuário: "esta pessoa ainda usa o app?" (Migration 40).

Existe para congelar o trabalho PAGO de contas inativas. O planning_scheduler
processa todo perfil com cronotipo a cada 5 minutos, e para quem sumiu há
meses seguia gerando relatório semanal, mensal, catch-up e análise de rotina —
os quatro chamam o Claude e custam por usuário por semana, para sempre.

Decisões do Bernardo (não reabrir):
  - corte de 21 dias sem usar o app;
  - congela SÓ o que chama o Claude. Push continua: é grátis e é a única
    ferramenta para trazer de volta quem sumiu. Reconcile/close_day também
    continuam: pular deixaria buraco nas estatísticas e tarefas presas.

POR QUE UMA COLUNA NOVA (profiles.last_seen_at) e não um sinal que já existe:
o sinal precisa significar "a PESSOA usou o app", e nada que o servidor faça
sozinho pode produzi-lo.
  - api_usage_events: o claude_service grava uma linha a cada chamada,
    inclusive as do próprio scheduler. Gerar relatório para um inativo o
    marcaria como ativo — para sempre.
  - tasks.updated_at: o carry-forward reescreve as pendentes todo dia, de
    todo mundo.
  - device_tokens.last_seen_at: só cobre quem instalou o app e aceitou push;
    o usuário da web ficaria congelado sem nunca ter sumido.
A coluna é escrita em auth_helper.get_current_user, o caminho que toda
requisição autenticada atravessa — e que só uma pessoa usando o app percorre.

Sem flag de "congelado" em lugar nenhum: o estado é DERIVADO de last_seen_at.
Quando a pessoa volta, a primeira requisição autenticada atualiza a coluna e o
próximo ciclo do scheduler já religa tudo, sem passo manual.
"""

import threading
from datetime import date, datetime, timedelta, timezone

from database import supabase

# Corte decidido pelo Bernardo. A partir de 21 dias completos sem nenhuma
# requisição autenticada, a conta conta como inativa.
INACTIVE_AFTER_DAYS = 21

# Último dia (UTC) em que last_seen_at foi gravado, por usuário. Em memória de
# propósito: decidir pelo banco trocaria uma escrita por dia por uma LEITURA em
# toda requisição. Produção roda um único worker (AGENTS.md §3), então o
# dicionário é a verdade do processo; um restart custa no máximo uma escrita
# extra por usuário. Cresce uma entrada por usuário ativo — irrelevante.
_last_written: dict[str, date] = {}

# As dependências síncronas do FastAPI rodam numa threadpool: a abertura do app
# dispara várias requisições ao mesmo tempo, e sem a trava todas veriam "ainda
# não gravei hoje" e escreveriam juntas.
_lock = threading.Lock()


def is_active(last_seen_at: object, now_utc: datetime) -> bool:
    """
    A pessoa usou o app nos últimos INACTIVE_AFTER_DAYS dias? Pura.

    Nulo ou ilegível conta como ATIVO. Erra para o lado de gastar, nunca para o
    de congelar quem está usando: é o caso de toda conta antes da Migration 40
    rodar e de qualquer conta nova antes da primeira requisição.
    """
    if not last_seen_at:
        return True
    try:
        visto = datetime.fromisoformat(str(last_seen_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if visto.tzinfo is None:
        # timestamptz sempre vem com fuso; sem ele, a leitura segura é UTC.
        visto = visto.replace(tzinfo=timezone.utc)
    return now_utc - visto < timedelta(days=INACTIVE_AFTER_DAYS)


def _claim_today(user_id: str, today: date) -> bool:
    """
    True só na PRIMEIRA chamada do dia para este usuário — e já reserva o dia.

    Reserva ANTES de escrever: se a escrita falhar, não tentamos de novo no
    mesmo dia. Repetir a cada requisição com o banco fora do ar só somaria
    carga; amanhã há outra chance, e 21 dias de folga cobrem qualquer queda.
    """
    with _lock:
        if _last_written.get(user_id) == today:
            return False
        _last_written[user_id] = today
        return True


def mark_seen(user_id: str, now_utc: datetime | None = None) -> None:
    """
    Registra que o usuário usou o app hoje: no máximo UMA escrita por dia.

    Chamado de dentro da autenticação, então NUNCA lança: qualquer falha é
    engolida aqui. Perder um registro de atividade custa no pior caso um
    relatório a menos; derrubar o login de todo mundo seria muito pior.
    """
    try:
        now_utc = now_utc or datetime.now(timezone.utc)
        if not _claim_today(user_id, now_utc.date()):
            return
        supabase.table("profiles").update(
            {"last_seen_at": now_utc.isoformat()}
        ).eq("id", user_id).execute()
    except Exception as e:
        # Só o tipo do erro: nada de dado pessoal no log.
        print(f"[activity] last_seen_at não gravado: {type(e).__name__}", flush=True)
