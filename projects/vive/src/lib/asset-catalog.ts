import type { Phase } from "../components/workspace/types";
import type { WorkflowStage } from "./workflow";
import { workflowStageToPhase } from "./workflow";
import type {
  DesignAsset,
  FilmAsset,
  ScriptAsset,
} from "./workspace";
import type { StoryboardAsset } from "./project";

export type AssetFolderId =
  | "scripts"
  | "character_prompts"
  | "character_sheets"
  | "environment_prompts"
  | "environment_sheets"
  | "storyboards"
  | "videos";

export type CatalogAssetKind =
  | "script"
  | "character"
  | "environment"
  | "storyboard"
  | "video";

export type CatalogFileType = "text" | "image" | "video";

export interface AssetFolderDefinition {
  id: AssetFolderId;
  label: string;
  storagePhase: Phase;
  assetKind: CatalogAssetKind;
  workflowStep: WorkflowStage;
}

export const ASSET_FOLDERS: AssetFolderDefinition[] = [
  {
    id: "scripts",
    label: "Scripts",
    storagePhase: "script",
    assetKind: "script",
    workflowStep: "script",
  },
  {
    id: "character_prompts",
    label: "Character Prompts",
    storagePhase: "design",
    assetKind: "character",
    workflowStep: "characters",
  },
  {
    id: "character_sheets",
    label: "Character Sheets",
    storagePhase: "design",
    assetKind: "character",
    workflowStep: "characters",
  },
  {
    id: "environment_prompts",
    label: "Environment Prompts",
    storagePhase: "design",
    assetKind: "environment",
    workflowStep: "environments",
  },
  {
    id: "environment_sheets",
    label: "Environment Art",
    storagePhase: "design",
    assetKind: "environment",
    workflowStep: "environments",
  },
  {
    id: "storyboards",
    label: "Storyboards",
    storagePhase: "storyboard",
    assetKind: "storyboard",
    workflowStep: "storyboard_plan",
  },
  {
    id: "videos",
    label: "Videos",
    storagePhase: "film",
    assetKind: "video",
    workflowStep: "video_clips",
  },
];

export interface CatalogAssetRef {
  id: string;
  title: string;
  folderId: AssetFolderId;
  storagePhase: Phase;
  assetKind: CatalogAssetKind;
  fileType: CatalogFileType;
  createdAt: string;
  updatedAt: string;
  status?: string;
  /** On-chain File object id when the ref was listed from Directory walk. */
  fileId?: string;
  /** Current VersionInfo content blob — load content from Walrus after selection. */
  contentBlobId?: string;
  /** Current VersionInfo metadata blob (decrypted during listing for title/path). */
  metadataBlobId?: string;
  currentVersion?: number;
}

export type FolderSortField = "name" | "created";
export type FolderSortDirection = "asc" | "desc";

export interface FolderSortPreference {
  field: FolderSortField;
  direction: FolderSortDirection;
}

export const DEFAULT_FOLDER_SORT: FolderSortPreference = {
  field: "created",
  direction: "desc",
};

function resolveCreatedAt(
  updatedAt: string | undefined,
  versions?: { savedAt: string }[],
): string {
  if (versions?.length) {
    let earliest = versions[0].savedAt;
    for (const version of versions) {
      if (version.savedAt < earliest) {
        earliest = version.savedAt;
      }
    }
    return earliest;
  }
  return updatedAt ?? "";
}

export function sortCatalogAssetRefs(
  refs: CatalogAssetRef[],
  preference: FolderSortPreference,
): CatalogAssetRef[] {
  const multiplier = preference.direction === "asc" ? 1 : -1;

  return [...refs].sort((left, right) => {
    if (preference.field === "name") {
      return (
        multiplier *
        left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        })
      );
    }

    const leftDate = left.createdAt || left.updatedAt;
    const rightDate = right.createdAt || right.updatedAt;
    return multiplier * leftDate.localeCompare(rightDate);
  });
}

export interface ProjectAssetCatalog {
  scripts: ScriptAsset[];
  designAssets: DesignAsset[];
  storyboards: StoryboardAsset[];
  videos: FilmAsset[];
}

export function getAssetFolderDefinition(
  folderId: AssetFolderId,
): AssetFolderDefinition {
  const folder = ASSET_FOLDERS.find((item) => item.id === folderId);
  if (!folder) {
    throw new Error(`Unknown asset folder: ${folderId}`);
  }
  return folder;
}

export function folderIdForWorkflowStep(step: WorkflowStage): AssetFolderId {
  switch (step) {
    case "script":
      return "scripts";
    case "characters":
      return "character_sheets";
    case "environments":
      return "environment_sheets";
    case "storyboard_plan":
    case "storyboard_sheets":
      return "storyboards";
    case "video_clips":
      return "videos";
    default:
      return "scripts";
  }
}

export function workflowStepForFolder(folderId: AssetFolderId): WorkflowStage {
  return getAssetFolderDefinition(folderId).workflowStep;
}

export function storagePhaseForFolder(folderId: AssetFolderId): Phase {
  return getAssetFolderDefinition(folderId).storagePhase;
}

