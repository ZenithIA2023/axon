"""
Simula — e, se pedido, testa de verdade — as notificações de planejamento de
UM usuário, com os dados reais dele.

Rodado pelo Bernardo, no terminal dele, com o backend/.env. Instruções de uso
no fim deste arquivo.

DOIS MODOS

1. Simulação (padrão). Percorre o dia local de 5 em 5 minutos chamando o MESMO
   código de decisão do scheduler (services/notification_planner) e imprime a
   linha do tempo: o que sai, quando, com que texto e para onde o toque leva —
   e o que não sai, e por quê. Não escreve nada no banco: o cliente do Supabase
   é trocado por uma guarda que recusa insert/update/upsert/delete e qualquer
   consulta que não esteja filtrada por este usuário. O "já enviado" de cada
   ciclo vive em memória (SimOutbox).

2. Teste real (--enviar-teste <tipo>). Sorteia UMA variação com os dados reais,
   mostra o texto e os tokens de push, pede confirmação digitada ("enviar"),
   grava e dispara o push pelo caminho real (create_notification), espera o
   push sair e APAGA a linha criada — dado de teste numa conta real não fica
   para trás, e uma linha esquecida atrapalharia o sorteio de 7 dias.

O que este script nunca faz, em nenhum modo: importar o main, iniciar o
APScheduler, ler ou escrever dados de outra pessoa, ou percorrer vários
usuários. tests_simular_notificacoes.py prova cada um.

Os dados ficam parados durante a simulação: ela mostra o que sairia com as
tarefas e os registros como estão AGORA. Concluir uma tarefa às 15h, no mundo
real, mudaria o que sai depois disso.
"""

import argparse
import math
import random
import sys
import threading
import time as time_mod
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND = Path(__file__).resolve().parent.parent

TIPOS_TESTE = {
    "resumo": "planning_daily",
    "trinta_min": "task_reminder",
    "registro": "day_review_reminder",
    "amanha": "plan_tomorrow_reminder",
    "semanal": "planning_weekly",
}

ROTULO = {
    "planning_daily": "Resumo da manhã",
    "planning_weekly": "Planejamento da semana",
    "task_reminder": "30 min antes",
    "day_review_reminder": "Registro do dia",
    "plan_tomorrow_reminder": "Organizar o amanhã",
}


# ── Guarda do banco ──────────────────────────────────────────────────────────

class Proibido(RuntimeError):
    """O script tentou algo que a guarda não deixa (escrita, outro usuário)."""


# Todo bloqueio fica registrado, além de lançar: o código de decisão engole
# exceções por usuário (de propósito, em produção), e um bloqueio poderia
# passar em silêncio. O script avisa no fim; os testes exigem a lista vazia.
VIOLACOES: list[str] = []


def _proibir(msg: str):
    VIOLACOES.append(msg)
    raise Proibido(msg)


class _Consulta:
    """
    Envolve um builder do postgrest. Toda consulta precisa de um filtro por
    ESTE usuário (user_id, ou id em profiles) antes do execute; escrita só com
    a guarda aberta para escrita, e só em notifications.
    """

    def __init__(self, guarda: "Guarda", tabela: str, interno):
        self._g, self._t, self._q = guarda, tabela, interno
        self._escopo = False

    # Escrita ----------------------------------------------------------------
    def insert(self, payload, *a, **k):
        self._g.checar_escrita(self._t, "insert")
        linhas = payload if isinstance(payload, list) else [payload]
        if any(str(linha.get("user_id")) != self._g.user_id for linha in linhas):
            _proibir(f"insert em {self._t} para outro usuário")
        self._escopo = True
        self._q = self._q.insert(payload, *a, **k)
        return self

    def upsert(self, *a, **k):
        _proibir(f"upsert em {self._t}: o script nunca usa")

    def update(self, *a, **k):
        self._g.checar_escrita(self._t, "update")
        self._q = self._q.update(*a, **k)
        return self

    def delete(self, *a, **k):
        self._g.checar_escrita(self._t, "delete")
        self._q = self._q.delete(*a, **k)
        return self

    # Filtros que definem o escopo -------------------------------------------
    def _escopar(self, coluna: str, valores) -> None:
        chave = "id" if self._t == "profiles" else "user_id"
        if coluna != chave:
            return
        if {str(v) for v in valores} != {self._g.user_id}:
            _proibir(f"{self._t}: filtro por outro usuário")
        self._escopo = True

    def eq(self, coluna, valor):
        self._escopar(coluna, [valor])
        self._q = self._q.eq(coluna, valor)
        return self

    def in_(self, coluna, valores):
        self._escopar(coluna, valores)
        self._q = self._q.in_(coluna, valores)
        return self

    def execute(self):
        if not self._escopo:
            _proibir(f"consulta em {self._t} sem filtro pelo usuário do --user-id")
        return self._q.execute()

    # O resto (select, gte, order, range, not_…) passa direto -----------------
    def __getattr__(self, nome):
        attr = getattr(self._q, nome)
        if callable(attr):
            def chamada(*a, **k):
                r = attr(*a, **k)
                if hasattr(r, "execute"):
                    self._q = r
                    return self
                return r
            return chamada
        if hasattr(attr, "execute"):  # propriedades como .not_
            self._q = attr
            return self
        return attr


