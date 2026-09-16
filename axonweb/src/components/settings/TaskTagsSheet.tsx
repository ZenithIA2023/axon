import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Tags, Trash2, X } from "lucide-react";

import BottomSheet from "../ui/BottomSheet";
import ConfirmDialog from "../ui/ConfirmDialog";
import * as api from "../../lib/api";
import type { TaskTag } from "../../lib/api";

// ===========================================================================
// CATEGORIAS DAS TAREFAS
// ===========================================================================
// Vocabulário de tags usado para AGRUPAR tarefas parecidas (ver Migration 31).
//
// Não confundir com o TagEditorSheet: aquele edita as tags do REGISTRO DIÁRIO
// (sono/humor/produtividade), que são outro conjunto, em outra tabela, com outra
// finalidade. Os dois coexistem de propósito.

// Paleta fixa para as categorias. Hex cru (e não token de tema) de propósito:
// a cor é identidade da tag e precisa ser a MESMA no claro e no escuro, senão a
// "Estudos azul" do usuário mudaria de cor ao trocar o tema. Os tons foram
// escolhidos com saturação média para legibilidade nos dois fundos.
const TAG_COLORS = [
  "#8b5cf6", // roxo
  "#3b82f6", // azul
  "#10b981", // verde
  "#f59e0b", // âmbar
  "#ef4444", // vermelho
  "#ec4899", // rosa
  "#14b8a6", // turquesa
  "#64748b", // cinza
];

export default function TaskTagsSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  // Edição inline: id da tag sendo renomeada e o texto atual do input.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [saving, setSaving] = useState(false);
  // Exclusão: a tag alvo e quantas tarefas ela afeta. A contagem é buscada ANTES
  // de o diálogo aparecer — o usuário tem de ver o alcance antes de confirmar,
  // porque excluir apaga os vínculos em cascata.
  const [deleting, setDeleting] = useState<{
    tag: TaskTag;
    taskCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    api
      .getTaskTags()
      .then(setTags)
      .catch(() => setError("Não foi possível carregar as categorias."))
      .finally(() => setLoading(false));
  }, [isOpen]);

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || creating) return;
    setCreating(true);
    setError(null);
    try {
      const tag = await api.createTaskTag(label);
      // O backend devolve a existente quando o nome repete, então filtrar por id
      // evita duplicar a linha na lista.
      setTags((prev) =>
        prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]
      );
      setNewLabel("");
    } catch {
      setError("Não foi possível criar a categoria.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(tag: TaskTag) {
    const label = editingLabel.trim();
    if (!label || label === tag.label) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateTaskTag(tag.id, { label });
      setTags((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingId(null);
    } catch {
      setError("Não foi possível renomear a categoria.");
    } finally {
      setSaving(false);
    }
  }

  async function handleColor(tag: TaskTag, color: string | null) {
    setError(null);
    // Otimista: a cor é feedback visual imediato e um erro apenas reverte.
    const previous = tags;
    setTags((prev) =>
      prev.map((t) => (t.id === tag.id ? { ...t, color } : t))
    );
    try {
      await api.updateTaskTag(tag.id, { color });
    } catch {
      setTags(previous);
      setError("Não foi possível salvar a cor.");
    }
  }

  async function askDelete(tag: TaskTag) {
    setError(null);
    try {
      const usage = await api.getTaskTagUsage(tag.id);
      setDeleting({ tag, taskCount: usage.task_count });
    } catch {
      // Sem a contagem, ainda dá para excluir — mas o aviso fica genérico em vez
      // de mentir um número.
      setDeleting({ tag, taskCount: -1 });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { tag } = deleting;
    setDeleting(null);
    try {
      await api.deleteTaskTag(tag.id);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch {
      setError("Não foi possível excluir a categoria.");
    }
  }

  const deleteMessage = !deleting
    ? ""
    : deleting.taskCount < 0
    ? `A categoria «${deleting.tag.label}» será excluída e sai de todas as tarefas que a usam.`
    : deleting.taskCount === 0
    ? `A categoria «${deleting.tag.label}» não está em nenhuma tarefa. Pode excluir com segurança.`
    : `A categoria «${deleting.tag.label}» está em ${deleting.taskCount} ${
        deleting.taskCount === 1 ? "tarefa" : "tarefas"
      }. Excluir remove a categoria dessas tarefas — as tarefas continuam lá.`;

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        ariaLabel="Categorias das tarefas"
        maxHeightClassName="max-h-[85vh]"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
              <Tags className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-primary">
                Categorias das tarefas
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Servem para o Axon agrupar tarefas parecidas ao organizar seu dia.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Nova categoria..."
              className="min-h-[48px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!newLabel.trim() || creating}
              className="flex min-h-[48px] shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-white transition active:scale-[0.97] disabled:opacity-50"
              aria-label="Criar categoria"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          </div>

          {error && (
            <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-200">
              {error}
            </p>
          )}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-2xl bg-surface-muted"
                />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <p className="px-1 text-xs leading-5 text-muted">
              Nenhuma categoria ainda. Crie a primeira acima.
            </p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="rounded-2xl border border-soft bg-surface-muted px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                  {editingId === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={editingLabel}
                        autoFocus
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleRename(tag);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-h-9 w-full rounded-xl border border-soft bg-surface-elevated px-3 text-sm text-primary outline-none focus:border-accent-soft"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(tag)}
                        disabled={saving}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-soft bg-accent-soft text-accent transition active:scale-[0.96] disabled:opacity-60"
                        aria-label="Salvar nome"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft text-muted transition active:scale-[0.96]"
                        aria-label="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-soft"
                        style={{ backgroundColor: tag.color ?? "transparent" }}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditingLabel(tag.label);
                        }}
                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-primary"
                      >
                        {tag.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => void askDelete(tag)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft text-muted transition active:scale-[0.96]"
                        aria-label={`Excluir ${tag.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  </div>

                  {/* Paleta só no modo edição: a cor é ajuste ocasional e uma
                      fileira de bolinhas em toda linha deixaria a lista ruidosa. */}
                  {editingId === tag.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2">
                      {TAG_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => void handleColor(tag, color)}
                          className={`h-6 w-6 rounded-full border transition active:scale-[0.92] ${
                            tag.color === color
                              ? "border-[var(--text-primary)]"
                              : "border-soft"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Cor ${color}`}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleColor(tag, null)}
                        className={`flex h-6 items-center rounded-full border px-2 text-[0.6rem] font-semibold text-muted transition active:scale-[0.95] ${
                          tag.color ? "border-soft" : "border-[var(--text-primary)]"
                        }`}
                      >
                        Sem cor
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        isOpen={!!deleting}
        title="Excluir categoria?"
        description={deleteMessage}
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
