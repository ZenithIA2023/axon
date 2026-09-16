import { useState } from "react";
import { ChevronDown, ChevronUp, Sliders } from "lucide-react";

import * as api from "../../lib/api";
import type { TaskComplexity, TaskTag } from "../../lib/api";

// ===========================================================================
// OPÇÕES AVANÇADAS DA TAREFA — complexidade + categorias
// ===========================================================================
// Compartilhado pelos modais de criar e editar do Planning, para os dois nunca
// divergirem. Recolhido por padrão: são campos opcionais, e quem só quer
// registrar "dentista às 15h" não deve tropeçar neles.
//
// A ESCALA é a do modal (min-h-[52px], rounded-2xl, px-4), não a do RoutineItem
// (rounded-xl, py-2) de onde o padrão de recolher/expandir veio — copiar as
// classes de lá faria o bloco destoar do resto do formulário.

// Rótulos em PT-BR dos quatro níveis. O valor "" é "não informado" e vira null
// no backend: a tarefa fica FORA da análise de complexidade, sem default
// implícito.
const COMPLEXITY_OPTIONS: { value: "" | TaskComplexity; label: string }[] = [
  { value: "", label: "Não informado" },
  { value: "light", label: "Baixa — mecânica, dá para fazer cansado" },
  { value: "moderate", label: "Moderada — atenção normal" },
  { value: "focus", label: "Preciso de foco" },
  { value: "deep_focus", label: "Preciso de foco profundo" },
];

export default function TaskAdvancedOptions({
  complexity,
  onComplexityChange,
  tags,
  selectedTagIds,
  onSelectedTagsChange,
  onTagCreated,
}: {
  complexity: "" | TaskComplexity;
  onComplexityChange: (value: "" | TaskComplexity) => void;
  tags: TaskTag[];
  selectedTagIds: string[];
  onSelectedTagsChange: (ids: string[]) => void;
  // Uma tag criada aqui precisa entrar na lista do pai, senão desaparece do
  // seletor até a próxima abertura do modal.
  onTagCreated: (tag: TaskTag) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [creating, setCreating] = useState(false);

  function toggleTag(id: string) {
    onSelectedTagsChange(
      selectedTagIds.includes(id)
        ? selectedTagIds.filter((t) => t !== id)
        : [...selectedTagIds, id]
    );
  }

  const query = tagQuery.trim();
  const filtered = query
    ? tags.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()))
    : tags;
  // Só oferece criar quando o texto não casa EXATAMENTE com uma tag existente —
  // casar parcialmente ainda é um nome novo válido ("Curso" com "Cursos" na
  // lista), mas repetir o mesmo nome não.
  const exactExists = tags.some(
    (t) => t.label.toLowerCase() === query.toLowerCase()
  );

  async function createTag() {
    if (!query || exactExists || creating) return;
    setCreating(true);
    try {
      const tag = await api.createTaskTag(query);
      onTagCreated(tag);
      // O backend devolve a tag existente se o slug já existia, então marcar
      // aqui é seguro: nunca duplica.
      if (!selectedTagIds.includes(tag.id)) {
        onSelectedTagsChange([...selectedTagIds, tag.id]);
      }
      setTagQuery("");
    } catch {
      // Falha de rede: o usuário pode tentar de novo. A tarefa em si não depende
      // disso para ser salva.
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="border-t border-soft pt-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" />
          Opções avançadas
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-muted">
              Complexidade
            </span>

            <select
              value={complexity}
              onChange={(e) =>
                onComplexityChange(e.target.value as "" | TaskComplexity)
              }
              className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none focus:border-accent-soft"
            >
              {COMPLEXITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <p className="mt-2 text-[0.68rem] leading-4 text-muted">
              Quanta energia mental a tarefa exige — diferente da prioridade, que
              é urgência. O Axon usa isso para não agendar trabalho pesado em
              horário de baixa energia.
            </p>
          </label>

          <div>
            <span className="mb-2 block text-xs font-medium text-muted">
              Categorias
            </span>

            {selectedTagIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {tags
                  .filter((t) => selectedTagIds.includes(t.id))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className="rounded-full bg-accent-soft px-3 py-1.5 text-[0.7rem] font-semibold text-accent transition active:scale-[0.97]"
                    >
                      {tag.label} ×
                    </button>
                  ))}
              </div>
            )}

            <input
              type="text"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createTag();
                }
              }}
              placeholder="Buscar ou criar categoria..."
              className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
            />

            {query && !exactExists && (
              <button
                type="button"
                onClick={() => void createTag()}
                disabled={creating}
                className="mt-2 w-full rounded-2xl border border-accent-soft bg-accent-soft px-4 py-3 text-xs font-semibold text-accent transition active:scale-[0.98] disabled:opacity-60"
              >
                {creating ? "Criando..." : `Criar «${query}»`}
              </button>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {filtered
                .filter((t) => !selectedTagIds.includes(t.id))
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="rounded-full border border-soft bg-surface-muted px-3 py-1.5 text-[0.7rem] font-medium text-secondary transition active:scale-[0.97]"
                  >
                    {tag.label}
                  </button>
                ))}
            </div>

            {tags.length === 0 && (
              <p className="mt-2 text-[0.68rem] leading-4 text-muted">
                Digite acima para criar sua primeira categoria.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
