"""
Scheduler de lembretes de planejamento.

Roda a cada 5 minutos via APScheduler e cria notificações de planejamento
para usuários cujo horário configurado foi atingido. Também dispara, no
fuso local de cada usuário: o snapshot/carry-forward de fim de dia (00:10),
os relatórios narrativos semanal (todo domingo 20h) e mensal (todo último
dia do mês 20h), e o catch-up diário desses relatórios (09h) — ver
report_service.

Fluxo:
  1. Busca todos os usuários com cronótipo definido (onboarding completo)
  2. Para cada um, roda o trabalho do dia (snapshot, relatórios, análise) e as
     notificações de planejamento
  3. As notificações (o que sai, quando e com que texto) são decididas em
     services/notification_planner — o mesmo código que o script de simulação
     (backend/scripts/simular_notificacoes.py) chama
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# notification_service não é usado aqui desde o notification_planner, mas o
# tests_activity troca funções dele por ps.notification_service.
from services import notification_service  # noqa: F401
from services import daily_stats_service
from services import saved_time_service
from services import routine_analysis_service
from services import report_service
from services import activity_service
from services import notification_planner

# Horário local (após a meia-noite) em que congelamos o snapshot do dia que
# acabou e carregamos as pendentes. Uma folga de alguns minutos evita a borda
# exata da virada.
_SNAPSHOT_FIRE_TIME = "00:10"

# Horário local de disparo dos relatórios narrativos (semanal e mensal).
# O período gerado inclui o próprio dia do disparo (ver report_service).
_REPORT_FIRE_TIME = "20:00"

# Horário local da verificação diária de relatórios faltando (catch-up).
# Longe das 20h de propósito: se o disparo pontual falhou por indisponibilidade,
# tentar de novo no mesmo minuto teria a mesma chance de falhar.
_REPORT_CATCHUP_TIME = "09:00"

# weekday() de domingo (0 = segunda ... 6 = domingo).
_SUNDAY = 6


def _is_last_day_of_month(d) -> bool:
    return (d + timedelta(days=1)).day == 1


# Mantidos com estes nomes: os testes de paginação e o tests_activity os usam.
_fetch_all = notification_planner.fetch_all
_fetch_users = notification_planner.fetch_users


def run() -> None:
    """Job chamado pelo APScheduler a cada 5 minutos."""
    now_utc = datetime.now(timezone.utc)

    try:
        users = _fetch_users()
    except Exception as e:
        print(f"[planning_scheduler] erro ao buscar usuários: {e}", flush=True)
        return

    for user in users:
        try:
            _process_user(user, now_utc)
        except Exception as e:
            print(f"[planning_scheduler] erro user={user.get('id')}: {e}", flush=True)

    # Fora do laço por usuário: precisa de UMA consulta para todos (ver
    # notification_planner.task_reminders). Em try próprio: falhar aqui não
    # desfaz o que o laço acima já fez.
    try:
        _send_task_reminders(users, now_utc)
    except Exception as e:
        print(f"[planning_scheduler] task_reminder falhou: {type(e).__name__}: {e}", flush=True)


def _send_task_reminders(users: list[dict], now_utc: datetime) -> None:
    notification_planner.task_reminders(users, now_utc, notification_planner.DbOutbox())


def _process_user(user: dict, now_utc: datetime) -> None:
    user_id = user["id"]

    # timezone já vem no select de run() — evita uma query por usuário/minuto.
    tz_name   = notification_planner.user_tz(user)
    now_local = now_utc.astimezone(ZoneInfo(tz_name))
    current_weekday = now_local.weekday()

    def _in_window(fire: str, minutes: int = 15) -> bool:
        return notification_planner.in_window(now_local, fire, minutes)

    # Conta inativa (21+ dias sem usar o app): congela SÓ os três blocos que
    # chamam o Claude — relatórios, catch-up e análise de rotina. Reconcile,
    # close_day e lembretes seguem rodando: os dados da pessoa ficam certos
    # para quando ela voltar, e o push (grátis) é o que pode trazê-la de volta.
    # Derivado de last_seen_at a cada ciclo: quem volta religa sozinho.
    active = activity_service.is_active(user.get("last_seen_at"), now_utc)

    # Fim do dia local: congela o snapshot de conclusão do dia que acabou e
    # carrega as pendentes. Roda independente das preferências de notificação.
    if _in_window(_SNAPSHOT_FIRE_TIME):
        try:
            daily_stats_service.reconcile(user_id, tz_name, now_local.date())
        except Exception as e:
            print(f"[planning_scheduler] reconcile falhou user={user_id}: {e}", flush=True)

        # Horas poupadas: fecha o dia que acabou, usando o plano que o
        # reconcile ACABOU de congelar — a ordem importa, sem o snapshot não há
        # planned_day_end com que comparar. Em try/except próprio de propósito:
        # o fechamento é uma métrica, e falhar nele não pode impedir o
        # carry-forward das pendentes (que roda dentro do reconcile).
        try:
            saved_time_service.close_day(
                user_id, tz_name, now_local.date() - timedelta(days=1)
            )
        except Exception as e:
            print(f"[planning_scheduler] close_day falhou user={user_id}: {e}", flush=True)

    # Relatórios narrativos: todo domingo 20h local (semana que está
    # terminando hoje) e todo último dia do mês 20h local (mês que está
    # terminando hoje). O próprio dia do disparo entra no período.
    if active and _in_window(_REPORT_FIRE_TIME):
        if current_weekday == _SUNDAY:
            try:
                report_service.generate_weekly_report(user_id, tz_name)
                print(f"[planning_scheduler] weekly_report → user={user_id}", flush=True)
            except Exception as e:
                print(f"[planning_scheduler] weekly_report falhou user={user_id}: {e}", flush=True)

        if _is_last_day_of_month(now_local.date()):
            try:
                report_service.generate_monthly_report(user_id, tz_name)
                print(f"[planning_scheduler] monthly_report → user={user_id}", flush=True)
            except Exception as e:
                print(f"[planning_scheduler] monthly_report falhou user={user_id}: {e}", flush=True)

    # Recuperação: o disparo acima exige que o servidor esteja no ar no minuto
    # exato das 20h. Se estava fora (deploy, queda, ambiente de dev desligado),
    # aquele relatório nunca seria gerado. Uma vez por dia verificamos se o
    # período encerrado ficou sem relatório e geramos com atraso.
    if active and _in_window(_REPORT_CATCHUP_TIME):
        try:
            generated = report_service.catch_up(user_id, tz_name)
            if generated:
                print(
                    f"[planning_scheduler] catch_up → user={user_id} {generated}",
                    flush=True,
                )
        except Exception as e:
            print(f"[planning_scheduler] catch_up falhou user={user_id}: {e}", flush=True)

    # Análise completa de rotina agendada (Migration 32): analisa AMANHÃ no
    # horário escolhido pelo usuário e notifica com a proposta — NUNCA aplica.
    # Janela curta como a dos relatórios: chama o Claude (custo), e o índice
    # único de proposta pendente por dia segura a duplicata se a janela repetir.
    # try/except próprio: falhar aqui não pode derrubar o resto do ciclo.
    if active and notification_planner.bool_pref(user.get("routine_analysis_enabled"), False) and user.get("routine_analysis_time"):
        if _in_window(str(user["routine_analysis_time"])[:5]):
            try:
                created = routine_analysis_service.run_scheduled(user_id, tz_name)
                if created:
                    print(f"[planning_scheduler] routine_analysis → user={user_id}", flush=True)
            except Exception as e:
                print(f"[planning_scheduler] routine_analysis falhou user={user_id}: {e}", flush=True)

    # Notificações de planejamento (fim do dia, resumo, semanal): decididas em
    # notification_planner, o mesmo código que o script de simulação chama.
    notification_planner.user_notifications(user, now_utc, notification_planner.DbOutbox())
