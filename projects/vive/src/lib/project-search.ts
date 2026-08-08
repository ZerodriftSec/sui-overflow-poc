import type { Phase } from "../components/workspace/types";
import type { ProjectManifest } from "./project-manifest";
import type { WalrusStorageContext } from "./storage/walrus-storage";
import { loadTextAssetFromWalrus } from "./storage/asset-storage";

export interface SearchableAssetRecord {
  projectId: string;
  phase: Phase | "registry" | "workflow";
  assetId: string;
  version?: number;
  title: string;
  summary: string;
  tags: string[];
  content: string;
}

export interface AssetSearchResult {
  projectId: string;
  phase: Phase | "registry" | "workflow";
  assetId: string;
  version?: number;
  title: string;
  summary: string;
  tags: string[];
  score: number;
}

const searchIndexCache = new Map<string, SearchableAssetRecord[]>();

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function scoreRecord(record: SearchableAssetRecord, tokens: string[]): number {
  const haystack = [
    record.title,
    record.summary,
    record.content,
    record.tags.join(" "),
    record.phase,
    record.assetId,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function manifestToRecords(
  projectId: string,
  manifest: ProjectManifest,
): SearchableAssetRecord[] {
  const records: SearchableAssetRecord[] = [
    {
      projectId,
      phase: "registry",
      assetId: projectId,
      title: manifest.title,
      summary: `Manifest with ${manifest.scriptAssets.length} scripts`,
      tags: ["manifest", "project"],
      content: JSON.stringify(manifest),
    },
  ];

  for (const asset of manifest.scriptAssets) {
    records.push({
      projectId,
      phase: "script",
      assetId: asset.id,
      version: asset.currentVersion,
      title: asset.title,
      summary: `Script asset ${asset.title}`,
      tags: ["script"],
      content: asset.title,
    });
  }

  for (const asset of manifest.designAssets ?? []) {
    records.push({
      projectId,
      phase: "design",
      assetId: asset.id,
      version: asset.currentVersion,
      title: asset.title,
      summary: `${asset.kind} design ${asset.title}`,
      tags: ["design", asset.kind],
      content: asset.title,
    });
  }

  for (const asset of manifest.storyboardAssets ?? []) {
    records.push({
      projectId,
      phase: "storyboard",
      assetId: asset.id,
      version: asset.currentVersion,
      title: asset.title,
      summary: `Storyboard ${asset.title}`,
      tags: ["storyboard"],
      content: asset.title,
    });
  }

  for (const asset of manifest.filmAssets ?? []) {
    records.push({
      projectId,
      phase: "film",
      assetId: asset.id,
      version: asset.currentVersion,
      title: asset.title,
      summary: `Film clip ${asset.title}`,
      tags: ["film"],
      content: asset.title,
    });
  }

  return records;
}

export async function buildProjectSearchIndex(
  ctx: WalrusStorageContext,
  project: { id: string; walrusPathPrefix: string },
  manifest: ProjectManifest,
  options?: { includeAssetBodies?: boolean },
): Promise<SearchableAssetRecord[]> {
  const records = manifestToRecords(project.id, manifest);

  if (options?.includeAssetBodies) {
    for (const record of records) {
      if (
        record.phase === "registry" ||
        record.phase === "workflow" ||
        !record.version
      ) {
        continue;
      }

      try {
        const text = await loadTextAssetFromWalrus({
          ctx,
          walrusPathPrefix: project.walrusPathPrefix,
          projectId: project.id,
          phase: record.phase,
          assetId: record.assetId,
          version: record.version,
        });
        if (text) {
          record.content = text.slice(0, 4000);
        }
      } catch {
        // Skip assets that fail to load during indexing.
      }
    }
  }

  searchIndexCache.set(project.id, records);
  return records;
}

export function searchProjectAssetsLocal(
  projectId: string,
  query: string,
): AssetSearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const records = searchIndexCache.get(projectId) ?? [];
  return records
    .map((record) => ({
      projectId: record.projectId,
      phase: record.phase,
      assetId: record.assetId,
      version: record.version,
      title: record.title,
      summary: record.summary,
      tags: record.tags,
      score: scoreRecord(record, tokens),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function clearProjectSearchIndex(projectId?: string): void {
  if (projectId) {
    searchIndexCache.delete(projectId);
    return;
  }
  searchIndexCache.clear();
}
