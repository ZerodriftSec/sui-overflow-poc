import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { getProject } from "../lib/project";
import {
  enrichOnChainRefsWithCatalog,
  type AssetFolderId,
  type CatalogAssetRef,
  type ProjectAssetCatalog,
} from "../lib/asset-catalog";
import {
  listDesignAssetsForProject,
  listFilmAssetsForProject,
  listScriptAssetsForProject,
  listStoryboardAssetsForProject,
  clearProjectManifestMemoryCache,
  type DesignAsset,
  type FilmAsset,
  type ScriptAsset,
  type WalrusNetwork,
} from "../lib/workspace";
import { clearPathIndexCache } from "../lib/storage/walrus-storage";
import type { StoryboardAsset } from "../lib/project";
import {
  buildDirectoryMetadataFromFolderIds,
  saveProjectDirectoryMetadata,
  loadProjectDirectoryMetadata,
  type ProjectDirectoryFolderMetadata,
} from "../lib/project-directory-metadata";
import { listRootAssetFolderEntries } from "../lib/storage/on-chain-directory";
import {
  clearOnChainCatalogMetadataCache,
  listCatalogRefsFromOnChainDirectories,
} from "../lib/storage/on-chain-catalog";
import { useWalrusStorage } from "./useWalrusStorage";

interface UseProjectAssetsResult {
  projectId: string;
  catalog: ProjectAssetCatalog;
  refs: CatalogAssetRef[];
  loading: boolean;
  error: string | null;
  walrusPathPrefix: string;
  explorerFolders: ProjectDirectoryFolderMetadata[];
  refresh: () => void;
  getScriptAsset: (id: string) => ScriptAsset | null;
  getDesignAsset: (id: string) => DesignAsset | null;
  getStoryboardAsset: (id: string) => StoryboardAsset | null;
  getVideoAsset: (id: string) => FilmAsset | null;
}

interface ProjectAssetsLoadResult {
  catalog: ProjectAssetCatalog;
  onChainRefs: CatalogAssetRef[];
  explorerFolders: ProjectDirectoryFolderMetadata[];
}

/** Dedupe concurrent identical catalog loads across hook instances. */
const projectAssetsLoadInflight = new Map<string, Promise<ProjectAssetsLoadResult>>();

async function loadProjectAssetsShared(
  key: string,
  loader: () => Promise<ProjectAssetsLoadResult>,
): Promise<ProjectAssetsLoadResult> {
  const existing = projectAssetsLoadInflight.get(key);
  if (existing) return existing;

  const promise = loader().finally(() => {
    projectAssetsLoadInflight.delete(key);
  });
  projectAssetsLoadInflight.set(key, promise);
  return promise;
}

const ProjectAssetsContext = createContext<UseProjectAssetsResult | null>(null);