class Guarda:
    """Cliente do Supabase restrito a um usuário; sem escrita, a menos que aberta."""

    def __init__(self, interno, user_id: str, escrita: bool = False):
        self._interno = interno
        self.user_id = str(user_id)
        self.escrita = escrita

    def table(self, nome: str) -> _Consulta:
        return _Consulta(self, nome, self._interno.table(nome))

    def checar_escrita(self, tabela: str, op: str) -> None:
        if not self.escrita:
            _proibir(f"{op} em {tabela}: a simulação não escreve no banco")
        if tabela != "notifications":
            _proibir(f"{op} em {tabela}: o teste real só cria e apaga a própria notificação")

    def __getattr__(self, nome):
        _proibir(f"supabase.{nome}: o script só usa .table()")


@contextmanager
def banco_restrito(user_id: str, escrita: bool = False):
    """
    Troca o cliente do Supabase de TODOS os módulos já carregados (database e
    services.*) pela guarda, e devolve o original na saída. Quem importa
    `from database import supabase` dentro de uma função (streak_service) pega
    database.supabase — também trocado. Módulos importados durante o bloco
    também são devolvidos na saída.
    """
    import database

    atual = database.supabase
    real = atual._interno if isinstance(atual, Guarda) else atual
    guarda = Guarda(real, user_id, escrita)

    def trocar(de, para):
        for nome, mod in list(sys.modules.items()):
            if mod is not None and (nome == "database" or nome.startswith("services.")) \
                    and getattr(mod, "supabase", None) is de:
                mod.supabase = para

    trocar(real, guarda)
    try:
        yield guarda
    finally:
        trocar(guarda, real)


# ── Caixa de saída da simulação ──────────────────────────────────────────────

def _ts(row) -> datetime | None:
    from services import day_reminders
    return day_reminders.parse_ts(row.get("created_at"))


