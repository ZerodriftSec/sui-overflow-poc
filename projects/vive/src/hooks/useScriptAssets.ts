import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { getProject, saveProject } from "../lib/project";
import {
  persistWithControlModeWalrusPolicy,
  useControlModeWalrusSessionOptional,
} from "./useControlModeWalrusSession";
import {
  buildOptimisticScriptAsset,
  createDraftScript,
  listScriptAssetsForProject,
  loadScriptAssetDocument,
  saveScriptAsset,
  type ScriptAsset,
  type ScriptDraft,
  type WalrusNetwork,
} from "../lib/workspace";
import { clearPathIndexCache } from "../lib/storage/walrus-storage";
import { useWalrusStorage } from "./useWalrusStorage";
import type { CatalogAssetRef } from "../lib/asset-catalog";

interface SaveAssetInput {
  id: string;
  title: string;
  content: string;
  prompt?: string;
  generationModelId?: string;
  useProvidedTitle?: boolean;
}

interface SaveAssetCallbacks {
  onSuccess?: (asset: ScriptAsset) => void;
  onError?: (error: Error) => void;
}

interface PendingSaveJob {
  input: SaveAssetInput;
  assetsSnapshot: ScriptAsset[];
  callbacks: SaveAssetCallbacks;
}

function contentCacheKey(assetId: string, version?: number): string {
  return version != null ? `${assetId}:v${version}` : `${assetId}:latest`;
}

function promptCacheKey(assetId: string, version?: number): string {
  return `prompt:${contentCacheKey(assetId, version)}`;
}

function modelCacheKey(assetId: string, version?: number): string {
  return `model:${contentCacheKey(assetId, version)}`;
}

function mergeLoadedAssets(
  current: ScriptAsset[],
  loaded: ScriptAsset[],
): ScriptAsset[] {
  const loadedIds = new Set(loaded.map((asset) => asset.id));
  const optimisticOnly = current.filter((asset) => !loadedIds.has(asset.id));
  if (optimisticOnly.length === 0) {
    return loaded;
  }
  return [...loaded, ...optimisticOnly].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}

interface UseScriptAssetsResult {
  assets: ScriptAsset[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  walrusPathPrefix: string;
  refresh: () => void;
  loadContent: (asset: ScriptAsset, version?: number) => Promise<string>;
  loadDocument: (
    asset: ScriptAsset,
    version?: number,
  ) => Promise<{
    content: string;
    prompt: string;
    generationModelId: string;
  }>;
  createDraft: (title?: string) => ScriptDraft;
  saveAsset: (
    input: SaveAssetInput,
    callbacks?: SaveAssetCallbacks,
  ) => ScriptAsset;
}

export interface UseScriptAssetsOptions {
  /** When false, skip the mount/refresh network list (control mode shares useProjectAssets). */
  autoLoad?: boolean;
  /** Mirror assets from a shared catalog instead of listing again. */
  syncedAssets?: ScriptAsset[];
}

export function useScriptAssets(
  projectId: string,
  options: UseScriptAssetsOptions = {},
): UseScriptAssetsResult {
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

  const [assets, setAssets] = useState<ScriptAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pendingSavesRef = useRef<Map<string, PendingSaveJob>>(new Map());
  const processingRef = useRef<Set<string>>(new Set());
  const contentCacheRef = useRef<Map<string, string>>(new Map());

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
    setAssets((current) => mergeLoadedAssets(current, syncedAssets));
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
      setError("Connect your wallet to load script assets");
      return;
    }

