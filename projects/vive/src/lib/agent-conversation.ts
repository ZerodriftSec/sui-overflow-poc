import { z } from "zod";
import type { ConversationScope } from "./chat-scope";
import {
  conversationBucketKey,
  legacyConversationBucketKeys,
} from "./chat-scope";
import { prepareChatImageForPersistence } from "./chat-image-storage";
import type { Project } from "./project";
import {
  conversationScopeIndexPath,
  conversationScopePath,
  legacyConversationScopeIndexPath,
  legacyConversationScopePaths,
} from "./storage/paths";
import {
  readProjectTextAtPath,
  writeProjectPathsAtPaths,
  type WalrusStorageContext,
} from "./storage/walrus-storage";
import { downloadAndDecryptText } from "./walrus/download-decrypt";

const mediaModeSchema = z.enum(["text", "image", "video"]);
const behaviorModeSchema = z.enum(["ask", "draft", "edit", "agent"]);

const conversationScopeSchema = z.object({
  mediaMode: mediaModeSchema,
  behaviorMode: behaviorModeSchema,
  skillId: z.string().nullable(),
});

const storedChatImageSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  dataUrl: z.string().optional(),
  imageBlobId: z.string().optional(),
  imageBlobObjectId: z.string().optional(),
});

const storedChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  rawContent: z.string().optional(),
  scriptOutput: z.string().optional(),
  promptOutput: z.string().optional(),
  attachedImages: z.array(storedChatImageSchema).optional(),
});