class SimOutbox:
    """
    A caixa de saída do notification_planner em memória. O "já enviado" começa
    com as notificações REAIS anteriores ao período simulado (para o sorteio de
    7 dias valer) e recebe cada envio simulado. Nada é gravado.
    """

    wants_notes = True

    def __init__(self, linhas_reais: list[dict], rng: random.Random):
        self.rows = list(linhas_reais)
        self.rng = rng
        self.timeline: list[dict] = []
        self._decididos: dict[tuple[str, str], str] = {}
        self._notas: set[tuple] = set()

    def decided(self, user_id, notif_type, today):
        return self._decididos.get((user_id, notif_type)) == today

    def decide(self, user_id, notif_type, today):
        self._decididos[(user_id, notif_type)] = today

    def _do_tipo_desde(self, notif_type: str, desde: datetime) -> list[datetime]:
        return [t for r in self.rows if r.get("type") == notif_type
                for t in [_ts(r)] if t and t >= desde]

    @staticmethod
    def _meia_noite(tz_name: str, now_utc: datetime, dias_atras: int = 0) -> datetime:
        local = now_utc.astimezone(ZoneInfo(tz_name))
        meia_noite = local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dias_atras)
        return meia_noite.astimezone(timezone.utc)

    # Mesma semântica de day_reminders.latest_sent_today e de
    # notification_service.has_planning_reminder_today/_this_week, sobre a
    # memória em vez do banco.
    def latest_sent_today(self, user_id, notif_type, tz_name, now_utc):
        ts = self._do_tipo_desde(notif_type, self._meia_noite(tz_name, now_utc))
        return max(ts) if ts else None

    def planning_sent_today(self, user_id, tz_name, now_utc):
        return bool(self._do_tipo_desde("planning_daily", self._meia_noite(tz_name, now_utc)))

    def planning_sent_this_week(self, user_id, tz_name, now_utc):
        dia_semana = now_utc.astimezone(ZoneInfo(tz_name)).weekday()
        return bool(self._do_tipo_desde("planning_weekly", self._meia_noite(tz_name, now_utc, dia_semana)))

    def history(self, user_id, notif_type, now_utc):
        desde = now_utc - timedelta(days=7)
        return [((r.get("action") or {}).get("variant_id"), t) for r in self.rows
                if r.get("type") == notif_type for t in [_ts(r)]
                if t and t >= desde and (r.get("action") or {}).get("variant_id")]

    def task_reminder_state(self, user_ids, now_utc):
        from services import notification_planner as npl
        desde = now_utc - timedelta(days=7)
        return npl.task_state_from_rows([r for r in self.rows if r.get("type") == "task_reminder"
                                         and (_ts(r) or desde) >= desde])

    def emit(self, user_id, notif_type, choice, now_utc):
        self.rows.append({"user_id": user_id, "type": notif_type, "action": choice["action"],
                          "created_at": now_utc.isoformat()})
        self.timeline.append({"quando": now_utc, "tipo": notif_type, "sai": True, **choice})

    def note(self, user_id, notif_type, reason, now_utc):
        # Uma vez por dia e motivo: a mesma decisão se repete em todo ciclo
        # dentro da janela, e a linha do tempo viraria ruído.
        chave = (now_utc.date(), notif_type, reason)
        if chave in self._notas:
            return
        self._notas.add(chave)
        self.timeline.append({"quando": now_utc, "tipo": notif_type, "sai": False, "motivo": reason})


# ── Leituras do cabeçalho ────────────────────────────────────────────────────

def _usuario(user_id: str) -> dict:
    from services import notification_planner as npl
    users = npl.fetch_users(user_id)
    if not users:
        raise SystemExit("Perfil não encontrado, ou sem cronotipo (onboarding incompleto).")
    return users[0]


def _tokens(user_id: str) -> dict[str, int]:
    from database import supabase
    rows = supabase.table("device_tokens").select("platform").eq("user_id", user_id).execute().data or []
    out: dict[str, int] = {}
    for r in rows:
        out[r.get("platform") or "?"] = out.get(r.get("platform") or "?", 0) + 1
    return out


def _cabecalho(user: dict, tokens: dict[str, int], now_utc: datetime, saida) -> None:
    from services import activity_service, notification_planner as npl
    tz_name = npl.user_tz(user)
    saida(f"Usuário: {npl.first_name(user)} · fuso {tz_name} · cronotipo {user.get('chronotype')}")
    ativo = activity_service.is_active(user.get("last_seen_at"), now_utc)
    saida(f"Conta {'ativa' if ativo else 'INATIVA (21+ dias sem abrir o app: sem 30 min antes)'}")
    if not tokens:
        saida("Push: nenhum token — o celular não recebe nada (só a lista dentro do app)")
    for plat, n in sorted(tokens.items()):
        extra = " — o envio para iPhone ainda não funciona (item 37)" if plat == "ios" else ""
        saida(f"Push: {n} token(s) {plat}{extra}")
    if "ios" not in tokens:
        saida("Push: nenhum token ios — iPhone não recebe nada até o item 37")


def destino_toque(notif_type: str, action: dict) -> str:
    """Para onde o toque leva — espelho do routeForNotification do DeepLinkHandler.tsx."""
    if notif_type in ("planning_daily", "planning_weekly"):
        return "Planning"
    if notif_type in ("task_reminder", "plan_tomorrow_reminder"):
        return f"Planning em {action.get('date')}" if action.get("date") else "Planning"
    if notif_type == "day_review_reminder":
        return "Dashboard → registro de ONTEM" if action.get("registro") == "ontem" else "Dashboard → registro de hoje"
    return "Dashboard"


