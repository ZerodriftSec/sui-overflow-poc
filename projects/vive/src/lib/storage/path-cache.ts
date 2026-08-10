export type PathCacheKind = "file" | "directory";

export interface PathCacheEntry {
  kind: PathCacheKind;
  objectId: string;
  parentDirectoryId: string;
  nameHashHex: string;
  contentBlobId?: string;
  metadataBlobId?: string;
  mimeType?: string;
  currentVersion?: number;
  updatedAt: string;
}

export interface PathCache {
  version: 1;
  projectId: string;
  entries: Record<string, PathCacheEntry>;
  updatedAt: string;
}

const CACHE_PREFIX = "dirsys-path-cache:";

function cacheKey(projectId: string): string {
  return `${CACHE_PREFIX}${projectId}`;
}

export function createEmptyPathCache(projectId: string): PathCache {
  return {
    version: 1,
    projectId,
    entries: {},
    updatedAt: new Date().toISOString(),
  };
}

export function readPathCache(projectId: string): PathCache {
  try {
    const raw = localStorage.getItem(cacheKey(projectId));
    if (!raw) return createEmptyPathCache(projectId);
    const parsed = JSON.parse(raw) as PathCache;
    if (parsed.version !== 1 || parsed.projectId !== projectId) {
      return createEmptyPathCache(projectId);
    }
    return parsed;
  } catch {
    return createEmptyPathCache(projectId);
  }
}

export function writePathCache(cache: PathCache): void {
  const payload: PathCache = {
    ...cache,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(cacheKey(payload.projectId), JSON.stringify(payload));
}

export function clearPathCache(projectId: string): void {
  localStorage.removeItem(cacheKey(projectId));
}

export function clearAllPathCaches(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function normalizeLogicalPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function splitLogicalPath(path: string): string[] {
  const normalized = normalizeLogicalPath(path);
  if (!normalized) return [];
  return normalized.split("/").filter(Boolean);
}

export function parentLogicalPath(path: string): string | null {
  const parts = splitLogicalPath(path);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("/");
}

export function upsertPathCacheEntry(
  cache: PathCache,
  logicalPath: string,
  entry: PathCacheEntry,
): PathCache {
  const key = normalizeLogicalPath(logicalPath);
  return {
    ...cache,
    entries: {
      ...cache.entries,
      [key]: entry,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function removePathCacheEntry(cache: PathCache, logicalPath: string): PathCache {
  const key = normalizeLogicalPath(logicalPath);
  const { [key]: _removed, ...rest } = cache.entries;
  return {
    ...cache,
    entries: rest,
    updatedAt: new Date().toISOString(),
  };
}