const agentConversationDocumentSchema = z.object({
  type: z.literal("agent-conversation"),
  id: z.string(),
  scope: conversationScopeSchema,
  title: z.string(),
  contextTitle: z.string().nullish().transform((value) => value ?? null),
  modelId: z.string(),
  messages: z.array(storedChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const conversationIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  blobId: z.string(),
  messageCount: z.number().int().nonnegative(),
});

const agentConversationIndexSchema = z.object({
  type: z.literal("agent-conversation-index"),
  scope: conversationScopeSchema,
  walrusPathPrefix: z.string(),
  conversations: z.array(conversationIndexEntrySchema),
  updatedAt: z.string(),
});

export type StoredChatImage = z.infer<typeof storedChatImageSchema>;
export type StoredChatMessage = z.infer<typeof storedChatMessageSchema>;
export type AgentConversation = z.infer<typeof agentConversationDocumentSchema> & {
  blobId?: string;
};

export type AgentConversationMeta = z.infer<typeof conversationIndexEntrySchema>;

export type AgentConversationIndex = z.infer<
  typeof agentConversationIndexSchema
> & {
  blobId?: string;
};

const INDEX_CACHE_PREFIX = "agent-conversation-index:";

export function conversationTitleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New conversation";
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

function indexCacheKey(walrusPathPrefix: string, scope: ConversationScope): string {
  return `${INDEX_CACHE_PREFIX}${walrusPathPrefix}:${conversationBucketKey(scope)}`;
}

export function readCachedConversationIndex(
  walrusPathPrefix: string,
  scope: ConversationScope,
): AgentConversationIndex | null {
  try {
    const raw = localStorage.getItem(indexCacheKey(walrusPathPrefix, scope));
    if (!raw) return null;
    return agentConversationIndexSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCachedConversationIndex(index: AgentConversationIndex): void {
  localStorage.setItem(
    indexCacheKey(index.walrusPathPrefix, index.scope),
    JSON.stringify({
      type: index.type,
      scope: index.scope,
      walrusPathPrefix: index.walrusPathPrefix,
      conversations: index.conversations,
      updatedAt: index.updatedAt,
    }),
  );
}

export function clearAgentConversationIndexCache(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(INDEX_CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function createAgentConversation(input: {
  scope: ConversationScope;
  contextTitle: string | null;
  modelId: string;
}): AgentConversation {
  const now = new Date().toISOString();
  return {
    type: "agent-conversation",
    id: crypto.randomUUID(),
    scope: input.scope,
    title: "New conversation",
    contextTitle: input.contextTitle,
    modelId: input.modelId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function prepareMessagesForPersistence(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
  messages: StoredChatMessage[],
  conversationId: string,
): Promise<StoredChatMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (!message.attachedImages?.length) {
        return message;
      }

      const attachedImages = await Promise.all(
        message.attachedImages.map((image, imageIndex) =>
          prepareChatImageForPersistence(ctx, image, {
            projectId: project.id,
            walrusPathPrefix: project.walrusPathPrefix,
            scope,
            conversationId,
            messageId: message.id,
            imageIndex,
          }),
        ),
      );

      return {
        ...message,
        attachedImages,
      };
    }),
  );
}

function serializeAgentConversation(conversation: AgentConversation): string {
  return JSON.stringify(
    {
      type: "agent-conversation" as const,
      id: conversation.id,
      scope: conversation.scope,
      title: conversation.title,
      contextTitle: conversation.contextTitle,
      modelId: conversation.modelId,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    null,
    2,
  );
}

function serializeConversationIndex(index: AgentConversationIndex): string {
  return JSON.stringify(
    {
      type: "agent-conversation-index" as const,
      scope: index.scope,
      walrusPathPrefix: index.walrusPathPrefix,
      conversations: index.conversations,
      updatedAt: index.updatedAt,
    },
    null,
    2,
  );
}

export function parseAgentConversation(text: string): AgentConversation | null {
  try {
    return agentConversationDocumentSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

function parseConversationIndex(text: string): AgentConversationIndex | null {
  try {
    return agentConversationIndexSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** @internal Exported for unit tests. */
export function parseLegacyBlobRefMarker(text: string): string | null {
  const legacyBlobRefMarkerSchema = z.object({
    type: z.literal("blob-ref"),
    blobId: z.string(),
  });

  try {
    const parsed = legacyBlobRefMarkerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.blobId : null;
  } catch {
    return null;
  }
}

async function downloadProjectTextBlob(
  ctx: WalrusStorageContext,
  blobId: string,
): Promise<string | null> {
  const trimmed = blobId.trim();
  if (!trimmed) return null;

  try {
    return await downloadAndDecryptText({
      blobId: trimmed,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      projectId: ctx.vault.projectId,
      accessRegistryId: ctx.vault.accessRegistryId,
    });
  } catch {
    return null;
  }
}

/** Resolve on-chain path text, including legacy blob-ref pointer files. */
export async function resolveStoredProjectText(
  ctx: WalrusStorageContext,
  text: string | null,
  fallbackBlobId?: string,
): Promise<string | null> {
  if (text) {
    const legacyBlobId = parseLegacyBlobRefMarker(text);
    if (legacyBlobId) {
      return downloadProjectTextBlob(ctx, legacyBlobId);
    }
    return text;
  }

  if (fallbackBlobId?.trim()) {
    return downloadProjectTextBlob(ctx, fallbackBlobId);
  }

  return null;
}

function createEmptyConversationIndex(
  walrusPathPrefix: string,
  scope: ConversationScope,
): AgentConversationIndex {
  return {
    type: "agent-conversation-index",
    scope,
    walrusPathPrefix,
    conversations: [],
    updatedAt: new Date(0).toISOString(),
  };
}

const conversationIndexInflight = new Map<
  string,
  Promise<AgentConversationIndex>
>();

export async function loadConversationIndex(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
): Promise<AgentConversationIndex> {
  const key = `${project.walrusPathPrefix}:${conversationBucketKey(scope)}`;
  const inflight = conversationIndexInflight.get(key);
  if (inflight) return inflight;

  const promise = loadConversationIndexInner(ctx, project, scope).finally(() => {
    conversationIndexInflight.delete(key);
  });
  conversationIndexInflight.set(key, promise);
  return promise;
}

async function loadConversationIndexInner(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
): Promise<AgentConversationIndex> {
  const cached = readCachedConversationIndex(project.walrusPathPrefix, scope);

  const rawText = await readProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    conversationScopeIndexPath(project.id, scope),
  );
  const text = await resolveStoredProjectText(ctx, rawText);

  if (text) {
    const parsed = parseConversationIndex(text);
    if (parsed?.conversations.length) {
      const merged = mergeIndexBlobIdsFromCache(parsed, cached);
      writeCachedConversationIndex(merged);
      return merged;
    }
  }

  const legacy = await loadLegacyConversationIndex(ctx, project, scope);
  if (legacy) {
    writeCachedConversationIndex(legacy);
    return legacy;
  }

  if (cached?.conversations.length) {
    return cached;
  }

  return createEmptyConversationIndex(project.walrusPathPrefix, scope);
}

/** Keep Walrus blob ids from cache when the on-chain index was saved before refs existed. */
function mergeIndexBlobIdsFromCache(
  fromChain: AgentConversationIndex,
  cached: AgentConversationIndex | null,
): AgentConversationIndex {
  if (!cached?.conversations.length) return fromChain;

  const cachedById = new Map(
    cached.conversations.map((meta) => [meta.id, meta] as const),
  );

  return {
    ...fromChain,
    conversations: fromChain.conversations.map((meta) => {
      if (meta.blobId.trim()) return meta;
      const cachedMeta = cachedById.get(meta.id);
      if (!cachedMeta?.blobId.trim()) return meta;
      return { ...meta, blobId: cachedMeta.blobId };
    }),
  };
}

function mergeConversationMetas(
  metas: AgentConversationMeta[],
): AgentConversationMeta[] {
  const byId = new Map<string, AgentConversationMeta>();
  for (const meta of metas) {
    const existing = byId.get(meta.id);
    if (!existing || meta.updatedAt.localeCompare(existing.updatedAt) > 0) {
      byId.set(meta.id, meta);
    }
  }
  return [...byId.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

async function loadLegacyConversationIndex(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
): Promise<AgentConversationIndex | null> {
  const mergedMetas: AgentConversationMeta[] = [];
  let latestUpdatedAt = new Date(0).toISOString();

  for (const bucketKey of legacyConversationBucketKeys(scope)) {
    const legacyRawText = await readProjectTextAtPath(
      ctx,
      project.walrusPathPrefix,
      legacyConversationScopeIndexPath(project.id, bucketKey),
    );
    const legacyText = await resolveStoredProjectText(ctx, legacyRawText);
    if (!legacyText) continue;

    const parsed = parseConversationIndex(legacyText);
    if (!parsed?.conversations.length) continue;

    mergedMetas.push(...parsed.conversations);
    if (parsed.updatedAt.localeCompare(latestUpdatedAt) > 0) {
      latestUpdatedAt = parsed.updatedAt;
    }
  }

  if (mergedMetas.length === 0) return null;

  return {
    type: "agent-conversation-index",
    scope,
    walrusPathPrefix: project.walrusPathPrefix,
    conversations: mergeConversationMetas(mergedMetas),
    updatedAt: latestUpdatedAt,
  };
}

export async function loadAgentConversation(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
  meta: AgentConversationMeta,
): Promise<AgentConversation | null> {
  const pathsToTry = [
    conversationScopePath(project.id, scope, meta.id),
    ...legacyConversationScopePaths(project.id, scope, meta.id),
  ];

  for (const relativePath of pathsToTry) {
    const rawText = await readProjectTextAtPath(
      ctx,
      project.walrusPathPrefix,
      relativePath,
    );
    const text = await resolveStoredProjectText(ctx, rawText, meta.blobId);
    if (!text) continue;

    const conversation = parseAgentConversation(text);
    if (!conversation || conversation.id !== meta.id) continue;

    return {
      ...conversation,
      blobId: meta.blobId || conversation.blobId,
    };
  }

  if (meta.blobId.trim()) {
    const text = await resolveStoredProjectText(ctx, null, meta.blobId);
    if (text) {
      const conversation = parseAgentConversation(text);
      if (conversation && conversation.id === meta.id) {
        return {
          ...conversation,
          blobId: meta.blobId,
        };
      }
    }
  }

  return null;
}

export async function listAgentConversationMetas(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
): Promise<AgentConversationMeta[]> {
  const index = await loadConversationIndex(ctx, project, scope);
  return [...index.conversations].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function listAgentConversations(
  ctx: WalrusStorageContext,
  project: Project,
  scope: ConversationScope,
): Promise<AgentConversation[]> {
  const metas = await listAgentConversationMetas(ctx, project, scope);
  const conversations = await Promise.all(
    metas.map(async (meta) => {
      try {
        return await loadAgentConversation(ctx, project, scope, meta);
      } catch {
        return null;
      }
    }),
  );

  return conversations.filter(
    (conversation): conversation is AgentConversation => conversation !== null,
  );
}

export async function saveAgentConversation(
  ctx: WalrusStorageContext,
  project: Project,
  conversation: AgentConversation,
): Promise<AgentConversation> {
  const updatedAt = new Date().toISOString();

  const preparedMessages = await prepareMessagesForPersistence(
    ctx,
    project,
    conversation.scope,
    conversation.messages,
    conversation.id,
  );

  const payload: AgentConversation = {
    ...conversation,
    messages: preparedMessages,
    updatedAt,
  };

  const conversationRelativePath = conversationScopePath(
    project.id,
    conversation.scope,
    conversation.id,
  );
  const indexRelativePath = conversationScopeIndexPath(
    project.id,
    conversation.scope,
  );
  const conversationText = serializeAgentConversation(payload);

  const index = await loadConversationIndex(ctx, project, conversation.scope);
  const entry: AgentConversationMeta = {
    id: payload.id,
    title: payload.title,
    updatedAt,
    blobId: "",
    messageCount: payload.messages.length,
  };

  const existingIndex = index.conversations.findIndex(
    (item) => item.id === payload.id,
  );
  const conversations =
    existingIndex >= 0
      ? index.conversations.map((item, itemIndex) =>
          itemIndex === existingIndex ? entry : item,
        )
      : [entry, ...index.conversations];

  const indexPayload: AgentConversationIndex = {
    ...index,
    conversations: conversations.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    updatedAt,
  };

  writeCachedConversationIndex(indexPayload);

  const refs = await writeProjectPathsAtPaths(ctx, project.walrusPathPrefix, [
    { relativePath: conversationRelativePath, text: conversationText },
    {
      relativePath: indexRelativePath,
      text: serializeConversationIndex(indexPayload),
    },
  ]);

  const conversationRef = refs[0];
  const indexRef = refs[1];
  const saved: AgentConversation = {
    ...payload,
    blobId: conversationRef?.blobId,
  };

  const savedIndexPayload: AgentConversationIndex = {
    ...indexPayload,
    conversations: indexPayload.conversations.map((item) =>
      item.id === saved.id
        ? { ...item, blobId: conversationRef?.blobId ?? item.blobId }
        : item,
    ),
  };

  writeCachedConversationIndex({
    ...savedIndexPayload,
    blobId: indexRef?.blobId,
  });

  return saved;
}

export function toConversationMeta(
  conversation: AgentConversation,
): AgentConversationMeta {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    blobId: conversation.blobId ?? "",
    messageCount: conversation.messages.length,
  };
}
