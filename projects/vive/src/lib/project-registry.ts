import { z } from "zod";
import { VAULT_REGISTRY_PATH } from "../constants";
import type { Project } from "./project";
import { manifestPath } from "./storage/paths";
import type {
  ProjectRegistryDocument,
  ProjectRegistryRecord,
} from "./storage/types";
import {
  readTextAtPath,
  writeRegistryDocument,
  type WalrusStorageContext,
} from "./storage/walrus-storage";
import { writeCachedVaultContext } from "./vault";

const projectRegistryRecordSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  walrusPathPrefix: z.string(),
  ownerAddress: z.string(),
  manifestPath: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const projectRegistryDocumentSchema = z.object({
  type: z.literal("project-registry"),
  version: z.literal(1),
  projects: z.array(projectRegistryRecordSchema),
  updatedAt: z.string(),
});

export type { ProjectRegistryRecord };

export function buildProjectRegistryRecord(project: Project): ProjectRegistryRecord {
  return {
    projectId: project.id,
    title: project.title,
    walrusPathPrefix: project.walrusPathPrefix,
    ownerAddress: project.ownerAddress,
    manifestPath: project.manifestPath,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function createEmptyRegistry(): ProjectRegistryDocument {
  return {
    type: "project-registry",
    version: 1,
    projects: [],
    updatedAt: new Date().toISOString(),
  };
}

export function serializeProjectRegistry(doc: ProjectRegistryDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseProjectRegistry(text: string): ProjectRegistryDocument | null {
  try {
    return projectRegistryDocumentSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function loadProjectRegistry(
  ctx: WalrusStorageContext,
): Promise<ProjectRegistryDocument> {
  // Registry is an on-chain-indexed file under the workspace project root.
  const text = await readTextAtPath(ctx, VAULT_REGISTRY_PATH);
  if (!text) {
    return createEmptyRegistry();
  }
  return parseProjectRegistry(text) ?? createEmptyRegistry();
}

export interface ProjectRegistryWrite {
  logicalPath: string;
  text: string;
  entry: ProjectRegistryRecord;
}

/**
 * Reads the current registry and computes the updated document text for a
 * new/changed project entry, without performing the write. Lets callers fold
 * this write into a larger batched transaction (see writeTextsAtLogicalPaths)
 * instead of paying for a dedicated signAndExecute round trip.
 */
export async function buildProjectRegistryWrite(
  ctx: WalrusStorageContext,
  project: Project,
): Promise<ProjectRegistryWrite> {
  const registry = await loadProjectRegistry(ctx);
  const entry = buildProjectRegistryRecord({
    ...project,
    updatedAt: new Date().toISOString(),
  });

  const projects = registry.projects.filter((item) => item.projectId !== entry.projectId);
  projects.push(entry);
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const payload: ProjectRegistryDocument = {
    ...registry,
    projects,
    updatedAt: new Date().toISOString(),
  };

  return {
    logicalPath: VAULT_REGISTRY_PATH,
    text: serializeProjectRegistry(payload),
    entry,
  };
}

export async function saveProjectRegistryEntry(
  ctx: WalrusStorageContext,
  project: Project,
): Promise<ProjectRegistryRecord> {
  const write = await buildProjectRegistryWrite(ctx, project);
  await writeRegistryDocument(ctx, write.text);
  writeCachedVaultContext(ctx.vault);
  return write.entry;
}

export async function listProjectRegistryFromWalrus(
  ctx: WalrusStorageContext,
): Promise<ProjectRegistryRecord[]> {
  const registry = await loadProjectRegistry(ctx);
  return registry.projects;
}

export function defaultManifestPath(projectId: string): string {
  return `${projectId}/manifest.json`.replace(/^/, "project/");
}

export function buildManifestPathForProject(projectId: string): string {
  return `project/${projectId}/${manifestPath(projectId)}`;
}
