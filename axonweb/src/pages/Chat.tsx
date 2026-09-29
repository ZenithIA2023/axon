/* ==========================================================================
 * Esta página separa conversas soltas da aba "Projetos", mantendo busca,
 * criação rápida e navegação para a conversa interna.
 * ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Focus,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  X,
  MoreVertical,
  Edit3,
  Trash2,
  Loader2,
  ArrowLeft,
} from "lucide-react";

import { results, type ChronotypeResultKey } from "../data/results";
import { ScrollArea } from "../components/ui/ScrollArea";
import Sidebar from "../components/layout/Sidebar";
import { ChatConversationPanel } from "./ChatConversation";
import * as api from "../lib/api";
import type { ConversationData } from "../lib/api";
import AppBackground from "../components/layout/AppBackground";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import ChatListDrawer from "../components/chat/ChatListDrawer";

/* ==========================================================================
 * Tipos e aliases locais
 * ========================================================================== */
type ConversationType = "general" | "planning" | "focus" | "project";
type ProjectFolder = api.ChatProjectData;
type ProjectConversation = ConversationData & { project_id?: string | null };
type ConversationWithSortDates = ConversationData & {
  updated_at?: string | null;
  last_message_at?: string | null;
  last_accessed_at?: string | null;
  last_opened_at?: string | null;
  last_read_at?: string | null;
};

// Centraliza a prioridade de datas usada para ordenar conversas recentes.
function getConversationSortDate(conversation: ConversationData) {
  const item = conversation as ConversationWithSortDates;

  return new Date(
    item.last_accessed_at ??
      item.last_opened_at ??
      item.last_read_at ??
      item.last_message_at ??
      item.updated_at ??
      item.created_at
  ).getTime();
}

// Evita mutar a lista original antes de renderizar filtros e projetos.
function sortConversationsByRecent<T extends ConversationData>(items: T[]) {
  return [...items].sort(
    (a, b) => getConversationSortDate(b) - getConversationSortDate(a)
  );
}

function formatConversationDate(date: Date) {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (diffDays === 1) return "Ontem";

  if (diffDays < 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "short" });
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getConversationLastAccessDate(
  conversation: ConversationData,
  localLastAccess?: string
) {
  const item = conversation as ConversationWithSortDates;

  const rawDate =
    localLastAccess ??
    item.last_accessed_at ??
    item.last_opened_at ??
    item.last_read_at ??
    null;

  if (!rawDate) return null;

  const date = new Date(rawDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getConversationDisplayDate(
  conversation: ConversationData,
  localLastAccess?: string
) {
  const lastAccessDate = getConversationLastAccessDate(
    conversation,
    localLastAccess
  );

  if (!lastAccessDate) return "Novo";

  return formatConversationDate(lastAccessDate);
}

function isAxonDirectConversation(conversation: ConversationData) {
  return conversation.conversation_type === "axon_direct";
}

// Controla por quanto tempo o card explicativo do topo aparece para usuários recorrentes.
const CHAT_INTRO_STORAGE_KEY = "axon:chat:intro:first-seen-at";
const CHAT_INTRO_DISMISSED_KEY = "axon:chat:intro:dismissed";
const CHAT_INTRO_VISIBLE_DAYS = 7;
const CHAT_INTRO_HIDE_AFTER_MS =
  CHAT_INTRO_VISIBLE_DAYS * 24 * 60 * 60 * 1000;

const CHAT_LAST_ACCESS_STORAGE_KEY = "axon:chat:last-accessed-by-id";
const CHAT_METADATA_UPDATED_EVENT = "axon:chat-metadata-updated";

type LastAccessMap = Record<string, string>;

function readLastAccessMap(): LastAccessMap {
  try {
    return JSON.parse(
      localStorage.getItem(CHAT_LAST_ACCESS_STORAGE_KEY) ?? "{}"
    ) as LastAccessMap;
  } catch {
    return {};
  }
}

function saveLastAccessMap(nextMap: LastAccessMap) {
  localStorage.setItem(CHAT_LAST_ACCESS_STORAGE_KEY, JSON.stringify(nextMap));
}

function isDesktopChatViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches
  );
}

// Fallback usado pela Sidebar quando o cronotipo salvo ainda não existe.
const validKeys: ChronotypeResultKey[] = [
  "Matutino",
  "Vespertino",
  "Noturno",
  "Misto",
  "Bimodal",
];