def _explicacao(choice: dict) -> list[str]:
    e = choice.get("explain") or {}
    if "reserva" in e:
        return [f"reserva fora do catálogo: {e['reserva']}"]
    linhas = [f"elegíveis: {', '.join(e.get('elegiveis') or []) or '—'}"]
    if e.get("excluidas_7d"):
        linhas.append(f"fora pelos 7 dias: {', '.join(e['excluidas_7d'])}")
    if e.get("fora"):
        linhas.append("fora do sorteio: " + "; ".join(f"{vid} ({m})" for vid, m in e["fora"]))
    return linhas


def imprimir_envio(choice: dict, notif_type: str, saida, prefixo: str = "") -> None:
    a = choice["action"]
    recuo = " " * len(prefixo)   # o horário só na primeira linha do envio
    saida(f"{prefixo}{ROTULO.get(notif_type, notif_type)} · {a.get('variant_id')} · {a.get('family')}")
    saida(f"{recuo}  “{choice['title']}” — {choice['body']}")
    saida(f"{recuo}  toque → {destino_toque(notif_type, a)}")
    for linha in _explicacao(choice):
        saida(f"{recuo}  {linha}")


# ── Modo 1: simulação ────────────────────────────────────────────────────────

def simular(user_id: str, dia: date | None = None, dias: int = 1, seed: int | None = None,
            saida=print) -> SimOutbox:
    """
    Simula `dias` dias locais a partir de `dia` (padrão: hoje no fuso da
    pessoa), ciclo a ciclo de 5 minutos. Devolve a caixa de saída com a linha
    do tempo (os testes a comparam com o run() real).
    """
    from services import notification_planner as npl

    with banco_restrito(user_id, escrita=False):
        user = _usuario(user_id)
        tz = ZoneInfo(npl.user_tz(user))
        dia = dia or datetime.now(tz).date()
        inicio = datetime.combine(dia, time(0), tz)
        inicio_utc = inicio.astimezone(timezone.utc)

        # Notificações reais ANTES do período: o sorteio de 7 dias e o "30 min
        # já avisado" valem com elas. As do próprio período ficam de fora — a
        # simulação refaz o dia do zero.
        from database import supabase
        reais = npl.fetch_all(
            lambda: supabase.table("notifications")
            .select("id, type, action, created_at")
            .eq("user_id", user_id)
            .gte("created_at", (inicio_utc - timedelta(days=8)).isoformat())
            .order("id")
        )
        reais = [r for r in reais if (_ts(r) or inicio_utc) < inicio_utc]
        outbox = SimOutbox(reais, random.Random(seed))

        _cabecalho(user, _tokens(user_id), inicio_utc, saida)
        saida(f"Simulando {dias} dia(s) a partir de {dia}, de 5 em 5 minutos" +
              (f", semente {seed}" if seed is not None else "") + "\n")

        for d in range(dias):
            for k in range(24 * 12):
                agora_utc = (inicio + timedelta(days=d, minutes=5 * k)).astimezone(timezone.utc)
                # A mesma ordem e o mesmo isolamento de erro do run(): o que é
                # de uma pessoa, depois o "30 min antes".
                try:
                    npl.user_notifications(user, agora_utc, outbox)
                except Exception as e:
                    outbox.note(user_id, "erro", f"{type(e).__name__}: {e}", agora_utc)
                try:
                    npl.task_reminders([user], agora_utc, outbox, user_id=user_id)
                except Exception as e:
                    outbox.note(user_id, "erro", f"30 min antes: {type(e).__name__}: {e}", agora_utc)

    for ev in outbox.timeline:
        local = ev["quando"].astimezone(tz)
        hora = local.strftime("%H:%M") if dias == 1 else local.strftime("%d/%m %H:%M")
        if ev["sai"]:
            imprimir_envio(ev, ev["tipo"], saida, prefixo=f"{hora}  ")
            saida("")
        else:
            saida(f"{hora}  {ROTULO.get(ev['tipo'], ev['tipo'])}: não sai — {ev['motivo']}")
    if not outbox.timeline:
        saida("Nada sairia nem seria descartado nesse período.")
    if VIOLACOES:
        saida(f"\nATENÇÃO: a guarda bloqueou {len(VIOLACOES)} operação(ões); a simulação pode estar "
              f"incompleta: {VIOLACOES[:3]}")
    return outbox


