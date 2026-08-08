import type { SealClient, SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import {
  buildCreateDirectoryTransaction,
  buildFileMutationTransaction,
  type FileWriteOp,
  type VaultContext,
  writeCachedVaultContext,
} from "../vault";
import {
  downloadAndDecryptBytes,
} from "../walrus/download-decrypt";
import { encryptAndUploadBytes } from "../walrus/encrypt-upload";
import { isWalrusBlobNotFoundError } from "../walrus/provider-service";
import {
  bytesToUtf8Vector,
  computeNameHash,
  contentHash,
  nameHashToBytes,
} from "./name-hash";
import {
  clearAllPathCaches,
  clearPathCache,
  createEmptyPathCache,
  normalizeLogicalPath,
  parentLogicalPath,
  readPathCache,
  removePathCacheEntry,
  upsertPathCacheEntry,
  writePathCache,
  type PathCache,
} from "./path-cache";
import {
  resolveCurrentVersionBlobs,
  resolveFileAtLogicalPath,
  resolveFileObjectIdAtLogicalPath,
  resolvedFileToPathCacheEntry,
} from "./on-chain-path";
import {
  assetFolderSegmentForLogicalPath,
  fileEntryNameKey,
} from "./folder-placement";
import {
  buildFileMetadataDocument,
  serializeFileMetadataDocument,
} from "./file-metadata";
import { resolveChildDirectoryId } from "./on-chain-directory";
import {
  formatOnChainTransactionError,
  isInsufficientSuiBalanceError,
  OnChainFlushError,
} from "./on-chain-flush-error";
import type { WalrusBlobRef } from "./types";

export interface FailedOnChainFlush {
  projectId: string;
  error: string;
  insufficientBalance: boolean;
}

const failedOnChainFlushes = new Map<
  string,
  { ctx: WalrusStorageContext; error: string; insufficientBalance: boolean }
>();
const failedOnChainFlushSubscribers = new Set<() => void>();

function emitFailedOnChainFlushChange(): void {
  for (const subscriber of failedOnChainFlushSubscribers) {
    subscriber();
  }
}

export function getFailedOnChainFlush(
  projectId: string,
): FailedOnChainFlush | null {
  const entry = failedOnChainFlushes.get(projectId);
  if (!entry) return null;
  return {
    projectId: entry.ctx.vault.projectId,
    error: entry.error,
    insufficientBalance: entry.insufficientBalance,
  };
}

export function subscribeFailedOnChainFlush(listener: () => void): () => void {
  failedOnChainFlushSubscribers.add(listener);
  return () => {
    failedOnChainFlushSubscribers.delete(listener);
  };
}

export function registerFailedOnChainFlush(
  ctx: WalrusStorageContext,
  cause: unknown,
): void {
  failedOnChainFlushes.set(ctx.vault.projectId, {
    ctx,
    error: formatOnChainTransactionError(cause),
    insufficientBalance: isInsufficientSuiBalanceError(cause),
  });
  emitFailedOnChainFlushChange();
}

export function clearFailedOnChainFlush(projectId: string): void {
  if (failedOnChainFlushes.delete(projectId)) {
    emitFailedOnChainFlushChange();
  }
}

export async function retryFailedOnChainFlush(projectId: string): Promise<void> {
  const entry = failedOnChainFlushes.get(projectId);
  if (!entry) {
    throw new Error("No pending on-chain transaction to retry.");
  }
  await flushDeferredWalrusWrites(entry.ctx);
}

export type WalrusWriteMode = "immediate" | "deferred";

export interface ChainExecuteSummary {
  createdFileIds: string[];
  createdDirectoryIds?: string[];
  createdProjectIds?: string[];
}

export interface WalrusStorageContext {
  vault: VaultContext;
  sealClient: SealClient;
  sessionKey: SessionKey;
  suiClient: SealCompatibleClient;
  signAndExecute: (tx: Transaction) => Promise<ChainExecuteSummary | void>;
  /** When "deferred", on-chain mutations are queued until flush. */
  writeMode?: WalrusWriteMode;
}

interface PendingFileWrite {
  logicalPath: string;
  op: FileWriteOp;
  contentBlobId: string;
  metadataBlobId: string;
  mimeType: string;
}

const deferredPendingByCtx = new WeakMap<WalrusStorageContext, PendingFileWrite[]>();
const deferredDirtyContexts = new WeakSet<WalrusStorageContext>();
let deferredDirtyContextCount = 0;

let pathWritesInFlight = 0;
const pathWriteSubscribers = new Set<(busy: boolean) => void>();
let pathWriteLock: Promise<void> = Promise.resolve();

function emitPathWriteBusy(): void {
  const busy = pathWritesInFlight > 0;
  for (const subscriber of pathWriteSubscribers) {
    subscriber(busy);
  }
}

/** @deprecated Name kept for provider compatibility; tracks on-chain write busy state. */
export function subscribePathIndexWrites(
  listener: (busy: boolean) => void,
): () => void {
  pathWriteSubscribers.add(listener);
  listener(pathWritesInFlight > 0);
  return () => {
    pathWriteSubscribers.delete(listener);
  };
}

function beginWriteBusy(): void {
  pathWritesInFlight += 1;
  emitPathWriteBusy();
}

function endWriteBusy(): void {
  pathWritesInFlight = Math.max(0, pathWritesInFlight - 1);
  emitPathWriteBusy();
}

/**
 * Serializes only the fast, synchronous cache/queue mutation that follows a
 * prepared write. Deliberately does *not* wrap the slow network calls
 * (encryption, Walrus upload, on-chain resolution) so independent writes can
 * run those parts concurrently instead of queueing behind one another.
 */
function withPathMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = pathWriteLock.then(operation, operation);
  pathWriteLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Busy-tracked variant used when the whole operation (prepare + commit) should be serialized. */
function withPathWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  beginWriteBusy();
  return withPathMutationLock(operation).finally(endWriteBusy);
}

