import { z } from "zod";
import type { WalrusClient } from "@mysten/walrus";
import {
  loadManifestFromWalrus,
  loadTextAssetFromWalrus,
  saveManifestToWalrus,
  saveTextAssetToWalrus,
} from "./storage/asset-storage";
import { loadManifestByBlobId } from "./storage/manifest-load";
import { designImagePath, filmVideoPath, storyboardSheetImagePath } from "./storage/paths";
import type { WalrusStorageContext } from "./storage/walrus-storage";
import { writeProjectBytesAtPath } from "./storage/walrus-storage";
import { downloadAndDecryptBytes, downloadAndDecryptText } from "./walrus/download-decrypt";
import {
  buildProjectManifest,
  parseProjectManifest,
  type ProjectManifest,
} from "./project-manifest";
import {
  getCachedUploadEntry,
  listCachedUploadEntries,
  removeCachedUploadEntry,
  upsertCachedUploadEntry,
} from "./upload-cache";
import type { WalrusNetwork } from "./walrus/constants";
import { fetchWalrusBlobText } from "./walrus/provider-service";
import type {
  Project,
  StoryboardAsset,
  StoryboardDocument,
} from "./project";

export interface WalrusExtendedClient {
  walrus: WalrusClient;
}

const scriptAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  savedAt: z.string(),
});

const scriptAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  identifier: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(scriptAssetVersionSchema).optional(),
});

const scriptAssetDocumentSchema = z.object({
  type: z.literal("script-asset"),
  id: z.string(),
  title: z.string(),
  content: z.string(),
  /** User brief / chat request that produced this script (mirrors film/design prompts). */
  prompt: z.string().optional().default(""),
  /** OpenRouter model id used to generate this script. */
  generationModelId: z.string().optional(),
  version: z.number().int().positive().optional(),
  updatedAt: z.string().optional(),
});

export type ScriptAssetDocument = z.infer<typeof scriptAssetDocumentSchema>;

const designAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  savedAt: z.string(),
});

const designAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  primaryFileType: z.enum(["text", "image"]).optional(),
  blobId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(designAssetVersionSchema).optional(),
});

const designGeneratedImageSchema = z
  .object({
    mimeType: z.string().default("image/png"),
    dataBase64: z.string().optional(),
    imageBlobId: z.string().optional(),
    imageBlobObjectId: z.string().optional(),
  })
  .refine(
    (value) =>
      (value.dataBase64?.trim().length ?? 0) > 0 ||
      (value.imageBlobId?.trim().length ?? 0) > 0,
    {
      message: "image must include dataBase64 or imageBlobId",
    },
  );

const designDocumentAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  description: z.string(),
  prompt: z.string(),
  notes: z.string().optional().default(""),
  /** OpenRouter image model id used to generate this asset's image. */
  generationModelId: z.string().optional(),
  image: designGeneratedImageSchema,
});

const designDocumentSchema = z.object({
  sourceScriptId: z.string().optional(),
  sourceScriptVersion: z.number().int().positive().optional(),
  sourceScriptBlobId: z.string().optional(),
  styleBrief: z.string().optional().default(""),
  updatedAt: z.string(),
  assets: z.array(designDocumentAssetSchema),
});

const designAssetDocumentSchema = z.object({
  type: z.literal("design-asset"),
  id: z.string(),
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  version: z.number().int().positive().optional(),
  updatedAt: z.string().optional(),
  document: designDocumentSchema,
});

const storyboardAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  savedAt: z.string(),
});

const storyboardAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(storyboardAssetVersionSchema).optional(),
});

const storyboardCardSchema = z.object({
  id: z.string(),
  sceneIndex: z.number(),
  shotIndex: z.number(),
  title: z.string(),
  scriptSegment: z.string().optional().default(""),
  storyPurpose: z.string(),
  shotDescription: z.string(),
  shotType: z.enum(["ECU", "CU", "MCU", "MS", "WS", "EWS"]),
  cameraAngle: z.enum([
    "eye-level",
    "high-angle",
    "low-angle",
    "birds-eye",
    "dutch",
  ]),
  cameraMovement: z.string(),
  characterAction: z.string(),
  visualSketch: z.string(),
  sceneGraph: z
    .object({
      version: z.literal(1),
      summary: z.string(),
      camera: z.object({
        projection: z.literal("perspective"),
        position: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }),
        target: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }),
        fov: z.number(),
      }),
      lights: z.array(
        z.object({
          id: z.string(),
          type: z.enum(["ambient", "directional"]),
          color: z.string(),
          intensity: z.number(),
          position: z
            .object({
              x: z.number(),
              y: z.number(),
              z: z.number(),
            })
            .optional(),
        }),
      ),
      objects: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          primitive: z.enum(["box", "sphere", "capsule", "cylinder", "cone", "plane"]),
          color: z.string(),
          position: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
          }),
          rotation: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
          }),
          scale: z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
          }),
        }),
      ),
      ground: z
        .object({
          enabled: z.boolean(),
          color: z.string(),
          size: z.number(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  blocking2d: z
    .object({
      version: z.literal(1),
      summary: z.string(),
      backgroundColor: z.string(),
      boxes: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          color: z.string(),
          shape: z
            .enum(["person", "table", "door", "window", "vehicle", "prop", "box"])
            .optional()
            .default("box"),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          depth: z.enum(["foreground", "midground", "background"]),
        }),
      ),
    })
    .nullable()
    .optional(),
  dialogue: z.string(),
  voiceover: z.string(),
  sfx: z.string(),
  musicCue: z.string(),
  continuity: z.string(),
  estimatedDurationSec: z.number(),
  transitionOut: z.enum([
    "cut",
    "dissolve",
    "fade-to-black",
    "wipe",
    "match-cut",
  ]),
  generationPrompt: z.string(),
  negativePrompt: z.string(),
  status: z.enum(["draft", "review", "approved", "locked"]),
});

const storyboardSheetImageSchema = z
  .object({
    mimeType: z.string().default("image/png"),
    dataBase64: z.string().optional(),
    imageBlobId: z.string().optional(),
    imageBlobObjectId: z.string().optional(),
  })
  .refine(
    (value) =>
      (value.dataBase64?.trim().length ?? 0) > 0 ||
      (value.imageBlobId?.trim().length ?? 0) > 0,
    {
      message: "sheet image must include dataBase64 or imageBlobId",
    },
  );

const storyboardSheetEntrySchema = z.object({
  segmentId: z.string(),
  segmentIndex: z.number().int().nonnegative(),
  segmentTitle: z.string(),
  durationSec: z.number().positive(),
  shotIds: z.array(z.string()),
  panelCount: z.number().int().positive(),
  shotId: z.string(),
  prompt: z.string(),
  panelAspectRatio: z.string().optional(),
  image: storyboardSheetImageSchema,
});

const storyboardDocumentSchema = z.object({
  sourceScriptId: z.string().optional(),
  sourceScriptVersion: z.number().int().positive().optional(),
  sourceScriptBlobId: z.string().optional(),
  updatedAt: z.string(),
  cards: z.array(storyboardCardSchema),
  sheets: z.array(storyboardSheetEntrySchema).optional(),
});

const storyboardAssetDocumentSchema = z.object({
  type: z.literal("storyboard-asset"),
  id: z.string(),
  title: z.string(),
  version: z.number().int().positive().optional(),
  updatedAt: z.string().optional(),
  document: storyboardDocumentSchema,
});

const filmAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  savedAt: z.string(),
});

const filmAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(filmAssetVersionSchema).optional(),
});

const filmGeneratedVideoSchema = z
  .object({
    mimeType: z.string().default("video/mp4"),
    dataBase64: z.string().optional(),
    videoBlobId: z.string().optional(),
    videoBlobObjectId: z.string().optional(),
  })
  .refine(
    (value) =>
      (value.dataBase64?.trim().length ?? 0) > 0 ||
      (value.videoBlobId?.trim().length ?? 0) > 0,
    {
      message: "video must include dataBase64 or videoBlobId",
    },
  );

const filmDocumentSchema = z.object({
  sourceStoryboardId: z.string().optional(),
  sourceShotId: z.string().optional(),
  prompt: z.string().default(""),
  /** OpenRouter video model id used to generate this clip. */
  generationModelId: z.string().optional(),
  durationSec: z.number().optional(),
  status: z.enum(["draft", "generating", "ready", "failed"]).default("draft"),
  updatedAt: z.string(),
  video: filmGeneratedVideoSchema.optional(),
});

const filmAssetDocumentSchema = z.object({
  type: z.literal("film-asset"),
  id: z.string(),
  title: z.string(),
  version: z.number().int().positive().optional(),
  updatedAt: z.string().optional(),
  document: filmDocumentSchema,
});

const workspaceManifestSchema = z.object({
  scriptAssets: z.array(scriptAssetSchema),
  designAssets: z.array(designAssetSchema).optional().default([]),
  storyboardAssets: z.array(storyboardAssetSchema).optional().default([]),
  filmAssets: z.array(filmAssetSchema).optional().default([]),
});

export type ScriptAssetVersion = z.infer<typeof scriptAssetVersionSchema>;
export type ScriptAsset = z.infer<typeof scriptAssetSchema>;
export type DesignAssetVersion = z.infer<typeof designAssetVersionSchema>;
export type DesignAsset = z.infer<typeof designAssetSchema>;
export type DesignGeneratedImage = z.infer<typeof designGeneratedImageSchema>;
export type DesignDocumentAsset = z.infer<typeof designDocumentAssetSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type StoryboardAssetVersion = z.infer<typeof storyboardAssetVersionSchema>;
export type FilmAssetVersion = z.infer<typeof filmAssetVersionSchema>;
export type FilmAsset = z.infer<typeof filmAssetSchema>;
export type FilmGeneratedVideo = z.infer<typeof filmGeneratedVideoSchema>;
export type FilmDocument = z.infer<typeof filmDocumentSchema>;

export type { WalrusNetwork } from "./walrus/constants";

const LOCAL_CACHE_BLOB_PREFIX = "local-cache:";

