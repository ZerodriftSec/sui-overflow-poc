import { useCallback } from "react";
import {
  loadAssetReference,
  type AssetReferenceLookup,
  type LoadedAssetReference,
} from "../lib/asset-reference";
import { getProject } from "../lib/project";
import { useProjectAssets } from "./useProjectAssets";
import { useWalrusStorage } from "./useWalrusStorage";

export type { LoadedAssetReference };

export function useLoadAssetReference(
  projectId: string,
): (id: string, lookup?: AssetReferenceLookup) => Promise<LoadedAssetReference | null> {
  const walrusStorage = useWalrusStorage();
  const {
    getScriptAsset,
    getDesignAsset,
    getStoryboardAsset,
    getVideoAsset,
  } = useProjectAssets(projectId);

  return useCallback(
    async (
      id: string,
      lookup: AssetReferenceLookup = {},
    ): Promise<LoadedAssetReference | null> => {
      const project = getProject(projectId);
      if (!project) return null;

      try {
        const ctx = await walrusStorage.getStorageContext();
        return await loadAssetReference(ctx, project, id, {
          getScriptAsset,
          getDesignAsset,
          getStoryboardAsset,
          getVideoAsset,
        }, lookup);
      } catch {
        return null;
      }
    },
    [
      getDesignAsset,
      getScriptAsset,
      getStoryboardAsset,
      getVideoAsset,
      projectId,
      walrusStorage,
    ],
  );
}

/** @deprecated Use useLoadAssetReference */
export const useLoadScriptReference = useLoadAssetReference;