export function clearPathIndexCache(projectId?: string): void {
  if (deferredDirtyContextCount > 0) {
    return;
  }
  if (projectId) {
    clearPathCache(projectId);
    return;
  }
  clearAllPathCaches();
}

function loadCache(ctx: WalrusStorageContext): PathCache {
  return readPathCache(ctx.vault.projectId);
}

function saveCache(cache: PathCache): void {
  writePathCache(cache);
}

function guessMimeType(logicalPath: string): string {
  const lower = logicalPath.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

const CONVERSATIONS_DIRECTORY_SEGMENT = "conversations";

const childDirectoryCreateInflight = new Map<string, Promise<string>>();

/**
 * Resolve a root child Directory, creating the conversations folder on demand
 * when older workspaces were seeded without it.
 */
async function ensureChildDirectoryId(
  ctx: WalrusStorageContext,
  segmentName: string,
): Promise<string> {
  const existing = await resolveChildDirectoryId({
    client: ctx.suiClient,
    projectId: ctx.vault.projectId,
    parentDirectoryId: ctx.vault.rootDirectoryId,
    segmentName,
  });
  if (existing) return existing;

  if (segmentName !== CONVERSATIONS_DIRECTORY_SEGMENT) {
    throw new Error(`Missing on-chain "${segmentName}" directory`);
  }

  const inflightKey = `${ctx.vault.projectId}:${segmentName}`;
  const inflight = childDirectoryCreateInflight.get(inflightKey);
  if (inflight) return inflight;

  const createPromise = (async () => {
    const raced = await resolveChildDirectoryId({
      client: ctx.suiClient,
      projectId: ctx.vault.projectId,
      parentDirectoryId: ctx.vault.rootDirectoryId,
      segmentName,
    });
    if (raced) return raced;

    const tx = buildCreateDirectoryTransaction({
      parentDirectoryId: ctx.vault.rootDirectoryId,
      accessRegistryId: ctx.vault.accessRegistryId,
      projectId: ctx.vault.projectId,
      segmentName,
    });
    const summary = await ctx.signAndExecute(tx);
    const createdId = summary?.createdDirectoryIds?.[0]?.trim();
    if (createdId) return createdId;

    const resolved = await resolveChildDirectoryId({
      client: ctx.suiClient,
      projectId: ctx.vault.projectId,
      parentDirectoryId: ctx.vault.rootDirectoryId,
      segmentName,
    });
    if (!resolved) {
      throw new Error(
        `Created on-chain "${segmentName}" directory but could not resolve its object id`,
      );
    }
    return resolved;
  })().finally(() => {
    childDirectoryCreateInflight.delete(inflightKey);
  });

  childDirectoryCreateInflight.set(inflightKey, createPromise);
  return createPromise;
}

/**
 * Place files under the seeded on-chain folder Directory when the path maps to
 * one (e.g. Script/* → `script`, Conversations/* → `conversations`). Workspace
 * docs (manifest, registry) stay on the root Directory.
 */
async function resolveFileParentDirectory(
  ctx: WalrusStorageContext,
  logicalPath: string,
): Promise<{ directoryId: string; entryName: string }> {
  const entryName = fileEntryNameKey(logicalPath);
  const segment = assetFolderSegmentForLogicalPath(logicalPath);
  if (!segment) {
    return {
      directoryId: ctx.vault.rootDirectoryId,
      entryName,
    };
  }

  const folderId = await ensureChildDirectoryId(ctx, segment);

  return {
    directoryId: folderId,
    entryName,
  };
}

async function uploadEncryptedMetadataBlob(
  ctx: WalrusStorageContext,
  logicalPath: string,
  contentSize: number,
  mimeType: string,
): Promise<{ blobId: string; endEpoch: number; bytes: number[] }> {
  const document = buildFileMetadataDocument({
    logicalPath,
    contentSize,
    mimeType,
  });
  const upload = await encryptAndUploadBytes({
    sealClient: ctx.sealClient,
    projectId: ctx.vault.projectId,
    bytes: serializeFileMetadataDocument(document),
    ownerAddress: ctx.vault.ownerAddress,
  });
  return {
    blobId: upload.blobId,
    endEpoch: upload.endEpoch,
    bytes: bytesToUtf8Vector(upload.blobId),
  };
}

async function resolvePendingFileWriteTarget(
  ctx: WalrusStorageContext,
  path: string,
): Promise<{
  existing: PathCache["entries"][string] | undefined;
  opBase:
    | { type: "add-version"; fileId: string }
    | { type: "create-file"; directoryId: string; nameHash: number[] };
}> {
  const cache = loadCache(ctx);
  let existing = cache.entries[path];

  if (
    (!existing || existing.objectId.startsWith("pending:")) &&
    ctx.vault.rootDirectoryId
  ) {
    const resolved = await resolveFileAtLogicalPath(ctx.suiClient, {
      projectId: ctx.vault.projectId,
      rootDirectoryId: ctx.vault.rootDirectoryId,
      logicalPath: path,
    });
    if (resolved) {
      const entry = resolvedFileToPathCacheEntry(resolved);
      saveCache(upsertPathCacheEntry(cache, path, entry));
      existing = entry;
    }
  }

  if (existing?.kind === "file" && !existing.objectId.startsWith("pending:")) {
    return {
      existing,
      opBase: { type: "add-version", fileId: existing.objectId },
    };
  }

  const { directoryId, entryName } = await resolveFileParentDirectory(ctx, path);
  const nameHash = nameHashToBytes(computeNameHash(ctx.vault.projectId, entryName));
  return {
    existing,
    opBase: { type: "create-file", directoryId, nameHash },
  };
}

function buildPendingFileWrite(input: {
  logicalPath: string;
  contentBlobId: string;
  contentHash: number[];
  contentSize: number;
  metadata: { blobId: string; bytes: number[] };
  mimeType: string;
  walrusEndEpoch: number;
  opBase:
    | { type: "add-version"; fileId: string }
    | { type: "create-file"; directoryId: string; nameHash: number[] };
}): PendingFileWrite {
  const mimeTypeBytes = bytesToUtf8Vector(input.mimeType);
  const contentBlobIdVector = bytesToUtf8Vector(input.contentBlobId);

  if (input.opBase.type === "add-version") {
    return {
      logicalPath: input.logicalPath,
      contentBlobId: input.contentBlobId,
      metadataBlobId: input.metadata.blobId,
      mimeType: input.mimeType,
      op: {
        type: "add-version",
        fileId: input.opBase.fileId,
        contentBlobId: contentBlobIdVector,
        contentHash: input.contentHash,
        contentSize: input.contentSize,
        metadataBlobId: input.metadata.bytes,
        walrusEndEpoch: input.walrusEndEpoch,
        logicalPath: input.logicalPath,
      },
    };
  }

  return {
    logicalPath: input.logicalPath,
    contentBlobId: input.contentBlobId,
    metadataBlobId: input.metadata.blobId,
    mimeType: input.mimeType,
    op: {
      type: "create-file",
      directoryId: input.opBase.directoryId,
      nameHash: input.opBase.nameHash,
      mimeType: mimeTypeBytes,
      contentBlobId: contentBlobIdVector,
      contentHash: input.contentHash,
      contentSize: input.contentSize,
      metadataBlobId: input.metadata.bytes,
      walrusEndEpoch: input.walrusEndEpoch,
      logicalPath: input.logicalPath,
    },
  };
}

async function prepareFileWriteFromRef(
  ctx: WalrusStorageContext,
  logicalPath: string,
  ref: WalrusBlobRef,
  contentSize = 0,
): Promise<PendingFileWrite> {
  const path = normalizeLogicalPath(logicalPath);
  const mimeType = guessMimeType(path);
  // Content blob already exists — only upload the paired metadata blob.
  // Metadata upload and on-chain target resolution are independent, so run
  // them concurrently instead of paying for both round-trips in sequence.
  const [metadata, { opBase }] = await Promise.all([
    uploadEncryptedMetadataBlob(ctx, path, contentSize, mimeType),
    resolvePendingFileWriteTarget(ctx, path),
  ]);
  const contentHashBytes = contentHash(
    new TextEncoder().encode(ref.blobId),
  );

  return buildPendingFileWrite({
    logicalPath: path,
    contentBlobId: ref.blobId,
    contentHash: contentHashBytes,
    contentSize,
    metadata,
    mimeType,
    walrusEndEpoch: metadata.endEpoch,
    opBase,
  });
}

async function prepareFileWrite(
  ctx: WalrusStorageContext,
  logicalPath: string,
  bytes: Uint8Array,
): Promise<PendingFileWrite> {
  const path = normalizeLogicalPath(logicalPath);
  const mimeType = guessMimeType(path);
  // Content upload, metadata upload, and on-chain target resolution are all
  // independent of one another — running them concurrently cuts this write's
  // latency roughly in half (or more) versus awaiting each in turn.
  const [contentUpload, metadata, { opBase }] = await Promise.all([
    encryptAndUploadBytes({
      sealClient: ctx.sealClient,
      projectId: ctx.vault.projectId,
      bytes,
      ownerAddress: ctx.vault.ownerAddress,
    }),
    uploadEncryptedMetadataBlob(ctx, path, bytes.byteLength, mimeType),
    resolvePendingFileWriteTarget(ctx, path),
  ]);
  const contentHashBytes = contentHash(bytes);

  return buildPendingFileWrite({
    logicalPath: path,
    contentBlobId: contentUpload.blobId,
    contentHash: contentHashBytes,
    contentSize: bytes.byteLength,
    metadata,
    mimeType,
    walrusEndEpoch: contentUpload.endEpoch,
    opBase,
  });
}

function applyPendingToCache(
  ctx: WalrusStorageContext,
  pending: PendingFileWrite,
  fileObjectId?: string,
): void {
  let cache = loadCache(ctx);
  const existing = cache.entries[pending.logicalPath];
  const objectId =
    fileObjectId ??
    (pending.op.type === "add-version" ? pending.op.fileId : existing?.objectId);

  if (!objectId && pending.op.type === "create-file") {
    // File ID unknown until we resolve the dynamic field after create.
    return;
  }

  if (!objectId) return;

  const nameHashHex =
    pending.op.type === "create-file"
      ? toHex(Uint8Array.from(pending.op.nameHash))
      : (existing?.nameHashHex ?? "");

  cache = upsertPathCacheEntry(cache, pending.logicalPath, {
    kind: "file",
    objectId,
    parentDirectoryId:
      pending.op.type === "create-file"
        ? pending.op.directoryId
        : (existing?.parentDirectoryId ?? ctx.vault.rootDirectoryId),
    nameHashHex,
    contentBlobId: pending.contentBlobId,
    metadataBlobId: pending.metadataBlobId,
    mimeType: pending.mimeType,
    currentVersion: (existing?.currentVersion ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  });
  saveCache(cache);
}

async function resolveNewFileObjectId(
  ctx: WalrusStorageContext,
  pending: PendingFileWrite,
): Promise<string | null> {
  if (pending.op.type !== "create-file") {
    return pending.op.fileId;
  }
  return resolveFileObjectIdAtLogicalPath(ctx.suiClient, {
    projectId: ctx.vault.projectId,
    rootDirectoryId: ctx.vault.rootDirectoryId,
    logicalPath: pending.logicalPath,
  });
}

async function resolveCachedOrOnChainFile(
  ctx: WalrusStorageContext,
  logicalPath: string,
): Promise<{ contentBlobId: string } | null> {
  const path = normalizeLogicalPath(logicalPath);
  const cache = loadCache(ctx);
  const cached = cache.entries[path];

  // Optimistic deferred creates: trust the local cache until flush.
  if (
    cached?.kind === "file" &&
    cached.objectId.startsWith("pending:") &&
    cached.contentBlobId
  ) {
    return { contentBlobId: cached.contentBlobId };
  }

  // Trust a recent path-cache hit to avoid hammering Sui RPC on every asset open.
  // Revalidate when the entry is older than the TTL so updates still surface.
  const PATH_CACHE_TRUST_TTL_MS = 60_000;
  if (
    cached?.kind === "file" &&
    cached.objectId &&
    !cached.objectId.startsWith("pending:") &&
    cached.contentBlobId
  ) {
    const updatedAtMs = Date.parse(cached.updatedAt);
    const isFresh =
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs < PATH_CACHE_TRUST_TTL_MS;
    if (isFresh) {
      return { contentBlobId: cached.contentBlobId };
    }

    const fresh = await resolveCurrentVersionBlobs(ctx.suiClient, cached.objectId);
    if (fresh) {
      saveCache(
        upsertPathCacheEntry(cache, path, {
          ...cached,
          contentBlobId: fresh.contentBlobId,
          metadataBlobId: fresh.metadataBlobId,
          mimeType: fresh.mimeType,
          currentVersion: fresh.currentVersion,
          updatedAt: new Date().toISOString(),
        }),
      );
      return { contentBlobId: fresh.contentBlobId };
    }
  }

  const resolved = await resolveFileAtLogicalPath(ctx.suiClient, {
    projectId: ctx.vault.projectId,
    rootDirectoryId: ctx.vault.rootDirectoryId,
    logicalPath: path,
  });
  if (!resolved) {
    // Fall back to stale cache only when chain lookup is unavailable.
    if (cached?.kind === "file" && cached.contentBlobId) {
      return { contentBlobId: cached.contentBlobId };
    }
    return null;
  }

  saveCache(
    upsertPathCacheEntry(cache, path, resolvedFileToPathCacheEntry(resolved)),
  );
  return { contentBlobId: resolved.contentBlobId };
}

async function executePendingWrites(
  ctx: WalrusStorageContext,
  pending: PendingFileWrite[],
): Promise<void> {
  if (pending.length === 0) return;

  const tx = buildFileMutationTransaction({
    accessRegistryId: ctx.vault.accessRegistryId,
    mutations: pending.map((item) => item.op),
  });
  const summary = (await ctx.signAndExecute(tx)) ?? { createdFileIds: [] };
  const createdFileIds = [...(summary.createdFileIds ?? [])];

  // Prefer path resolution over effect order — createdFileIds may not match
  // mutation order when create-file is mixed with add-version in one PTB.
  // Each lookup is an independent RPC call, so resolve them concurrently
  // rather than one at a time.
  const resolvedIds = await Promise.all(
    pending.map((item) =>
      item.op.type === "create-file"
        ? resolveNewFileObjectId(ctx, item)
        : Promise.resolve(null),
    ),
  );

  pending.forEach((item, index) => {
    if (item.op.type === "create-file") {
      const resolvedId = resolvedIds[index];
      const fromEffects = createdFileIds.shift();
      const fileId = resolvedId ?? fromEffects ?? undefined;
      applyPendingToCache(ctx, item, fileId);
    } else {
      applyPendingToCache(ctx, item);
    }
  });

  writeCachedVaultContext(ctx.vault);
}

export function hasDeferredWalrusWrites(ctx: WalrusStorageContext): boolean {
  return deferredDirtyContexts.has(ctx);
}

export function createDeferredWalrusStorageContext(
  base: WalrusStorageContext,
): WalrusStorageContext {
  return {
    ...base,
    writeMode: "deferred",
  };
}

/** Persist all deferred on-chain file mutations in a single PTB. */
export async function flushDeferredWalrusWrites(
  ctx: WalrusStorageContext,
): Promise<void> {
  await withPathWriteLock(async () => {
    if (!deferredDirtyContexts.has(ctx)) {
      return;
    }

    const pending = deferredPendingByCtx.get(ctx) ?? [];

    try {
      await executePendingWrites(ctx, pending);
      deferredPendingByCtx.delete(ctx);
      deferredDirtyContexts.delete(ctx);
      deferredDirtyContextCount = Math.max(0, deferredDirtyContextCount - 1);
      clearFailedOnChainFlush(ctx.vault.projectId);
    } catch (error) {
      registerFailedOnChainFlush(ctx, error);
      throw new OnChainFlushError(ctx.vault.projectId, error);
    }
  });
}

export async function readBytesAtPath(
  ctx: WalrusStorageContext,
  logicalPath: string,
): Promise<Uint8Array | null> {
  const path = normalizeLogicalPath(logicalPath);
  const resolved = await resolveCachedOrOnChainFile(ctx, path);
  if (!resolved?.contentBlobId) return null;

  try {
    return await downloadAndDecryptBytes({
      blobId: resolved.contentBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      projectId: ctx.vault.projectId,
      accessRegistryId: ctx.vault.accessRegistryId,
    });
  } catch (error) {
    if (isWalrusBlobNotFoundError(error)) return null;
    throw error;
  }
}

export async function readTextAtPath(
  ctx: WalrusStorageContext,
  logicalPath: string,
): Promise<string | null> {
  const bytes = await readBytesAtPath(ctx, logicalPath);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

/**
 * Queue a prepared write onto the context's deferred pending list and reflect
 * it in the optimistic path cache. Synchronous aside from cache I/O, so it's
 * safe (and fast) to run inside the write lock.
 */
function enqueueDeferredPending(
  ctx: WalrusStorageContext,
  pending: PendingFileWrite,
): void {
  if (!deferredDirtyContexts.has(ctx)) {
    deferredDirtyContextCount += 1;
    deferredDirtyContexts.add(ctx);
    deferredPendingByCtx.set(ctx, []);
  }
  const queue = deferredPendingByCtx.get(ctx) ?? [];
  // Coalesce multiple writes to the same path into the latest mutation.
  const filtered = queue.filter((item) => item.logicalPath !== pending.logicalPath);
  filtered.push(pending);
  deferredPendingByCtx.set(ctx, filtered);

  // Optimistic cache for reads within the deferred session.
  if (pending.op.type === "add-version") {
    applyPendingToCache(ctx, pending);
  } else {
    // Synthetic temp id until flush resolves the shared File object.
    applyPendingToCache(ctx, pending, `pending:${pending.logicalPath}`);
  }
}

export async function writeBytesAtPath(
  ctx: WalrusStorageContext,
  logicalPath: string,
  bytes: Uint8Array,
): Promise<WalrusBlobRef> {
  beginWriteBusy();
  try {
    // Encryption + upload + on-chain target resolution are network-bound and
    // don't touch shared state, so they run outside the mutation lock — this
    // lets sibling writes (e.g. a Promise.all of several assets) upload in
    // parallel instead of queueing behind one another. The busy flag above
    // still spans the whole operation so callers gating on it wait correctly.
    const pending = await prepareFileWrite(ctx, logicalPath, bytes);

    return await withPathMutationLock(async () => {
      if (ctx.writeMode === "deferred") {
        enqueueDeferredPending(ctx, pending);
        return {
          blobId: pending.contentBlobId,
          blobObjectId: "",
        };
      }

      await executePendingWrites(ctx, [pending]);
      return {
        blobId: pending.contentBlobId,
        blobObjectId: "",
      };
    });
  } finally {
    endWriteBusy();
  }
}

export async function writeTextAtPath(
  ctx: WalrusStorageContext,
  logicalPath: string,
  text: string,
): Promise<WalrusBlobRef> {
  return writeBytesAtPath(ctx, logicalPath, new TextEncoder().encode(text));
}

export async function writeRegistryDocument(
  ctx: WalrusStorageContext,
  text: string,
): Promise<WalrusBlobRef> {
  // Registry is now a regular on-chain-indexed file path.
  return writeTextAtPath(ctx, "registry.json", text);
}

export async function uploadProjectTextToWalrus(
  ctx: WalrusStorageContext,
  text: string,
): Promise<WalrusBlobRef> {
  const upload = await encryptAndUploadBytes({
    sealClient: ctx.sealClient,
    projectId: ctx.vault.projectId,
    bytes: new TextEncoder().encode(text),
    ownerAddress: ctx.vault.ownerAddress,
  });
  return {
    blobId: upload.blobId,
    blobObjectId: upload.blobObjectId,
  };
}

export interface LogicalPathTextWrite {
  logicalPath: string;
  text: string;
}

/**
 * Batches multiple absolute-logical-path text writes into a single on-chain
 * transaction. Independent documents (e.g. a project manifest and the
 * project registry) can be created/updated together this way instead of each
 * paying for its own signAndExecute round trip.
 */
export async function writeTextsAtLogicalPaths(
  ctx: WalrusStorageContext,
  writes: LogicalPathTextWrite[],
): Promise<WalrusBlobRef[]> {
  if (writes.length === 0) return [];

  beginWriteBusy();
  try {
    // Each write's encrypt/upload/target-resolution is independent, so prepare
    // them all concurrently — the batch then costs as much as the slowest
    // single write instead of the sum of all of them.
    const prepared = await Promise.all(
      writes.map(async (write) => {
        const pending = await prepareFileWrite(
          ctx,
          write.logicalPath,
          new TextEncoder().encode(write.text),
        );
        return { pending, ref: { blobId: pending.contentBlobId, blobObjectId: "" } };
      }),
    );

    const pendingList = prepared.map((item) => item.pending);
    const refs = prepared.map((item) => item.ref);

    return await withPathMutationLock(async () => {
      if (ctx.writeMode === "deferred") {
        for (const pending of pendingList) {
          enqueueDeferredPending(ctx, pending);
        }
        return refs;
      }

      await executePendingWrites(ctx, pendingList);
      return refs;
    });
  } finally {
    endWriteBusy();
  }
}

export type ProjectPathWrite =
  | { relativePath: string; text: string }
  | { relativePath: string; bytes: Uint8Array }
  | { relativePath: string; ref: WalrusBlobRef };

export function fullProjectPath(walrusPathPrefix: string, relativePath: string): string {
  const prefix = walrusPathPrefix.endsWith("/")
    ? walrusPathPrefix
    : `${walrusPathPrefix}/`;
  return `${prefix}${relativePath.replace(/^\//, "")}`;
}

export async function writeProjectPathsAtPaths(
  ctx: WalrusStorageContext,
  walrusPathPrefix: string,
  writes: ProjectPathWrite[],
): Promise<WalrusBlobRef[]> {
  if (writes.length === 0) return [];

  beginWriteBusy();
  try {
    // Prepare every write concurrently — each upload/target-resolution is
    // independent, so a batch of N writes takes roughly as long as the
    // slowest one instead of the sum of all of them.
    const prepared = await Promise.all(
      writes.map(async (write) => {
        const logicalPath = fullProjectPath(walrusPathPrefix, write.relativePath);
        if ("ref" in write) {
          const pending = await prepareFileWriteFromRef(ctx, logicalPath, write.ref);
          return { pending, ref: write.ref };
        }

        const bytes =
          "text" in write ? new TextEncoder().encode(write.text) : write.bytes;
        const pending = await prepareFileWrite(ctx, logicalPath, bytes);
        return {
          pending,
          ref: { blobId: pending.contentBlobId, blobObjectId: "" },
        };
      }),
    );

    const pendingList = prepared.map((item) => item.pending);
    const refs = prepared.map((item) => item.ref);

    return await withPathMutationLock(async () => {
      if (ctx.writeMode === "deferred") {
        for (const pending of pendingList) {
          enqueueDeferredPending(ctx, pending);
        }
        return refs;
      }

      await executePendingWrites(ctx, pendingList);
      return refs;
    });
  } finally {
    endWriteBusy();
  }
}

export async function readProjectTextAtPath(
  ctx: WalrusStorageContext,
  walrusPathPrefix: string,
  relativePath: string,
): Promise<string | null> {
  return readTextAtPath(ctx, fullProjectPath(walrusPathPrefix, relativePath));
}

export async function writeProjectTextAtPath(
  ctx: WalrusStorageContext,
  walrusPathPrefix: string,
  relativePath: string,
  text: string,
): Promise<WalrusBlobRef> {
  return writeTextAtPath(ctx, fullProjectPath(walrusPathPrefix, relativePath), text);
}

export async function writeProjectBytesAtPath(
  ctx: WalrusStorageContext,
  walrusPathPrefix: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<WalrusBlobRef> {
  return writeBytesAtPath(ctx, fullProjectPath(walrusPathPrefix, relativePath), bytes);
}

export async function ensurePathIndexInitialized(
  ctx: WalrusStorageContext,
): Promise<PathCache> {
  const cache = loadCache(ctx);
  if (Object.keys(cache.entries).length === 0) {
    saveCache(createEmptyPathCache(ctx.vault.projectId));
  }
  return loadCache(ctx);
}

export async function removePath(
  ctx: WalrusStorageContext,
  logicalPath: string,
): Promise<void> {
  const cache = loadCache(ctx);
  saveCache(removePathCacheEntry(cache, logicalPath));
  void parentLogicalPath;
}

export {
  OnChainFlushError,
  isOnChainFlushError,
  isInsufficientSuiBalanceError,
  formatOnChainTransactionError,
} from "./on-chain-flush-error";

export { VAULT_PATH_INDEX_PATH } from "../../constants";
