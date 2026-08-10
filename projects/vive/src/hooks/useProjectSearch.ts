import { useCallback, useState } from "react";
import {
  buildProjectSearchIndex,
  searchProjectAssetsLocal,
  type AssetSearchResult,
} from "../lib/project-search";
import type { ProjectManifest } from "../lib/project-manifest";
import type { WalrusStorageContext } from "../lib/storage/walrus-storage";

interface UseProjectSearchResult {
  results: AssetSearchResult[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
  rebuildIndex: (
    ctx: WalrusStorageContext,
    project: { id: string; walrusPathPrefix: string },
    manifest: ProjectManifest,
  ) => Promise<void>;
}

export function useProjectSearch(projectId: string): UseProjectSearchResult {
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const matches = searchProjectAssetsLocal(projectId, trimmed);
        setResults(matches);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  const rebuildIndex = useCallback(
    async (
      ctx: WalrusStorageContext,
      project: { id: string; walrusPathPrefix: string },
      manifest: ProjectManifest,
    ) => {
      await buildProjectSearchIndex(ctx, project, manifest, {
        includeAssetBodies: true,
      });
    },
    [],
  );

  return { results, loading, error, search, clear, rebuildIndex };
}
