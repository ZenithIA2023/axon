/* ==========================================================================
 * Drawer lateral de conversas — usado apenas no mobile.
 *
 * No celular a rota /chat abre direto na conversa principal do Axon; o
 * histórico de conversas e projetos deixa de ser uma tela e passa a ser esta
 * gaveta, que desliza da ESQUERDA (padrão de ChatGPT/Claude) e é acionada
 * pelo ícone de abas no canto superior esquerdo do header.
 *
 * A troca entre "Todas" e "Projetos" repete a navegação que existia na tela
 * de lista, inclusive a entrada em um projeto para ver as conversas dele.
 * ========================================================================== */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Focus,
  MessageCircle,
  PanelLeft,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";

import * as api from "../../lib/api";
import type { ConversationData } from "../../lib/api";
import { ScrollArea } from "../ui/ScrollArea";

type Props = {
  isOpen: boolean;
  conversations: ConversationData[];
  projects: api.ChatProjectData[];
  activeConversationId: string | null;
  loading?: boolean;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onCreate: (
    projectId?: string | null,
    mode?: "conversation" | "project"
  ) => void;
};

type DrawerView = "all" | "projects";

// Agrupa o histórico por faixa de tempo — é a informação que o usuário usa
// para se localizar numa lista longa, então vira a estrutura da lista.
type Bucket = { label: string; items: ConversationData[] };

function sortDate(conversation: ConversationData) {
  const item = conversation as ConversationData & {
    updated_at?: string | null;
    last_message_at?: string | null;
    last_accessed_at?: string | null;
  };

  return new Date(
    item.last_accessed_at ??
      item.last_message_at ??
      item.updated_at ??
      item.created_at
  ).getTime();
}