    const scopedProject = activeProject;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ctx = await getStorageContext();
        const nextAssets = await listScriptAssetsForProject(
          ctx,
          scopedProject,
          walrusNetwork,
        );
        if (!cancelled) {
          setAssets((current) => mergeLoadedAssets(current, nextAssets));
        }
      } catch (err) {
        if (!cancelled) {
          setAssets([]);
          setError(
            err instanceof Error ? err.message : "Failed to load script assets",
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
    async (asset: ScriptAsset, version?: number) => {
      const cacheKey = contentCacheKey(asset.id, version);
      const promptKey = promptCacheKey(asset.id, version);
      const modelKey = modelCacheKey(asset.id, version);
      const cachedContent = contentCacheRef.current.get(cacheKey);
      const cachedPrompt = contentCacheRef.current.get(promptKey);
      const cachedModel = contentCacheRef.current.get(modelKey);
      if (
        cachedContent !== undefined &&
        cachedPrompt !== undefined &&
        cachedModel !== undefined
      ) {
        return {
          content: cachedContent,
          prompt: cachedPrompt,
          generationModelId: cachedModel,
        };
      }

      const activeProject = getProject(projectId);
      if (!activeProject) {
        throw new Error("Project not found");
      }
      const ctx = await getStorageContext();
      const document = await loadScriptAssetDocument(
        ctx,
        activeProject,
        asset,
        version,
      );
      contentCacheRef.current.set(cacheKey, document.content);
      contentCacheRef.current.set(promptKey, document.prompt);
      contentCacheRef.current.set(modelKey, document.generationModelId);
      return document;
    },
    [projectId, getStorageContext],
  );

  const loadContent = useCallback(
    async (asset: ScriptAsset, version?: number) => {
      const document = await loadDocument(asset, version);
      return document.content;
    },
    [loadDocument],
  );

  const createDraft = useCallback((title?: string) => {
    setError(null);
    return createDraftScript(assets, title);
  }, [assets]);

  const applySavedAsset = useCallback((asset: ScriptAsset) => {
    setAssets((current) => {
      const existingIndex = current.findIndex((item) => item.id === asset.id);
      const next =
        existingIndex >= 0
          ? current.map((item, index) =>
              index === existingIndex ? asset : item,
            )
          : [...current, asset];
      return next.sort((a, b) => a.title.localeCompare(b.title));
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
              (ctx) =>
                saveScriptAsset(ctx, activeProject, {
                  ...input,
                  knownScriptAssets: assetsRef.current,
                }),
            );

            // Only mark success after deferred on-chain mutations have flushed.
            saveProject({
              ...activeProject,
              manifestBlobId,
              updatedAt: new Date().toISOString(),
            });
            applySavedAsset(asset);
            contentCacheRef.current.set(
              contentCacheKey(asset.id),
              input.content,
            );
            if (input.prompt !== undefined) {
              contentCacheRef.current.set(
                promptCacheKey(asset.id),
                input.prompt.trim(),
              );
            }
            if (input.generationModelId !== undefined) {
              contentCacheRef.current.set(
                modelCacheKey(asset.id),
                input.generationModelId.trim(),
              );
            }
            callbacks.onSuccess?.(asset);
            if (!controlModeSession?.isSessionActive()) {
              refreshProjectAssets();
            }
          } catch (err) {
            const error =
              err instanceof Error ? err : new Error("Failed to save script");
            contentCacheRef.current.delete(contentCacheKey(input.id));
            contentCacheRef.current.delete(promptCacheKey(input.id));
            contentCacheRef.current.delete(modelCacheKey(input.id));
            setAssets(assetsSnapshot);
            setError(error.message);
            callbacks.onError?.(error);
            pendingSavesRef.current.delete(assetId);
            break;
          }
        }
      } finally {
        processingRef.current.delete(assetId);
        setSaving(pendingSavesRef.current.size > 0 || processingRef.current.size > 0);
      }
    },
    [applySavedAsset, controlModeSession, ensureVault, projectId, getStorageContext, refreshProjectAssets],
  );

  const saveAsset = useCallback(
    (input: SaveAssetInput, callbacks?: SaveAssetCallbacks) => {
      void ensureVault();

      const currentAssets = assetsRef.current;
      const optimistic = buildOptimisticScriptAsset(currentAssets, input);
      const assetsSnapshot = currentAssets;
      const optimisticRef: CatalogAssetRef = {
        id: input.id,
        title: optimistic.title,
        folderId: "scripts",
        storagePhase: "script",
        assetKind: "script",
        fileType: "text",
        createdAt: optimistic.updatedAt ?? new Date().toISOString(),
        updatedAt: optimistic.updatedAt ?? new Date().toISOString(),
        status: "saving",
      };

      contentCacheRef.current.set(contentCacheKey(input.id), input.content);
      if (input.prompt !== undefined) {
        contentCacheRef.current.set(
          promptCacheKey(input.id),
          input.prompt.trim(),
        );
      }
      if (input.generationModelId !== undefined) {
        contentCacheRef.current.set(
          modelCacheKey(input.id),
          input.generationModelId.trim(),
        );
      }
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
      ensureVault,
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
    loadContent,
    loadDocument,
    createDraft,
    saveAsset,
  };
}
