import { bcs } from "@mysten/sui/bcs";
import { toHex } from "@mysten/sui/utils";
import type { SealCompatibleClient } from "@mysten/seal";
import { Directory, DirEntry } from "../../contracts/content_vault/directory";
import { File, VersionInfo } from "../../contracts/content_vault/file";
import { computeNameHash, utf8VectorToString } from "./name-hash";
import {
  deriveDynamicFieldId,
  getObjectsContentBatched,
  skipDynamicFieldWrapper,
} from "./sui-rpc-batch";
import {
  assetFolderIdForSegment,
  segmentForAssetFolderId,
} from "./folder-placement";
import type { AssetFolderId } from "../asset-catalog";

const ROOT_SEGMENT_TO_FOLDER: ReadonlyArray<{
  segment: string;
  folderId: AssetFolderId;
}> = [
  { segment: "script", folderId: "scripts" },
  { segment: "characters", folderId: "character_sheets" },
  { segment: "environments", folderId: "environment_sheets" },
  { segment: "storyboard", folderId: "storyboards" },
  { segment: "video clip", folderId: "videos" },
];

interface DynamicFieldValueResponse {
  dynamicField: {
    value: {
      bcs: Uint8Array;
    };
  };
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

async function getDirEntry(
  client: SealCompatibleClient,
  tableId: string,
  nameHash: Uint8Array,
): Promise<ReturnType<typeof DirEntry.parse> | null> {
  if (!client.core?.getDynamicField) return null;
  try {
    const response = (await client.core.getDynamicField({
      parentId: tableId,
      name: {
        type: "vector<u8>",
        bcs: bcs.vector(bcs.u8()).serialize(nameHash).toBytes(),
      },
    })) as DynamicFieldValueResponse;
    return DirEntry.parse(response.dynamicField.value.bcs);
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
}

export async function resolveChildDirectoryId(input: {
  client: SealCompatibleClient;
  projectId: string;
  parentDirectoryId: string;
  segmentName: string;
}): Promise<string | null> {
  const parentContent = await getObjectContent(input.client, input.parentDirectoryId);
  if (!parentContent) return null;

  const parent = Directory.parse(parentContent);
  const nameHash = computeNameHash(input.projectId, input.segmentName);
  const entry = await getDirEntry(input.client, parent.entries.id, nameHash);
  if (!entry || !entry.is_directory) return null;
  return entry.object_id;
}

export async function resolveAssetFolderDirectoryId(input: {
  client: SealCompatibleClient;
  projectId: string;
  rootDirectoryId: string;
  folderId: AssetFolderId;
}): Promise<string | null> {
  const segment = segmentForAssetFolderId(input.folderId);
  if (!segment) return null;
  return resolveChildDirectoryId({
    client: input.client,
    projectId: input.projectId,
    parentDirectoryId: input.rootDirectoryId,
    segmentName: segment,
  });
}

export interface OnChainDirectoryFileEntry {
  fileId: string;
  directoryId: string;
  nameHashHex: string;
  mimeType: string;
  currentVersion: number;
  contentBlobId: string;
  metadataBlobId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

/** Lightweight File header used by the explorer (no version / blob lookups). */
export interface OnChainDirectoryFileHeader {
  fileId: string;
  directoryId: string;
  nameHashHex: string;
  mimeType: string;
  createdAtMs: number;
}

export interface RootAssetFolderEntry {
  folderId: AssetFolderId;
  directoryId: string;
}

interface ParsedFileVersion {
  mimeType: string;
  currentVersion: number;
  contentBlobId: string;
  metadataBlobId: string;
  nameHash: number[];
  createdAtMs: number;
  updatedAtMs: number;
}

function parseFileVersionFromContents(input: {
  fileContent: Uint8Array;
  versionFieldContent: Uint8Array;
}): ParsedFileVersion | null {
  try {
    const file = File.parse(input.fileContent);
    const currentVersion = Number(file.current_version);
    if (!Number.isFinite(currentVersion) || currentVersion <= 0) return null;

    const versionBcs = skipDynamicFieldWrapper(
      input.versionFieldContent,
      bcs.u64().serialize(currentVersion).toBytes().length,
    );
    if (!versionBcs) return null;

    const version = VersionInfo.parse(versionBcs);
    const contentBlobId = utf8VectorToString(version.content_blob_id).trim();
    const metadataBlobId = utf8VectorToString(version.metadata_blob_id).trim();
    if (!contentBlobId) return null;

    const createdAtMs = Number(file.created_at_ms);
    const updatedAtMs = Number(version.created_at_ms);

    return {
      mimeType: utf8VectorToString(file.mime_type) || "application/octet-stream",
      currentVersion,
      contentBlobId,
      metadataBlobId,
      nameHash: file.name_hash,
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : createdAtMs || 0,
    };
  } catch {
    return null;
  }
}

async function loadCurrentFileVersions(
  client: SealCompatibleClient,
  fileIds: string[],
  fileContents: Map<string, Uint8Array>,
): Promise<Map<string, ParsedFileVersion>> {
  const versions = new Map<string, ParsedFileVersion>();
  if (fileIds.length === 0) return versions;

  const versionLookups: Array<{
    fileId: string;
    fieldId: string;
  }> = [];

  for (const fileId of fileIds) {
    const fileContent = fileContents.get(fileId);
    if (!fileContent) continue;
    try {
      const file = File.parse(fileContent);
      const currentVersion = Number(file.current_version);
      if (!Number.isFinite(currentVersion) || currentVersion <= 0) continue;
      const nameBcs = bcs.u64().serialize(currentVersion).toBytes();
      versionLookups.push({
        fileId,
        fieldId: deriveDynamicFieldId(file.versions.id, "u64", nameBcs),
      });
    } catch {
      continue;
    }
  }

  const versionFieldContents = await getObjectsContentBatched(
    client,
    versionLookups.map((lookup) => lookup.fieldId),
  );

  for (const lookup of versionLookups) {
    const versionFieldContent = versionFieldContents.get(lookup.fieldId);
    const fileContent = fileContents.get(lookup.fileId);
    if (!versionFieldContent || !fileContent) continue;
    const parsed = parseFileVersionFromContents({
      fileContent,
      versionFieldContent,
    });
    if (parsed) {
      versions.set(lookup.fileId, parsed);
    }
  }

  return versions;
}

async function listDirEntries(input: {
  client: SealCompatibleClient;
  directoryId: string;
}): Promise<Array<ReturnType<typeof DirEntry.parse>>> {
  if (!input.client.core?.listDynamicFields) {
    return [];
  }

  const directoryContent = await getObjectContent(input.client, input.directoryId);
  if (!directoryContent) return [];

  const directory = Directory.parse(directoryContent);
  const tableId = directory.entries.id;
  const entries: Array<ReturnType<typeof DirEntry.parse>> = [];

  let cursor: string | null = null;
  do {
    const page = await input.client.core.listDynamicFields({
      parentId: tableId,
      cursor,
      limit: 50,
    });

    const inlineFields = page.dynamicFields.filter(
      (field): field is typeof field & { fieldId: string } =>
        field.$kind === "DynamicField" && Boolean(field.fieldId),
    );
    const fieldContents = await getObjectsContentBatched(
      input.client,
      inlineFields.map((field) => field.fieldId),
    );

    for (const field of inlineFields) {
      const content = fieldContents.get(field.fieldId);
      if (!content) continue;
      const valueBcs = skipDynamicFieldWrapper(content, field.name.bcs.length);
      if (!valueBcs) continue;
      try {
        entries.push(DirEntry.parse(valueBcs));
      } catch {
        continue;
      }
    }

    for (const field of page.dynamicFields) {
      if (field.$kind !== "DynamicObject" || !field.childId) continue;
      entries.push({
        is_directory: false,
        object_id: field.childId,
      });
    }

    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);

  return entries;
}

/**
 * Enumerate File children of a Directory via Table dynamic fields (RPC),
 * then load each File's on-chain header + current version pointers.
 * Matches architecture §8: use dynamic_field queries for browsable views.
 */
export async function listFilesInDirectory(input: {
  client: SealCompatibleClient;
  directoryId: string;
}): Promise<OnChainDirectoryFileEntry[]> {
  const entries = await listDirEntries(input);
  const fileIds = entries
    .filter((entry) => !entry.is_directory)
    .map((entry) => entry.object_id);
  const fileContents = await getObjectsContentBatched(input.client, fileIds);
  const versionsByFileId = await loadCurrentFileVersions(
    input.client,
    fileIds,
    fileContents,
  );
  const files: OnChainDirectoryFileEntry[] = [];

  for (const entry of entries) {
    if (entry.is_directory) continue;
    const version = versionsByFileId.get(entry.object_id);
    if (!version) continue;

    files.push({
      fileId: entry.object_id,
      directoryId: input.directoryId,
      nameHashHex: toHex(Uint8Array.from(version.nameHash)),
      mimeType: version.mimeType,
      currentVersion: version.currentVersion,
      contentBlobId: version.contentBlobId,
      metadataBlobId: version.metadataBlobId,
      createdAtMs: version.createdAtMs,
      updatedAtMs: version.updatedAtMs,
    });
  }

  return files;
}

/** Explorer listing: DirEntry + File header only (no version blob pointers). */
export async function listFileHeadersInDirectory(input: {
  client: SealCompatibleClient;
  directoryId: string;
}): Promise<OnChainDirectoryFileHeader[]> {
  const entries = await listDirEntries(input);
  const fileIds = entries
    .filter((entry) => !entry.is_directory)
    .map((entry) => entry.object_id);
  const fileContents = await getObjectsContentBatched(input.client, fileIds);
  const files: OnChainDirectoryFileHeader[] = [];

  for (const entry of entries) {
    if (entry.is_directory) continue;
    const content = fileContents.get(entry.object_id);
    if (!content) continue;
    try {
      const file = File.parse(content);
      const createdAtMs = Number(file.created_at_ms);
      files.push({
        fileId: entry.object_id,
        directoryId: input.directoryId,
        nameHashHex: toHex(Uint8Array.from(file.name_hash)),
        mimeType: utf8VectorToString(file.mime_type) || "application/octet-stream",
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
      });
    } catch {
      continue;
    }
  }

  return files;
}

/** One root Directory fetch + parallel child lookups, returning folder object IDs. */
export async function listRootAssetFolderEntries(input: {
  client: SealCompatibleClient;
  projectId: string;
  rootDirectoryId: string;
}): Promise<RootAssetFolderEntry[]> {
  const rootContent = await getObjectContent(input.client, input.rootDirectoryId);
  if (!rootContent) return [];

  const root = Directory.parse(rootContent);
  const tableId = root.entries.id;

  const resolved = await Promise.all(
    ROOT_SEGMENT_TO_FOLDER.map(async (candidate) => {
      const nameHash = computeNameHash(input.projectId, candidate.segment);
      const entry = await getDirEntry(input.client, tableId, nameHash);
      if (!entry?.is_directory) return null;
      return {
        folderId: candidate.folderId,
        directoryId: entry.object_id,
      } satisfies RootAssetFolderEntry;
    }),
  );

  return resolved.filter((entry): entry is RootAssetFolderEntry => entry != null);
}

export async function listRootAssetFoldersFromChain(input: {
  client: SealCompatibleClient;
  projectId: string;
  rootDirectoryId: string;
}): Promise<AssetFolderId[]> {
  const entries = await listRootAssetFolderEntries(input);
  return entries.map((entry) => entry.folderId);
}

export async function listAssetFolderFilesFromChain(input: {
  client: SealCompatibleClient;
  projectId: string;
  rootDirectoryId: string;
  folderId: AssetFolderId;
  /** Skip another root resolve when the caller already has the Directory id. */
  directoryId?: string;
}): Promise<OnChainDirectoryFileEntry[]> {
  const directoryId =
    input.directoryId ?? (await resolveAssetFolderDirectoryId(input));
  if (!directoryId) return [];
  return listFilesInDirectory({
    client: input.client,
    directoryId,
  });
}

export { assetFolderIdForSegment };
