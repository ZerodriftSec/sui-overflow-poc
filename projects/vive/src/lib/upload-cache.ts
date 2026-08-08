export type CachedUploadPhase = "script" | "design" | "storyboard" | "film";

export interface CachedUploadEntry {
  phase: CachedUploadPhase;
  projectId: string;
  assetId: string;
  title: string;
  updatedAt: string;
  version: number;
  kind?: "character" | "environment";
  payload: string;
  error: string;
}

interface UploadCacheState {
  entries: CachedUploadEntry[];
}

const UPLOAD_CACHE_KEY = "content-studio-upload-cache-v1";

function readUploadCacheState(): UploadCacheState {
  try {
    const raw = localStorage.getItem(UPLOAD_CACHE_KEY);
    if (!raw) {
      return { entries: [] };
    }
    const parsed = JSON.parse(raw) as UploadCacheState;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { entries: [] };
    }
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function writeUploadCacheState(state: UploadCacheState): void {
  localStorage.setItem(UPLOAD_CACHE_KEY, JSON.stringify(state));
}

export function upsertCachedUploadEntry(entry: CachedUploadEntry): void {
  const state = readUploadCacheState();
  const nextEntries = state.entries.filter(
    (item) =>
      !(
        item.phase === entry.phase &&
        item.projectId === entry.projectId &&
        item.assetId === entry.assetId
      ),
  );
  nextEntries.push(entry);
  writeUploadCacheState({ entries: nextEntries });
}

export function removeCachedUploadEntry(input: {
  phase: CachedUploadPhase;
  projectId: string;
  assetId: string;
}): void {
  const state = readUploadCacheState();
  const nextEntries = state.entries.filter(
    (item) =>
      !(
        item.phase === input.phase &&
        item.projectId === input.projectId &&
        item.assetId === input.assetId
      ),
  );
  if (nextEntries.length === state.entries.length) {
    return;
  }
  writeUploadCacheState({ entries: nextEntries });
}

export function getCachedUploadEntry(input: {
  phase: CachedUploadPhase;
  projectId: string;
  assetId: string;
}): CachedUploadEntry | null {
  const state = readUploadCacheState();
  return (
    state.entries.find(
      (item) =>
        item.phase === input.phase &&
        item.projectId === input.projectId &&
        item.assetId === input.assetId,
    ) ?? null
  );
}

export function listCachedUploadEntries(input: {
  phase: CachedUploadPhase;
  projectId: string;
}): CachedUploadEntry[] {
  const state = readUploadCacheState();
  return state.entries
    .filter(
      (item) => item.phase === input.phase && item.projectId === input.projectId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