# ── Modo 2: teste real ───────────────────────────────────────────────────────

def _proxima_tarefa(user: dict, now_utc: datetime) -> dict | None:
    """O item de "30 min antes" da próxima tarefa com horário (hoje ou amanhã)."""
    from services import day_reminders, notification_planner as npl
    uid = str(user["id"])
    tz = ZoneInfo(npl.user_tz(user))
    melhor = None
    for t in npl.fetch_reminder_tasks(now_utc, uid).get(uid, []):
        try:
            d = date.fromisoformat(str(t["scheduled_date"])[:10])
            h, m = int(str(t["start_time"])[:2]), int(str(t["start_time"])[3:5])
        except (ValueError, IndexError, TypeError):
            continue
        inicio = datetime(d.year, d.month, d.day, h, m, tzinfo=tz)
        seg = (inicio - now_utc).total_seconds()
        if seg >= 0 and (melhor is None or seg < melhor[0]):
            melhor = (seg, {"task": t, "minutes": math.ceil(seg / 60),
                            "key": day_reminders.reminder_key(t["id"], t["scheduled_date"], t["start_time"])})
    return melhor[1] if melhor else None


def preparar_teste(user: dict, tipo: str, now_utc: datetime, rng: random.Random) -> dict:
    """A escolha real (variação + texto + action) para o tipo pedido. Só lê."""
    from services import notification_planner as npl
    uid = str(user["id"])
    now_local = now_utc.astimezone(ZoneInfo(npl.user_tz(user)))
    outbox = npl.DbOutbox()
    outbox.rng = rng
    notif_type = TIPOS_TESTE[tipo]
    if tipo == "resumo":
        return npl.morning_choice(user, uid, now_local, now_utc, outbox)
    if tipo == "trinta_min":
        item = _proxima_tarefa(user, now_utc)
        if item is None:
            raise SystemExit("Nenhuma tarefa com horário pendente hoje ou amanhã. Crie uma no app e rode de novo.")
        _, history = outbox.task_reminder_state([uid], now_utc)
        return npl.task_choice(user, item, history.get(uid, []), now_utc, rng)
    attempts = {
        "registro": npl.review_attempts,
        "amanha": npl.tomorrow_attempts,
        "semanal": npl.weekly_attempts,
    }[tipo](user, uid, now_local)
    choice = npl.resolve(uid, notif_type, attempts, now_utc, outbox)
    if choice is None:
        raise SystemExit("Nenhuma variação elegível com os dados atuais.")
    return choice


