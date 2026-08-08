import type { Phase } from "../../components/workspace/types";
import {
  buildProjectManifest,
  parseProjectManifest,
  serializeProjectManifest,
} from "../project-manifest";
import {
  buildManifestPathForProject,
  saveProjectRegistryEntry,
  type ProjectRegistryRecord,
} from "../project-registry";
import {
  designAssetPath,
  legacyDesignAssetPath,
  manifestPath,
  type DesignPathKind,
} from "./paths";
import {
  readProjectTextAtPath,
  writeProjectTextAtPath,
  type WalrusStorageContext,
} from "./walrus-storage";
import type { WalrusBlobRef } from "./types";

export type AssetMemoryPhase = Phase | "registry" | "workflow";

export async function loadManifestFromWalrus(
  ctx: WalrusStorageContext,
  project: {
    id: string;
    walrusPathPrefix: string;
  },
): Promise<ReturnType<typeof buildProjectManifest> | null> {
  const text = await readProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    manifestPath(project.id),
  );
  if (!text) return null;

  const manifest = parseProjectManifest(text);
  if (!manifest || manifest.projectId !== project.id) return null;
  return manifest;
}

export async function saveManifestToWalrus(
  ctx: WalrusStorageContext,
  project: {
    id: string;
    walrusPathPrefix: string;
  },
  manifest: ReturnType<typeof buildProjectManifest>,
): Promise<WalrusBlobRef> {
  return writeProjectTextAtPath(
    ctx,
    project.walrusPathPrefix,
    manifestPath(project.id),
    serializeProjectManifest({
      ...manifest,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function assetPathForPhase(
  projectId: string,
  phase: AssetMemoryPhase,
  assetId: string,
  version: number,
  designKind?: DesignPathKind,
): string {
  switch (phase) {
    case "script":
      return `Script/Assets/${assetId}/v${version}.txt`;
    case "design":
      if (!designKind) {
        throw new Error("designKind is required for design asset paths");
      }
      return designAssetPath(projectId, assetId, version, designKind);
    case "storyboard":
      return `Storyboard/Assets/${assetId}/v${version}.json`;
    case "film":
      return `Film/Assets/${assetId}/v${version}.json`;
    default:
      return `${phase}/${assetId}/v${version}.json`;
  }
}

function designReadCandidates(
  projectId: string,
  assetId: string,
  version: number,
  designKind?: DesignPathKind,
): string[] {
  const paths: string[] = [];
  if (designKind) {
    paths.push(designAssetPath(projectId, assetId, version, designKind));
  }
  paths.push(
    designAssetPath(projectId, assetId, version, "character"),
    designAssetPath(projectId, assetId, version, "environment"),
    legacyDesignAssetPath(projectId, assetId, version),
  );
  return [...new Set(paths)];
}

export async function saveTextAssetToWalrus(input: {
  ctx: WalrusStorageContext;
  walrusPathPrefix: string;
  projectId: string;
  phase: AssetMemoryPhase;
  assetId: string;
  version: number;
  content: string;
  /** Required when phase is `design` — selects Characters vs Environments folder. */
  designKind?: DesignPathKind;
}): Promise<WalrusBlobRef> {
  const path = assetPathForPhase(
    input.projectId,
    input.phase,
    input.assetId,
    input.version,
    input.designKind,
  );

  return writeProjectTextAtPath(
    input.ctx,
    input.walrusPathPrefix,
    path,
    input.content,
  );
}

export async function loadTextAssetFromWalrus(input: {
  ctx: WalrusStorageContext;
  walrusPathPrefix: string;
  projectId: string;
  phase: AssetMemoryPhase;
  assetId: string;
  version: number;
  designKind?: DesignPathKind;
}): Promise<string | null> {
  if (input.phase === "design") {
    for (const path of designReadCandidates(
      input.projectId,
      input.assetId,
      input.version,
      input.designKind,
    )) {
      const text = await readProjectTextAtPath(
        input.ctx,
        input.walrusPathPrefix,
        path,
      );
      if (text) return text;
    }
    return null;
  }

  const path = assetPathForPhase(
    input.projectId,
    input.phase,
    input.assetId,
    input.version,
    input.designKind,
  );

  return readProjectTextAtPath(
    input.ctx,
    input.walrusPathPrefix,
    path,
  );
}

export async function saveJsonAssetToWalrus(input: {
  ctx: WalrusStorageContext;
  walrusPathPrefix: string;
  projectId: string;
  phase: AssetMemoryPhase;
  assetId: string;
  version: number;
  payload: unknown;
  designKind?: DesignPathKind;
}): Promise<WalrusBlobRef> {
  return saveTextAssetToWalrus({
    ctx: input.ctx,
    walrusPathPrefix: input.walrusPathPrefix,
    projectId: input.projectId,
    phase: input.phase,
    assetId: input.assetId,
    version: input.version,
    content: JSON.stringify(input.payload, null, 2),
    designKind: input.designKind,
  });
}

export { buildManifestPathForProject, saveProjectRegistryEntry };
export type { ProjectRegistryRecord };
