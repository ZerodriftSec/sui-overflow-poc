import { bcs } from "@mysten/sui/bcs";
import { toHex } from "@mysten/sui/utils";
import type { SealCompatibleClient } from "@mysten/seal";
import { DirEntry, Directory } from "../../contracts/content_vault/directory";
import { File, VersionInfo } from "../../contracts/content_vault/file";
import { computeNameHash, utf8VectorToString } from "./name-hash";
import {
  normalizeLogicalPath,
  type PathCacheEntry,
} from "./path-cache";
import {
  assetFolderSegmentForLogicalPath,
  fileEntryNameKey,
} from "./folder-placement";
import { resolveChildDirectoryId } from "./on-chain-directory";

export interface ResolvedOnChainFile {
  logicalPath: string;
  fileId: string;
  parentDirectoryId: string;
  nameHash: Uint8Array;
  nameHashHex: string;
  contentBlobId: string;
  metadataBlobId: string;
  mimeType: string;
  currentVersion: number;
}

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("missing")
  );
}

async function getObjectContent(
  client: SealCompatibleClient,
  objectId: string,
): Promise<Uint8Array | null> {
  if (!client.core?.getObject) return null;
  try {
    const { object } = await client.core.getObject({
      objectId,
      include: { content: true },
    });
    const content = object?.content;
    if (!content) return null;
    return content instanceof Uint8Array ? content : await content;
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
}

async function getTableEntryValue(
  client: SealCompatibleClient,
  tableId: string,
  nameType: string,
  nameBcs: Uint8Array,
): Promise<Uint8Array | null> {
  if (!client.core?.getDynamicField) return null;
  try {
    const { dynamicField } = await client.core.getDynamicField({
      parentId: tableId,
      name: { type: nameType, bcs: nameBcs },
    });
    return dynamicField.value.bcs;
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
}

function parseDirectoryTableId(content: Uint8Array): string {
  const parsed = Directory.parse(content);
  return parsed.entries.id;
}

function parseFileFields(content: Uint8Array): {
  directoryId: string;
  nameHash: number[];
  mimeType: number[];
  currentVersion: bigint | number | string;
  versionsTableId: string;
} {
  const parsed = File.parse(content);
  return {
    directoryId: parsed.directory_id,
    nameHash: parsed.name_hash,
    mimeType: parsed.mime_type,
    currentVersion: parsed.current_version,
    versionsTableId: parsed.versions.id,
  };
}

export interface ResolvedFileVersionBlobs {
  contentBlobId: string;
  metadataBlobId: string;
  mimeType: string;
  currentVersion: number;
  directoryId: string;
  nameHash: Uint8Array;
}

/** Revalidate the current version blob ids for a known File object. */
export async function resolveCurrentVersionBlobs(
  client: SealCompatibleClient,
  fileId: string,
): Promise<ResolvedFileVersionBlobs | null> {
  const fileContent = await getObjectContent(client, fileId);
  if (!fileContent) return null;

  const file = parseFileFields(fileContent);
  const currentVersion = Number(file.currentVersion);
  if (!Number.isFinite(currentVersion) || currentVersion <= 0) return null;

  const versionBcs = await getTableEntryValue(
    client,
    file.versionsTableId,
    "u64",
    bcs.u64().serialize(currentVersion).toBytes(),
  );
  if (!versionBcs) return null;

  const version = VersionInfo.parse(versionBcs);
  const contentBlobId = utf8VectorToString(version.content_blob_id).trim();
  const metadataBlobId = utf8VectorToString(version.metadata_blob_id).trim();
  if (!contentBlobId) return null;

  return {
    contentBlobId,
    metadataBlobId,
    mimeType: utf8VectorToString(file.mimeType) || "application/octet-stream",
    currentVersion,
    directoryId: file.directoryId,
    nameHash: Uint8Array.from(file.nameHash),
  };
}

/**
 * Resolve a logical path to its File under the mapped folder Directory
 * (architecture: Directory.entries → File). Workspace docs without a mapped
 * segment (manifest, registry) resolve from the root Directory.
 */
export async function resolveFileAtLogicalPath(
  client: SealCompatibleClient,
  input: {
    projectId: string;
    rootDirectoryId: string;
    logicalPath: string;
  },
): Promise<ResolvedOnChainFile | null> {
  const logicalPath = normalizeLogicalPath(input.logicalPath);
  if (!logicalPath) return null;

  const entryName = fileEntryNameKey(logicalPath);
  const nameHash = computeNameHash(input.projectId, entryName);
  const segment = assetFolderSegmentForLogicalPath(logicalPath);

  const parentCandidates: string[] = [];
  if (segment) {
    const folderId = await resolveChildDirectoryId({
      client,
      projectId: input.projectId,
      parentDirectoryId: input.rootDirectoryId,
      segmentName: segment,
    });
    if (folderId) parentCandidates.push(folderId);
  }
  // Legacy flat-root placement (pre-folder layout).
  parentCandidates.push(input.rootDirectoryId);

  for (const parentDirectoryId of parentCandidates) {
    const directoryContent = await getObjectContent(client, parentDirectoryId);
    if (!directoryContent) continue;

    const entriesTableId = parseDirectoryTableId(directoryContent);
    const nameBcs = bcs.vector(bcs.u8()).serialize(nameHash).toBytes();
    const entryBcs = await getTableEntryValue(
      client,
      entriesTableId,
      "vector<u8>",
      nameBcs,
    );
    if (!entryBcs) continue;

    const entry = DirEntry.parse(entryBcs);
    if (entry.is_directory) continue;

    const fileId = entry.object_id;
    const version = await resolveCurrentVersionBlobs(client, fileId);
    if (!version) continue;

    return {
      logicalPath,
      fileId,
      parentDirectoryId: version.directoryId || parentDirectoryId,
      nameHash,
      nameHashHex: toHex(nameHash),
      contentBlobId: version.contentBlobId,
      metadataBlobId: version.metadataBlobId,
      mimeType: version.mimeType,
      currentVersion: version.currentVersion,
    };
  }

  return null;
}

/** Look up only the File object id for a path (used after create). */
export async function resolveFileObjectIdAtLogicalPath(
  client: SealCompatibleClient,
  input: {
    projectId: string;
    rootDirectoryId: string;
    logicalPath: string;
  },
): Promise<string | null> {
  const resolved = await resolveFileAtLogicalPath(client, input);
  return resolved?.fileId ?? null;
}

export function resolvedFileToPathCacheEntry(
  resolved: ResolvedOnChainFile,
): PathCacheEntry {
  return {
    kind: "file",
    objectId: resolved.fileId,
    parentDirectoryId: resolved.parentDirectoryId,
    nameHashHex: resolved.nameHashHex,
    contentBlobId: resolved.contentBlobId,
    metadataBlobId: resolved.metadataBlobId,
    mimeType: resolved.mimeType,
    currentVersion: resolved.currentVersion,
    updatedAt: new Date().toISOString(),
  };
}
