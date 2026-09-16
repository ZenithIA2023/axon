"""
Tags de tarefas: vocabulário por usuário + vínculo N:N com as tarefas.

Por que tabela e não texto livre (`tasks.group_name`, que existe e é coluna
morta): agrupar exige vocabulário CONTROLADO. Em texto livre "Estudos",
"estudos" e "Estudo" seriam três categorias, e a análise de rotina não teria
como juntar "Estudar alemão" com "Revisar gramática". O slug normalizado é quem
garante a unicidade; o label preserva como o usuário escreveu.

O vínculo é N:N porque uma tarefa pode pertencer a mais de uma categoria — um
curso profissional é "estudo" e "trabalho" ao mesmo tempo.
"""

import re
import unicodedata

from database import supabase

# Lista semeada no primeiro acesso. Curta de propósito: é ponto de partida para
# o usuário editar, não uma taxonomia completa. Semear demais faz o seletor
# nascer poluído e ninguém apaga.
DEFAULT_TAGS: tuple[str, ...] = (
    "Trabalho",
    "Estudos",
    "Saúde",
    "Pessoal",
    "Casa",
    "Financeiro",
)


def slugify(label: str) -> str:
    """
    'Curso de Alemão' → 'curso-de-alemao'.

    Remove acento e caixa para que o índice único de (user_id, slug) pegue
    "Estudos" e "estudos" como a mesma tag — é esse o ponto do slug.
    """
    text = unicodedata.normalize("NFKD", str(label or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _serialize(row: dict) -> dict:
    return {
        "id": str(row.get("id")),
        "label": row.get("label"),
        "slug": row.get("slug"),
        "color": row.get("color"),
        "is_default": bool(row.get("is_default")),
    }


# ── Vocabulário ─────────────────────────────────────────────────────────────

def ensure_defaults(user_id: str) -> None:
    """
    Semeia DEFAULT_TAGS se o usuário não tem nenhuma tag.

    Roda na primeira listagem, e não no cadastro, para que usuários JÁ
    EXISTENTES também recebam a lista — eles nunca passariam por um gancho de
    cadastro. É seguro repetir: só semeia quando a contagem é zero, e o índice
    único protege contra a corrida de duas chamadas simultâneas.
    """
    try:
        existing = (
            supabase.table("task_tags")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return
        supabase.table("task_tags").insert(
            [
                {
                    "user_id": user_id,
                    "label": label,
                    "slug": slugify(label),
                    "is_default": True,
                }
                for label in DEFAULT_TAGS
            ]
        ).execute()
    except Exception as e:
        # Não bloqueia a listagem: sem as tags padrão o usuário ainda pode criar
        # as dele.
        print(f"[task_tags] semeadura falhou user={user_id}: {e}", flush=True)


def list_tags(user_id: str) -> list[dict]:
    """As tags do usuário: padrão primeiro, depois alfabética."""
    ensure_defaults(user_id)
    try:
        res = (
            supabase.table("task_tags")
            .select("id, label, slug, color, is_default")
            .eq("user_id", user_id)
            .order("is_default", desc=True)
            .order("label", desc=False)
            .execute()
        )
    except Exception as e:
        print(f"[task_tags] list falhou user={user_id}: {e}", flush=True)
        return []
    return [_serialize(r) for r in res.data or []]


def create_tag(user_id: str, label: str, color: str | None = None) -> dict | None:
    """
    Cria a tag. Se o slug já existe, devolve a EXISTENTE em vez de erro.

    O usuário que digita "estudos" num campo de criação quer a tag de estudos —
    não quer ver um erro de duplicidade. Quem chama não precisa checar antes.
    """
    label = str(label or "").strip()
    if not label:
        return None
    slug = slugify(label)
    if not slug:
        return None

    try:
        found = (
            supabase.table("task_tags")
            .select("id, label, slug, color, is_default")
            .eq("user_id", user_id)
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        if found.data:
            return _serialize(found.data[0])

        res = (
            supabase.table("task_tags")
            .insert(
                {
                    "user_id": user_id,
                    "label": label,
                    "slug": slug,
                    "color": color,
                    "is_default": False,
                }
            )
            .execute()
        )
        return _serialize(res.data[0]) if res.data else None
    except Exception as e:
        # Pode ser a corrida contra o índice único (duas criações simultâneas do
        # mesmo slug): relê antes de desistir, porque a tag agora existe.
        try:
            found = (
                supabase.table("task_tags")
                .select("id, label, slug, color, is_default")
                .eq("user_id", user_id)
                .eq("slug", slug)
                .limit(1)
                .execute()
            )
            if found.data:
                return _serialize(found.data[0])
        except Exception:
            pass
        print(f"[task_tags] create falhou user={user_id}: {e}", flush=True)
        return None


def update_tag(
    user_id: str,
    tag_id: str,
    label: str | None = None,
    color: str | None = None,
) -> dict | None:
    """Renomeia (recalculando o slug) e/ou troca a cor."""
    payload: dict = {}
    if label is not None:
        label = str(label).strip()
        if not label:
            return None
        payload["label"] = label
        payload["slug"] = slugify(label)
    if color is not None:
        payload["color"] = color
    if not payload:
        return None

    try:
        res = (
            supabase.table("task_tags")
            .update(payload)
            .eq("user_id", user_id)
            .eq("id", tag_id)
            .execute()
        )
        return _serialize(res.data[0]) if res.data else None
    except Exception as e:
        print(f"[task_tags] update falhou user={user_id} tag={tag_id}: {e}", flush=True)
        return None


def count_tasks_with_tag(user_id: str, tag_id: str) -> int:
    """
    Quantas tarefas usam esta tag — para AVISAR antes de excluir.

    O frontend mostra esse número na confirmação: excluir a tag apaga os
    vínculos em cascata, e o usuário tem de saber o alcance antes de confirmar.
    """
    try:
        res = (
            supabase.table("task_tag_links")
            .select("task_id")
            .eq("user_id", user_id)
            .eq("tag_id", tag_id)
            .execute()
        )
        return len(res.data or [])
    except Exception:
        return 0


def delete_tag(user_id: str, tag_id: str) -> bool:
    """Exclui a tag. Os vínculos vão com ela (ON DELETE CASCADE)."""
    try:
        supabase.table("task_tags").delete().eq("user_id", user_id).eq(
            "id", tag_id
        ).execute()
        return True
    except Exception as e:
        print(f"[task_tags] delete falhou user={user_id} tag={tag_id}: {e}", flush=True)
        return False


# ── Vínculo com tarefas ─────────────────────────────────────────────────────

def set_task_tags(user_id: str, task_id: str, tag_ids: list[str] | None) -> None:
    """
    Substitui o conjunto de tags da tarefa numa operação.

    `None` não faz nada (o campo não veio no PATCH); lista vazia REMOVE todas as
    tags. A distinção importa: sem ela, editar o título de uma tarefa apagaria
    as tags dela.
    """
    if tag_ids is None:
        return
    try:
        supabase.table("task_tag_links").delete().eq("user_id", user_id).eq(
            "task_id", task_id
        ).execute()
        if not tag_ids:
            return
        # Só vincula tags que são do próprio usuário: um tag_id de outra conta
        # chegaria aqui pelo corpo da requisição e o insert violaria a RLS.
        owned = (
            supabase.table("task_tags")
            .select("id")
            .eq("user_id", user_id)
            .in_("id", [str(t) for t in tag_ids])
            .execute()
        )
        valid = [str(r["id"]) for r in owned.data or []]
        if not valid:
            return
        supabase.table("task_tag_links").upsert(
            [
                {"user_id": user_id, "task_id": task_id, "tag_id": tid}
                for tid in valid
            ],
            on_conflict="task_id,tag_id",
        ).execute()
    except Exception as e:
        print(f"[task_tags] set falhou user={user_id} task={task_id}: {e}", flush=True)


def tags_for_tasks(user_id: str, task_ids: list[str]) -> dict[str, list[dict]]:
    """
    Tags de várias tarefas em DUAS queries, não uma por tarefa.

    Cada query no Supabase custa ~105ms: um N+1 aqui somaria segundos na
    listagem do Planning (foi assim que o dashboard chegou a 1812ms antes de um
    N+1 ser removido do routines_service). Uma query traz os vínculos, outra os
    rótulos, e o cruzamento é feito em memória.
    """
    if not task_ids:
        return {}
    try:
        links = (
            supabase.table("task_tag_links")
            .select("task_id, tag_id")
            .eq("user_id", user_id)
            .in_("task_id", [str(t) for t in task_ids])
            .execute()
        ).data or []
        if not links:
            return {}

        tag_ids = list({str(l["tag_id"]) for l in links})
        tags = (
            supabase.table("task_tags")
            .select("id, label, slug, color, is_default")
            .eq("user_id", user_id)
            .in_("id", tag_ids)
            .execute()
        ).data or []
        by_id = {str(t["id"]): _serialize(t) for t in tags}

        out: dict[str, list[dict]] = {}
        for link in links:
            tag = by_id.get(str(link["tag_id"]))
            if tag:
                out.setdefault(str(link["task_id"]), []).append(tag)
        for task_id in out:
            out[task_id].sort(key=lambda t: (not t["is_default"], t["label"] or ""))
        return out
    except Exception as e:
        print(f"[task_tags] tags_for_tasks falhou user={user_id}: {e}", flush=True)
        return {}