function groupByPeriod(items: ConversationData[]): Bucket[] {
  const now = Date.now();
  const day = 86400000;

  const buckets: Bucket[] = [
    { label: "Hoje", items: [] },
    { label: "Ontem", items: [] },
    { label: "Últimos 7 dias", items: [] },
    { label: "Antes", items: [] },
  ];

  for (const item of [...items].sort((a, b) => sortDate(b) - sortDate(a))) {
    const diff = Math.floor((now - sortDate(item)) / day);

    if (diff <= 0) buckets[0].items.push(item);
    else if (diff === 1) buckets[1].items.push(item);
    else if (diff < 7) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}

function iconFor(type?: string): LucideIcon {
  if (type === "planning") return CalendarDays;
  if (type === "focus") return Focus;
  if (type === "project") return Briefcase;
  return MessageCircle;
}

function projectIdOf(conversation: ConversationData) {
  return (
    (conversation as ConversationData & { project_id?: string | null })
      .project_id ?? null
  );
}

export default function ChatListDrawer({
  isOpen,
  conversations,
  projects,
  activeConversationId,
  loading = false,
  onClose,
  onSelect,
  onCreate,
}: Props) {
  // Quem pediu menos movimento recebe a gaveta sem o deslizamento.
  const reduceMotion = useReducedMotion();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<DrawerView>("all");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  // A gaveta sempre reabre limpa: busca vazia, aba "Todas", fora de projeto.
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setView("all");
      setOpenProjectId(null);
    }
  }, [isOpen]);

  // Fecha na tecla Esc do navegador.
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const openProject = useMemo(
    () => projects.find((project) => project.id === openProjectId) ?? null,
    [projects, openProjectId]
  );

  const axonDirect = useMemo(
    () =>
      conversations.find(
        (item) => !item.archived && item.conversation_type === "axon_direct"
      ),
    [conversations]
  );

  const query = search.trim().toLowerCase();

  function matchesSearch(conversation: ConversationData) {
    if (!query) return true;

    return (
      conversation.title?.toLowerCase().includes(query) ||
      (conversation.last_message ?? "").toLowerCase().includes(query)
    );
  }

  // Aba "Todas": conversas soltas, sem as que vivem dentro de um projeto.
  const looseConversations = useMemo(
    () =>
      conversations.filter(
        (item) =>
          !item.archived &&
          item.conversation_type !== "axon_direct" &&
          !projectIdOf(item) &&
          matchesSearch(item)
      ),
    [conversations, query]
  );

  // Dentro de um projeto: apenas as conversas dele.
  const projectConversations = useMemo(
    () =>
      conversations.filter(
        (item) =>
          !item.archived &&
          projectIdOf(item) === openProjectId &&
          matchesSearch(item)
      ),
    [conversations, openProjectId, query]
  );

  const filteredProjects = useMemo(() => {
    if (!query) return projects;

    return projects.filter((project) =>
      project.name.toLowerCase().includes(query)
    );
  }, [projects, query]);

  const buckets = useMemo(
    () => groupByPeriod(openProject ? projectConversations : looseConversations),
    [openProject, projectConversations, looseConversations]
  );

  // Na aba Projetos (fora de um projeto) a criação muda de alvo.
  const isProjectsTab = view === "projects" && !openProject;

  const searchPlaceholder = openProject
    ? "Buscar neste projeto"
    : view === "projects"
    ? "Buscar projeto"
    : "Buscar conversa";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: 0.22 } }}
          />

          <motion.aside
            /* Entrada e saída têm curvas diferentes de propósito: entrando, a
               gaveta desacelera ao chegar na posição; saindo, ela acelera para
               fora em vez de frear contra a borda. Sem mola — o overshoot de um
               spring bate no limite da tela e lê como tremida. */
            initial={reduceMotion ? { opacity: 0 } : { x: "-100%" }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: { duration: 0.15 } }
                : { x: 0, transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.15 } }
                : {
                    x: "-100%",
                    transition: { duration: 0.22, ease: [0.4, 0, 0.9, 0.3] },
                  }
            }
            style={{ willChange: "transform" }}
            className="fixed inset-y-0 left-0 z-[90] flex w-[86%] max-w-[21rem] flex-col bg-[var(--surface-elevated)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-soft lg:hidden"
            role="dialog"
            aria-label="Suas conversas"
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft">
                  <img
                    src="/axon-logo.svg"
                    alt=""
                    className="h-8 w-8 object-contain"
                  />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">
                    {openProject ? openProject.name : "Chat"}
                  </p>

                  <p className="truncate text-xs text-muted">
                    {openProject
                      ? "Conversas do projeto"
                      : "Conversas com AXON"}
                  </p>
                </div>
              </div>

              {/* Mesmo ícone que abre a gaveta, agora fechando: o botão volta
                  para o lugar de onde veio. */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-secondary transition active:scale-[0.96]"
                aria-label="Fechar conversas"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 rounded-full bg-surface-muted px-3.5 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-soft" />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-soft"
                />
              </div>
            </div>

            {/* Alternância entre conversas soltas e projetos. Some ao entrar
                em um projeto, onde o caminho de volta é o botão acima. */}
            {!openProject && (
              <div className="mx-4 mb-1 flex gap-1 rounded-full bg-surface-muted p-1">
                <ViewTab
                  label="Todas"
                  isActive={view === "all"}
                  onClick={() => setView("all")}
                />

                <ViewTab
                  label="Projetos"
                  isActive={view === "projects"}
                  onClick={() => setView("projects")}
                />
              </div>
            )}

            {openProject && (
              <button
                type="button"
                onClick={() => setOpenProjectId(null)}
                className="mx-4 mb-1 inline-flex items-center gap-2 self-start rounded-full px-2 py-1.5 text-xs font-medium text-muted transition active:scale-[0.98]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Todos os projetos
              </button>
            )}

            {/* A ação de criar segue a aba: em "Projetos" cria um projeto,
                em "Todas" (e dentro de um projeto) cria uma conversa. */}
            <button
              type="button"
              onClick={() => {
                onCreate(
                  openProjectId,
                  isProjectsTab ? "project" : "conversation"
                );
                onClose();
              }}
              className="mx-4 my-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white">
                <Plus className="h-4 w-4" />
              </span>

              <span className="text-sm font-medium text-primary">
                {isProjectsTab
                  ? "Novo projeto"
                  : openProject
                  ? "Nova conversa no projeto"
                  : "Nova conversa"}
              </span>
            </button>

            <ScrollArea className="min-h-0 flex-1" contentClassName="px-2 pb-6">
              {loading ? (
                <p className="px-4 py-6 text-sm text-muted">
                  Carregando conversas...
                </p>
              ) : view === "projects" && !openProject ? (
                filteredProjects.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted">
                    {query
                      ? "Nenhum projeto com esse nome."
                      : "Crie um projeto para reunir conversas do mesmo assunto."}
                  </p>
                ) : (
                  filteredProjects.map((project) => {
                    const count =
                      project.conversation_count ??
                      conversations.filter(
                        (item) =>
                          projectIdOf(item) === project.id && !item.archived
                      ).length;

                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setOpenProjectId(project.id)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99]"
                      >
                        <Briefcase className="h-4 w-4 shrink-0 text-soft" />

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-primary">
                            {project.name}
                          </span>

                          <span className="block truncate text-xs text-muted">
                            {count === 1 ? "1 conversa" : `${count} conversas`}
                          </span>
                        </span>

                        <ChevronRight className="h-4 w-4 shrink-0 text-soft" />
                      </button>
                    );
                  })
                )
              ) : (
                <>
                  {axonDirect && !query && !openProject && view === "all" && (
                    <DrawerRow
                      title="Axon"
                      subtitle={axonDirect.last_message ?? "Conversa principal"}
                      icon={MessageCircle}
                      isActive={activeConversationId === axonDirect.id}
                      onClick={() => {
                        onSelect(axonDirect.id);
                        onClose();
                      }}
                    />
                  )}

                  {buckets.map((bucket) => (
                    <div key={bucket.label}>
                      <p className="px-4 pb-1 pt-4 text-xs font-medium text-soft">
                        {bucket.label}
                      </p>

                      {bucket.items.map((conversation) => (
                        <DrawerRow
                          key={conversation.id}
                          title={conversation.title || "Nova conversa"}
                          subtitle={conversation.last_message ?? undefined}
                          icon={iconFor(conversation.type)}
                          isActive={activeConversationId === conversation.id}
                          onClick={() => {
                            onSelect(conversation.id);
                            onClose();
                          }}
                        />
                      ))}
                    </div>
                  ))}

                  {buckets.length === 0 && (!axonDirect || query || openProject) && (
                    <p className="px-4 py-6 text-sm text-muted">
                      {query
                        ? "Nenhuma conversa com esse nome."
                        : openProject
                        ? "Este projeto ainda não tem conversas."
                        : "Suas conversas aparecem aqui."}
                    </p>
                  )}
                </>
              )}
            </ScrollArea>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function ViewTab({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 flex-1 rounded-full text-xs font-medium transition active:scale-[0.98] ${
        isActive
          ? "bg-[var(--accent-strong)] text-white"
          : "text-muted"
      }`}
      aria-pressed={isActive}
    >
      {label}
    </button>
  );
}

function DrawerRow({
  title,
  subtitle,
  icon: Icon,
  isActive,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] ${
        isActive ? "bg-accent-soft" : ""
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${isActive ? "text-accent" : "text-soft"}`}
      />

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm ${
            isActive ? "font-medium text-accent" : "text-primary"
          }`}
        >
          {title}
        </span>

        {subtitle && (
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        )}
      </span>
    </button>
  );
}
