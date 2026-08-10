import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import {
  buildOptimisticDesignAsset,
  clearPendingDesignDocument,
  listDesignAssetsForProject,
  loadDesignAssetDocument,
  saveDesignAsset,
  saveDesignAssetsBatch,
  stagePendingDesignDocument,
  type DesignAsset,
  type DesignDocument,
  type WalrusNetwork,
} from "../lib/workspace";
import { clearPathIndexCache } from "../lib/storage/walrus-storage";
import { getProject, saveProject } from "../lib/project";
import {
  persistWithControlModeWalrusPolicy,
  useControlModeWalrusSessionOptional,
} from "./useControlModeWalrusSession";
import { useWalrusStorage } from "./useWalrusStorage";
import type { CatalogAssetRef } from "../lib/asset-catalog";

interface SaveAssetInput {
  id: string;
  title: string;
  kind: DesignAsset["kind"];
  primaryFileType?: "text" | "image";
  document: DesignDocument;
}

interface SaveAssetCallbacks {
  onSuccess?: (asset: DesignAsset) => void;
  onError?: (error: Error) => void;
}

interface PendingSaveJob {
  input: SaveAssetInput;
  assetsSnapshot: DesignAsset[];
  callbacks: SaveAssetCallbacks;
}

function documentCacheKey(assetId: string, version?: number): string {
  return version != null ? `${assetId}:v${version}` : `${assetId}:latest`;
}

interface UseDesignAssetsResult {
  assets: DesignAsset[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  walrusPathPrefix: string;
  refresh: () => void;
  hasDocumentCached: (assetId: string) => boolean;
  loadDocument: (asset: DesignAsset, version?: number) => Promise<DesignDocument>;
  saveAsset: (input: SaveAssetInput, callbacks?: SaveAssetCallbacks) => DesignAsset;
  saveAssetsBatch: (inputs: SaveAssetInput[]) => Promise<DesignAsset[]>;
}

export interface UseDesignAssetsOptions {
  autoLoad?: boolean;
  syncedAssets?: DesignAsset[];
}

export function useDesignAssets(
  projectId: string,
  options: UseDesignAssetsOptions = {},
): UseDesignAssetsResult {
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

  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pendingSavesRef = useRef<Map<string, PendingSaveJob>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());
  const documentCacheRef = useRef<Map<string, DesignDocument>>(new Map());

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
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
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
      setError("Connect your wallet to load design assets");
      return;
    }

    const scopedProject = activeProject;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ctx = await getStorageContext();
        const nextAssets = await listDesignAssetsForProject(
          ctx,
          scopedProject,
          walrusNetwork,
        );
        if (!cancelled) {
          setAssets(
            [...nextAssets].sort((a, b) =>
              (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
            ),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setAssets([]);
          setError(
            err instanceof Error ? err.message : "Failed to load design assets",
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

  const hasDocumentCached = useCallback((assetId: string): boolean => {
    return documentCacheRef.current.has(documentCacheKey(assetId));
  }, []);

  const loadDocument = useCallback(
    async (asset: DesignAsset, version?: number) => {
      const cacheKey = documentCacheKey(asset.id, version);
      const cached = documentCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const activeProject = getProject(projectId);
      if (!activeProject) {
        throw new Error("Project not found");
      }

      const ctx = await getStorageContext();
      const document = await loadDesignAssetDocument(
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

  const applySavedAsset = useCallback((asset: DesignAsset) => {
    setAssets((current) => {
      const existingIndex = current.findIndex((item) => item.id === asset.id);
      const next =
        existingIndex >= 0
          ? current.map((item, index) => (index === existingIndex ? asset : item))
          : [asset, ...current];
      return next.sort((a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
      );
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
                saveDesignAsset(ctx, activeProject, {
                  ...input,
                  knownDesignAssets: assetsRef.current,
                }),
            );

            saveProject({
              ...activeProject,
              manifestBlobId,
              updatedAt: new Date().toISOString(),
            });
            applySavedAsset(asset);
            documentCacheRef.current.set(documentCacheKey(asset.id), input.document);
            clearPendingDesignDocument(input.id);
            callbacks.onSuccess?.(asset);
            if (!controlModeSession?.isSessionActive()) {
              refreshProjectAssets();
            }
          } catch (err) {
            const saveError =
              err instanceof Error ? err : new Error("Failed to save design asset");
            documentCacheRef.current.delete(documentCacheKey(input.id));
            clearPendingDesignDocument(input.id);
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
      const optimistic = buildOptimisticDesignAsset(currentAssets, {
        id: input.id,
        title: input.title,
        kind: input.kind,
        primaryFileType: input.primaryFileType,
      });
      const assetsSnapshot = currentAssets;
      const optimisticRef: CatalogAssetRef = {
        id: input.id,
        title: optimistic.title,
        folderId:
          input.kind === "character" ? "character_sheets" : "environment_sheets",
        storagePhase: "design",
        assetKind: input.kind,
        fileType: input.primaryFileType ?? "image",
        createdAt: optimistic.updatedAt ?? new Date().toISOString(),
        updatedAt: optimistic.updatedAt ?? new Date().toISOString(),
        status: "saving",
      };

      documentCacheRef.current.set(documentCacheKey(input.id), input.document);
      stagePendingDesignDocument(input.id, input.document);
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

  const saveAssetsBatch = useCallback(
    async (inputs: SaveAssetInput[]) => {
      if (inputs.length === 0) {
        return [];
      }

      const activeProject = getProject(projectId);
      if (!activeProject) {
        throw new Error("Project not found");
      }

      setSaving(true);
      setError(null);
      const nowIso = new Date().toISOString();
      for (const input of inputs) {
        stagePendingDesignDocument(input.id, input.document);
        upsertOptimisticProjectAsset({
          id: input.id,
          title: input.title,
          folderId:
            input.kind === "character" ? "character_sheets" : "environment_sheets",
          storagePhase: "design",
          assetKind: input.kind,
          fileType: input.primaryFileType ?? "image",
          createdAt: nowIso,
          updatedAt: nowIso,
          status: "saving",
        });
      }

      try {
        const result = await persistWithControlModeWalrusPolicy(
          controlModeSession,
          getStorageContext,
          async (ctx) =>
            saveDesignAssetsBatch(ctx, activeProject, inputs, {
              knownDesignAssets: assetsRef.current,
            }),
        );

        saveProject({
          ...activeProject,
          manifestBlobId: result.manifestBlobId,
          updatedAt: new Date().toISOString(),
        });

        for (const input of inputs) {
          documentCacheRef.current.set(documentCacheKey(input.id), input.document);
          clearPendingDesignDocument(input.id);
        }

        setAssets((current) => {
          const byId = new Map(current.map((asset) => [asset.id, asset]));
          for (const asset of result.assets) {
            byId.set(asset.id, asset);
          }
          return [...byId.values()].sort((a, b) =>
            (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
          );
        });

        if (!controlModeSession?.isSessionActive()) {
          refreshProjectAssets();
        }

        return result.assets;
      } catch (err) {
        const saveError =
          err instanceof Error ? err : new Error("Failed to save design assets");
        for (const input of inputs) {
          removeOptimisticProjectAsset(input.id);
          clearPendingDesignDocument(input.id);
        }
        setError(saveError.message);
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [
      controlModeSession,
      getStorageContext,
      projectId,
      refreshProjectAssets,
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
    hasDocumentCached,
    loadDocument,
    saveAsset,
    saveAssetsBatch,
  };
}