export default function Chat() {
  const navigate = useNavigate();

  /* --------------------------------------------------------------------------
   * Estados da lista e layout
   * -------------------------------------------------------------------------- */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"conversation" | "project">(
    "conversation"
  );
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "projects">("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const [showIntroCard, setShowIntroCard] = useState(false);
  const [lastAccessByConversation, setLastAccessByConversation] =
    useState<LastAccessMap>(() => readLastAccessMap());
  // Mobile: qual conversa está aberta na tela (a gaveta troca este valor).
  const [mobileConversationId, setMobileConversationId] = useState<string | null>(null);
  const [isChatListOpen, setIsChatListOpen] = useState(false);

  const [desktopConversationId, setDesktopConversationId] = useState<string | null>(
    null
  );

  /* --------------------------------------------------------------------------
   * Conversas
   * -------------------------------------------------------------------------- */
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const axonDirectConversation = useMemo(() => {
    return conversations.find(
      (conversation) =>
        !conversation.archived && isAxonDirectConversation(conversation)
    );
  }, [conversations]);

  /* --------------------------------------------------------------------------
   * Projetos / pastas de conversa
   * -------------------------------------------------------------------------- */
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [createConversationProjectId, setCreateConversationProjectId] =
    useState<string | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<ProjectFolder | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectFolder | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  /* --------------------------------------------------------------------------
   * Carregamento inicial de conversas
   * -------------------------------------------------------------------------- */
  useEffect(() => {
    api
      .getConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoadingConversations(false));
  }, []);

  /* --------------------------------------------------------------------------
   * Card contextual do topo
   * -------------------------------------------------------------------------- */
  useEffect(() => {
    const dismissed = localStorage.getItem(CHAT_INTRO_DISMISSED_KEY) === "true";
    const firstSeen = localStorage.getItem(CHAT_INTRO_STORAGE_KEY);
    const now = Date.now();

    if (dismissed) {
      setShowIntroCard(false);
      return;
    }

    if (!firstSeen) {
      localStorage.setItem(CHAT_INTRO_STORAGE_KEY, String(now));
      setShowIntroCard(true);
      return;
    }

    const firstSeenAt = Number(firstSeen);

    if (!Number.isFinite(firstSeenAt)) {
      localStorage.setItem(CHAT_INTRO_STORAGE_KEY, String(now));
      setShowIntroCard(true);
      return;
    }

    setShowIntroCard(now - firstSeenAt < CHAT_INTRO_HIDE_AFTER_MS);
  }, []);

  function hideIntroCard() {
    localStorage.setItem(CHAT_INTRO_DISMISSED_KEY, "true");
    setShowIntroCard(false);
  }

  /* --------------------------------------------------------------------------
   * Carregamento dos projetos
   * -------------------------------------------------------------------------- */
  useEffect(() => {
    setLoadingProjects(true);

    api
      .getChatProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    function handleChatMetadataUpdated() {
      api
        .getConversations()
        .then(setConversations)
        .catch(() => null);

      api
        .getChatProjects()
        .then(setProjects)
        .catch(() => null);
    }

    window.addEventListener(
      CHAT_METADATA_UPDATED_EVENT,
      handleChatMetadataUpdated
    );

    return () => {
      window.removeEventListener(
        CHAT_METADATA_UPDATED_EVENT,
        handleChatMetadataUpdated
      );
    };
  }, []);

  /* --------------------------------------------------------------------------
   * Dados da Sidebar
   * -------------------------------------------------------------------------- */
  const resultKey = useMemo<ChronotypeResultKey>(() => {
    const stored = localStorage.getItem("axon_chronotype");

    if (stored && validKeys.includes(stored as ChronotypeResultKey)) {
      return stored as ChronotypeResultKey;
    }

    return "Misto";
  }, []);

  const result = results[resultKey];

  /* --------------------------------------------------------------------------
   * Filtros e ordenação
   * -------------------------------------------------------------------------- */
  const looseConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const projectId = getConversationProjectId(conversation);

      return (
        !conversation.archived &&
        !projectId &&
        !isAxonDirectConversation(conversation)
      );
    });
  }, [conversations]);

  const projectConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const projectId = getConversationProjectId(conversation);

      return (
        !conversation.archived &&
        Boolean(projectId) &&
        !isAxonDirectConversation(conversation)
      );
    });
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const query = search.toLowerCase();

    const filtered = looseConversations.filter((conversation) => {
      const matchesSearch =
        conversation.title.toLowerCase().includes(query) ||
        (conversation.last_message ?? "").toLowerCase().includes(query);

      return matchesSearch;
    });

    return sortConversationsByRecent(filtered);
  }, [looseConversations, search]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const filteredProjectConversations = useMemo(() => {
    const query = search.toLowerCase();

    const filtered = projectConversations.filter((conversation) => {
      const belongsToSelectedProject =
        getConversationProjectId(conversation) === selectedProjectId;

      const matchesSearch =
        conversation.title.toLowerCase().includes(query) ||
        (conversation.last_message ?? "").toLowerCase().includes(query);

      return belongsToSelectedProject && matchesSearch;
    });

    return sortConversationsByRecent(filtered);
  }, [projectConversations, search, selectedProjectId]);

  const filteredProjects = useMemo(() => {
    const query = search.toLowerCase();

    return projects.filter((project) => {
      const conversationsInsideProject = projectConversations.filter(
        (conversation) => getConversationProjectId(conversation) === project.id
      );

      const matchesProject =
        project.name.toLowerCase().includes(query) ||
        (project.description ?? "").toLowerCase().includes(query);

      const matchesConversation = conversationsInsideProject.some(
        (conversation) =>
          conversation.title.toLowerCase().includes(query) ||
          (conversation.last_message ?? "").toLowerCase().includes(query)
      );

      return matchesProject || matchesConversation;
    });
  }, [projects, projectConversations, search]);

  const activeConversationList =
    view === "projects" && selectedProjectId
      ? filteredProjectConversations
      : filteredConversations;

  useEffect(() => {
    if (!isDesktopChatViewport() || desktopConversationId || loadingConversations) {
      return;
    }

    const firstConversation =
      axonDirectConversation ??
      sortConversationsByRecent([...looseConversations, ...projectConversations])[0];

    if (firstConversation) {
      setDesktopConversationId(firstConversation.id);
    }
  }, [
    axonDirectConversation,
    desktopConversationId,
    loadingConversations,
    looseConversations,
    projectConversations,
  ]);

  const visibleConversations = activeConversationList.slice(0, visibleCount);
  const hasMoreConversations = activeConversationList.length > visibleCount;

  const defaultDesktopConversationId = useMemo(() => {
    if (loadingConversations) return null;

    const availableConversations = conversations.filter(
      (conversation) => !conversation.archived
    );

    const lastUsedConversation = availableConversations
      .map((conversation) => ({
        conversation,
        date: getConversationLastAccessDate(
          conversation,
          lastAccessByConversation[conversation.id]
        ),
      }))
      .filter(
        (item): item is { conversation: ConversationData; date: Date } =>
          Boolean(item.date)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.conversation;

    if (lastUsedConversation) {
      return lastUsedConversation.id;
    }

    return axonDirectConversation?.id ?? null;
  }, [
    axonDirectConversation,
    conversations,
    lastAccessByConversation,
    loadingConversations,
  ]);

  /* --------------------------------------------------------------------------
   * Paginação simples da lista
   * -------------------------------------------------------------------------- */
  useEffect(() => {
    setVisibleCount(8);
  }, [search, view, selectedProjectId]);

  /* --------------------------------------------------------------------------
   * Navegação entre abas
   * -------------------------------------------------------------------------- */
  useEffect(() => {
    if (view === "all") {
      setSelectedProjectId(null);
    }
  }, [view]);

  useEffect(() => {
    if (!isDesktopChatViewport()) return;
    if (!defaultDesktopConversationId) return;

    const currentConversationStillExists =
      !!desktopConversationId &&
      conversations.some(
        (conversation) =>
          conversation.id === desktopConversationId && !conversation.archived
      );

    if (currentConversationStillExists) return;

    setDesktopConversationId(defaultDesktopConversationId);
  }, [conversations, defaultDesktopConversationId, desktopConversationId]);

  // Mobile: /chat abre direto na conversa principal do Axon. Se ela ainda não
  // existir (conta nova), cai na conversa mais recente disponível.
  useEffect(() => {
    if (isDesktopChatViewport()) return;
    if (loadingConversations) return;

    const stillExists =
      !!mobileConversationId &&
      conversations.some(
        (conversation) =>
          conversation.id === mobileConversationId && !conversation.archived
      );

    if (stillExists) return;

    const fallback =
      axonDirectConversation ??
      sortConversationsByRecent(
        conversations.filter((conversation) => !conversation.archived)
      )[0];

    setMobileConversationId(fallback?.id ?? null);
  }, [
    axonDirectConversation,
    conversations,
    loadingConversations,
    mobileConversationId,
  ]);

  /* --------------------------------------------------------------------------
   * Último acesso do usuário em uma conversa
   * -------------------------------------------------------------------------- */
  function openConversation(conversationId: string) {
    const accessedAt = new Date().toISOString();

    setLastAccessByConversation((current) => {
      const next = {
        ...current,
        [conversationId]: accessedAt,
      };

      saveLastAccessMap(next);

      return next;
    });

    if (isDesktopChatViewport()) {
      setDesktopConversationId(conversationId);
      return;
    }

    // No mobile a conversa troca dentro da própria tela /chat.
    setMobileConversationId(conversationId);
  }

  /* --------------------------------------------------------------------------
   * Criação de conversa/projeto
   * -------------------------------------------------------------------------- */
  function openCreateConversationModal(
    projectId?: string | null,
    mode: "conversation" | "project" = "conversation"
  ) {
    setCreateConversationProjectId(projectId ?? null);
    setCreateMode(mode);
    setIsCreateModalOpen(true);
  }

  /* --------------------------------------------------------------------------
   * Exclusão de projeto
   * -------------------------------------------------------------------------- */
  async function confirmDeleteProject() {
    if (!projectToDelete) return;

    setIsDeletingProject(true);

    try {
      await api.deleteChatProject(projectToDelete.id);

      setProjects((prev) =>
        prev.filter((project) => project.id !== projectToDelete.id)
      );

      if (selectedProjectId === projectToDelete.id) {
        setSelectedProjectId(null);
      }

      window.dispatchEvent(new Event(CHAT_METADATA_UPDATED_EVENT));

      setProjectToDelete(null);
    } catch {
      // Mantém a tela estável se a exclusão falhar; o tratamento visual pode entrar depois.
    } finally {
      setIsDeletingProject(false);
    }
  }

  function renderDesktopChatItems() {
    const visibleLooseConversations = filteredConversations.slice(0, visibleCount);
    const hasMoreLooseConversations = filteredConversations.length > visibleCount;

    return (
      <div className="space-y-5">
        {loadingConversations ? (
          <DesktopChatSidebarLoading label="Carregando conversas..." />
        ) : (
          <>
            {axonDirectConversation && (
              <DesktopChatSidebarSection title="Principal">
                <DesktopSidebarConversationItem
                  conversation={axonDirectConversation}
                  lastAccessedAt={lastAccessByConversation[axonDirectConversation.id]}
                  isSelected={desktopConversationId === axonDirectConversation.id}
                  isAxon
                  onClick={() => openConversation(axonDirectConversation.id)}
                />
              </DesktopChatSidebarSection>
            )}

            <DesktopChatSidebarSection title="Projetos" count={filteredProjects.length}>
              {loadingProjects ? (
                <DesktopChatSidebarLoading label="Carregando projetos..." compact />
              ) : filteredProjects.length === 0 ? (
                <DesktopSidebarEmpty
                  icon={Briefcase}
                  title="Nenhum projeto"
                  description={
                    search.trim()
                      ? "Nenhum projeto encontrado com essa busca."
                      : "Agrupe conversas por assunto, cliente ou objetivo."
                  }
                  actionLabel="Criar projeto"
                  onAction={() => openCreateConversationModal(null, "project")}
                />
              ) : (
                <div className="space-y-1.5">
                  {filteredProjects.map((project) => {
                    const conversationsInsideProject = sortConversationsByRecent(
                      projectConversations.filter((conversation) => {
                        const belongsToProject =
                          getConversationProjectId(conversation) === project.id;
                        const query = search.toLowerCase();
                        const matchesSearch =
                          !query ||
                          conversation.title.toLowerCase().includes(query) ||
                          (conversation.last_message ?? "")
                            .toLowerCase()
                            .includes(query);

                        return belongsToProject && matchesSearch;
                      })
                    );

                    const isOpen = selectedProjectId === project.id;

                    return (
                      <DesktopSidebarProjectItem
                        key={project.id}
                        project={project}
                        conversations={conversationsInsideProject}
                        isOpen={isOpen}
                        activeConversationId={desktopConversationId}
                        lastAccessByConversation={lastAccessByConversation}
                        onToggle={() => {
                          setView("projects");
                          setSelectedProjectId(isOpen ? null : project.id);
                        }}
                        onSelectConversation={openConversation}
                        onCreateConversation={() =>
                          openCreateConversationModal(project.id, "conversation")
                        }
                        onEdit={() => setProjectToEdit(project)}
                        onDelete={() => setProjectToDelete(project)}
                      />
                    );
                  })}
                </div>
              )}
            </DesktopChatSidebarSection>

            <DesktopChatSidebarSection title="Conversas" count={filteredConversations.length}>
              {filteredConversations.length === 0 ? (
                <DesktopSidebarEmpty
                  icon={MessageCircle}
                  title="Nenhuma conversa"
                  description={
                    search.trim()
                      ? "Nenhuma conversa solta encontrada com essa busca."
                      : "Conversas de projetos aparecem dentro de cada projeto."
                  }
                  actionLabel="Criar conversa"
                  onAction={() => openCreateConversationModal(null, "conversation")}
                />
              ) : (
                <div className="space-y-1.5">
                  {visibleLooseConversations.map((conversation) => (
                    <DesktopSidebarConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      lastAccessedAt={lastAccessByConversation[conversation.id]}
                      isSelected={desktopConversationId === conversation.id}
                      onClick={() => openConversation(conversation.id)}
                    />
                  ))}

                  {hasMoreLooseConversations && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((current) => current + 8)}
                      className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-4 text-xs font-black text-secondary transition active:scale-[0.98]"
                    >
                      Ver mais conversas
                    </button>
                  )}
                </div>
              )}
            </DesktopChatSidebarSection>
          </>
        )}
      </div>
    );
  }

  /* --------------------------------------------------------------------------
   * Renderização
   * -------------------------------------------------------------------------- */

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-app text-primary">
      <AppBackground />

      {/* ----------------------------------------------------------------
        * Mobile: /chat É a conversa. O histórico saiu do caminho principal
        * e virou a gaveta lateral, aberta pelo ícone do canto esquerdo.
        * ---------------------------------------------------------------- */}
      <div className="relative z-10 h-full lg:hidden">
        {mobileConversationId ? (
          <ChatConversationPanel
            key={mobileConversationId}
            conversationId={mobileConversationId}
            onOpenChatList={() => setIsChatListOpen(true)}
            onCreateConversation={() => openCreateConversationModal(null)}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-sm text-muted">
              {loadingConversations
                ? "Abrindo sua conversa com o Axon..."
                : "Nenhuma conversa disponível."}
            </p>
          </div>
        )}
      </div>

      <ChatListDrawer
        isOpen={isChatListOpen}
        conversations={conversations}
        projects={projects}
        activeConversationId={mobileConversationId}
        loading={loadingConversations}
        onClose={() => setIsChatListOpen(false)}
        onSelect={(id) => {
          setMobileConversationId(id);
          openConversation(id);
        }}
        onCreate={(projectId, mode) =>
          openCreateConversationModal(projectId ?? null, mode)
        }
      />


      <div className="relative z-10 hidden h-full grid-cols-[320px_minmax(0,1fr)] gap-2.5 px-2.5 py-2.5 lg:grid xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="relative flex min-h-0 flex-col overflow-hidden rounded-[1.45rem] border border-soft bg-surface-elevated text-primary shadow-soft backdrop-blur-2xl">
          <div className="shrink-0 border-b border-[var(--border-soft)] px-3.5 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="flex min-w-0 items-center gap-2.5 text-left transition active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent shadow-card">
                  <img
                    src="/axon-logo.svg"
                    alt="Axon"
                    className="h-7 w-7 object-contain"
                  />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-primary">
                    AXON
                  </p>
                  <p className="truncate text-xs text-muted">
                    Chat e projetos
                  </p>
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    openCreateConversationModal(
                      view === "projects" && selectedProjectId ? selectedProjectId : null,
                      "conversation"
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent-strong)] text-white shadow-card transition active:scale-[0.96]"
                  aria-label="Nova conversa"
                  title="Nova conversa"
                >
                  <Plus className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <ChatSearchPanel
              search={search}
              view={view}
              isInsideProject={Boolean(selectedProjectId)}
              onSearchChange={setSearch}
              onViewChange={setView}
            />
          </div>

          <ScrollArea className="min-h-0 flex-1" contentClassName="px-3 py-3">
            {renderDesktopChatItems()}
          </ScrollArea>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-[1.55rem] border border-soft bg-surface-elevated shadow-soft backdrop-blur-2xl">
          {desktopConversationId ? (
            <ChatConversationPanel
              key={desktopConversationId}
              conversationId={desktopConversationId}
              embedded
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
          ) : (
            <DesktopChatEmptyPane
              onCreate={() => openCreateConversationModal(null)}
            />
          )}
        </section>
      </div>

      {/* Sidebar global reaproveitada para navegação entre páginas do app. */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chronotypeLabel={result.label}
        energyPeak={result.energyPeak}
      />

      {/* Modal único para criar conversa solta, conversa dentro de projeto ou novo projeto. */}
      <CreateConversationModal
        isOpen={isCreateModalOpen}
        defaultProjectId={createConversationProjectId}
        defaultMode={createMode}
        onClose={() => {
          setIsCreateModalOpen(false);
          setCreateConversationProjectId(null);
        }}
        onCreated={(conv) => {
          const conversationWithProject = {
            ...conv,
            project_id: conv.project_id ?? createConversationProjectId,
          } as ConversationData;

          setConversations((prev) => [conversationWithProject, ...prev]);

          if (createConversationProjectId) {
            setView("projects");
            setSelectedProjectId(createConversationProjectId);
          }

          setIsCreateModalOpen(false);
          setCreateConversationProjectId(null);

          window.dispatchEvent(new Event(CHAT_METADATA_UPDATED_EVENT));

          if (isDesktopChatViewport()) {
            setDesktopConversationId(conv.id);
          } else {
            navigate(`/chat/${conv.id}`);
          }
        }}
        onProjectCreated={(project) => {
          setProjects((prev) => [project, ...prev]);
          setView("projects");
          setSelectedProjectId(project.id);
          setIsCreateModalOpen(false);
          setCreateConversationProjectId(null);
          window.dispatchEvent(new Event(CHAT_METADATA_UPDATED_EVENT));
        }}
      />

      {/* Edição rápida de nome/descrição do projeto. */}
      <EditProjectModal
        project={projectToEdit}
        onClose={() => setProjectToEdit(null)}
        onUpdated={(updatedProject) => {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === updatedProject.id ? updatedProject : project
            )
          );

          window.dispatchEvent(new Event(CHAT_METADATA_UPDATED_EVENT));

          setProjectToEdit(null);
        }}
      />

      {/* Confirmação separada para evitar exclusão acidental de projeto. */}
      <DeleteProjectModal
        project={projectToDelete}
        isDeleting={isDeletingProject}
        onClose={() => {
          if (!isDeletingProject) {
            setProjectToDelete(null);
          }
        }}
        onConfirm={confirmDeleteProject}
      />
    </main>
  );

}