function useProjectAssetsState(
  projectId: string,
  enabled: boolean,
): UseProjectAssetsResult {
  const account = useCurrentAccount();
  const walrusNetwork = useCurrentNetwork() as WalrusNetwork;
  const walrusStorage = useWalrusStorage();
  const {
    getStorageContext,
    projectAssetRefreshKey,
    optimisticProjectAssetRefs,
    pruneOptimisticProjectAssets,
  } = walrusStorage;
  const project = getProject(projectId);
  const walrusPathPrefix = project?.walrusPathPrefix ?? "";
  const getStorageContextRef = useRef(getStorageContext);
  getStorageContextRef.current = getStorageContext;

  const [catalog, setCatalog] = useState<ProjectAssetCatalog>({
    scripts: [],
    designAssets: [],
    storyboards: [],
    videos: [],
  });
  const [onChainRefs, setOnChainRefs] = useState<CatalogAssetRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [explorerFolders, setExplorerFolders] = useState<
    ProjectDirectoryFolderMetadata[]
  >([]);
  // Tracks which project's on-chain walk has already completed at least once.
  // Only the very first load for a project should stream partial per-folder
  // snapshots into state — on later refreshes (e.g. triggered by a save) we
  // already have a full list on screen, and replacing it with whatever
  // subset of folders has resolved so far would flash the sidebar down to
  // just those assets until the rest of the walk catches up.
  const completedLoadForProjectRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    clearPathIndexCache();
    clearProjectManifestMemoryCache(projectId);
    clearOnChainCatalogMetadataCache();
    setRefreshKey((value) => value + 1);
  }, [projectId]);

  useEffect(() => {
    if (!enabled) return;
    clearPathIndexCache();
    clearProjectManifestMemoryCache(projectId);
    clearOnChainCatalogMetadataCache();
  }, [enabled, projectId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!account?.address) {
      setCatalog({
        scripts: [],
        designAssets: [],
        storyboards: [],
        videos: [],
      });
      setOnChainRefs([]);
      setExplorerFolders([]);
      completedLoadForProjectRef.current = null;
      return;
    }

    const scopedProject = getProject(projectId);
    if (!scopedProject) {
      setCatalog({
        scripts: [],
        designAssets: [],
        storyboards: [],
        videos: [],
      });
      setOnChainRefs([]);
      setExplorerFolders([]);
      completedLoadForProjectRef.current = null;
      return;
    }

    const projectForLoad = scopedProject;
    // Snapshot once per effect run — later folder-completion callbacks
    // within this same load should keep using the answer from when the
    // load started, not flip mid-walk once this same load finishes.
    const isFirstLoadForProject = completedLoadForProjectRef.current !== projectId;
    let cancelled = false;
    const loadKey = [
      account.address,
      projectId,
      walrusNetwork,
      projectAssetRefreshKey,
      refreshKey,
      projectForLoad.manifestBlobId ?? "",
    ].join(":");

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await loadProjectAssetsShared(loadKey, async () => {
          const ctx = await getStorageContextRef.current();

          // Manifest-based catalog (scripts/design/storyboard/video metadata)
          // and the on-chain Directory walk are independent — run them
          // concurrently instead of one after the other.
          const catalogPromise: Promise<ProjectAssetCatalog> = Promise.all([
            listScriptAssetsForProject(ctx, projectForLoad, walrusNetwork),
            listDesignAssetsForProject(ctx, projectForLoad, walrusNetwork),
            listStoryboardAssetsForProject(ctx, projectForLoad, walrusNetwork),
            listFilmAssetsForProject(ctx, projectForLoad, walrusNetwork),
          ]).then(([scripts, designAssets, storyboards, videos]) => ({
            scripts,
            designAssets,
            storyboards,
            videos,
          }));

          const folderEntries = await listRootAssetFolderEntries({
            client: ctx.suiClient,
            projectId: ctx.vault.projectId,
            rootDirectoryId: ctx.vault.rootDirectoryId,
          });
          const chainFolders = folderEntries.map((entry) => entry.folderId);
          const chainFolderSet = new Set<AssetFolderId>(chainFolders);

          // Sidebar membership comes from the on-chain Directory walk. Decrypt
          // each file's Walrus metadata for titles / asset ids. Start this as
          // soon as folderEntries resolves — it doesn't need to wait on the
          // manifest catalog above — and stream partial results into state as
          // each folder finishes instead of waiting for every folder.
          const chainRefsPromise: Promise<CatalogAssetRef[]> =
            folderEntries.length > 0
              ? listCatalogRefsFromOnChainDirectories({
                  client: ctx.suiClient,
                  sealClient: ctx.sealClient,
                  sessionKey: ctx.sessionKey,
                  vaultProjectId: ctx.vault.projectId,
                  accessRegistryId: ctx.vault.accessRegistryId,
                  rootDirectoryId: ctx.vault.rootDirectoryId,
                  walrusPathPrefix: projectForLoad.walrusPathPrefix,
                  folderEntries,
                  onProgress: (partialRefs) => {
                    if (!cancelled && isFirstLoadForProject) {
                      setOnChainRefs([...partialRefs]);
                    }
                  },
                })
              : Promise.resolve([]);

          // Optional Walrus folder labels — never required for membership.
          const walrusMetadataPromise = loadProjectDirectoryMetadata(
            ctx,
            projectForLoad,
          ).catch(() => null);

          const [catalog, chainRefsRaw, walrusMetadata] = await Promise.all([
            catalogPromise,
            chainRefsPromise,
            walrusMetadataPromise,
          ]);
          const chainRefs = enrichOnChainRefsWithCatalog(chainRefsRaw, catalog);

          const resolvedExplorerFolders: ProjectDirectoryFolderMetadata[] =
            chainFolders.length > 0
              ? buildDirectoryMetadataFromFolderIds(chainFolders)
              : [];
          const labeledExplorerFolders =
            walrusMetadata && walrusMetadata.length > 0
              ? chainFolders.map((folderId) => {
                  const fromWalrus = walrusMetadata.find(
                    (entry) => entry.folderId === folderId,
                  );
                  return fromWalrus ?? buildDirectoryMetadataFromFolderIds([folderId])[0];
                })
              : resolvedExplorerFolders;
          const shouldPersistMetadata =
            chainFolders.length > 0 &&
            (walrusMetadata == null ||
              walrusMetadata.length !== labeledExplorerFolders.length ||
              labeledExplorerFolders.some((folder, index) => {
                const existing = walrusMetadata[index];
                return (
                  !existing ||
                  existing.folderId !== folder.folderId ||
                  existing.label !== folder.label ||
                  existing.segmentName !== folder.segmentName
                );
              }) ||
              walrusMetadata.some((folder) => !chainFolderSet.has(folder.folderId)));
          if (shouldPersistMetadata) {
            // Fire-and-forget: never block or re-enter catalog loading on this write.
            void saveProjectDirectoryMetadata(
              ctx,
              projectForLoad,
              labeledExplorerFolders,
            ).catch(() => {});
          }

          return {
            catalog,
            onChainRefs: chainRefs,
            explorerFolders: labeledExplorerFolders,
          };
        });

        if (!cancelled) {
          completedLoadForProjectRef.current = projectId;
          setCatalog(result.catalog);
          setOnChainRefs(result.onChainRefs);
          setExplorerFolders(result.explorerFolders);
          pruneOptimisticProjectAssets([
            ...result.catalog.scripts.map((asset) => asset.id),
            ...result.catalog.designAssets.map((asset) => asset.id),
            ...result.catalog.storyboards.map((asset) => asset.id),
            ...result.catalog.videos.map((asset) => asset.id),
            ...result.onChainRefs.map((ref) => ref.id),
          ]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load project assets",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    account?.address,
    projectId,
    projectAssetRefreshKey,
    refreshKey,
    pruneOptimisticProjectAssets,
    walrusNetwork,
  ]);

  const refs = useMemo(() => {
    const merged = new Map<string, CatalogAssetRef>();
    // On-chain Directory walk is the source of truth for membership.
    for (const ref of onChainRefs) {
      merged.set(`${ref.folderId}:${ref.id}`, ref);
    }
    // Optimistic locals (not yet flushed on-chain) still appear in the sidebar.
    for (const ref of optimisticProjectAssetRefs) {
      merged.set(`${ref.folderId}:${ref.id}`, ref);
    }
    return [...merged.values()];
  }, [onChainRefs, optimisticProjectAssetRefs]);

  const scriptById = useMemo(
    () => new Map(catalog.scripts.map((asset) => [asset.id, asset])),
    [catalog.scripts],
  );
  const designById = useMemo(
    () => new Map(catalog.designAssets.map((asset) => [asset.id, asset])),
    [catalog.designAssets],
  );
  const storyboardById = useMemo(
    () => new Map(catalog.storyboards.map((asset) => [asset.id, asset])),
    [catalog.storyboards],
  );
  const videoById = useMemo(
    () => new Map(catalog.videos.map((asset) => [asset.id, asset])),
    [catalog.videos],
  );

  return {
    projectId,
    catalog,
    refs,
    loading,
    error,
    walrusPathPrefix,
    explorerFolders,
    refresh,
    getScriptAsset: (id) => scriptById.get(id) ?? null,
    getDesignAsset: (id) => designById.get(id) ?? null,
    getStoryboardAsset: (id) => storyboardById.get(id) ?? null,
    getVideoAsset: (id) => videoById.get(id) ?? null,
  };
}

export function ProjectAssetsProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const value = useProjectAssetsState(projectId, true);
  return (
    <ProjectAssetsContext.Provider value={value}>
      {children}
    </ProjectAssetsContext.Provider>
  );
}

export function useProjectAssets(projectId: string): UseProjectAssetsResult {
  const shared = useContext(ProjectAssetsContext);
  const needsLocal = !shared || shared.projectId !== projectId;
  const local = useProjectAssetsState(projectId, needsLocal);
  if (shared && shared.projectId === projectId) {
    return shared;
  }
  return local;
}
