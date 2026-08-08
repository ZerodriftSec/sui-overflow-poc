import type { SealCompatibleClient } from "@mysten/seal";
import type { SessionKey } from "@mysten/seal";
import type { SealClient } from "@mysten/seal";
import type {
  AssetFolderId,
  CatalogAssetRef,
  CatalogFileType,
} from "../asset-catalog";
import { getAssetFolderDefinition } from "../asset-catalog";
import { batchDownloadAndDecryptText } from "../walrus/download-decrypt";
import {
  listAssetFolderFilesFromChain,
  listFilesInDirectory,
  listRootAssetFolderEntries,
  type OnChainDirectoryFileEntry,
  type RootAssetFolderEntry,
} from "./on-chain-directory";
import { stripProjectPathPrefix } from "./folder-placement";

interface FileMetadataJson {
  filename?: string;
  logicalPath?: string;
  content_type?: string;
  original_size?: number;
}

const metadataCache = new Map<string, FileMetadataJson | null>();

function fileTypeFromMime(mimeType: string): CatalogFileType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "text";
}

function msToIso(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return new Date(0).toISOString();
  }
  return new Date(ms).toISOString();
}

function assetIdFromLogicalPath(logicalPath: string): string | null {
  const relative = stripProjectPathPrefix(logicalPath);
  // e.g. Script/Assets/<id>/v1.txt
  const match = relative.match(/\/Assets\/([^/]+)\//i);
  return match?.[1] ?? null;
}

/** Prefer versioned JSON/text docs over companion image/video blobs for the same asset. */
function isPrimaryAssetDocumentPath(logicalPath: string): boolean {
  const relative = stripProjectPathPrefix(logicalPath);
  return /\/v\d+\.(json|txt)$/i.test(relative);
}

/**
 * Design sheet bytes at `Design/.../Assets/<id>/image.<ext>` (and legacy
 * `Design/Assets/...`). These ride alongside the JSON design document and must
 * not appear as duplicate sidebar entries.
 */
function isDesignCompanionMediaPath(logicalPath: string): boolean {
  if (!logicalPath) return false;
  const relative = stripProjectPathPrefix(logicalPath);
  if ((relative.split("/")[0] ?? "").toLowerCase() !== "design") return false;
  if (/\/Assets\/[^/]+\/image\.[^.]+$/i.test(relative)) return true;
  return (
    /\.(png|jpe?g|gif|webp|svg)$/i.test(relative) &&
    !isPrimaryAssetDocumentPath(logicalPath)
  );
}

/**
 * Storyboard contact-sheet images at `Storyboard/Assets/<segmentId>/sheet.<ext>`.
 * These are companion media for the storyboard JSON document (loaded via
 * `document.sheets[].image.imageBlobId`) and must not appear as explorer rows.
 */
export function isStoryboardCompanionMediaPath(logicalPath: string): boolean {
  if (!logicalPath) return false;
  const relative = stripProjectPathPrefix(logicalPath);
  if ((relative.split("/")[0] ?? "").toLowerCase() !== "storyboard") {
    return false;
  }
  return /\/Assets\/[^/]+\/sheet\.[^.]+$/i.test(relative);
}

function folderIdFromDesignLogicalPath(
  logicalPath: string,
): AssetFolderId | null {
  const relative = stripProjectPathPrefix(logicalPath);
  const parts = relative.split("/");
  if ((parts[0] ?? "").toLowerCase() !== "design") return null;
  const second = (parts[1] ?? "").toLowerCase();
  if (second === "environments" || second === "environment") {
    return "environment_sheets";
  }
  if (second === "characters" || second === "character" || second === "assets") {
    return "character_sheets";
  }
  return null;
}

function shortFileLabel(fileId: string): string {
  const hex = fileId.replace(/^0x/, "");
  return hex.slice(0, 8) || fileId;
}

/**
 * Resolve metadata for a batch of file entries with a single Seal `fetchKeys`
 * call covering every not-yet-cached blob, instead of one key-server round
 * trip per file.
 */
async function readFileMetadataBatch(input: {
  entries: readonly OnChainDirectoryFileEntry[];
  sessionKey: SessionKey;
  sealClient: SealClient;
  suiClient: SealCompatibleClient;
  projectId: string;
  accessRegistryId: string;
}): Promise<Map<string, FileMetadataJson | null>> {
  const results = new Map<string, FileMetadataJson | null>();
  const blobIdsToFetch: string[] = [];

  for (const entry of input.entries) {
    if (!entry.metadataBlobId) continue;
    const cached = metadataCache.get(entry.metadataBlobId);
    if (cached !== undefined) {
      results.set(entry.metadataBlobId, cached);
    } else if (!blobIdsToFetch.includes(entry.metadataBlobId)) {
      blobIdsToFetch.push(entry.metadataBlobId);
    }
  }

  if (blobIdsToFetch.length > 0) {
    const decryptedByBlobId = await batchDownloadAndDecryptText({
      blobIds: blobIdsToFetch,
      sessionKey: input.sessionKey,
      sealClient: input.sealClient,
      suiClient: input.suiClient,
      projectId: input.projectId,
      accessRegistryId: input.accessRegistryId,
    });

    for (const blobId of blobIdsToFetch) {
      const text = decryptedByBlobId.get(blobId);
      let parsed: FileMetadataJson | null = null;
      if (text != null) {
        try {
          parsed = JSON.parse(text) as FileMetadataJson;
        } catch {
          parsed = null;
        }
      }
      metadataCache.set(blobId, parsed);
      results.set(blobId, parsed);
    }
  }

  return results;
}

function upsertCatalogRef(
  refs: CatalogAssetRef[],
  seen: Set<string>,
  next: CatalogAssetRef,
  logicalPath: string,
): void {
  const dedupeKey = `${next.folderId}:${next.id}`;
  const existingIndex = refs.findIndex(
    (ref) => `${ref.folderId}:${ref.id}` === dedupeKey,
  );
  if (existingIndex < 0) {
    seen.add(dedupeKey);
    refs.push(next);
    return;
  }

  const existing = refs[existingIndex];
  const nextIsPrimary = isPrimaryAssetDocumentPath(logicalPath);
  // Prefer versioned JSON/text docs over companion media blobs for the same id.
  if (nextIsPrimary && existing.fileType !== "text") {
    refs[existingIndex] = next;
    return;
  }
  if (!nextIsPrimary && existing.fileType === "text") {
    return;
  }
  if ((next.updatedAt || "") > (existing.updatedAt || "")) {
    refs[existingIndex] = next;
  }
}

/**
 * Build explorer refs by enumerating on-chain Directory → File entries, then
 * decrypting each file's sealed Walrus metadata for titles / asset ids.
 * Membership itself comes from the chain walk, not the project manifest.
 */
export async function listCatalogRefsFromOnChainDirectories(input: {
  client: SealCompatibleClient;
  sealClient: SealClient;
  sessionKey: SessionKey;
  vaultProjectId: string;
  accessRegistryId: string;
  rootDirectoryId: string;
  /** App project path prefix, e.g. `project/<id>/` — filters multi-project workspaces. */
  walrusPathPrefix: string;
  folderIds?: readonly AssetFolderId[];
  /** Pre-resolved root folders — avoids a second root Directory fetch. */
  folderEntries?: readonly RootAssetFolderEntry[];
  /**
   * Invoked with a growing snapshot of refs as each folder (and the legacy
   * root-recovery pass) finishes, so callers can render assets incrementally
   * instead of waiting for every folder to resolve.
   */
  onProgress?: (refs: readonly CatalogAssetRef[]) => void;
}): Promise<CatalogAssetRef[]> {
  const prefix = input.walrusPathPrefix.endsWith("/")
    ? input.walrusPathPrefix
    : `${input.walrusPathPrefix}/`;

  const folderEntries =
    input.folderEntries ??
    (await listRootAssetFolderEntries({
      client: input.client,
      projectId: input.vaultProjectId,
      rootDirectoryId: input.rootDirectoryId,
    }));

  const allowed =
    input.folderIds && input.folderIds.length > 0
      ? new Set(input.folderIds)
      : null;
  const refs: CatalogAssetRef[] = [];
  const seen = new Set<string>();

  const ingestEntries = async (
    entries: OnChainDirectoryFileEntry[],
    folderIdForEntry: (
      logicalPath: string,
      fallbackFolderId: AssetFolderId,
    ) => AssetFolderId | null,
    fallbackFolderId: AssetFolderId,
  ) => {
    const metadataByBlobId = await readFileMetadataBatch({
      entries,
      sessionKey: input.sessionKey,
      sealClient: input.sealClient,
      suiClient: input.client,
      projectId: input.vaultProjectId,
      accessRegistryId: input.accessRegistryId,
    });

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const metadata = entry.metadataBlobId
        ? metadataByBlobId.get(entry.metadataBlobId) ?? null
        : null;
      const logicalPath = metadata?.logicalPath?.trim() ?? "";

      if (
        logicalPath &&
        !logicalPath.startsWith(prefix) &&
        logicalPath !== prefix.slice(0, -1)
      ) {
        continue;
      }

      // Sidebar lists primary documents only — companion media blobs are
      // loaded via the document's imageBlobId / sheets, not as explorer rows.
      if (isDesignCompanionMediaPath(logicalPath)) continue;
      if (isStoryboardCompanionMediaPath(logicalPath)) continue;

      const folderId = folderIdForEntry(logicalPath, fallbackFolderId);
      if (!folderId) continue;
      if (allowed && !allowed.has(folderId)) continue;

      const folder = getAssetFolderDefinition(folderId);
      const assetId =
        assetIdFromLogicalPath(logicalPath) ??
        entry.fileId.replace(/^0x/, "").slice(0, 12);
      const title =
        metadata?.filename?.replace(/\.[^.]+$/, "") ||
        metadata?.filename ||
        shortFileLabel(entry.fileId);

      upsertCatalogRef(
        refs,
        seen,
        {
          id: assetId,
          title,
          folderId,
          storagePhase: folder.storagePhase,
          assetKind: folder.assetKind,
          fileType: fileTypeFromMime(metadata?.content_type || entry.mimeType),
          createdAt: msToIso(entry.createdAtMs),
          updatedAt: msToIso(entry.updatedAtMs),
          status: "ready",
          fileId: entry.fileId,
          contentBlobId: entry.contentBlobId,
          metadataBlobId: entry.metadataBlobId || undefined,
          currentVersion: entry.currentVersion,
        },
        logicalPath,
      );
    }
  };

  const folderTasks = folderEntries
    .filter((folderEntry) => !allowed || allowed.has(folderEntry.folderId))
    .map(async (folderEntry) => {
      const entries = await listAssetFolderFilesFromChain({
        client: input.client,
        projectId: input.vaultProjectId,
        rootDirectoryId: input.rootDirectoryId,
        folderId: folderEntry.folderId,
        directoryId: folderEntry.directoryId,
      });

      await ingestEntries(
        entries,
        (_logicalPath, fallback) => fallback,
        folderEntry.folderId,
      );
      input.onProgress?.([...refs]);
    });

  // Recover design files that were incorrectly parented under the vault root
  // (legacy Design/Assets placement when Design paths had no folder segment).
  const wantsDesign =
    !allowed ||
    allowed.has("character_sheets") ||
    allowed.has("environment_sheets");
  const designRecoveryTask = wantsDesign
    ? (async () => {
        const rootEntries = await listFilesInDirectory({
          client: input.client,
          directoryId: input.rootDirectoryId,
        }).catch(() => [] as OnChainDirectoryFileEntry[]);

        await ingestEntries(
          rootEntries,
          (logicalPath) => folderIdFromDesignLogicalPath(logicalPath),
          "character_sheets",
        );
        input.onProgress?.([...refs]);
      })()
    : Promise.resolve();

  // Folders (and the legacy root-recovery pass) are independent, so run them
  // concurrently — each still batches its own Seal `fetchKeys` call.
  await Promise.all([...folderTasks, designRecoveryTask]);

  return refs;
}

export function clearOnChainCatalogMetadataCache(): void {
  metadataCache.clear();
}