export function buildCatalogAssetRefs(
  catalog: ProjectAssetCatalog,
): CatalogAssetRef[] {
  const refs: CatalogAssetRef[] = [];

  for (const script of catalog.scripts) {
    const updatedAt = script.updatedAt ?? "";
    refs.push({
      id: script.id,
      title: script.title,
      folderId: "scripts",
      storagePhase: "script",
      assetKind: "script",
      fileType: "text",
      createdAt: resolveCreatedAt(updatedAt, script.versions),
      updatedAt,
      contentBlobId: script.blobId,
    });
  }

  for (const asset of catalog.designAssets) {
    const isCharacter = asset.kind === "character";
    const updatedAt = asset.updatedAt ?? "";
    refs.push({
      id: asset.id,
      title: asset.title,
      folderId: isCharacter ? "character_sheets" : "environment_sheets",
      storagePhase: "design",
      assetKind: isCharacter ? "character" : "environment",
      fileType: asset.primaryFileType ?? "image",
      createdAt: resolveCreatedAt(updatedAt, asset.versions),
      updatedAt,
      contentBlobId: asset.blobId,
    });
  }

  for (const storyboard of catalog.storyboards) {
    const updatedAt = storyboard.updatedAt ?? "";
    refs.push({
      id: storyboard.id,
      title: storyboard.title,
      folderId: "storyboards",
      storagePhase: "storyboard",
      assetKind: "storyboard",
      fileType: "image",
      createdAt: resolveCreatedAt(updatedAt, storyboard.versions),
      updatedAt,
      contentBlobId: storyboard.blobId,
    });
  }

  for (const video of catalog.videos) {
    const updatedAt = video.updatedAt ?? "";
    refs.push({
      id: video.id,
      title: video.title,
      folderId: "videos",
      storagePhase: "film",
      assetKind: "video",
      fileType: "video",
      createdAt: resolveCreatedAt(updatedAt, video.versions),
      updatedAt,
      contentBlobId: video.blobId,
    });
  }

  return refs;
}

/**
 * Overlay readable titles / stable asset ids from a Walrus manifest catalog onto
 * on-chain directory refs when content blob ids match. Membership stays chain-only.
 */
export function enrichOnChainRefsWithCatalog(
  onChainRefs: readonly CatalogAssetRef[],
  catalog: ProjectAssetCatalog,
): CatalogAssetRef[] {
  const blobToAsset = new Map<
    string,
    { id: string; title: string; folderId: AssetFolderId }
  >();

  const remember = (
    folderId: AssetFolderId,
    id: string,
    title: string,
    blobId: string | undefined,
    versions?: { blobId: string }[],
  ) => {
    if (blobId?.trim()) {
      blobToAsset.set(blobId.trim(), { id, title, folderId });
    }
    for (const version of versions ?? []) {
      if (version.blobId?.trim()) {
        blobToAsset.set(version.blobId.trim(), { id, title, folderId });
      }
    }
  };

  for (const script of catalog.scripts) {
    remember("scripts", script.id, script.title, script.blobId, script.versions);
  }
  for (const asset of catalog.designAssets) {
    const folderId =
      asset.kind === "character" ? "character_sheets" : "environment_sheets";
    remember(folderId, asset.id, asset.title, asset.blobId, asset.versions);
  }
  for (const storyboard of catalog.storyboards) {
    remember(
      "storyboards",
      storyboard.id,
      storyboard.title,
      storyboard.blobId,
      storyboard.versions,
    );
  }
  for (const video of catalog.videos) {
    remember("videos", video.id, video.title, video.blobId, video.versions);
  }

  const enriched = onChainRefs.map((ref) => {
    const blobId = ref.contentBlobId?.trim();
    if (!blobId) return ref;
    const match = blobToAsset.get(blobId);
    if (!match || match.folderId !== ref.folderId) return ref;
    return {
      ...ref,
      id: match.id,
      title: match.title || ref.title,
    };
  });

  // Prefer the newest on-chain file when several version paths map to one asset id.
  const byAsset = new Map<string, CatalogAssetRef>();
  for (const ref of enriched) {
    const key = `${ref.folderId}:${ref.id}`;
    const existing = byAsset.get(key);
    if (!existing || (ref.updatedAt || "") > (existing.updatedAt || "")) {
      byAsset.set(key, ref);
    }
  }
  return [...byAsset.values()];
}

export function filterRefsByFolder(
  refs: CatalogAssetRef[],
  folderId: AssetFolderId,
): CatalogAssetRef[] {
  return refs.filter((ref) => ref.folderId === folderId);
}

export function inferWorkflowStepFromSelection(input: {
  folderId: AssetFolderId | null;
  workflowStep?: WorkflowStage | null;
}): WorkflowStage {
  if (input.workflowStep) {
    return input.workflowStep;
  }
  if (input.folderId) {
    return workflowStepForFolder(input.folderId);
  }
  return "script";
}

export function inferStoragePhaseFromSelection(input: {
  folderId: AssetFolderId | null;
  workflowStep: WorkflowStage;
}): Phase {
  if (input.folderId) {
    return storagePhaseForFolder(input.folderId);
  }
  return workflowStageToPhase(input.workflowStep) ?? "script";
}
