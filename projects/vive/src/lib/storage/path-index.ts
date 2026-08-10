import type { PathIndex, PathIndexEntry } from "./types";

export function createEmptyPathIndex(): PathIndex {
  return {
    type: "path-index",
    version: 1,
    entries: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export function parsePathIndex(text: string): PathIndex | null {
  try {
    const parsed = JSON.parse(text) as PathIndex;
    if (parsed.type !== "path-index" || parsed.version !== 1) return null;
    if (!parsed.entries || typeof parsed.entries !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializePathIndex(index: PathIndex): string {
  return JSON.stringify(
    {
      ...index,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function resolvePathEntry(
  index: PathIndex,
  logicalPath: string,
): PathIndexEntry | null {
  return index.entries[logicalPath] ?? null;
}

export function upsertPathEntry(
  index: PathIndex,
  logicalPath: string,
  ref: { blobId: string; blobObjectId: string },
): PathIndex {
  return {
    ...index,
    entries: {
      ...index.entries,
      [logicalPath]: {
        blobId: ref.blobId,
        blobObjectId: ref.blobObjectId,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function removePathEntry(index: PathIndex, logicalPath: string): PathIndex {
  const nextEntries = { ...index.entries };
  delete nextEntries[logicalPath];
  return {
    ...index,
    entries: nextEntries,
  };
}
