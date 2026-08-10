import { z } from "zod";
import type { AssetFolderId } from "./asset-catalog";
import { directoryMetadataPath } from "./storage/paths";
import {
  readProjectTextAtPath,
  writeProjectTextAtPath,
  type WalrusStorageContext,
} from "./storage/walrus-storage";

export interface ProjectDirectoryFolderMetadata {
  folderId: AssetFolderId;
  label: string;
  segmentName: string;
}

const folderMetadataSchema = z.object({
  folderId: z.enum([
    "scripts",
    "character_sheets",
    "environment_sheets",
    "storyboards",
    "videos",
  ]),
  label: z.string(),
  segmentName: z.string(),
});

const directoryMetadataSchema = z.object({
  type: z.literal("directory-metadata"),
  version: z.literal(1),
  folders: z.array(folderMetadataSchema),
  updatedAt: z.string(),
});

const DEFAULT_FOLDER_METADATA_BY_ID: Record<
  AssetFolderId,
  ProjectDirectoryFolderMetadata
> = {
  scripts: { folderId: "scripts", label: "Scripts", segmentName: "script" },
  character_prompts: {
    folderId: "character_prompts",
    label: "Character Prompts",
    segmentName: "character prompts",
  },
  character_sheets: {
    folderId: "character_sheets",
    label: "Characters",
    segmentName: "characters",
  },
  environment_prompts: {
    folderId: "environment_prompts",
    label: "Environment Prompts",
    segmentName: "environment prompts",
  },
  environment_sheets: {
    folderId: "environment_sheets",
    label: "Environments",
    segmentName: "environments",
  },
  storyboards: {
    folderId: "storyboards",
    label: "Storyboard",
    segmentName: "storyboard",
  },
  videos: { folderId: "videos", label: "Video Clips", segmentName: "video clip" },
};

export function defaultFolderMetadataFor(
  folderId: AssetFolderId,
): ProjectDirectoryFolderMetadata {
  const metadata = DEFAULT_FOLDER_METADATA_BY_ID[folderId];
  return {
    folderId: metadata.folderId,
    label: metadata.label,
    segmentName: metadata.segmentName,
  };
}

export function buildDirectoryMetadataFromFolderIds(
  folderIds: readonly AssetFolderId[],
): ProjectDirectoryFolderMetadata[] {
  return folderIds.map((folderId) => defaultFolderMetadataFor(folderId));
}

export async function loadProjectDirectoryMetadata(
  ctx: WalrusStorageContext,
  project: {
    id: string;
    walrusPathPrefix: string;
  },
): Promise<ProjectDirectoryFolderMetadata[] | null> {
  const text = await readProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    directoryMetadataPath(project.id),
  );
  if (!text) return null;

  try {
    const parsed = directoryMetadataSchema.parse(JSON.parse(text));
    return parsed.folders;
  } catch {
    return null;
  }
}

export async function saveProjectDirectoryMetadata(
  ctx: WalrusStorageContext,
  project: {
    id: string;
    walrusPathPrefix: string;
  },
  folders: readonly ProjectDirectoryFolderMetadata[],
): Promise<void> {
  const payload = {
    type: "directory-metadata" as const,
    version: 1 as const,
    folders,
    updatedAt: new Date().toISOString(),
  };
  await writeProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    directoryMetadataPath(project.id),
    JSON.stringify(payload, null, 2),
  );
}

