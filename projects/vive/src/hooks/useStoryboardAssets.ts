import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import type { CatalogAssetRef } from "../lib/asset-catalog";
import type { StoryboardAsset, StoryboardDocument } from "../lib/project";
import { getProject, saveProject, setActiveStoryboard } from "../lib/project";
import {
  buildOptimisticStoryboardAsset,
  listStoryboardAssetsForProject,
  loadStoryboardAssetDocument,
  saveStoryboardAsset,
  type WalrusNetwork,
} from "../lib/workspace";
import { clearPathIndexCache } from "../lib/storage/walrus-storage";
import {
  persistWithControlModeWalrusPolicy,
  useControlModeWalrusSessionOptional,
} from "./useControlModeWalrusSession";
import { useWalrusStorage } from "./useWalrusStorage";

interface SaveAssetInput {
  id: string;
  title: string;
  document: StoryboardDocument;
  useProvidedTitle?: boolean;
}

interface SaveAssetCallbacks {
  onSuccess?: (asset: StoryboardAsset) => void;
  onError?: (error: Error) => void;
}

interface PendingSaveJob {
  input: SaveAssetInput;
  assetsSnapshot: StoryboardAsset[];
  callbacks: SaveAssetCallbacks;
}

function documentCacheKey(assetId: string, version?: number): string {
  return version != null ? `${assetId}:v${version}` : `${assetId}:latest`;
}

interface UseStoryboardAssetsResult {
  assets: StoryboardAsset[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  walrusPathPrefix: string;
  refresh: () => void;
  loadDocument: (
    asset: StoryboardAsset,
    version?: number,
  ) => Promise<StoryboardDocument>;
  saveAsset: (
    input: SaveAssetInput,
    callbacks?: SaveAssetCallbacks,
  ) => StoryboardAsset;
}

export interface UseStoryboardAssetsOptions {
  autoLoad?: boolean;
  syncedAssets?: StoryboardAsset[];
}

export function useStoryboardAssets(
  projectId: string,
  options: UseStoryboardAssetsOptions = {},
): UseStoryboardAssetsResult {
  const autoLoad = options.autoLoad !== false;
  const syncedAssets = options.syncedAssets;
  const account = useCurrentAccount();
  const walrusNetwork = useCurrentNetwork() as WalrusNetwork;
  const walrusStorage = useWalrusStorage();
  const controlModeSession = useControlModeWalrusSessionOptional();
  const {
    getStorageContext,
    ensureVault,
    projectAssetRefreshKey,
    refreshProjectAssets,
    upsertOptimisticProjectAsset,
    removeOptimisticProjectAsset,
  } = walrusStorage;
  const project = getProject(projectId);
  const walrusPathPrefix = project?.walrusPathPrefix ?? "";

  const [assets, setAssets] = useState<StoryboardAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pendingSavesRef = useRef<Map<string, PendingSaveJob>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());
  const documentCacheRef = useRef<Map<string, StoryboardDocument>>(new Map());

  const refresh = useCallback(() => {
    clearPathIndexCache();
    if (autoLoad) {
      setRefreshKey((key) => key + 1);
      return;
    }
    refreshProjectAssets();
  }, [autoLoad, refreshProjectAssets]);