def enviar_teste(user_id: str, tipo: str, seed: int | None = None, entrada=input,
                 espera: float = 8.0, saida=print) -> dict:
    """
    Envia UMA notificação real para este usuário e apaga a linha no fim.
    Devolve um resumo do que aconteceu (os testes o usam).
    """
    from services import notification_service, push_service

    now_utc = datetime.now(timezone.utc)
    with banco_restrito(user_id, escrita=False):
        user = _usuario(user_id)
        tokens = _tokens(user_id)
        choice = preparar_teste(user, tipo, now_utc, random.Random(seed))
    notif_type = TIPOS_TESTE[tipo]

    _cabecalho(user, tokens, now_utc, saida)
    saida("")
    imprimir_envio(choice, notif_type, saida)
    saida("")

    if not push_service.is_configured():
        saida("Sem credencial do Firebase no .env (FIREBASE_CREDENTIALS_JSON/PATH): nada foi enviado.")
        return {"enviado": False, "motivo": "sem firebase"}
    if not tokens:
        saida("Aviso: sem token de push. A notificação seria gravada, mas não chegaria ao celular.")

    if entrada('Digite "enviar" para gravar e disparar o push (qualquer outra coisa cancela): ').strip() != "enviar":
        saida("Cancelado: nada foi gravado nem enviado.")
        return {"enviado": False, "motivo": "sem confirmação"}

    with banco_restrito(user_id, escrita=True) as banco:
        # "teste" no action: se a exclusão abaixo falhar, a linha é
        # reconhecível na consulta de comparação e no SQL Editor.
        criada = notification_service.create_notification(
            user_id=user_id, notif_type=notif_type, title=choice["title"], body=choice["body"],
            action={**choice["action"], "teste": True},
        )
        notif_id = criada.get("id")
        saida(f"Gravada e enviada (id {notif_id}). Esperando {espera:.0f}s para o push sair…")

        # O push roda em thread (push_service.send_to_user): espera ela terminar
        # antes de apagar, para o celular receber o push de uma linha que ainda
        # existe quando o app for abrir.
        fim = time_mod.monotonic() + espera
        time_mod.sleep(max(0.0, espera / 2))
        for th in threading.enumerate():
            if th is not threading.current_thread() and th.daemon:
                th.join(timeout=max(0.0, fim - time_mod.monotonic()))
        time_mod.sleep(max(0.0, fim - time_mod.monotonic()))

        apagada = False
        if notif_id:
            banco.table("notifications").delete().eq("id", notif_id).eq("user_id", user_id).execute()
            resta = banco.table("notifications").select("id").eq("id", notif_id).eq("user_id", user_id).execute()
            apagada = not (resta.data or [])
        saida("Linha de teste apagada (conferido no banco)." if apagada
              else f"ATENÇÃO: a linha {notif_id} não foi apagada. Apague à mão: "
                   f"delete from public.notifications where id = '{notif_id}';")
    return {"enviado": True, "id": notif_id, "apagada": apagada}


# ── Linha de comando ─────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(
        description="Simula (ou testa de verdade) as notificações de UM usuário.",
        epilog="Instruções completas no fim deste arquivo.",
    )
    p.add_argument("--user-id", required=True)
    p.add_argument("--data", help="primeiro dia simulado, AAAA-MM-DD (padrão: hoje no fuso da pessoa)")
    p.add_argument("--dias", type=int, default=1)
    p.add_argument("--seed", type=int, help="semente do sorteio, para repetir o resultado")
    p.add_argument("--enviar-teste", choices=sorted(TIPOS_TESTE))
    args = p.parse_args(argv)

    # O .env só é lido aqui (não no import): os testes importam este arquivo
    # com um banco falso.
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
    sys.path.insert(0, str(BACKEND))

    if args.enviar_teste:
        enviar_teste(args.user_id, args.enviar_teste, args.seed)
    else:
        simular(args.user_id, date.fromisoformat(args.data) if args.data else None,
                max(1, args.dias), args.seed)


if __name__ == "__main__":
    main()


# ═════════════════════════════════════════════════════════════════════════════
# INSTRUÇÕES PARA O BERNARDO
# ═════════════════════════════════════════════════════════════════════════════
#
# 1) Achar o seu user-id. No SQL Editor do Supabase, troque o e-mail entre
#    aspas pelo seu e rode:
#
#      select p.id, split_part(p.name, ' ', 1) as primeiro_nome
#      from auth.users u
#      join public.profiles p on p.id = u.id
#      where lower(u.email) = lower('SEU_EMAIL_AQUI');
#
# 2) Simulação (não escreve nada; pode rodar quantas vezes quiser):
#
#      cd backend && python3 scripts/simular_notificacoes.py --user-id <uuid>
#      cd backend && python3 scripts/simular_notificacoes.py --user-id <uuid> --data 2026-11-16 --dias 3 --seed 7
#
# 3) Teste real (envia UMA notificação para você e apaga a linha depois):
#
#      cd backend && python3 scripts/simular_notificacoes.py --user-id <uuid> --enviar-teste resumo
#
#    Tipos: resumo, trinta_min, registro, amanha, semanal. Ele mostra o texto e
#    pede que você digite "enviar". Rode com o celular ANDROID desbloqueado por
#    perto: o push chega em poucos segundos. No iPhone, nada chega até o item
#    37 (o token de push dele ainda não é válido) — o script mostra isso no
#    cabeçalho. Tocar no push depois que a linha foi apagada abre a tela certa,
#    mas o registro do toque não acha a notificação (esperado: ela era teste).
