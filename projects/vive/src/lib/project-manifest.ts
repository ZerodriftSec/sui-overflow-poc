import { z } from "zod";
import type { StoryboardAsset } from "./project";
import type { DesignAsset, FilmAsset, ScriptAsset } from "./workspace";

const walrusBlobRefSchema = z.object({
  blobId: z.string(),
  blobObjectId: z.string().optional().default(""),
});

const scriptAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  blobObjectId: z.string().optional(),
  savedAt: z.string(),
});

const scriptAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  blobObjectId: z.string().optional(),
  identifier: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(scriptAssetVersionSchema).optional(),
});

const storyboardAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  blobObjectId: z.string().optional(),
  savedAt: z.string(),
});

const storyboardAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  blobObjectId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(storyboardAssetVersionSchema).optional(),
});

const designAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  blobObjectId: z.string().optional(),
  savedAt: z.string(),
});

const designAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  primaryFileType: z.enum(["text", "image"]).optional(),
  blobId: z.string().optional(),
  blobObjectId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(designAssetVersionSchema).optional(),
});

const filmAssetVersionSchema = z.object({
  version: z.number().int().positive(),
  blobId: z.string(),
  blobObjectId: z.string().optional(),
  savedAt: z.string(),
});

const filmAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  blobId: z.string().optional(),
  blobObjectId: z.string().optional(),
  updatedAt: z.string().optional(),
  currentVersion: z.number().int().positive().optional(),
  versions: z.array(filmAssetVersionSchema).optional(),
});

const projectManifestSchema = z.object({
  type: z.literal("project-manifest"),
  version: z.literal(1),
  projectId: z.string(),
  title: z.string(),
  ownerAddress: z.string(),
  vaultId: z.string(),
  walrusPathPrefix: z.string(),
  manifestPath: z.string(),
  scriptAssets: z.array(scriptAssetSchema),
  designAssets: z.array(designAssetSchema).optional().default([]),
  storyboardAssets: z.array(storyboardAssetSchema).optional().default([]),
  filmAssets: z.array(filmAssetSchema).optional().default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export function buildProjectManifest(input: {
  projectId: string;
  title: string;
  ownerAddress: string;
  vaultId: string;
  walrusPathPrefix: string;
  manifestPath: string;
  createdAt: string;
  updatedAt: string;
  scriptAssets?: ScriptAsset[];
  designAssets?: DesignAsset[];
  storyboardAssets?: StoryboardAsset[];
  filmAssets?: FilmAsset[];
}): ProjectManifest {
  return {
    type: "project-manifest",
    version: 1,
    projectId: input.projectId,
    title: input.title,
    ownerAddress: input.ownerAddress,
    vaultId: input.vaultId,
    walrusPathPrefix: input.walrusPathPrefix,
    manifestPath: input.manifestPath,
    scriptAssets: input.scriptAssets ?? [],
    designAssets: input.designAssets ?? [],
    storyboardAssets: input.storyboardAssets ?? [],
    filmAssets: input.filmAssets ?? [],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function serializeProjectManifest(manifest: ProjectManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function parseProjectManifest(text: string): ProjectManifest | null {
  try {
    return projectManifestSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export { walrusBlobRefSchema };
