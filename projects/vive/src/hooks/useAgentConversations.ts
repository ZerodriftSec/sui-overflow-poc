import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  createAgentConversation,
  loadAgentConversation,
  listAgentConversationMetas,
  readCachedConversationIndex,
  saveAgentConversation,
  toConversationMeta,
  type AgentConversation,
  type AgentConversationMeta,
  type StoredChatMessage,
} from "../lib/agent-conversation";
import type { ConversationScope } from "../lib/chat-scope";
import {
  conversationBucketKey,
  shouldAutoRestoreConversation,
} from "../lib/chat-scope";
import { getProject } from "../lib/project";
import { isConfigured } from "../lib/settings";
import { useSettings } from "../components/SettingsProvider";
import {
  persistWithControlModeWalrusPolicy,
  useControlModeWalrusSessionOptional,
} from "./useControlModeWalrusSession";
import { useWalrusStorage } from "./useWalrusStorage";

interface UseAgentConversationsOptions {
  projectId: string;
  scope: ConversationScope;
  contextTitle: string | null;
  modelId: string;
  enabled?: boolean;
}

interface UseAgentConversationsResult {
  conversations: AgentConversationMeta[];
  activeConversation: AgentConversation | null;
  messages: StoredChatMessage[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  setMessages: Dispatch<SetStateAction<StoredChatMessage[]>>;
  setModelId: (modelId: string) => void;
  createConversation: () => void;
  selectConversation: (id: string) => Promise<void>;
  persistConversation: (
    messages: StoredChatMessage[],
    options?: { title?: string; modelId?: string; silent?: boolean },
  ) => Promise<void>;
  refresh: () => void;
}

export function useAgentConversations({
  projectId,
  scope,
  contextTitle,
  modelId,
  enabled = true,
}: UseAgentConversationsOptions): UseAgentConversationsResult {
  const account = useCurrentAccount();
  const { settings } = useSettings();
  const walrusStorage = useWalrusStorage();
  const controlModeSession = useControlModeWalrusSessionOptional();
  const { getStorageContext } = walrusStorage;
  const project = getProject(projectId);
  const walrusPathPrefix = project?.walrusPathPrefix ?? "";

  const [conversations, setConversations] = useState<AgentConversationMeta[]>(
    () =>
      readCachedConversationIndex(walrusPathPrefix, scope)?.conversations ?? [],
  );
  const [activeConversation, setActiveConversation] =
    useState<AgentConversation | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeConversationRef = useRef<AgentConversation | null>(null);
  const messagesRef = useRef<StoredChatMessage[]>([]);
  const modelIdRef = useRef(modelId);
  const contextTitleRef = useRef(contextTitle);
  const conversationMapRef = useRef<Map<string, AgentConversation>>(new Map());
  const activeConversationIdRef = useRef<string | null>(null);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const getStorageContextRef = useRef(getStorageContext);
  const loadConversationContentRef = useRef<
    (meta: AgentConversationMeta) => Promise<AgentConversation | null>
  >(async () => null);
  const loadedScopeRef = useRef<string | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  function sortConversationMetas(
    metas: AgentConversationMeta[],
  ): AgentConversationMeta[] {
    return [...metas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function conversationMetasEqual(
    left: AgentConversationMeta[],
    right: AgentConversationMeta[],
  ): boolean {
    if (left.length !== right.length) return false;
    return left.every((item, index) => {
      const other = right[index];
      return (
        item.id === other.id &&
        item.title === other.title &&
        item.updatedAt === other.updatedAt &&
        item.blobId === other.blobId &&
        item.messageCount === other.messageCount
      );
    });
  }

  function setConversationsIfChanged(next: AgentConversationMeta[]): void {
    setConversations((current) =>
      conversationMetasEqual(current, next) ? current : next,
    );
  }

  function resetConversationScope(): void {
    activeConversationRef.current = null;
    activeConversationIdRef.current = null;
    conversationMapRef.current.clear();
    lastPersistedSnapshotRef.current = null;
    setActiveConversation(null);
    setMessages([]);
  }

  function snapshotMessages(nextMessages: StoredChatMessage[]): string {
    return JSON.stringify(nextMessages);
  }

  function isConversationDirty(nextMessages: StoredChatMessage[]): boolean {
    if (nextMessages.length === 0) return false;
    return snapshotMessages(nextMessages) !== lastPersistedSnapshotRef.current;
  }

  function markConversationPersisted(nextMessages: StoredChatMessage[]): void {
    lastPersistedSnapshotRef.current =
      nextMessages.length > 0 ? snapshotMessages(nextMessages) : null;
  }

  activeConversationRef.current = activeConversation;
  messagesRef.current = messages;
  modelIdRef.current = modelId;
  contextTitleRef.current = contextTitle;
  activeConversationIdRef.current = activeConversation?.id ?? null;
  getStorageContextRef.current = getStorageContext;

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const loadConversationContent = useCallback(
    async (meta: AgentConversationMeta): Promise<AgentConversation | null> => {
      const cached = conversationMapRef.current.get(meta.id);
      if (cached && (!meta.blobId || cached.blobId === meta.blobId)) {
        return cached;
      }

      const activeProject = getProject(projectId);
      if (!activeProject) return null;

      try {
        const ctx = await getStorageContextRef.current();
        const conversation = await loadAgentConversation(
          ctx,
          activeProject,
          scopeRef.current,
          meta,
        );
        if (!conversation) return null;
        conversationMapRef.current.set(conversation.id, conversation);
        return conversation;
      } catch {
        return null;
      }
    },
    [projectId],
  );
  loadConversationContentRef.current = loadConversationContent;

  const persistConversation = useCallback(
    async (
      nextMessages: StoredChatMessage[],
      options?: { title?: string; modelId?: string; silent?: boolean },
    ) => {
      if (!enabled || !account?.address) return;
      if (nextMessages.length === 0) return;
      if (!options?.title && !isConversationDirty(nextMessages)) return;

      if (!isConfigured(settings)) return;

      const activeProject = getProject(projectId);
      if (!activeProject) return;

      const currentScope = scopeRef.current;
      let conversation = activeConversationRef.current;
      if (!conversation) {
        conversation = createAgentConversation({
          scope: currentScope,
          contextTitle,
          modelId: options?.modelId ?? modelIdRef.current,
        });
      }

      const updatedConversation: AgentConversation = {
        ...conversation,
        scope: currentScope,
        title: options?.title ?? conversation.title,
        contextTitle: contextTitle ?? conversation.contextTitle,
        modelId: options?.modelId ?? modelIdRef.current,
        messages: nextMessages,
      };

      if (!options?.silent) {
        setSaving(true);
      }
      setError(null);
      try {
        await persistWithControlModeWalrusPolicy(
          controlModeSession,
          getStorageContextRef.current,
          async (ctx) => {
            const saved = await saveAgentConversation(
              ctx,
              activeProject,
              updatedConversation,
            );
            conversationMapRef.current.set(saved.id, saved);
            markConversationPersisted(saved.messages);
            if (activeConversationRef.current?.id === conversation.id) {
              setActiveConversation(saved);
              setMessages(saved.messages);
            }
            setConversations((current) => {
              const meta = toConversationMeta(saved);
              const existingIndex = current.findIndex(
                (item) => item.id === saved.id,
              );
              const next =
                existingIndex >= 0
                  ? current.map((item, index) =>
                      index === existingIndex ? meta : item,
                    )
                  : [meta, ...current];
              return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            });
          },
        );
      } catch (err) {
        if (!options?.silent) {
          setError(
            err instanceof Error ? err.message : "Failed to save conversation",
          );
        }
      } finally {
        if (!options?.silent) {
          setSaving(false);
        }
      }
    },
    [account?.address, contextTitle, controlModeSession, enabled, projectId, settings],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationRef.current?.id) return;

      const currentMessages = messagesRef.current;
      if (isConversationDirty(currentMessages)) {
        void persistConversation(currentMessages, { silent: true });
      }

      const meta = conversations.find((conversation) => conversation.id === id);
      if (!meta) return;

      setLoading(true);
      let conversation: AgentConversation | null = null;
      try {
        conversation = await loadConversationContent(meta);
      } finally {
        setLoading(false);
      }

      if (!conversation) {
        setError(
          "Failed to load conversation. The saved transcript could not be retrieved from Walrus.",
        );
        return;
      }

      setActiveConversation(conversation);
      setMessages(conversation.messages);
      markConversationPersisted(conversation.messages);
      setError(null);
    },
    [conversations, loadConversationContent, persistConversation],
  );

  const createConversation = useCallback(() => {
    const currentMessages = messagesRef.current;
    if (isConversationDirty(currentMessages)) {
      void persistConversation(currentMessages, { silent: true });
    }

    const conversation = createAgentConversation({
      scope: scopeRef.current,
      contextTitle,
      modelId: modelIdRef.current,
    });
    conversationMapRef.current.set(conversation.id, conversation);
    setActiveConversation(conversation);
    setMessages([]);
    lastPersistedSnapshotRef.current = null;
    setError(null);
  }, [contextTitle, persistConversation]);

  useEffect(() => {
    const bucketKey = conversationBucketKey(scope);
    const scopeBucket = `${projectId}:${bucketKey}`;

    if (!enabled || !account?.address) {
      loadedScopeRef.current = null;
      setConversations([]);
      resetConversationScope();
      return;
    }

    const activeProject = getProject(projectId);
    if (!activeProject) {
      loadedScopeRef.current = null;
      setConversations([]);
      resetConversationScope();
      setError("Project not found");
      return;
    }

    const scopedProject = activeProject;
    const scopeChanged = loadedScopeRef.current !== scopeBucket;
    if (scopeChanged) {
      loadedScopeRef.current = scopeBucket;
      resetConversationScope();

      const cached = readCachedConversationIndex(
        scopedProject.walrusPathPrefix,
        scope,
      );
      setConversationsIfChanged(
        cached?.conversations.length
          ? sortConversationMetas(cached.conversations)
          : [],
      );
    } else if (
      activeConversationRef.current &&
      activeConversationRef.current.scope.behaviorMode !== scope.behaviorMode
    ) {
      setActiveConversation((current) =>
        current
          ? { ...current, scope: { ...current.scope, behaviorMode: scope.behaviorMode } }
          : current,
      );
      return;
    }

    if (!isConfigured(settings)) {
      if (!activeConversationRef.current) {
        const conversation = createAgentConversation({
          scope,
          contextTitle: contextTitleRef.current,
          modelId: modelIdRef.current,
        });
        conversationMapRef.current.set(conversation.id, conversation);
        setActiveConversation(conversation);
        setMessages([]);
      }
      return;
    }

    if (!activeConversationRef.current) {
      const conversation = createAgentConversation({
        scope,
        contextTitle: contextTitleRef.current,
        modelId: modelIdRef.current,
      });
      conversationMapRef.current.set(conversation.id, conversation);
      setActiveConversation(conversation);
      setMessages([]);
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ctx = await getStorageContextRef.current();
        const metas = await listAgentConversationMetas(
          ctx,
          scopedProject,
          scope,
        );
        if (cancelled) return;

        setConversationsIfChanged(sortConversationMetas(metas));

        const autoRestore = shouldAutoRestoreConversation(scope);
        if (autoRestore) {
          const preferredId = activeConversationIdRef.current;
          const preferredMeta =
            metas.find((meta) => meta.id === preferredId) ?? metas[0] ?? null;

          if (preferredMeta) {
            const conversation =
              await loadConversationContentRef.current(preferredMeta);
            if (cancelled) return;

            if (conversation) {
              setActiveConversation(conversation);
              setMessages(conversation.messages);
              markConversationPersisted(conversation.messages);
              return;
            }
          }
        } else if (activeConversationRef.current) {
          return;
        }

        const conversation = createAgentConversation({
          scope,
          contextTitle: contextTitleRef.current,
          modelId: modelIdRef.current,
        });
        conversationMapRef.current.set(conversation.id, conversation);
        setActiveConversation(conversation);
        setMessages([]);
      } catch (err) {
        if (!cancelled) {
          const fallback = createAgentConversation({
            scope,
            contextTitle: contextTitleRef.current,
            modelId: modelIdRef.current,
          });
          conversationMapRef.current.set(fallback.id, fallback);
          setActiveConversation(fallback);
          setMessages([]);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load conversations",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [account?.address, enabled, scope, projectId, refreshKey, settings]);

  const setModelId = useCallback((nextModelId: string) => {
    modelIdRef.current = nextModelId;
    setActiveConversation((current) =>
      current ? { ...current, modelId: nextModelId } : current,
    );
  }, []);

  return {
    conversations,
    activeConversation,
    messages,
    loading,
    saving,
    error,
    setMessages,
    setModelId,
    createConversation,
    selectConversation,
    persistConversation,
    refresh,
  };
}
