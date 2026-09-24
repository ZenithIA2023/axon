"""
Sincronização AxonWeb → Google Agenda (Fase 1, sentido único).

Sempre que uma tarefa/evento/rotina é criada, editada ou deletada, espelha a
mudança no Google Calendar do usuário (se ele tiver o Google conectado).

A sincronização roda em uma THREAD separada (best-effort): nunca bloqueia o
CRUD nem o streaming do chat, e nunca propaga exceção. O id do evento criado
é gravado de volta em tasks.google_event_id para permitir update/delete depois.
"""

import threading
from datetime import datetime, timedelta

from database import supabase
from services import google_service, user_tz

_RRULE = {
    "daily": "RRULE:FREQ=DAILY",
    "weekly": "RRULE:FREQ=WEEKLY",
    "monthly": "RRULE:FREQ=MONTHLY",
}


def _hhmm(value: str) -> str:
    """Normaliza 'HH:MM:SS' ou 'HH:MM' para 'HH:MM'."""
    return value[:5]


def _task_to_event(task: dict, tz_name: str) -> dict | None:
    """
    Converte uma tarefa no corpo de evento do Google Calendar.
    Retorna None se a tarefa não tem data (não dá para agendar).
    """
    date = task.get("scheduled_date")
    if not date:
        return None
    date = str(date)[:10]

    description = task.get("description") or ""
    if description:
        description += "\n\n"
    description += "Sincronizado pelo Axon."

    event: dict = {
        "summary": task.get("title", "Tarefa"),
        "description": description,
    }
    if task.get("location"):
        event["location"] = task["location"]

    start_time = task.get("start_time")
    end_time = task.get("end_time")

    if start_time:
        start_dt = f"{date}T{_hhmm(start_time)}:00"
        if end_time:
            end_dt = f"{date}T{_hhmm(end_time)}:00"
        else:
            # Sem fim definido: duração padrão de 1h
            base = datetime.fromisoformat(start_dt)
            end_dt = (base + timedelta(hours=1)).isoformat()
        event["start"] = {"dateTime": start_dt, "timeZone": tz_name}
        event["end"] = {"dateTime": end_dt, "timeZone": tz_name}
    else:
        # Sem horário: evento de dia inteiro
        event["start"] = {"date": date}
        event["end"] = {"date": date}

    # Rotina → evento recorrente
    if task.get("task_type") == "routine" and task.get("recurrence") in _RRULE:
        event["recurrence"] = [_RRULE[task["recurrence"]]]

    return event


def _get_sync_profile(user_id: str) -> tuple[str | None, str]:
    """Retorna (refresh_token, timezone) do perfil."""
    res = (
        supabase.table("profiles")
        .select("google_refresh_token, timezone")
        .eq("id", user_id)
        .single()
        .execute()
    )
    data = res.data or {}
    return data.get("google_refresh_token"), user_tz.normalize(data.get("timezone")) or user_tz.DEFAULT_TZ


def disconnect(user_id: str) -> None:
    """
    Desconecta o Google Agenda do usuário: revoga no Google e apaga o token.

    Os eventos que o Axon já criou PERMANECEM na agenda — são compromissos reais
    do usuário, e apagar dezenas deles como efeito colateral de "desconectar"
    seria destrutivo. Por isso `tasks.google_event_id` também fica: sem refresh
    token o `_sync` retorna cedo e não chama o Google, e se o usuário reconectar
    a MESMA conta os ids continuam válidos.

    Limitação conhecida: reconectar uma conta Google DIFERENTE deixa os
    `google_event_id` antigos apontando para eventos que não existem nela. As
    atualizações dessas tarefas falham em silêncio (o `_sync` engole exceções
    de propósito). Não tratado por enquanto.

    Idempotente: sem token, só grava o estado final.
    """
    res = (
        supabase.table("profiles")
        .select("google_refresh_token")
        .eq("id", user_id)
        .single()
        .execute()
    )
    refresh_token = (res.data or {}).get("google_refresh_token")

    if refresh_token:
        try:
            google_service.revoke_token(refresh_token)
        except Exception:
            # O usuário pediu para desconectar; deixar o token gravado porque o
            # Google não respondeu seria o pior dos dois mundos (continuaríamos
            # sincronizando contra a vontade dele). Apagar daqui é o que importa.
            pass

    # "independent", não NULL: NULL é "ainda não escolheu" e faria a pergunta
    # do Planning reaparecer. Quem desconecta escolheu não usar o Google.
    supabase.table("profiles").update(
        {"google_refresh_token": None, "calendar_setup_choice": "independent"}
    ).eq("id", user_id).execute()


def _sync(user_id: str, task: dict, action: str) -> None:
    """Executado dentro da thread. Best-effort, engole erros."""
    try:
        refresh_token, tz_name = _get_sync_profile(user_id)
        if not refresh_token:
            return  # usuário sem Google conectado

        event_id = task.get("google_event_id")

        if action == "delete":
            if event_id:
                access = google_service.refresh_access_token(refresh_token)
                google_service.delete_calendar_event(access, event_id)
            return

        body = _task_to_event(task, tz_name)
        if body is None:
            return  # tarefa sem data — nada a sincronizar

        access = google_service.refresh_access_token(refresh_token)

        if action == "update" and event_id:
            google_service.update_calendar_event(access, event_id, body)
        else:
            # create, ou update de tarefa que ainda não tinha evento
            new_id = google_service.create_calendar_event(access, body)
            supabase.table("tasks").update({"google_event_id": new_id}).eq(
                "id", task["id"]
            ).eq("user_id", user_id).execute()
    except Exception:
        pass  # sincronização é secundária — nunca quebra o fluxo principal


def sync_task_async(user_id: str, task: dict, action: str) -> None:
    """Dispara a sincronização em background (não bloqueia o chamador)."""
    threading.Thread(target=_sync, args=(user_id, task, action), daemon=True).start()