function makeLocalCacheBlobId(assetId: string, version: number): string {
  return `${LOCAL_CACHE_BLOB_PREFIX}${assetId}:v${version}`;
}

function isLocalCacheBlobId(blobId: string): boolean {
  return blobId.startsWith(LOCAL_CACHE_BLOB_PREFIX);
}

const pendingDesignDocuments = new Map<string, DesignDocument>();
const pendingScriptContent = new Map<string, string>();

export function stagePendingDesignDocument(
  assetId: string,
  document: DesignDocument,
): void {
  pendingDesignDocuments.set(assetId, document);
}

export function clearPendingDesignDocument(assetId: string): void {
  pendingDesignDocuments.delete(assetId);
}

function getPendingDesignDocument(assetId: string): DesignDocument | undefined {
  return pendingDesignDocuments.get(assetId);
}

export function stagePendingScriptContent(
  assetId: string,
  content: string,
): void {
  pendingScriptContent.set(assetId, content);
}

export function clearPendingScriptContent(assetId: string): void {
  pendingScriptContent.delete(assetId);
}

export function getPendingScriptContent(assetId: string): string | undefined {
  return pendingScriptContent.get(assetId);
}

function loadCachedDesignDocument(
  project: Project,
  assetId: string,
): DesignDocument | null {
  const cached = getCachedUploadEntry({
    phase: "design",
    projectId: project.id,
    assetId,
  });
  if (!cached) return null;

  try {
    return designDocumentSchema.parse(JSON.parse(cached.payload));
  } catch {
    return null;
  }
}