/* ==========================================================================
 * Sidebar desktop estilo ChatGPT
 * ========================================================================== */
function DesktopChatSidebarSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <p className="truncate text-[0.62rem] font-black uppercase tracking-[0.14em] text-soft">
          {title}
        </p>

        {typeof count === "number" && (
          <span className="rounded-full border border-soft bg-surface-muted px-2 py-0.5 text-[0.58rem] font-black text-muted">
            {count}
          </span>
        )}
      </div>

      {children}
    </section>
  );
}

function DesktopSidebarConversationItem({
  conversation,
  lastAccessedAt,
  isSelected = false,
  isAxon = false,
  compact = false,
  onClick,
}: {
  conversation: ConversationData;
  lastAccessedAt?: string;
  isSelected?: boolean;
  isAxon?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const Icon = isAxon
    ? Bell
    : getConversationIcon(conversation.type as ConversationType);
  const formattedDate = useMemo(
    () => getConversationDisplayDate(conversation, lastAccessedAt),
    [conversation, lastAccessedAt]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full min-w-0 items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition active:scale-[0.99] ${
        isSelected
          ? "border-accent-soft bg-accent-soft shadow-card"
          : "border-transparent bg-transparent hover:border-soft hover:bg-surface-muted"
      } ${compact ? "pl-2" : ""}`}
    >
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-xl border ${
          compact ? "h-8 w-8" : "h-9 w-9"
        } ${
          isAxon
            ? "border-accent-soft bg-[var(--accent-strong)] text-white shadow-card"
            : isSelected
            ? "border-accent-soft bg-surface-elevated text-accent"
            : "border-soft bg-surface-elevated text-muted group-hover:text-accent"
        }`}
      >
        {isAxon ? (
          <img src="/axon-logo.svg" alt="Axon" className="h-6 w-6 object-contain" />
        ) : (
          <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-xs font-black text-primary">
            {isAxon ? "Axon" : conversation.title}
          </span>

          <span className="shrink-0 text-[0.58rem] font-semibold text-soft">
            {formattedDate}
          </span>
        </span>

        <span className="mt-0.5 block truncate text-[0.68rem] leading-4 text-muted">
          {isAxon
            ? "Conversa principal"
            : conversation.last_message ||
              (conversation.type === "planning"
                ? "Planejamento"
                : conversation.type === "focus"
                ? "Foco"
                : conversation.type === "project"
                ? "Projeto"
                : "Geral")}
        </span>
      </span>
    </button>
  );
}

function DesktopSidebarProjectItem({
  project,
  conversations,
  isOpen,
  activeConversationId,
  lastAccessByConversation,
  onToggle,
  onSelectConversation,
  onCreateConversation,
  onEdit,
  onDelete,
}: {
  project: ProjectFolder;
  conversations: ConversationData[];
  isOpen: boolean;
  activeConversationId: string | null;
  lastAccessByConversation: LastAccessMap;
  onToggle: () => void;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (target && projectMenuRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <div ref={projectMenuRef} className="relative">
      <div
        className={`group relative overflow-visible rounded-2xl border transition ${
          isOpen
            ? "border-accent-soft bg-accent-soft"
            : "border-transparent hover:border-soft hover:bg-surface-muted"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full min-w-0 items-center gap-2.5 px-2.5 py-2 pr-20 text-left transition active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-elevated text-accent">
            <Briefcase className="h-4 w-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-black text-primary">
                {project.name}
              </span>

            </span>

            <span className="mt-0.5 block truncate text-[0.68rem] leading-4 text-muted">
              {project.description || "Projeto de conversas"}
            </span>
          </span>
        </button>

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen((current) => !current);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition active:scale-[0.96] ${
              isMenuOpen
                ? "border-accent-soft bg-[var(--accent-strong)] text-white shadow-card"
                : "border-soft bg-surface-elevated text-secondary hover:border-accent-soft hover:text-accent"
            }`}
            aria-label="Ações do projeto"
            title="Ações do projeto"
          >
            <MoreVertical className="h-4.5 w-4.5" />
          </button>

          <ChevronRight
            className={`h-4 w-4 text-soft transition ${
              isOpen ? "rotate-90 text-accent" : ""
            }`}
          />
        </div>

        {isMenuOpen && (
          <div className="absolute right-2 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-soft bg-surface-elevated p-1 shadow-soft backdrop-blur-2xl">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu();
                onCreateConversation();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-bold text-secondary transition hover:bg-surface-muted"
            >
              <Plus className="h-3.5 w-3.5 text-accent" />
              Nova conversa
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu();
                onEdit();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-bold text-secondary transition hover:bg-surface-muted"
            >
              <Edit3 className="h-3.5 w-3.5 text-accent" />
              Editar projeto
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu();
                onDelete();
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-bold text-red-600 transition hover:bg-red-500/10 dark:text-red-200/80"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir projeto
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="ml-4 mt-2 space-y-1.5 border-l border-[var(--border-soft)] pl-2.5">
          {conversations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-soft bg-surface-muted px-3 py-2 text-[0.68rem] leading-4 text-muted">
              Nenhuma conversa neste projeto.
            </p>
          ) : (
            conversations.map((conversation) => (
              <DesktopSidebarConversationItem
                key={conversation.id}
                conversation={conversation}
                lastAccessedAt={lastAccessByConversation[conversation.id]}
                isSelected={activeConversationId === conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DesktopSidebarEmpty({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ElementType;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-soft bg-surface-muted px-3 py-4 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
        <Icon className="h-4 w-4" />
      </div>

      <p className="text-xs font-black text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-[14rem] text-[0.68rem] leading-4 text-muted">
        {description}
      </p>

      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-3 text-[0.68rem] font-black text-white transition active:scale-[0.98]"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function DesktopChatSidebarLoading({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-soft bg-surface-muted text-center text-xs text-muted ${
        compact ? "p-3" : "p-5"
      }`}
    >
      {label}
    </div>
  );
}

/* ==========================================================================
 * Card contextual temporário
 * ========================================================================== */
function ChatIntroCard({ onHide }: { onHide: () => void }) {
  return (
    <section className="mb-4">
      <div className="relative overflow-hidden rounded-[2.15rem] border border-soft bg-surface-elevated p-5 text-primary shadow-card backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_54%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--accent-muted)] to-transparent" />

        <div className="relative">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.1em] text-accent">
              <Sparkles className="h-3 w-3" />
              Memória e contexto
            </div>

            <button
              type="button"
              onClick={onHide}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-soft bg-surface-muted text-soft transition active:scale-[0.96]"
              aria-label="Ocultar explicação"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <h1 className="max-w-[21rem] text-[1.75rem] font-black leading-[0.98] tracking-[-0.055em] text-primary">
            Organize suas conversas por assunto.
          </h1>

          <p className="mt-3 text-sm leading-6 text-muted">
            Crie chats separados para rotina, foco, projetos, estudos ou
            qualquer área que precise de acompanhamento.
          </p>

          <p className="mt-3 text-[0.68rem] leading-5 text-soft">
            Essa explicação desaparece automaticamente depois de{" "}
            {CHAT_INTRO_VISIBLE_DAYS} dias.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
 * Busca e alternância de visualização
 * ========================================================================== */
function ChatSearchPanel({
  search,
  isInsideProject,
  onSearchChange,
}: {
  search: string;
  view: "all" | "projects";
  isInsideProject: boolean;
  onSearchChange: (value: string) => void;
  onViewChange: (value: "all" | "projects") => void;
}) {
  return (
    <section className="shrink-0">
      <label className="flex min-h-10 items-center gap-2.5 rounded-2xl border border-soft bg-surface-muted px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl">
        <Search className="h-4 w-4 text-soft" />

        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={
            isInsideProject
              ? "Buscar conversas e projetos..."
              : "Buscar conversas..."
          }
          className="w-full bg-transparent text-xs font-semibold text-primary outline-none placeholder:text-soft"
        />

        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-soft transition hover:bg-surface-elevated hover:text-secondary active:scale-[0.96]"
            aria-label="Limpar busca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>
    </section>
  );
}

/* ==========================================================================
 * Cabeçalho do projeto selecionado
 * ========================================================================== */
function SelectedProjectHeader({
  project,
  conversationCount,
  onBack,
  onCreateConversation,
}: {
  project: ProjectFolder;
  conversationCount: number;
  onBack: () => void;
  onCreateConversation: () => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-[1.65rem] border border-soft bg-surface-elevated p-4 text-primary shadow-card backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[var(--accent-muted)] to-transparent" />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-soft bg-surface-muted px-3 text-xs font-semibold text-secondary transition active:scale-[0.98]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Projetos
          </button>

          <span className="rounded-full border border-accent-soft bg-accent-soft px-3 py-1 text-[0.62rem] font-black text-accent">
            {conversationCount} {conversationCount === 1 ? "conversa" : "conversas"}
          </span>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
            <Briefcase className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-accent">
              Projeto
            </p>

            <h2 className="mt-1 truncate text-xl font-black leading-none tracking-[-0.045em] text-primary">
              {project.name}
            </h2>

            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
              {project.description || "Sem descrição"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCreateConversation}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft px-4 text-sm font-black text-accent transition active:scale-[0.98]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova conversa
        </button>
      </div>
    </article>
  );
}

/* ==========================================================================
 * Cards de conversa
 * ========================================================================== */

// Card genérico para conversa solta ou dentro de projeto.
function ConversationCard({
  conversation,
  lastAccessedAt,
  isFixed = false,
  isSelected = false,
  onClick,
}: {
  conversation: ConversationData;
  lastAccessedAt?: string;
  isFixed?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}) {

  const Icon = isFixed
    ? Bell
    : getConversationIcon(conversation.type as ConversationType);

  // Mostra a última atividade/acesso disponível, evitando usar a data de criação.
  const formattedDate = useMemo(
    () => getConversationDisplayDate(conversation, lastAccessedAt),
    [conversation, lastAccessedAt]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[1.7rem] border p-4 text-left shadow-card backdrop-blur-2xl transition active:scale-[0.99] ${
        isSelected
          ? "border-accent-soft bg-accent-soft"
          : isFixed
          ? "border-accent-soft bg-accent-soft"
          : conversation.archived
            ? "border-soft bg-surface-muted opacity-70"
            : "border-soft bg-surface-elevated"
      }`}
    >
      <div
        className={`relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border ${
          isFixed
            ? "border-accent-soft bg-surface-elevated text-accent"
            : "border-accent-soft bg-accent-soft text-accent"
        }`}
      >
        <Icon className="h-5 w-5" />

        {isFixed && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--surface-elevated)] bg-[var(--accent)] px-1 text-[0.58rem] font-bold text-white">
            1
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-primary">
              {conversation.title}
            </p>

            {isFixed && (
              <span className="shrink-0 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-accent">
                Fixo
              </span>
            )}
          </div>

          <p className="shrink-0 text-[0.68rem] text-soft">
            {formattedDate}
          </p>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <p className="truncate text-xs text-muted capitalize">
            {conversation.type === "general" ? "Geral" :
             conversation.type === "planning" ? "Planejamento" :
             conversation.type === "focus" ? "Foco" : "Projeto"}
          </p>

          {conversation.archived && (
            <span className="shrink-0 rounded-full border border-soft bg-surface-muted px-2 py-0.5 text-[0.6rem] font-semibold text-muted">
              Arquivada
            </span>
          )}
        </div>

        {conversation.last_message && (
          <p className="line-clamp-1 text-xs leading-5 text-muted">
            {conversation.last_message}
          </p>
        )}
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-soft" />
    </button>
  );
}

// Card especial para a conversa direta com o Axon, sempre fixa no topo da lista.
function AxonDirectConversationCard({
  conversation,
  lastAccessedAt,
  isSelected = false,
  onClick,
}: {
  conversation: ConversationData;
  lastAccessedAt?: string;
  isSelected?: boolean;
  onClick: () => void;
}) {
  const formattedDate = useMemo(
    () => getConversationDisplayDate(conversation, lastAccessedAt),
    [conversation, lastAccessedAt]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-[1.8rem] border border-accent-soft p-4 text-left text-primary shadow-card backdrop-blur-2xl transition active:scale-[0.99] ${
        isSelected ? "bg-accent-soft" : "bg-surface-elevated"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_58%)]" />

      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-[var(--accent-strong)] shadow-card">
        <img
          src="/axon-logo.svg"
          alt="Axon"
          className="h-8 w-8 object-contain"
        />
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-primary">
              Axon
            </p>

            <span className="shrink-0 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-accent">
              Canal do Axon
            </span>
          </div>

          <p className="shrink-0 text-[0.68rem] text-muted">
            {formattedDate}
          </p>
        </div>

        <p className="mb-2 truncate text-xs font-semibold text-accent">
          Conversa principal
        </p>

        {conversation.last_message && (
          <p className="line-clamp-1 text-xs leading-5 text-secondary">
            {conversation.last_message}
          </p>
        )}
      </div>

      <ChevronRight className="relative h-5 w-5 shrink-0 text-muted transition group-active:translate-x-0.5" />
    </button>
  );
}

// Ícone visual usado para diferenciar contexto geral, planejamento, foco e projeto.
function getConversationIcon(type: ConversationType) {
  if (type === "planning") return CalendarDays;
  if (type === "focus") return Focus;
  if (type === "project") return Briefcase;
  return MessageCircle;
}

/* ==========================================================================
 * Estado vazio do painel desktop
 * ========================================================================== */
function DesktopChatEmptyPane({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-8 py-8 text-center">
      <div className="max-w-[26rem]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-accent-soft bg-accent-soft text-accent shadow-card">
          <MessageCircle className="h-7 w-7" />
        </div>

        <h2 className="text-[2rem] font-black leading-[0.96] tracking-[-0.055em] text-primary">
          Escolha uma conversa.
        </h2>

        <p className="mx-auto mt-4 max-w-[21rem] text-sm leading-6 text-muted">
          Selecione um chat ou projeto na coluna da esquerda para manter a
          conversa aberta no painel principal.
        </p>

        <button
          type="button"
          onClick={onCreate}
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-black text-white shadow-card transition active:scale-[0.98]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova conversa
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
 * Modal de criação de conversa/projeto
 * ========================================================================== */
function CreateConversationModal({
  isOpen,
  defaultProjectId,
  defaultMode = "conversation",
  onClose,
  onCreated,
  onProjectCreated,
}: {
  isOpen: boolean;
  defaultProjectId?: string | null;
  defaultMode?: "conversation" | "project";
  onClose: () => void;
  onCreated: (conv: ConversationData) => void;
  onProjectCreated: (project: api.ChatProjectData) => void;
}) {
  const [createMode, setCreateMode] = useState<"conversation" | "project">(
    "conversation"
  );
  const [selectedType, setSelectedType] =
    useState<ConversationType>("general");
  const [title, setTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isInsideProject = Boolean(defaultProjectId);

  // Sempre reabre o modal limpo e respeitando o projeto de origem.
  useEffect(() => {
    if (!isOpen) return;

    setCreateMode(defaultProjectId ? "conversation" : defaultMode);
    setSelectedType(defaultProjectId ? "project" : "general");
    setTitle("");
    setProjectName("");
    setProjectDescription("");
    setFormError(null);
    setIsLoading(false);
  }, [isOpen, defaultProjectId, defaultMode]);

  if (!isOpen) return null;

  // Decide entre criar projeto, conversa solta ou conversa já vinculada ao projeto.
  async function handleCreate() {
    setFormError(null);

    if (createMode === "project" && !isInsideProject) {
      if (!projectName.trim()) {
        setFormError("Dê um nome para o projeto.");
        return;
      }

      setIsLoading(true);

      try {
        const project = await api.createChatProject({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
        });

        onProjectCreated(project);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Erro ao criar projeto");
      } finally {
        setIsLoading(false);
      }

      return;
    }

    const finalTitle = title.trim() || "Nova conversa";
    const finalType = defaultProjectId ? "project" : selectedType;

    setIsLoading(true);

    try {
      const conv = await api.createConversation(
        finalTitle,
        finalType,
        defaultProjectId ?? undefined
      );

      onCreated(conv);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar conversa");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="relative flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-soft bg-surface-elevated text-primary shadow-soft backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--accent-soft),transparent_50%)]" />

        <div className="relative border-b border-[var(--border-soft)] px-5 pb-4 pt-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
                <Plus className="h-3.5 w-3.5" />
                {isInsideProject
                  ? "Conversa do projeto"
                  : createMode === "project"
                  ? "Novo projeto"
                  : "Nova conversa"}
              </div>

              <h2 className="text-[1.65rem] font-black leading-[1.02] tracking-[-0.055em] text-primary">
                {isInsideProject
                  ? "Adicionar conversa"
                  : createMode === "project"
                  ? "Criar projeto"
                  : "Criar conversa"}
              </h2>

              <p className="mt-2 text-xs leading-5 text-muted">
                {isInsideProject
                  ? "A nova conversa ficará dentro deste projeto."
                  : createMode === "project"
                  ? "Agrupe conversas relacionadas em uma pasta própria."
                  : "Crie um chat separado para um assunto específico."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96] disabled:opacity-50"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!isInsideProject && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-soft bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setCreateMode("conversation")}
                className={`min-h-11 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                  createMode === "conversation"
                    ? "bg-[var(--accent-strong)] text-white shadow-card"
                    : "text-muted"
                }`}
              >
                Conversa
              </button>

              <button
                type="button"
                onClick={() => setCreateMode("project")}
                className={`min-h-11 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                  createMode === "project"
                    ? "bg-[var(--accent-strong)] text-white shadow-card"
                    : "text-muted"
                }`}
              >
                Projeto
              </button>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1" contentClassName="relative px-5 py-4">
          {createMode === "conversation" || isInsideProject ? (
            <div className="space-y-4">
              {!isInsideProject && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted">
                    Tipo de conversa
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <ConversationTypeButton
                      active={selectedType === "general"}
                      icon={MessageCircle}
                      label="Geral"
                      onClick={() => setSelectedType("general")}
                    />

                    <ConversationTypeButton
                      active={selectedType === "planning"}
                      icon={CalendarDays}
                      label="Planejamento"
                      onClick={() => setSelectedType("planning")}
                    />

                    <ConversationTypeButton
                      active={selectedType === "focus"}
                      icon={Focus}
                      label="Foco"
                      onClick={() => setSelectedType("focus")}
                    />
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-muted">
                  Nome da conversa
                </span>

                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  type="text"
                  placeholder={
                    isInsideProject
                      ? "Ex: Briefing, tarefas, decisões..."
                      : "Ex: Estudos, trabalho, rotina..."
                  }
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none transition placeholder:text-soft focus:border-accent-soft"
                />
              </label>

              {isInsideProject && (
                <div className="rounded-2xl border border-accent-soft bg-accent-soft p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-accent" />
                    <p className="text-sm font-semibold text-primary">
                      Dentro do projeto atual
                    </p>
                  </div>

                  <p className="text-xs leading-5 text-muted">
                    O Axon usará o contexto deste projeto para manter as
                    conversas mais organizadas.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-muted">
                  Nome do projeto
                </span>

                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  type="text"
                  placeholder="Ex: AXON WebApp"
                  className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none transition placeholder:text-soft focus:border-accent-soft"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-muted">
                  Descrição
                </span>

                <textarea
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Ex: Conversas sobre telas, fluxo, backend e decisões do produto."
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-soft bg-surface-muted px-4 py-3 text-sm leading-6 text-primary outline-none transition placeholder:text-soft focus:border-accent-soft"
                />
              </label>

              <div className="rounded-2xl border border-accent-soft bg-accent-soft p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-sm font-semibold text-primary">
                    Quando usar projetos
                  </p>
                </div>

                <p className="text-xs leading-5 text-muted">
                  Use projetos para reunir conversas que pertencem ao mesmo
                  tema, trabalho, estudo ou objetivo.
                </p>
              </div>
            </div>
          )}

          {formError && (
            <p className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-300">
              {formError}
            </p>
          )}
        </ScrollArea>

        <div className="relative border-t border-[var(--border-soft)] bg-surface-elevated px-5 py-4">
          <button
            type="button"
            onClick={handleCreate}
            disabled={isLoading}
            className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : createMode === "project" && !isInsideProject ? (
              <>
                Criar projeto
                <Briefcase className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Criar conversa
                <MessageCircle className="ml-2 h-4 w-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-6 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * Botão de tipo de conversa
 * ========================================================================== */
function ConversationTypeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[4.25rem] flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-[0.68rem] font-semibold transition active:scale-[0.98] ${
        active
          ? "border-accent-soft bg-accent-soft text-accent shadow-card"
          : "border-soft bg-surface-muted text-muted"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

/* ==========================================================================
 * Cards de projeto
 * ========================================================================== */
function ProjectFolderCard({
  project,
  count,
  onClick,
  onCreateConversation,
  onEdit,
  onDelete,
}: {
  project: ProjectFolder;
  count: number;
  onClick: () => void;
  onCreateConversation: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-[1.7rem] border border-soft bg-surface-elevated p-4 pr-14 text-left text-primary shadow-card backdrop-blur-2xl transition active:scale-[0.98]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[var(--accent-muted)] to-transparent" />

        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent-soft bg-accent-soft text-accent">
          <Briefcase className="h-5 w-5" />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="truncate text-base font-black tracking-[-0.035em] text-primary">
            {project.name}
          </p>

          <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted">
            {project.description || "Sem descrição"}
          </p>

          <div className="mt-2 inline-flex rounded-full border border-accent-soft bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">
            {count} {count === 1 ? "conversa" : "conversas"}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsMenuOpen((current) => !current);
        }}
        className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted shadow-card backdrop-blur-2xl transition active:scale-[0.96]"
        aria-label="Ações do projeto"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {isMenuOpen && (
        <div className="absolute right-4 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-2xl border border-soft bg-surface-elevated p-1 shadow-soft backdrop-blur-2xl">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen(false);
              onCreateConversation();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-secondary transition hover:bg-surface-muted active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 text-accent" />
            Nova conversa
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen(false);
              onEdit();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-secondary transition hover:bg-surface-muted active:scale-[0.98]"
          >
            <Edit3 className="h-4 w-4 text-accent" />
            Editar projeto
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen(false);
              onDelete();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-500/10 active:scale-[0.98] dark:text-red-200/80"
          >
            <Trash2 className="h-4 w-4" />
            Excluir projeto
          </button>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
 * Modal de edição de projeto
 * ========================================================================== */
function EditProjectModal({
  project,
  onClose,
  onUpdated,
}: {
  project: ProjectFolder | null;
  onClose: () => void;
  onUpdated: (project: ProjectFolder) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sincroniza o formulário sempre que um projeto diferente é escolhido.
  useEffect(() => {
    if (!project) return;

    setName(project.name ?? "");
    setDescription(project.description ?? "");
    setSubmitting(false);
    setFormError(null);
  }, [project]);

  if (!project) return null;

  // Envia apenas nome e descrição, mantendo as conversas do projeto intactas.
  async function handleSubmit() {
    if (!project) return;

    if (!name.trim()) {
      setFormError("Dê um nome para o projeto.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const updatedProject = await api.updateChatProject(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      onUpdated(updatedProject);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao atualizar projeto");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="relative flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-soft bg-surface-elevated text-primary shadow-soft backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.22),transparent_48%)]" />

        <div className="relative border-b border-[var(--border-soft)] px-5 pb-4 pt-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-soft bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
                <Edit3 className="h-3.5 w-3.5" />
                Projeto
              </div>

              <h2 className="text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.05em] text-primary">
                Editar projeto
              </h2>

              <p className="mt-2 text-xs leading-5 text-muted">
                Atualize o nome e a descrição deste projeto.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-soft bg-surface-muted text-muted transition active:scale-[0.96] disabled:opacity-50"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1" contentClassName="relative px-5 py-4">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Nome
              </span>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                type="text"
                className="min-h-[52px] w-full rounded-2xl border border-soft bg-surface-muted px-4 text-sm text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-muted">
                Descrição
              </span>

              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border border-soft bg-surface-muted px-4 py-3 text-sm leading-6 text-primary outline-none placeholder:text-soft focus:border-accent-soft"
              />
            </label>

            {formError && (
              <p className="text-xs font-medium text-rose-300">{formError}</p>
            )}
          </div>
        </ScrollArea>

        <div className="relative border-t border-[var(--border-soft)] bg-surface-elevated px-5 py-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                Salvar alterações
                <Edit3 className="ml-2 h-4 w-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-soft bg-surface-muted px-5 text-sm font-semibold text-secondary transition active:scale-[0.98] disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * Modal de exclusão de projeto
 * ========================================================================== */
function DeleteProjectModal({
  project,
  isDeleting,
  onClose,
  onConfirm,
}: {
  project: ProjectFolder | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!project) return null;

  return (
    <ConfirmDialog
      isOpen
      title="Excluir projeto?"
      description={
        <>
          <p>
            Essa ação vai excluir o projeto{" "}
            <span className="font-semibold text-primary">
              "{project.name}"
            </span>
            .
          </p>

          <div className="mt-5 rounded-[1.35rem] border border-soft bg-surface-muted p-3 text-left">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-soft">
              Atenção
            </p>

            <p className="mt-2 text-xs leading-5 text-muted">
              Confirme com o backend se as conversas serão mantidas fora do
              projeto ou excluídas junto com ele.
            </p>
          </div>
        </>
      }
      confirmLabel="Excluir"
      variant="danger"
      icon={Trash2}
      loading={isDeleting}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

/* ==========================================================================
 * Helpers finais
 * ========================================================================== */

// Compatibiliza conversas antigas/novas sem exigir project_id no tipo base.
function getConversationProjectId(conversation: ConversationData) {
  return (conversation as ProjectConversation).project_id ?? null;
}