  useEffect(() => {
    if (!syncedAssets) return;
    setAssets((current) => {
      const loadedIds = new Set(syncedAssets.map((asset) => asset.id));
      const optimisticOnly = current.filter((asset) => !loadedIds.has(asset.id));
      return [...syncedAssets, ...optimisticOnly].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    });
  }, [syncedAssets]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    const activeProject = getProject(projectId);

    if (!activeProject) {
      setAssets([]);
      setLoading(false);
      setError("Project not found");
      return;
    }

    if (!account?.address) {
      setAssets([]);
      setLoading(false);
      setError("Connect your wallet to load storyboard assets");
      return;
    }

    const scopedProject = activeProject;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ctx = await getStorageContext();
        const nextAssets = await listStoryboardAssetsForProject(
          ctx,
          scopedProject,
          walrusNetwork,
        );
        if (!cancelled) {
          setAssets(
            [...nextAssets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setAssets([]);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load storyboard assets",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [account?.address, autoLoad, projectId, refreshKey, projectAssetRefreshKey, getStorageContext, walrusNetwork]);

  const loadDocument = useCallback(
    async (asset: StoryboardAsset, version?: number) => {
      const cacheKey = documentCacheKey(asset.id, version);
      const cached = documentCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const activeProject = getProject(projectId);
      if (!activeProject) {
        throw new Error("Project not found");
      }

      const ctx = await getStorageContext();
      const document = await loadStoryboardAssetDocument(
        ctx,
        activeProject,
        asset,
        version,
      );
      documentCacheRef.current.set(cacheKey, document);
      return document;
    },
    [projectId, getStorageContext],
  );

  const applySavedAsset = useCallback((asset: StoryboardAsset) => {
    setAssets((current) => {
      const existingIndex = current.findIndex((item) => item.id === asset.id);
      const next =
        existingIndex >= 0
          ? current.map((item, index) =>
              index === existingIndex ? asset : item,
            )
          : [asset, ...current];
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const flushSaveQueue = useCallback(
    async (assetId: string) => {
      if (processingRef.current.has(assetId)) return;

      processingRef.current.add(assetId);
      setSaving(true);

      try {
        while (pendingSavesRef.current.has(assetId)) {
          const job = pendingSavesRef.current.get(assetId);
          if (!job) break;

          pendingSavesRef.current.delete(assetId);
          const { input, assetsSnapshot, callbacks } = job;

          try {
            const activeProject = getProject(projectId);
            if (!activeProject) {
              throw new Error("Project not found");
            }

            setError(null);
            await ensureVault();
            const { asset, manifestBlobId } = await persistWithControlModeWalrusPolicy(
              controlModeSession,
              getStorageContext,
              async (ctx) =>
                saveStoryboardAsset(ctx, activeProject, {
                  ...input,
                  knownStoryboardAssets: assetsRef.current,
                }),
            );

            saveProject({
              ...activeProject,
              manifestBlobId,
              updatedAt: new Date().toISOString(),
            });
            setActiveStoryboard(projectId, asset.id);
            applySavedAsset(asset);
            documentCacheRef.current.set(
              documentCacheKey(asset.id),
              input.document,
            );
            callbacks.onSuccess?.(asset);
            if (!controlModeSession?.isSessionActive()) {
              refreshProjectAssets();
            }
          } catch (err) {
            const saveError =
              err instanceof Error
                ? err
                : new Error("Failed to save storyboard");
            documentCacheRef.current.delete(documentCacheKey(input.id));
            setAssets(assetsSnapshot);
            setError(saveError.message);
            callbacks.onError?.(saveError);
            pendingSavesRef.current.delete(assetId);
            break;
          }
        }
      } finally {
        processingRef.current.delete(assetId);
        setSaving(
          pendingSavesRef.current.size > 0 || processingRef.current.size > 0,
        );
      }
    },
    [applySavedAsset, controlModeSession, ensureVault, projectId, getStorageContext, refreshProjectAssets],
  );

  const saveAsset = useCallback(
    (input: SaveAssetInput, callbacks?: SaveAssetCallbacks) => {
      const currentAssets = assetsRef.current;
      const optimistic = buildOptimisticStoryboardAsset(currentAssets, {
        id: input.id,
        title: input.title,
      });
      const assetsSnapshot = currentAssets;
      const optimisticRef: CatalogAssetRef = {
        id: input.id,
        title: optimistic.title,
        folderId: "storyboards",
        storagePhase: "storyboard",
        assetKind: "storyboard",
        fileType: "image",
        createdAt: optimistic.updatedAt,
        updatedAt: optimistic.updatedAt,
        status: "saving",
      };

      documentCacheRef.current.set(documentCacheKey(input.id), input.document);
      applySavedAsset(optimistic);
      upsertOptimisticProjectAsset(optimisticRef);

      const existing = pendingSavesRef.current.get(input.id);
      const mergedCallbacks: SaveAssetCallbacks = {
        onSuccess: (asset) => {
          existing?.callbacks.onSuccess?.(asset);
          callbacks?.onSuccess?.(asset);
        },
        onError: (error) => {
          removeOptimisticProjectAsset(input.id);
          existing?.callbacks.onError?.(error);
          callbacks?.onError?.(error);
        },
      };
      pendingSavesRef.current.set(input.id, {
        input,
        assetsSnapshot: existing?.assetsSnapshot ?? assetsSnapshot,
        callbacks: mergedCallbacks,
      });

      void flushSaveQueue(input.id);
      return optimistic;
    },
    [
      applySavedAsset,
      flushSaveQueue,
      removeOptimisticProjectAsset,
      upsertOptimisticProjectAsset,
    ],
  );

  return {
    assets,
    loading,
    saving,
    error,
    walrusPathPrefix,
    refresh,
    loadDocument,
    saveAsset,
  };
}