function titleFromIdentifier(identifier: string): string {
  const basename = identifier.replace(/^script\//, "");
  const withoutExt = basename.replace(/\.[^.]+$/, "");
  return withoutExt || basename || identifier;
}

async function readBlobText(
  blobId: string,
  network: WalrusNetwork,
): Promise<string> {
  return fetchWalrusBlobText({
    blobId,
    network,
  });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToUint8Array(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToVideoBlob(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: mimeType });
}

export async function loadFilmVideoObjectUrl(
  ctx: WalrusStorageContext,
  video: FilmGeneratedVideo,
): Promise<string> {
  if (video.dataBase64 && video.dataBase64.length > 0) {
    const bytes = base64ToUint8Array(video.dataBase64);
    return URL.createObjectURL(bytesToVideoBlob(bytes, video.mimeType));
  }

  const videoBlobId = video.videoBlobId?.trim();
  if (videoBlobId) {
    const bytes = await downloadAndDecryptBytes({
      blobId: videoBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      vaultId: ctx.vault.vaultId,
      capId: ctx.vault.capId,
    });
    return URL.createObjectURL(bytesToVideoBlob(bytes, video.mimeType));
  }

  throw new Error("Film clip is missing data and storage reference");
}

export async function loadFilmVideoDataUrl(
  ctx: WalrusStorageContext,
  video: FilmGeneratedVideo,
): Promise<string> {
  if (video.dataBase64 && video.dataBase64.length > 0) {
    return `data:${video.mimeType};base64,${video.dataBase64}`;
  }

  const videoBlobId = video.videoBlobId?.trim();
  if (videoBlobId) {
    const bytes = await downloadAndDecryptBytes({
      blobId: videoBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      vaultId: ctx.vault.vaultId,
      capId: ctx.vault.capId,
    });
    return `data:${video.mimeType};base64,${uint8ArrayToBase64(bytes)}`;
  }

  throw new Error("Film clip is missing data and storage reference");
}

export async function loadDesignImageDataUrl(
  ctx: WalrusStorageContext,
  image: DesignGeneratedImage,
): Promise<string> {
  if (image.dataBase64 && image.dataBase64.length > 0) {
    return `data:${image.mimeType};base64,${image.dataBase64}`;
  }

  const imageBlobId = image.imageBlobId?.trim();
  if (imageBlobId) {
    const bytes = await downloadAndDecryptBytes({
      blobId: imageBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      vaultId: ctx.vault.vaultId,
      capId: ctx.vault.capId,
    });
    return `data:${image.mimeType};base64,${uint8ArrayToBase64(bytes)}`;
  }

  throw new Error("Design image is missing data and storage reference");
}

function parseScriptAssetDocument(text: string): {
  content: string;
  prompt: string;
  generationModelId: string;
} {
  try {
    const document = scriptAssetDocumentSchema.parse(JSON.parse(text));
    return {
      content: document.content,
      prompt: document.prompt ?? "",
      generationModelId: document.generationModelId ?? "",
    };
  } catch {
    return { content: text, prompt: "", generationModelId: "" };
  }
}

export function getScriptAssetVersions(asset: ScriptAsset): ScriptAssetVersion[] {
  if (asset.versions && asset.versions.length > 0) {
    return [...asset.versions].sort((a, b) => b.version - a.version);
  }

  if (asset.blobId) {
    return [
      {
        version: asset.currentVersion ?? 1,
        blobId: asset.blobId,
        savedAt: asset.updatedAt ?? new Date(0).toISOString(),
      },
    ];
  }

  return [];
}

export function getLatestScriptAssetVersion(
  asset: ScriptAsset,
): ScriptAssetVersion | null {
  return getScriptAssetVersions(asset)[0] ?? null;
}

export function isScriptAssetPersisted(asset: ScriptAsset): boolean {
  const latest = getLatestScriptAssetVersion(asset);
  return Boolean(latest?.blobId?.trim());
}

function getScriptAssetVersionEntry(
  asset: ScriptAsset,
  version?: number,
): ScriptAssetVersion | null {
  const versions = getScriptAssetVersions(asset);
  if (versions.length === 0) return null;

  if (version === undefined) {
    return versions[0];
  }

  return versions.find((entry) => entry.version === version) ?? null;
}

async function listScriptAssetsFromQuilt(
  walrusClient: WalrusExtendedClient,
  workspaceBlobId: string,
): Promise<ScriptAsset[]> {
  const blob = await walrusClient.walrus.getBlob({ blobId: workspaceBlobId });
  const files = await blob.files();
  const assets: ScriptAsset[] = [];

  for (const file of files) {
    const identifier = await file.getIdentifier();
    if (!identifier?.startsWith("script/")) continue;
    assets.push({
      id: identifier,
      title: titleFromIdentifier(identifier),
      identifier,
    });
  }

  return assets.sort((a, b) => a.title.localeCompare(b.title));
}

async function listScriptAssetsFromManifest(
  manifestText: string,
): Promise<ScriptAsset[]> {
  const parsed = workspaceManifestSchema.parse(JSON.parse(manifestText));
  return parsed.scriptAssets.map((asset) => ({
    ...asset,
    title: asset.title || asset.id,
  }));
}

export async function listScriptAssetsForProject(
  ctx: WalrusStorageContext | null,
  project: Project,
  network?: WalrusNetwork,
): Promise<ScriptAsset[]> {
  const manifest = await tryLoadProjectManifest(project, ctx, network);
  const manifestAssets = (manifest?.scriptAssets ?? []).map((asset) => ({
    ...asset,
    title: asset.title || asset.id,
  }));
  const cached = listCachedUploadEntries({
    phase: "script",
    projectId: project.id,
  });

  const mergedById = new Map<string, ScriptAsset>(
    manifestAssets.map((asset) => [asset.id, asset]),
  );
  for (const entry of cached) {
    const existing = mergedById.get(entry.assetId);
    const cachedVersion: ScriptAssetVersion = {
      version: entry.version,
      blobId: makeLocalCacheBlobId(entry.assetId, entry.version),
      savedAt: entry.updatedAt,
    };
    const nextVersions = existing
      ? [...getScriptAssetVersions(existing), cachedVersion]
      : [cachedVersion];
    mergedById.set(entry.assetId, {
      id: entry.assetId,
      title: entry.title || entry.assetId,
      blobId: existing?.blobId,
      updatedAt: entry.updatedAt,
      currentVersion: Math.max(existing?.currentVersion ?? 0, entry.version),
      versions: nextVersions,
    });
  }

  return [...mergedById.values()];
}

function normalizeDesignAsset(asset: {
  id: string;
  title: string;
  kind: "character" | "environment";
  primaryFileType?: "text" | "image";
  blobId?: string;
  updatedAt?: string;
  currentVersion?: number;
  versions?: DesignAssetVersion[];
}): DesignAsset {
  return {
    id: asset.id,
    title: asset.title || asset.id,
    kind: asset.kind,
    primaryFileType: asset.primaryFileType ?? "image",
    blobId: asset.blobId,
    updatedAt: asset.updatedAt ?? new Date(0).toISOString(),
    currentVersion: asset.currentVersion ?? 1,
    versions: asset.versions ?? [],
  };
}

export async function listDesignAssetsForProject(
  ctx: WalrusStorageContext | null,
  project: Project,
  network?: WalrusNetwork,
): Promise<DesignAsset[]> {
  const manifest = await tryLoadProjectManifest(project, ctx, network);
  const manifestAssets = (manifest?.designAssets ?? []).map(normalizeDesignAsset);
  const mergedById = new Map<string, DesignAsset>(
    manifestAssets.map((asset) => [asset.id, asset]),
  );
  const cached = listCachedUploadEntries({
    phase: "design",
    projectId: project.id,
  });
  for (const entry of cached) {
    const existing = mergedById.get(entry.assetId);
    const cachedVersion: DesignAssetVersion = {
      version: entry.version,
      blobId: makeLocalCacheBlobId(entry.assetId, entry.version),
      savedAt: entry.updatedAt,
    };
    const nextVersions = existing
      ? [...getDesignAssetVersions(existing), cachedVersion]
      : [cachedVersion];
    mergedById.set(entry.assetId, {
      id: entry.assetId,
      title: entry.title || entry.assetId,
      kind: entry.kind ?? existing?.kind ?? "character",
      blobId: existing?.blobId,
      updatedAt: entry.updatedAt,
      currentVersion: Math.max(existing?.currentVersion ?? 0, entry.version),
      versions: nextVersions,
    });
  }
  return [...mergedById.values()];
}

function normalizeStoryboardAsset(asset: {
  id: string;
  title: string;
  blobId?: string;
  updatedAt?: string;
  currentVersion?: number;
  versions?: StoryboardAssetVersion[];
}): StoryboardAsset {
  return {
    id: asset.id,
    title: asset.title || asset.id,
    blobId: asset.blobId,
    updatedAt: asset.updatedAt ?? new Date(0).toISOString(),
    currentVersion: asset.currentVersion ?? 1,
    versions: asset.versions ?? [],
  };
}

export async function listStoryboardAssetsForProject(
  ctx: WalrusStorageContext | null,
  project: Project,
  network?: WalrusNetwork,
): Promise<StoryboardAsset[]> {
  const manifest = await tryLoadProjectManifest(project, ctx, network);
  const manifestAssets = (manifest?.storyboardAssets ?? []).map(
    normalizeStoryboardAsset,
  );
  const mergedById = new Map<string, StoryboardAsset>(
    manifestAssets.map((asset) => [asset.id, asset]),
  );
  const cached = listCachedUploadEntries({
    phase: "storyboard",
    projectId: project.id,
  });
  for (const entry of cached) {
    const existing = mergedById.get(entry.assetId);
    const cachedVersion: StoryboardAssetVersion = {
      version: entry.version,
      blobId: makeLocalCacheBlobId(entry.assetId, entry.version),
      savedAt: entry.updatedAt,
    };
    const nextVersions = existing
      ? [...getStoryboardAssetVersions(existing), cachedVersion]
      : [cachedVersion];
    mergedById.set(entry.assetId, {
      id: entry.assetId,
      title: entry.title || entry.assetId,
      blobId: existing?.blobId,
      updatedAt: entry.updatedAt,
      currentVersion: Math.max(existing?.currentVersion ?? 0, entry.version),
      versions: nextVersions,
    });
  }
  return [...mergedById.values()];
}

function normalizeFilmAsset(asset: {
  id: string;
  title: string;
  blobId?: string;
  updatedAt?: string;
  currentVersion?: number;
  versions?: FilmAssetVersion[];
}): FilmAsset {
  return {
    id: asset.id,
    title: asset.title || asset.id,
    blobId: asset.blobId,
    updatedAt: asset.updatedAt ?? new Date(0).toISOString(),
    currentVersion: asset.currentVersion ?? 1,
    versions: asset.versions ?? [],
  };
}

export async function listFilmAssetsForProject(
  ctx: WalrusStorageContext | null,
  project: Project,
  network?: WalrusNetwork,
): Promise<FilmAsset[]> {
  const manifest = await tryLoadProjectManifest(project, ctx, network);
  const manifestAssets = (manifest?.filmAssets ?? []).map(normalizeFilmAsset);
  const mergedById = new Map<string, FilmAsset>(
    manifestAssets.map((asset) => [asset.id, asset]),
  );
  const cached = listCachedUploadEntries({
    phase: "film",
    projectId: project.id,
  });
  for (const entry of cached) {
    const existing = mergedById.get(entry.assetId);
    const cachedVersion: FilmAssetVersion = {
      version: entry.version,
      blobId: makeLocalCacheBlobId(entry.assetId, entry.version),
      savedAt: entry.updatedAt,
    };
    const nextVersions = existing
      ? [...getFilmAssetVersions(existing), cachedVersion]
      : [cachedVersion];
    mergedById.set(entry.assetId, {
      id: entry.assetId,
      title: entry.title || entry.assetId,
      blobId: existing?.blobId,
      updatedAt: entry.updatedAt,
      currentVersion: Math.max(existing?.currentVersion ?? 0, entry.version),
      versions: nextVersions,
    });
  }
  return [...mergedById.values()];
}

export async function listScriptAssets(
  walrusClient: WalrusExtendedClient,
  workspaceBlobId: string,
  network: WalrusNetwork,
): Promise<ScriptAsset[]> {
  try {
    const quiltAssets = await listScriptAssetsFromQuilt(
      walrusClient,
      workspaceBlobId,
    );
    if (quiltAssets.length > 0) return quiltAssets;
  } catch {
    // Not a quilt or quilt read failed — fall through to manifest parse.
  }

  const manifestText = await readBlobText(workspaceBlobId, network);
  return listScriptAssetsFromManifest(manifestText);
}

async function loadScriptAssetRawText(
  ctx: WalrusStorageContext,
  project: Project,
  asset: ScriptAsset,
  version?: number,
): Promise<string> {
  const versionEntry = getScriptAssetVersionEntry(asset, version);
  const targetVersion =
    version ?? versionEntry?.version ?? asset.currentVersion ?? 1;

  const text = await loadTextAssetFromWalrus({
    ctx,
    walrusPathPrefix: project.walrusPathPrefix,
    projectId: project.id,
    phase: "script",
    assetId: asset.id,
    version: targetVersion,
  });

  if (text) {
    return text;
  }

  const blobId = versionEntry?.blobId || asset.blobId;
  if (blobId && !isLocalCacheBlobId(blobId)) {
    try {
      return await downloadAndDecryptText({
        blobId,
        sessionKey: ctx.sessionKey,
        sealClient: ctx.sealClient,
        suiClient: ctx.suiClient,
        vaultId: ctx.vault.vaultId,
        capId: ctx.vault.capId,
      });
    } catch {
      // Fall through to the not-found error below.
    }
  }

  throw new Error(`Script asset not found in Walrus: ${asset.title}`);
}

function resolveScriptAssetBlobId(
  asset: ScriptAsset,
  version?: number,
): string | undefined {
  const versionEntry = getScriptAssetVersionEntry(asset, version);
  return versionEntry?.blobId || asset.blobId || undefined;
}

function loadCachedScriptAssetDocument(
  project: Project,
  asset: ScriptAsset,
): { content: string; prompt: string; generationModelId: string } | null {
  const cached = getCachedUploadEntry({
    phase: "script",
    projectId: project.id,
    assetId: asset.id,
  });
  if (!cached) return null;
  return parseScriptAssetDocument(cached.payload);
}

export async function loadScriptAssetDocument(
  ctx: WalrusStorageContext,
  project: Project,
  asset: ScriptAsset,
  version?: number,
): Promise<{ content: string; prompt: string; generationModelId: string }> {
  if (version === undefined) {
    const pending = getPendingScriptContent(asset.id);
    if (pending !== undefined) {
      return { content: pending, prompt: "", generationModelId: "" };
    }
  }

  const blobId = resolveScriptAssetBlobId(asset, version);
  if (!blobId || isLocalCacheBlobId(blobId)) {
    const cached = loadCachedScriptAssetDocument(project, asset);
    if (cached !== null) {
      return cached;
    }
  }

  const text = await loadScriptAssetRawText(ctx, project, asset, version);
  return parseScriptAssetDocument(text);
}

export async function loadScriptAssetContent(
  ctx: WalrusStorageContext,
  project: Project,
  asset: ScriptAsset,
  version?: number,
): Promise<string> {
  const document = await loadScriptAssetDocument(ctx, project, asset, version);
  return document.content;
}

function defaultScriptTitle(existingAssets: ScriptAsset[]): string {
  const base = "Untitled Script";
  const titles = new Set(existingAssets.map((asset) => asset.title));
  if (!titles.has(base)) return base;

  let index = 2;
  while (titles.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

function titleFromContent(content: string, fallback: string): string {
  const line = content.trim().split("\n")[0]?.trim();
  return line || fallback;
}

export function resolveScriptAssetTitle(
  content: string,
  fallback: string,
  useProvidedTitle?: boolean,
): string {
  if (useProvidedTitle) {
    return fallback.trim();
  }
  return titleFromContent(content, fallback);
}

export function buildOptimisticScriptAsset(
  existingAssets: ScriptAsset[],
  input: {
    id: string;
    title: string;
    content: string;
    useProvidedTitle?: boolean;
  },
): ScriptAsset {
  const existing = existingAssets.find((asset) => asset.id === input.id);
  const title = resolveScriptAssetTitle(
    input.content,
    input.title,
    input.useProvidedTitle,
  );
  const priorVersions = existing ? getScriptAssetVersions(existing) : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;
  const updatedAt = new Date().toISOString();
  const latestBlobId = existing?.blobId ?? priorVersions[0]?.blobId;

  return {
    id: input.id,
    title,
    blobId: latestBlobId,
    updatedAt,
    currentVersion: nextVersion,
    versions: [...priorVersions, { version: nextVersion, blobId: "", savedAt: updatedAt }].sort(
      (a, b) => a.version - b.version,
    ),
  };
}

function serializeScriptAssetDocument(input: {
  id: string;
  title: string;
  content: string;
  prompt?: string;
  generationModelId?: string;
  version: number;
  updatedAt: string;
}): string {
  return JSON.stringify(
    {
      type: "script-asset" as const,
      id: input.id,
      title: input.title,
      content: input.content,
      prompt: input.prompt?.trim() ?? "",
      generationModelId: input.generationModelId?.trim() ?? "",
      version: input.version,
      updatedAt: input.updatedAt,
    },
    null,
    2,
  );
}

export interface ScriptDraft {
  id: string;
  title: string;
}

export function createDraftScript(
  existingAssets: ScriptAsset[],
  title?: string,
): ScriptDraft {
  const trimmedTitle = title?.trim();
  return {
    id: crypto.randomUUID(),
    title: trimmedTitle || defaultScriptTitle(existingAssets),
  };
}

function manifestFromProject(
  project: Project,
  scriptAssets: ScriptAsset[] = [],
  designAssets: DesignAsset[] = [],
  storyboardAssets: StoryboardAsset[] = [],
  filmAssets: FilmAsset[] = [],
): ProjectManifest {
  return buildProjectManifest({
    projectId: project.id,
    title: project.title,
    ownerAddress: project.ownerAddress,
    vaultId: project.vaultId,
    walrusPathPrefix: project.walrusPathPrefix,
    manifestPath: project.manifestPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    scriptAssets,
    designAssets,
    storyboardAssets,
    filmAssets,
  });
}

const manifestLoadInflight = new Map<string, Promise<ProjectManifest | null>>();

const manifestMemoryCache = new Map<
  string,
  { manifestBlobId: string | null; manifest: ProjectManifest }
>();

function manifestCacheKey(project: Project): string {
  return `${project.id}:${project.manifestBlobId ?? ""}`;
}

function readCachedManifest(project: Project): ProjectManifest | null {
  const cached = manifestMemoryCache.get(manifestCacheKey(project));
  return cached?.manifest ?? null;
}

function writeCachedManifest(
  project: Project,
  manifest: ProjectManifest,
): void {
  manifestMemoryCache.set(manifestCacheKey(project), {
    manifestBlobId: project.manifestBlobId ?? null,
    manifest,
  });
}

export function clearProjectManifestMemoryCache(projectId?: string): void {
  if (!projectId) {
    manifestMemoryCache.clear();
    return;
  }
  for (const key of [...manifestMemoryCache.keys()]) {
    if (key.startsWith(`${projectId}:`)) {
      manifestMemoryCache.delete(key);
    }
  }
}

async function tryLoadProjectManifestImpl(
  ctx: WalrusStorageContext | null,
  project: Project,
  network?: WalrusNetwork,
): Promise<ProjectManifest | null> {
  // Prefer the in-memory manifest written by recent saves. Agent mode uses
  // deferred path-index updates, so a Walrus path read can return a stale
  // manifest even though project.manifestBlobId already points at the new one.
  const cached = readCachedManifest(project);
  if (cached) {
    return cached;
  }

  if (ctx) {
    // On-chain path index is the source of truth. Prefer it, then fall back to
    // the locally recorded manifestBlobId when the index is lagging or missing.
    try {
      const fromWalrus = await loadManifestFromWalrus(ctx, project);
      if (fromWalrus) {
        writeCachedManifest(project, fromWalrus);
        return fromWalrus;
      }
    } catch {
      // Fall through: path index can lag or be missing after a deferred flush.
    }

    if (project.manifestBlobId?.trim()) {
      try {
        const fromBlob = await loadManifestByBlobId(ctx, project);
        if (fromBlob) {
          writeCachedManifest(project, fromBlob);
          return fromBlob;
        }
      } catch {
        // Fall through to legacy plaintext reads.
      }
    }
  }

  if (network && project.manifestBlobId) {
    try {
      const text = await readBlobText(project.manifestBlobId, network);
      const manifest = parseProjectManifest(text);
      if (manifest?.projectId === project.id) {
        writeCachedManifest(project, manifest);
        return manifest;
      }
    } catch {
      // ignore legacy plaintext manifest reads
    }
  }

  return null;
}

async function tryLoadProjectManifest(
  project: Project,
  ctx: WalrusStorageContext | null = null,
  network?: WalrusNetwork,
): Promise<ProjectManifest | null> {
  const key = `${project.id}:${network ?? "none"}:${project.manifestBlobId ?? ""}:${ctx?.vault.vaultId ?? "no-vault"}`;
  const inflight = manifestLoadInflight.get(key);
  if (inflight) return inflight;

  const promise = tryLoadProjectManifestImpl(ctx, project, network).finally(() => {
    manifestLoadInflight.delete(key);
  });
  manifestLoadInflight.set(key, promise);
  return promise;
}

async function loadManifestForSave(
  ctx: WalrusStorageContext,
  project: Project,
  allowCacheFallback: boolean,
): Promise<ProjectManifest | null> {
  const cached = readCachedManifest(project);
  if (cached) {
    return cached;
  }

  try {
    const manifest = await tryLoadProjectManifest(project, ctx);
    if (manifest) {
      writeCachedManifest(project, manifest);
    }
    return manifest;
  } catch (error) {
    if (!allowCacheFallback) {
      throw error;
    }
    return null;
  }
}

export interface SaveScriptAssetResult {
  asset: ScriptAsset;
  manifestBlobId: string;
  cachedLocally?: boolean;
}

interface SaveWithCacheFallbackOptions {
  allowCacheFallback?: boolean;
}

function mergeKnownAssetsById<T extends { id: string }>(
  loaded: T[],
  known?: T[],
): T[] {
  if (!known || known.length === 0) {
    return loaded;
  }
  const byId = new Map(loaded.map((asset) => [asset.id, asset]));
  for (const asset of known) {
    byId.set(asset.id, asset);
  }
  return [...byId.values()];
}

export async function saveScriptAsset(
  ctx: WalrusStorageContext,
  project: Project,
  input: {
    id: string;
    title: string;
    content: string;
    /** User brief used to generate this script. Omitted = keep prior prompt when updating. */
    prompt?: string;
    /** Model used to generate this script. Omitted = keep prior model when updating. */
    generationModelId?: string;
    useProvidedTitle?: boolean;
    knownScriptAssets?: ScriptAsset[];
  },
  options?: SaveWithCacheFallbackOptions,
): Promise<SaveScriptAssetResult> {
  const allowCacheFallback = options?.allowCacheFallback ?? false;
  const loadedManifest = await loadManifestForSave(ctx, project, allowCacheFallback);
  const manifest = loadedManifest
    ? {
        ...loadedManifest,
        scriptAssets: mergeKnownAssetsById(
          loadedManifest.scriptAssets,
          input.knownScriptAssets,
        ),
      }
    : manifestFromProject(project, input.knownScriptAssets ?? [], [], []);

  const updatedAt = new Date().toISOString();
  const title = input.useProvidedTitle
    ? input.title.trim()
    : titleFromContent(input.content, input.title);

  const existingIndex = manifest.scriptAssets.findIndex(
    (asset) => asset.id === input.id,
  );
  const existingAsset =
    existingIndex >= 0 ? manifest.scriptAssets[existingIndex] : null;
  const priorVersions = existingAsset ? getScriptAssetVersions(existingAsset) : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;

  let resolvedPrompt = input.prompt?.trim() ?? "";
  let resolvedGenerationModelId = input.generationModelId?.trim() ?? "";
  if (
    (input.prompt === undefined || input.generationModelId === undefined) &&
    existingAsset
  ) {
    try {
      const prior = await loadScriptAssetDocument(ctx, project, existingAsset);
      if (input.prompt === undefined) {
        resolvedPrompt = prior.prompt;
      }
      if (input.generationModelId === undefined) {
        resolvedGenerationModelId = prior.generationModelId;
      }
    } catch {
      // Keep resolved defaults.
    }
  }

  const documentPayload = serializeScriptAssetDocument({
    id: input.id,
    title,
    content: input.content,
    prompt: resolvedPrompt,
    generationModelId: resolvedGenerationModelId,
    version: nextVersion,
    updatedAt,
  });

  try {
    const assetRef = await saveTextAssetToWalrus({
      ctx,
      walrusPathPrefix: project.walrusPathPrefix,
      projectId: project.id,
      phase: "script",
      assetId: input.id,
      version: nextVersion,
      content: documentPayload,
    });

    const versionEntry: ScriptAssetVersion = {
      version: nextVersion,
      blobId: assetRef.blobId,
      savedAt: updatedAt,
    };

    const savedAsset: ScriptAsset = {
      id: input.id,
      title,
      blobId: assetRef.blobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [...priorVersions, versionEntry].sort(
        (a, b) => a.version - b.version,
      ),
    };

    const scriptAssets =
      existingIndex >= 0
        ? manifest.scriptAssets.map((asset, index) =>
            index === existingIndex ? savedAsset : asset,
          )
        : [...manifest.scriptAssets, savedAsset];

    const updatedManifest = buildProjectManifest({
      projectId: manifest.projectId,
      title: manifest.title,
      ownerAddress: manifest.ownerAddress,
      vaultId: manifest.vaultId,
      walrusPathPrefix: manifest.walrusPathPrefix,
      manifestPath: manifest.manifestPath,
      createdAt: manifest.createdAt,
      updatedAt,
      scriptAssets,
      designAssets: manifest.designAssets ?? [],
      storyboardAssets: (manifest.storyboardAssets ?? []).map(
        normalizeStoryboardAsset,
      ),
      filmAssets: (manifest.filmAssets ?? []).map(normalizeFilmAsset),
    });

    const manifestRef = await saveManifestToWalrus(ctx, project, updatedManifest);
    writeCachedManifest(
      { ...project, manifestBlobId: manifestRef.blobId },
      updatedManifest,
    );

    removeCachedUploadEntry({
      phase: "script",
      projectId: project.id,
      assetId: input.id,
    });

    return {
      asset: savedAsset,
      manifestBlobId: manifestRef.blobId,
    };
  } catch (error) {
    if (!options?.allowCacheFallback) {
      throw error;
    }

    const cacheBlobId = makeLocalCacheBlobId(input.id, nextVersion);
    upsertCachedUploadEntry({
      phase: "script",
      projectId: project.id,
      assetId: input.id,
      title,
      updatedAt,
      version: nextVersion,
      payload: documentPayload,
      error: error instanceof Error ? error.message : "Failed to upload script",
    });

    const cachedAsset: ScriptAsset = {
      id: input.id,
      title,
      blobId: cacheBlobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [
        ...priorVersions,
        {
          version: nextVersion,
          blobId: cacheBlobId,
          savedAt: updatedAt,
        },
      ],
    };

    return {
      asset: cachedAsset,
      manifestBlobId: project.manifestBlobId,
      cachedLocally: true,
    };
  }
}

export function getDesignAssetVersions(asset: DesignAsset): DesignAssetVersion[] {
  if (asset.versions && asset.versions.length > 0) {
    return [...asset.versions].sort((a, b) => b.version - a.version);
  }

  if (asset.blobId) {
    return [
      {
        version: asset.currentVersion ?? 1,
        blobId: asset.blobId,
        savedAt: asset.updatedAt ?? new Date(0).toISOString(),
      },
    ];
  }

  return [];
}

export function getLatestDesignAssetVersion(
  asset: DesignAsset,
): DesignAssetVersion | null {
  return getDesignAssetVersions(asset)[0] ?? null;
}

function getDesignAssetVersionEntry(
  asset: DesignAsset,
  version?: number,
): DesignAssetVersion | null {
  const versions = getDesignAssetVersions(asset);
  if (versions.length === 0) return null;

  if (version === undefined) {
    return versions[0];
  }

  return versions.find((entry) => entry.version === version) ?? null;
}

function parseDesignBlobContent(text: string): DesignDocument {
  try {
    const document = designAssetDocumentSchema.parse(JSON.parse(text));
    return document.document;
  } catch {
    throw new Error("Failed to parse design asset document");
  }
}

function mimeTypeFromImageMagic(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * On-chain explorer refs sometimes point at the companion image blob
 * (`…/image.png`) when the design JSON doc is missing from the path index.
 * Synthesize a viewable document so selection can still preview the sheet.
 */
function buildImageOnlyDesignDocument(
  asset: DesignAsset,
  imageBlobId: string,
  mimeType: string,
): DesignDocument {
  return {
    styleBrief: "",
    updatedAt: asset.updatedAt ?? new Date().toISOString(),
    assets: [
      {
        id: asset.id,
        title: asset.title,
        kind: asset.kind,
        description: "",
        prompt: "",
        notes: "",
        generationModelId: "",
        image: {
          mimeType,
          imageBlobId,
        },
      },
    ],
  };
}

async function loadDesignAssetFromWalrus(
  ctx: WalrusStorageContext,
  project: Project,
  asset: DesignAsset,
  version?: number,
): Promise<DesignDocument> {
  const versionEntry = getDesignAssetVersionEntry(asset, version);
  const targetVersion = version ?? versionEntry?.version ?? asset.currentVersion ?? 1;

  const text = await loadTextAssetFromWalrus({
    ctx,
    walrusPathPrefix: project.walrusPathPrefix,
    projectId: project.id,
    phase: "design",
    assetId: asset.id,
    version: targetVersion,
    designKind: asset.kind,
  });

  if (text) {
    return parseDesignBlobContent(text);
  }

  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (blobId && !isLocalCacheBlobId(blobId)) {
    try {
      const bytes = await downloadAndDecryptBytes({
        blobId,
        sessionKey: ctx.sessionKey,
        sealClient: ctx.sealClient,
        suiClient: ctx.suiClient,
        vaultId: ctx.vault.vaultId,
        capId: ctx.vault.capId,
      });
      const asText = new TextDecoder().decode(bytes);
      if (asText.trimStart().startsWith("{")) {
        return parseDesignBlobContent(asText);
      }
      const imageMime = mimeTypeFromImageMagic(bytes);
      if (imageMime) {
        return buildImageOnlyDesignDocument(asset, blobId, imageMime);
      }
      return parseDesignBlobContent(asText);
    } catch {
      // Fall through to the not-found error below.
    }
  }

  throw new Error(`Design asset not found in Walrus: ${asset.title}`);
}

export async function loadDesignAssetDocument(
  ctx: WalrusStorageContext,
  project: Project,
  asset: DesignAsset,
  version?: number,
): Promise<DesignDocument> {
  const pending = getPendingDesignDocument(asset.id);
  if (pending) {
    return pending;
  }

  const versionEntry = getDesignAssetVersionEntry(asset, version);
  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (!blobId || isLocalCacheBlobId(blobId)) {
    const cached = loadCachedDesignDocument(project, asset.id);
    if (cached) {
      return cached;
    }
  }

  try {
    return await loadDesignAssetFromWalrus(ctx, project, asset, version);
  } catch (error) {
    const cached = loadCachedDesignDocument(project, asset.id);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

function defaultDesignTitle(kind: DesignAsset["kind"], existingAssets: DesignAsset[]): string {
  const base = kind === "character" ? "Character Design" : "Environment Design";
  let index = 1;
  while (existingAssets.some((asset) => asset.title === `${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

export function buildOptimisticDesignAsset(
  existingAssets: DesignAsset[],
  input: {
    id: string;
    title: string;
    kind: DesignAsset["kind"];
    primaryFileType?: "text" | "image";
  },
): DesignAsset {
  const existing = existingAssets.find((asset) => asset.id === input.id);
  const title = input.title.trim() || defaultDesignTitle(input.kind, existingAssets);
  const priorVersions = existing ? getDesignAssetVersions(existing) : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;
  const updatedAt = new Date().toISOString();
  const latestBlobId = existing?.blobId ?? priorVersions[0]?.blobId;

  return {
    id: input.id,
    title,
    kind: input.kind,
    primaryFileType: input.primaryFileType ?? existing?.primaryFileType ?? "image",
    blobId: latestBlobId,
    updatedAt,
    currentVersion: nextVersion,
    versions: [...priorVersions, { version: nextVersion, blobId: "", savedAt: updatedAt }].sort(
      (a, b) => a.version - b.version,
    ),
  };
}

function serializeDesignAssetDocument(input: {
  id: string;
  title: string;
  kind: DesignAsset["kind"];
  document: DesignDocument;
  version: number;
  updatedAt: string;
}): string {
  return JSON.stringify(
    {
      type: "design-asset" as const,
      id: input.id,
      title: input.title,
      kind: input.kind,
      version: input.version,
      updatedAt: input.updatedAt,
      document: input.document,
    },
    null,
    2,
  );
}

export interface SaveDesignAssetResult {
  asset: DesignAsset;
  manifestBlobId: string;
  cachedLocally?: boolean;
}

async function normalizeDesignDocumentForStorage(
  ctx: WalrusStorageContext,
  document: DesignDocument,
  project: Project,
  /** Catalog DesignAsset id — images are indexed under the same Assets/<id>/ tree as the JSON doc. */
  storageAssetId: string,
): Promise<DesignDocument> {
  const normalizedAssets = await Promise.all(
    document.assets.map(async (asset) => {
      const imageBlobId = asset.image.imageBlobId?.trim();
      if (imageBlobId && imageBlobId.length > 0) {
        return {
          ...asset,
          image: {
            mimeType: asset.image.mimeType,
            imageBlobId,
            imageBlobObjectId: asset.image.imageBlobObjectId,
          },
        };
      }

      const dataBase64 = asset.image.dataBase64?.trim();
      if (!dataBase64) {
        throw new Error(`Design asset "${asset.title}" is missing image data`);
      }

      const bytes = base64ToUint8Array(dataBase64);
      const extension = asset.image.mimeType.split("/")[1] || "png";
      const imageRef = await writeProjectBytesAtPath(
        ctx,
        project.walrusPathPrefix,
        designImagePath(project.id, storageAssetId, extension, asset.kind),
        bytes,
      );

      return {
        ...asset,
        image: {
          mimeType: asset.image.mimeType,
          imageBlobId: imageRef.blobId,
          imageBlobObjectId: imageRef.blobObjectId,
        },
      };
    }),
  );

  return {
    ...document,
    assets: normalizedAssets,
  };
}

export async function saveDesignAsset(
  ctx: WalrusStorageContext,
  project: Project,
  input: {
    id: string;
    title: string;
    kind: DesignAsset["kind"];
    primaryFileType?: "text" | "image";
    document: DesignDocument;
    knownDesignAssets?: DesignAsset[];
  },
  options?: SaveWithCacheFallbackOptions,
): Promise<SaveDesignAssetResult> {
  const allowCacheFallback = options?.allowCacheFallback ?? false;
  const loadedManifest = await loadManifestForSave(ctx, project, allowCacheFallback);
  const manifest = loadedManifest
    ? {
        ...loadedManifest,
        designAssets: mergeKnownAssetsById(
          loadedManifest.designAssets ?? [],
          input.knownDesignAssets,
        ),
      }
    : manifestFromProject(project, [], input.knownDesignAssets ?? [], []);

  const updatedAt = new Date().toISOString();
  const title =
    input.title.trim() ||
    defaultDesignTitle(
      input.kind,
      (manifest.designAssets ?? []).map(normalizeDesignAsset),
    );

  const existingIndex = (manifest.designAssets ?? []).findIndex(
    (asset) => asset.id === input.id,
  );
  const existingAsset =
    existingIndex >= 0 ? manifest.designAssets?.[existingIndex] ?? null : null;
  const normalizedExisting = existingAsset ? normalizeDesignAsset(existingAsset) : null;
  const priorVersions = normalizedExisting
    ? getDesignAssetVersions(normalizedExisting)
    : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;

  const nextDocument: DesignDocument = {
    ...input.document,
    updatedAt,
  };

  try {
    const uploadedDocument = await normalizeDesignDocumentForStorage(
      ctx,
      input.document,
      project,
      input.id,
    );

    const persistedDocument: DesignDocument = {
      ...uploadedDocument,
      updatedAt,
    };

    const assetRef = await saveTextAssetToWalrus({
      ctx,
      walrusPathPrefix: project.walrusPathPrefix,
      projectId: project.id,
      phase: "design",
      assetId: input.id,
      version: nextVersion,
      designKind: input.kind,
      content: serializeDesignAssetDocument({
        id: input.id,
        title,
        kind: input.kind,
        document: persistedDocument,
        version: nextVersion,
        updatedAt,
      }),
    });

    const versionEntry: DesignAssetVersion = {
      version: nextVersion,
      blobId: assetRef.blobId,
      savedAt: updatedAt,
    };

    const savedAsset: DesignAsset = {
      id: input.id,
      title,
      kind: input.kind,
      primaryFileType: input.primaryFileType ?? normalizedExisting?.primaryFileType ?? "image",
      blobId: assetRef.blobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [...priorVersions, versionEntry].sort(
        (a, b) => a.version - b.version,
      ),
    };

    const designAssets =
      existingIndex >= 0
        ? (manifest.designAssets ?? []).map((asset, index) =>
            index === existingIndex ? savedAsset : normalizeDesignAsset(asset),
          )
        : [...(manifest.designAssets ?? []).map(normalizeDesignAsset), savedAsset];

    const updatedManifest = buildProjectManifest({
      projectId: manifest.projectId,
      title: manifest.title,
      ownerAddress: manifest.ownerAddress,
      vaultId: manifest.vaultId,
      walrusPathPrefix: manifest.walrusPathPrefix,
      manifestPath: manifest.manifestPath,
      createdAt: manifest.createdAt,
      updatedAt,
      scriptAssets: manifest.scriptAssets,
      designAssets,
      storyboardAssets: (manifest.storyboardAssets ?? []).map(
        normalizeStoryboardAsset,
      ),
      filmAssets: (manifest.filmAssets ?? []).map(normalizeFilmAsset),
    });

    const manifestRef = await saveManifestToWalrus(ctx, project, updatedManifest);
    writeCachedManifest(
      { ...project, manifestBlobId: manifestRef.blobId },
      updatedManifest,
    );

    removeCachedUploadEntry({
      phase: "design",
      projectId: project.id,
      assetId: input.id,
    });

    return {
      asset: savedAsset,
      manifestBlobId: manifestRef.blobId,
    };
  } catch (error) {
    if (!options?.allowCacheFallback) {
      throw error;
    }

    const cacheBlobId = makeLocalCacheBlobId(input.id, nextVersion);
    upsertCachedUploadEntry({
      phase: "design",
      projectId: project.id,
      assetId: input.id,
      title,
      updatedAt,
      version: nextVersion,
      kind: input.kind,
      payload: JSON.stringify(nextDocument),
      error: error instanceof Error ? error.message : "Failed to upload design",
    });

    const cachedAsset: DesignAsset = {
      id: input.id,
      title,
      kind: input.kind,
      primaryFileType: input.primaryFileType ?? normalizedExisting?.primaryFileType ?? "image",
      blobId: cacheBlobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [
        ...priorVersions,
        {
          version: nextVersion,
          blobId: cacheBlobId,
          savedAt: updatedAt,
        },
      ],
    };

    return {
      asset: cachedAsset,
      manifestBlobId: project.manifestBlobId,
      cachedLocally: true,
    };
  }
}

export interface SaveDesignAssetsBatchResult {
  assets: DesignAsset[];
  manifestBlobId: string;
  cachedLocally: boolean;
}

export async function saveDesignAssetsBatch(
  ctx: WalrusStorageContext,
  project: Project,
  inputs: Array<{
    id: string;
    title: string;
    kind: DesignAsset["kind"];
    primaryFileType?: "text" | "image";
    document: DesignDocument;
  }>,
  options?: SaveWithCacheFallbackOptions & {
    knownDesignAssets?: DesignAsset[];
  },
): Promise<SaveDesignAssetsBatchResult> {
  if (inputs.length === 0) {
    return {
      assets: [],
      manifestBlobId: project.manifestBlobId,
      cachedLocally: false,
    };
  }

  const allowCacheFallback = options?.allowCacheFallback ?? false;
  const loadedManifest = await loadManifestForSave(ctx, project, allowCacheFallback);
  const manifest = loadedManifest
    ? {
        ...loadedManifest,
        designAssets: mergeKnownAssetsById(
          loadedManifest.designAssets ?? [],
          options?.knownDesignAssets,
        ),
      }
    : manifestFromProject(project, [], options?.knownDesignAssets ?? [], []);

  const updatedAt = new Date().toISOString();
  let designAssets = (manifest.designAssets ?? []).map(normalizeDesignAsset);
  let cachedLocally = false;

  const savedAssets = await Promise.all(
    inputs.map(async (input) => {
      const title =
        input.title.trim() ||
        defaultDesignTitle(
          input.kind,
          designAssets,
        );

      const existingIndex = designAssets.findIndex((asset) => asset.id === input.id);
      const existingAsset =
        existingIndex >= 0 ? designAssets[existingIndex] ?? null : null;
      const normalizedExisting = existingAsset
        ? normalizeDesignAsset(existingAsset)
        : null;
      const priorVersions = normalizedExisting
        ? getDesignAssetVersions(normalizedExisting)
        : [];
      const nextVersion =
        priorVersions.length > 0
          ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
          : 1;

      const nextDocument: DesignDocument = {
        ...input.document,
        updatedAt,
      };

      try {
        const uploadedDocument = await normalizeDesignDocumentForStorage(
          ctx,
          input.document,
          project,
          input.id,
        );

        const persistedDocument: DesignDocument = {
          ...uploadedDocument,
          updatedAt,
        };

        const assetRef = await saveTextAssetToWalrus({
          ctx,
          walrusPathPrefix: project.walrusPathPrefix,
          projectId: project.id,
          phase: "design",
          assetId: input.id,
          version: nextVersion,
          designKind: input.kind,
          content: serializeDesignAssetDocument({
            id: input.id,
            title,
            kind: input.kind,
            document: persistedDocument,
            version: nextVersion,
            updatedAt,
          }),
        });

        const versionEntry: DesignAssetVersion = {
          version: nextVersion,
          blobId: assetRef.blobId,
          savedAt: updatedAt,
        };

        return {
          asset: {
            id: input.id,
            title,
            kind: input.kind,
            primaryFileType:
              input.primaryFileType ??
              normalizedExisting?.primaryFileType ??
              "image",
            blobId: assetRef.blobId,
            updatedAt,
            currentVersion: nextVersion,
            versions: [...priorVersions, versionEntry].sort(
              (a, b) => a.version - b.version,
            ),
          } satisfies DesignAsset,
          cachedLocally: false,
        };
      } catch (error) {
        if (!allowCacheFallback) {
          throw error;
        }

        const cacheBlobId = makeLocalCacheBlobId(input.id, nextVersion);
        upsertCachedUploadEntry({
          phase: "design",
          projectId: project.id,
          assetId: input.id,
          title,
          updatedAt,
          version: nextVersion,
          kind: input.kind,
          payload: JSON.stringify(nextDocument),
          error:
            error instanceof Error ? error.message : "Failed to upload design",
        });

        return {
          asset: {
            id: input.id,
            title,
            kind: input.kind,
            primaryFileType:
              input.primaryFileType ??
              normalizedExisting?.primaryFileType ??
              "image",
            blobId: cacheBlobId,
            updatedAt,
            currentVersion: nextVersion,
            versions: [
              ...priorVersions,
              {
                version: nextVersion,
                blobId: cacheBlobId,
                savedAt: updatedAt,
              },
            ],
          } satisfies DesignAsset,
          cachedLocally: true,
        };
      }
    }),
  );

  for (const { asset, cachedLocally: assetCached } of savedAssets) {
    if (assetCached) {
      cachedLocally = true;
    }

    const existingIndex = designAssets.findIndex((entry) => entry.id === asset.id);
    if (existingIndex >= 0) {
      designAssets = designAssets.map((entry, index) =>
        index === existingIndex ? asset : entry,
      );
    } else {
      designAssets = [...designAssets, asset];
    }
  }

  const updatedManifest = buildProjectManifest({
    projectId: manifest.projectId,
    title: manifest.title,
    ownerAddress: manifest.ownerAddress,
    vaultId: manifest.vaultId,
    walrusPathPrefix: manifest.walrusPathPrefix,
    manifestPath: manifest.manifestPath,
    createdAt: manifest.createdAt,
    updatedAt,
    scriptAssets: manifest.scriptAssets,
    designAssets,
    storyboardAssets: (manifest.storyboardAssets ?? []).map(
      normalizeStoryboardAsset,
    ),
    filmAssets: (manifest.filmAssets ?? []).map(normalizeFilmAsset),
  });

  const manifestRef = await saveManifestToWalrus(ctx, project, updatedManifest);
  writeCachedManifest(
    { ...project, manifestBlobId: manifestRef.blobId },
    updatedManifest,
  );

  for (const input of inputs) {
    removeCachedUploadEntry({
      phase: "design",
      projectId: project.id,
      assetId: input.id,
    });
  }

  return {
    assets: savedAssets.map((entry) => entry.asset),
    manifestBlobId: manifestRef.blobId,
    cachedLocally,
  };
}

export function getStoryboardAssetVersions(
  asset: StoryboardAsset,
): StoryboardAssetVersion[] {
  if (asset.versions.length > 0) {
    return [...asset.versions].sort((a, b) => b.version - a.version);
  }

  if (asset.blobId) {
    return [
      {
        version: asset.currentVersion ?? 1,
        blobId: asset.blobId,
        savedAt: asset.updatedAt ?? new Date(0).toISOString(),
      },
    ];
  }

  return [];
}

export function getLatestStoryboardAssetVersion(
  asset: StoryboardAsset,
): StoryboardAssetVersion | null {
  return getStoryboardAssetVersions(asset)[0] ?? null;
}

function getStoryboardAssetVersionEntry(
  asset: StoryboardAsset,
  version?: number,
): StoryboardAssetVersion | null {
  const versions = getStoryboardAssetVersions(asset);
  if (versions.length === 0) return null;

  if (version === undefined) {
    return versions[0];
  }

  return versions.find((entry) => entry.version === version) ?? null;
}

function parseStoryboardBlobContent(text: string): StoryboardDocument {
  try {
    const document = storyboardAssetDocumentSchema.parse(JSON.parse(text));
    return document.document;
  } catch {
    throw new Error("Failed to parse storyboard asset document");
  }
}

async function loadStoryboardAssetFromWalrus(
  ctx: WalrusStorageContext,
  project: Project,
  asset: StoryboardAsset,
  version?: number,
): Promise<StoryboardDocument> {
  const versionEntry = getStoryboardAssetVersionEntry(asset, version);
  const targetVersion =
    version ?? versionEntry?.version ?? asset.currentVersion ?? 1;

  const text = await loadTextAssetFromWalrus({
    ctx,
    walrusPathPrefix: project.walrusPathPrefix,
    projectId: project.id,
    phase: "storyboard",
    assetId: asset.id,
    version: targetVersion,
  });

  if (text) {
    return parseStoryboardBlobContent(text);
  }

  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (blobId && !isLocalCacheBlobId(blobId)) {
    try {
      const byBlob = await downloadAndDecryptText({
        blobId,
        sessionKey: ctx.sessionKey,
        sealClient: ctx.sealClient,
        suiClient: ctx.suiClient,
        vaultId: ctx.vault.vaultId,
        capId: ctx.vault.capId,
      });
      return parseStoryboardBlobContent(byBlob);
    } catch {
      // Fall through to the not-found error below.
    }
  }

  throw new Error(`Storyboard asset not found in Walrus: ${asset.title}`);
}

export async function loadStoryboardAssetDocument(
  ctx: WalrusStorageContext,
  project: Project,
  asset: StoryboardAsset,
  version?: number,
): Promise<StoryboardDocument> {
  const versionEntry = getStoryboardAssetVersionEntry(asset, version);
  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (!blobId || isLocalCacheBlobId(blobId)) {
    const cached = getCachedUploadEntry({
      phase: "storyboard",
      projectId: project.id,
      assetId: asset.id,
    });
    if (cached) {
      return storyboardDocumentSchema.parse(JSON.parse(cached.payload));
    }
  }

  return loadStoryboardAssetFromWalrus(ctx, project, asset, version);
}

function defaultStoryboardTitle(existingAssets: StoryboardAsset[]): string {
  let index = existingAssets.length + 1;
  while (existingAssets.some((asset) => asset.title === `Storyboard ${index}`)) {
    index += 1;
  }
  return `Storyboard ${index}`;
}

export function buildOptimisticStoryboardAsset(
  existingAssets: StoryboardAsset[],
  input: {
    id: string;
    title: string;
  },
): StoryboardAsset {
  const existing = existingAssets.find((asset) => asset.id === input.id);
  const title = input.title.trim() || defaultStoryboardTitle(existingAssets);
  const priorVersions = existing ? getStoryboardAssetVersions(existing) : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;
  const updatedAt = new Date().toISOString();
  const latestBlobId = existing?.blobId ?? priorVersions[0]?.blobId;

  return {
    id: input.id,
    title,
    blobId: latestBlobId,
    updatedAt,
    currentVersion: nextVersion,
    versions: [
      ...priorVersions,
      { version: nextVersion, blobId: "", savedAt: updatedAt },
    ].sort((a, b) => a.version - b.version),
  };
}

function serializeStoryboardAssetDocument(input: {
  id: string;
  title: string;
  document: StoryboardDocument;
  version: number;
  updatedAt: string;
}): string {
  return JSON.stringify(
    {
      type: "storyboard-asset" as const,
      id: input.id,
      title: input.title,
      version: input.version,
      updatedAt: input.updatedAt,
      document: input.document,
    },
    null,
    2,
  );
}

export interface SaveStoryboardAssetResult {
  asset: StoryboardAsset;
  manifestBlobId: string;
  cachedLocally?: boolean;
}

async function normalizeStoryboardDocumentForStorage(
  ctx: WalrusStorageContext,
  document: StoryboardDocument,
  project: Project,
): Promise<StoryboardDocument> {
  if (!document.sheets?.length) {
    return document;
  }

  const normalizedSheets = await Promise.all(
    document.sheets.map(async (sheet) => {
      const imageBlobId = sheet.image.imageBlobId?.trim();
      if (imageBlobId && imageBlobId.length > 0) {
        return {
          ...sheet,
          image: {
            mimeType: sheet.image.mimeType,
            imageBlobId,
            imageBlobObjectId: sheet.image.imageBlobObjectId,
          },
        };
      }

      const dataBase64 = sheet.image.dataBase64?.trim();
      if (!dataBase64) {
        throw new Error(
          `Storyboard sheet "${sheet.segmentTitle}" is missing image data`,
        );
      }

      const bytes = base64ToUint8Array(dataBase64);
      const extension = sheet.image.mimeType.split("/")[1] || "png";
      const imageRef = await writeProjectBytesAtPath(
        ctx,
        project.walrusPathPrefix,
        storyboardSheetImagePath(project.id, sheet.segmentId, extension),
        bytes,
      );

      return {
        ...sheet,
        image: {
          mimeType: sheet.image.mimeType,
          imageBlobId: imageRef.blobId,
          imageBlobObjectId: imageRef.blobObjectId,
        },
      };
    }),
  );

  return {
    ...document,
    sheets: normalizedSheets,
  };
}

export async function saveStoryboardAsset(
  ctx: WalrusStorageContext,
  project: Project,
  input: {
    id: string;
    title: string;
    document: StoryboardDocument;
    useProvidedTitle?: boolean;
    knownStoryboardAssets?: StoryboardAsset[];
  },
  options?: SaveWithCacheFallbackOptions,
): Promise<SaveStoryboardAssetResult> {
  const allowCacheFallback = options?.allowCacheFallback ?? false;
  const loadedManifest = await loadManifestForSave(ctx, project, allowCacheFallback);
  const manifest = loadedManifest
    ? {
        ...loadedManifest,
        storyboardAssets: mergeKnownAssetsById(
          loadedManifest.storyboardAssets ?? [],
          input.knownStoryboardAssets,
        ),
      }
    : manifestFromProject(project, [], [], input.knownStoryboardAssets ?? []);

  const updatedAt = new Date().toISOString();
  const title = input.useProvidedTitle
    ? input.title.trim()
    : input.title.trim() ||
      defaultStoryboardTitle(
        (manifest.storyboardAssets ?? []).map(normalizeStoryboardAsset),
      );

  const existingIndex = (manifest.storyboardAssets ?? []).findIndex(
    (asset) => asset.id === input.id,
  );
  const existingAsset =
    existingIndex >= 0 ? manifest.storyboardAssets?.[existingIndex] ?? null : null;
  const normalizedExisting = existingAsset
    ? normalizeStoryboardAsset(existingAsset)
    : null;
  const priorVersions = normalizedExisting
    ? getStoryboardAssetVersions(normalizedExisting)
    : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;

  const nextDocument: StoryboardDocument = {
    ...input.document,
    updatedAt,
  };

  try {
    const persistedDocument = await normalizeStoryboardDocumentForStorage(
      ctx,
      nextDocument,
      project,
    );

    const assetRef = await saveTextAssetToWalrus({
      ctx,
      walrusPathPrefix: project.walrusPathPrefix,
      projectId: project.id,
      phase: "storyboard",
      assetId: input.id,
      version: nextVersion,
      content: serializeStoryboardAssetDocument({
        id: input.id,
        title,
        document: persistedDocument,
        version: nextVersion,
        updatedAt,
      }),
    });

    const versionEntry: StoryboardAssetVersion = {
      version: nextVersion,
      blobId: assetRef.blobId,
      savedAt: updatedAt,
    };

    const savedAsset: StoryboardAsset = {
      id: input.id,
      title,
      blobId: assetRef.blobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [...priorVersions, versionEntry].sort(
        (a, b) => a.version - b.version,
      ),
    };

    const storyboardAssets =
      existingIndex >= 0
        ? (manifest.storyboardAssets ?? []).map((asset, index) =>
            index === existingIndex ? savedAsset : normalizeStoryboardAsset(asset),
          )
        : [
            ...(manifest.storyboardAssets ?? []).map(normalizeStoryboardAsset),
            savedAsset,
          ];

    const updatedManifest = buildProjectManifest({
      projectId: manifest.projectId,
      title: manifest.title,
      ownerAddress: manifest.ownerAddress,
      vaultId: manifest.vaultId,
      walrusPathPrefix: manifest.walrusPathPrefix,
      manifestPath: manifest.manifestPath,
      createdAt: manifest.createdAt,
      updatedAt,
      scriptAssets: manifest.scriptAssets,
      designAssets: manifest.designAssets ?? [],
      storyboardAssets,
      filmAssets: (manifest.filmAssets ?? []).map(normalizeFilmAsset),
    });

    const manifestRef = await saveManifestToWalrus(ctx, project, updatedManifest);
    writeCachedManifest(
      { ...project, manifestBlobId: manifestRef.blobId },
      updatedManifest,
    );

    removeCachedUploadEntry({
      phase: "storyboard",
      projectId: project.id,
      assetId: input.id,
    });

    return {
      asset: savedAsset,
      manifestBlobId: manifestRef.blobId,
    };
  } catch (error) {
    if (!options?.allowCacheFallback) {
      throw error;
    }

    const cacheBlobId = makeLocalCacheBlobId(input.id, nextVersion);
    upsertCachedUploadEntry({
      phase: "storyboard",
      projectId: project.id,
      assetId: input.id,
      title,
      updatedAt,
      version: nextVersion,
      payload: JSON.stringify(nextDocument),
      error:
        error instanceof Error ? error.message : "Failed to upload storyboard",
    });

    const cachedAsset: StoryboardAsset = {
      id: input.id,
      title,
      blobId: cacheBlobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [
        ...priorVersions,
        {
          version: nextVersion,
          blobId: cacheBlobId,
          savedAt: updatedAt,
        },
      ],
    };

    return {
      asset: cachedAsset,
      manifestBlobId: project.manifestBlobId,
      cachedLocally: true,
    };
  }
}

function getFilmAssetVersions(asset: FilmAsset): FilmAssetVersion[] {
  if (asset.versions && asset.versions.length > 0) {
    return [...asset.versions].sort((a, b) => b.version - a.version);
  }

  if (asset.blobId) {
    return [
      {
        version: asset.currentVersion ?? 1,
        blobId: asset.blobId,
        savedAt: asset.updatedAt ?? new Date(0).toISOString(),
      },
    ];
  }

  return [];
}

function getFilmAssetVersionEntry(
  asset: FilmAsset,
  version?: number,
): FilmAssetVersion | null {
  const versions = getFilmAssetVersions(asset);
  if (versions.length === 0) return null;

  if (version === undefined) {
    return versions[0];
  }

  return versions.find((entry) => entry.version === version) ?? null;
}

function parseFilmBlobContent(text: string): FilmDocument {
  try {
    const document = filmAssetDocumentSchema.parse(JSON.parse(text));
    return document.document;
  } catch {
    throw new Error("Failed to parse film asset document");
  }
}

async function loadFilmAssetFromWalrus(
  ctx: WalrusStorageContext,
  project: Project,
  asset: FilmAsset,
  version?: number,
): Promise<FilmDocument> {
  const versionEntry = getFilmAssetVersionEntry(asset, version);
  const targetVersion = version ?? versionEntry?.version ?? asset.currentVersion ?? 1;

  const text = await loadTextAssetFromWalrus({
    ctx,
    walrusPathPrefix: project.walrusPathPrefix,
    projectId: project.id,
    phase: "film",
    assetId: asset.id,
    version: targetVersion,
  });

  if (text) {
    return parseFilmBlobContent(text);
  }

  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (blobId && !isLocalCacheBlobId(blobId)) {
    try {
      const byBlob = await downloadAndDecryptText({
        blobId,
        sessionKey: ctx.sessionKey,
        sealClient: ctx.sealClient,
        suiClient: ctx.suiClient,
        vaultId: ctx.vault.vaultId,
        capId: ctx.vault.capId,
      });
      return parseFilmBlobContent(byBlob);
    } catch {
      // Fall through to the not-found error below.
    }
  }

  throw new Error(`Film asset not found in Walrus: ${asset.title}`);
}

export async function loadFilmAssetDocument(
  ctx: WalrusStorageContext,
  project: Project,
  asset: FilmAsset,
  version?: number,
): Promise<FilmDocument> {
  const versionEntry = getFilmAssetVersionEntry(asset, version);
  const blobId = versionEntry?.blobId ?? asset.blobId;
  if (!blobId || isLocalCacheBlobId(blobId)) {
    const cached = getCachedUploadEntry({
      phase: "film",
      projectId: project.id,
      assetId: asset.id,
    });
    if (cached) {
      return filmDocumentSchema.parse(JSON.parse(cached.payload));
    }
  }

  return loadFilmAssetFromWalrus(ctx, project, asset, version);
}

function defaultFilmTitle(existingAssets: FilmAsset[]): string {
  const usedNumbers = new Set<number>();
  const pattern = /^Clip\s+(\d+)$/i;

  for (const asset of existingAssets) {
    const match = asset.title.match(pattern);
    if (match) {
      usedNumbers.add(Number.parseInt(match[1], 10));
    }
  }

  let next = 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }

  return `Clip ${next}`;
}

export interface FilmDraft {
  id: string;
  title: string;
}

export function createDraftFilm(existingAssets: FilmAsset[]): FilmDraft {
  return {
    id: crypto.randomUUID(),
    title: defaultFilmTitle(existingAssets),
  };
}

export function buildOptimisticFilmAsset(
  existingAssets: FilmAsset[],
  input: {
    id: string;
    title: string;
  },
): FilmAsset {
  const existing = existingAssets.find((asset) => asset.id === input.id);
  const title = input.title.trim() || defaultFilmTitle(existingAssets);
  const priorVersions = existing ? getFilmAssetVersions(existing) : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;
  const updatedAt = new Date().toISOString();
  const latestBlobId = existing?.blobId ?? priorVersions[0]?.blobId;

  return {
    id: input.id,
    title,
    blobId: latestBlobId,
    updatedAt,
    currentVersion: nextVersion,
    versions: [
      ...priorVersions,
      { version: nextVersion, blobId: "", savedAt: updatedAt },
    ].sort((a, b) => a.version - b.version),
  };
}

function serializeFilmAssetDocument(input: {
  id: string;
  title: string;
  document: FilmDocument;
  version: number;
  updatedAt: string;
}): string {
  return JSON.stringify(
    {
      type: "film-asset" as const,
      id: input.id,
      title: input.title,
      version: input.version,
      updatedAt: input.updatedAt,
      document: input.document,
    },
    null,
    2,
  );
}

export interface SaveFilmAssetResult {
  asset: FilmAsset;
  manifestBlobId: string;
  document: FilmDocument;
  cachedLocally?: boolean;
}

async function normalizeFilmDocumentForStorage(
  ctx: WalrusStorageContext,
  document: FilmDocument,
  project: Project,
  clipId: string,
  videoBytes?: Uint8Array,
  videoMimeType?: string,
): Promise<FilmDocument> {
  if (!document.video && !videoBytes) {
    return document;
  }

  const video = document.video ?? {
    mimeType: videoMimeType ?? "video/mp4",
  };

  const videoBlobId = video.videoBlobId?.trim();
  if (videoBlobId) {
    return {
      ...document,
      video: {
        mimeType: video.mimeType,
        videoBlobId,
        videoBlobObjectId: video.videoBlobObjectId,
      },
    };
  }

  const bytes =
    videoBytes ??
    (video.dataBase64?.trim()
      ? base64ToUint8Array(video.dataBase64.trim())
      : null);

  if (!bytes) {
    if (document.status === "ready") {
      throw new Error("Film clip is missing video data");
    }
    return document;
  }

  const mimeType = videoMimeType ?? video.mimeType;
  const extension = mimeType.split("/")[1] || "mp4";
  const videoRef = await writeProjectBytesAtPath(
    ctx,
    project.walrusPathPrefix,
    filmVideoPath(project.id, clipId, extension),
    bytes,
  );

  return {
    ...document,
    video: {
      mimeType,
      videoBlobId: videoRef.blobId,
      videoBlobObjectId: videoRef.blobObjectId,
    },
  };
}

export async function saveFilmAsset(
  ctx: WalrusStorageContext,
  project: Project,
  input: {
    id: string;
    title: string;
    document: FilmDocument;
    videoBytes?: Uint8Array;
    videoMimeType?: string;
    knownFilmAssets?: FilmAsset[];
  },
  options?: SaveWithCacheFallbackOptions,
): Promise<SaveFilmAssetResult> {
  const allowCacheFallback = options?.allowCacheFallback ?? false;
  const loadedManifest = await loadManifestForSave(ctx, project, allowCacheFallback);
  const manifest = loadedManifest
    ? {
        ...loadedManifest,
        filmAssets: mergeKnownAssetsById(
          loadedManifest.filmAssets ?? [],
          input.knownFilmAssets,
        ),
      }
    : manifestFromProject(
        project,
        [],
        [],
        [],
        input.knownFilmAssets ?? [],
      );

  const updatedAt = new Date().toISOString();
  const title =
    input.title.trim() ||
    defaultFilmTitle((manifest.filmAssets ?? []).map(normalizeFilmAsset));

  const existingIndex = (manifest.filmAssets ?? []).findIndex(
    (asset) => asset.id === input.id,
  );
  const existingAsset =
    existingIndex >= 0 ? manifest.filmAssets?.[existingIndex] ?? null : null;
  const normalizedExisting = existingAsset ? normalizeFilmAsset(existingAsset) : null;
  const priorVersions = normalizedExisting
    ? getFilmAssetVersions(normalizedExisting)
    : [];
  const nextVersion =
    priorVersions.length > 0
      ? Math.max(...priorVersions.map((entry) => entry.version)) + 1
      : 1;

  const baseDocument: FilmDocument = {
    ...input.document,
    updatedAt,
  };

  try {
    const nextDocument = await normalizeFilmDocumentForStorage(
      ctx,
      baseDocument,
      project,
      input.id,
      input.videoBytes,
      input.videoMimeType,
    );

    const assetRef = await saveTextAssetToWalrus({
      ctx,
      walrusPathPrefix: project.walrusPathPrefix,
      projectId: project.id,
      phase: "film",
      assetId: input.id,
      version: nextVersion,
      content: serializeFilmAssetDocument({
        id: input.id,
        title,
        document: nextDocument,
        version: nextVersion,
        updatedAt,
      }),
    });

    const versionEntry: FilmAssetVersion = {
      version: nextVersion,
      blobId: assetRef.blobId,
      savedAt: updatedAt,
    };

    const savedAsset: FilmAsset = {
      id: input.id,
      title,
      blobId: assetRef.blobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [...priorVersions, versionEntry].sort(
        (a, b) => a.version - b.version,
      ),
    };

    const filmAssets =
      existingIndex >= 0
        ? (manifest.filmAssets ?? []).map((asset, index) =>
            index === existingIndex ? savedAsset : normalizeFilmAsset(asset),
          )
        : [...(manifest.filmAssets ?? []).map(normalizeFilmAsset), savedAsset];

    const updatedManifest = buildProjectManifest({
      projectId: manifest.projectId,
      title: manifest.title,
      ownerAddress: manifest.ownerAddress,
      vaultId: manifest.vaultId,
      walrusPathPrefix: manifest.walrusPathPrefix,
      manifestPath: manifest.manifestPath,
      createdAt: manifest.createdAt,
      updatedAt,
      scriptAssets: manifest.scriptAssets,
      designAssets: manifest.designAssets ?? [],
      storyboardAssets: (manifest.storyboardAssets ?? []).map(
        normalizeStoryboardAsset,
      ),
      filmAssets,
    });

    const manifestRef = await saveManifestToWalrus(ctx, project, updatedManifest);
    writeCachedManifest(
      { ...project, manifestBlobId: manifestRef.blobId },
      updatedManifest,
    );

    removeCachedUploadEntry({
      phase: "film",
      projectId: project.id,
      assetId: input.id,
    });

    return {
      asset: savedAsset,
      manifestBlobId: manifestRef.blobId,
      document: nextDocument,
    };
  } catch (error) {
    if (!options?.allowCacheFallback) {
      throw error;
    }

    const mimeType =
      input.videoMimeType ?? input.document.video?.mimeType ?? "video/mp4";
    const cachedDocument: FilmDocument = {
      ...baseDocument,
      video: input.videoBytes
        ? {
            mimeType,
            dataBase64: uint8ArrayToBase64(input.videoBytes),
          }
        : baseDocument.video,
    };

    const cacheBlobId = makeLocalCacheBlobId(input.id, nextVersion);
    upsertCachedUploadEntry({
      phase: "film",
      projectId: project.id,
      assetId: input.id,
      title,
      updatedAt,
      version: nextVersion,
      payload: JSON.stringify(cachedDocument),
      error: error instanceof Error ? error.message : "Failed to upload film clip",
    });

    const cachedAsset: FilmAsset = {
      id: input.id,
      title,
      blobId: cacheBlobId,
      updatedAt,
      currentVersion: nextVersion,
      versions: [
        ...priorVersions,
        {
          version: nextVersion,
          blobId: cacheBlobId,
          savedAt: updatedAt,
        },
      ],
    };

    return {
      asset: cachedAsset,
      manifestBlobId: project.manifestBlobId,
      document: cachedDocument,
      cachedLocally: true,
    };
  }
}
