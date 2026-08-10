import { normalizeLogicalPath } from "./path-cache";
import type { AssetFolderId } from "../asset-catalog";

/**
 * Map a storage logical path to the workspace root Directory segment used by
 * DEFAULT_WORKSPACE_DIRECTORY_SEGMENTS / on-chain folder seeds.
 *
 * Paths like `project/<id>/Script/Assets/...` belong under the `script` Directory,
 * not flat under the workspace root (architecture: Directory.entries → File IDs).
 */
export function stripProjectPathPrefix(logicalPath: string): string {
  const path = normalizeLogicalPath(logicalPath);
  return path.replace(/^project\/[^/]+\//, "");
}

export function assetFolderSegmentForLogicalPath(logicalPath: string): string | null {
  const relative = stripProjectPathPrefix(logicalPath);
  const top = relative.split("/")[0]?.toLowerCase() ?? "";

  switch (top) {
    case "script":
      return "script";
    case "storyboard":
      return "storyboard";
    case "film":
      return "video clip";
    case "conversations":
      return "conversations";
    case "design": {
      // Design/Characters|Environments/Assets/... → seeded folder Directories.
      // Legacy Design/Assets/... defaults to characters (not vault root).
      const second = relative.split("/")[1]?.toLowerCase() ?? "";
      if (second === "environments" || second === "environment") {
        return "environments";
      }
      return "characters";
    }
    default:
      return null;
  }
}

export function assetFolderIdForSegment(segment: string): AssetFolderId | null {
  switch (segment) {
    case "script":
      return "scripts";
    case "characters":
      return "character_sheets";
    case "environments":
      return "environment_sheets";
    case "storyboard":
      return "storyboards";
    case "video clip":
      return "videos";
    default:
      return null;
  }
}

export function segmentForAssetFolderId(folderId: AssetFolderId): string | null {
  switch (folderId) {
    case "scripts":
      return "script";
    case "character_sheets":
      return "characters";
    case "environment_sheets":
      return "environments";
    case "storyboards":
      return "storyboard";
    case "videos":
      return "video clip";
    default:
      return null;
  }
}

/** Stable DirEntry / File.name_hash key: full logical path within the vault project. */
export function fileEntryNameKey(logicalPath: string): string {
  return normalizeLogicalPath(logicalPath);
}
