import type { SealClient, SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { toHex } from "@mysten/sui/utils";
import {
  AccessRegistry,
  ProjectAdminCap,
  grantEntry,
  revokeEntry,
} from "../contracts/content_vault/access";
import {
  createDirectory,
  shareDirectory,
} from "../contracts/content_vault/directory";
import {
  addVersionEntry,
  createFileEntry,
  moveFileEntry,
} from "../contracts/content_vault/file";
import {
  Project,
  createProject,
  createProjectEntry,
  finalizeProject,
  id as projectObjectId,
} from "../contracts/content_vault/project";
import { nameHash as hashDirectoryName } from "../contracts/content_vault/utils";
import { getVaultPackageId, vaultPackageOptions } from "./vault-package";
import { computeNameHash, nameHashToBytes } from "./storage/name-hash";

export interface VaultDiscoveryClient {
  listOwnedObjects(params: {
    owner: string;
    type: string;
    include?: { content?: boolean };
  }): Promise<{
    objects: Array<{ objectId: string; content?: Uint8Array }>;
  }>;
  getObject(params: {
    objectId: string;
    include?: { content?: boolean };
  }): Promise<{ object?: { content?: Uint8Array } | null }>;
}

/** On-chain workspace / project context (replaces the old pointer Vault). */
export interface VaultContext {
  /** On-chain Project object ID. */
  projectId: string;
  /** @deprecated Alias of projectId for transitional callers. */
  vaultId: string;
  adminCapId: string;
  accessRegistryId: string;
  rootDirectoryId: string;
  ownerAddress: string;
  title: string;
  /**
   * @deprecated Seal approvals now use accessRegistryId.
   * Kept equal to accessRegistryId so older call sites compile during migration.
   */
  capId: string;
  /** @deprecated Path index is on-chain; always null. */
  pathIndexBlobId: string | null;
  /** @deprecated Project registry is on-chain discovery; always null. */
  registryBlobId: string | null;
}

const VAULT_CACHE_PREFIX = "dirsys-project-context:";
export const WORKSPACE_PROJECT_TITLE = "Studio Workspace";
/** On-chain root segment names for default workspace folders (see on-chain-directory mapping). */
export const DEFAULT_WORKSPACE_DIRECTORY_SEGMENTS = [
  "script",
  "characters",
  "environments",
  "storyboard",
  "video clip",
  "conversations",
] as const;

/** Thrown when reads need an on-chain workspace that has not been created yet. */
export class WorkspaceStorageNotFoundError extends Error {
  constructor() {
    super(
      "Workspace storage not found. Create a project to set up your on-chain workspace.",
    );
    this.name = "WorkspaceStorageNotFoundError";
  }
}

export function isWorkspaceStorageNotFoundError(error: unknown): boolean {
  if (error instanceof WorkspaceStorageNotFoundError) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.name === "WorkspaceStorageNotFoundError" ||
    error.message.includes("Workspace storage not found")
  );
}

function vaultCacheKey(address: string): string {
  return `${VAULT_CACHE_PREFIX}${address}`;
}

export function readCachedVaultContext(address: string): VaultContext | null {
  try {
    const raw = localStorage.getItem(vaultCacheKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultContext;
    if (!parsed.projectId || !parsed.accessRegistryId || !parsed.rootDirectoryId) {
      return null;
    }
    return normalizeVaultContext(parsed);
  } catch {
    return null;
  }
}

export function writeCachedVaultContext(context: VaultContext): void {
  localStorage.setItem(
    vaultCacheKey(context.ownerAddress),
    JSON.stringify(normalizeVaultContext(context)),
  );
}

export function clearCachedVaultContext(address: string): void {
  localStorage.removeItem(vaultCacheKey(address));
}

function normalizeVaultContext(input: VaultContext): VaultContext {
  const projectId = input.projectId || input.vaultId;
  return {
    projectId,
    vaultId: projectId,
    adminCapId: input.adminCapId,
    accessRegistryId: input.accessRegistryId,
    rootDirectoryId: input.rootDirectoryId,
    ownerAddress: input.ownerAddress,
    title: input.title || WORKSPACE_PROJECT_TITLE,
    capId: input.accessRegistryId,
    pathIndexBlobId: null,
    registryBlobId: null,
  };
}

function parseProjectContent(content: Uint8Array | undefined): {
  title: string;
  accessRegistryId: string;
  rootDirectoryId: string;
  owner: string;
} | null {
  if (!content) return null;
  try {
    const parsed = Project.parse(content);
    return {
      title: parsed.title,
      accessRegistryId: parsed.access_registry_id,
      rootDirectoryId: parsed.root_directory_id,
      owner: parsed.owner,
    };
  } catch {
    return null;
  }
}

export async function listOwnedProjectContexts(
  suiClient: VaultDiscoveryClient,
  ownerAddress: string,
): Promise<VaultContext[]> {
  const packageId = getVaultPackageId();
  const capType = `${packageId}::access::ProjectAdminCap`;

  const { objects } = await suiClient.listOwnedObjects({
    owner: ownerAddress,
    type: capType,
    include: { content: true },
  });

  const contexts: VaultContext[] = [];

  for (const capObject of objects) {
    if (!capObject.content) continue;
    let projectId: string;
    try {
      projectId = ProjectAdminCap.parse(capObject.content).project_id;
    } catch {
      continue;
    }

    const { object: projectObject } = await suiClient.getObject({
      objectId: projectId,
      include: { content: true },
    });
    const fields = parseProjectContent(projectObject?.content);
    if (!fields) continue;

    contexts.push(
      normalizeVaultContext({
        projectId,
        vaultId: projectId,
        adminCapId: capObject.objectId,
        accessRegistryId: fields.accessRegistryId,
        rootDirectoryId: fields.rootDirectoryId,
        ownerAddress,
        title: fields.title,
        capId: fields.accessRegistryId,
        pathIndexBlobId: null,
        registryBlobId: null,
      }),
    );
  }

  return contexts;
}

export async function findVaultContext(
  suiClient: VaultDiscoveryClient,
  ownerAddress: string,
): Promise<VaultContext | null> {
  const contexts = await listOwnedProjectContexts(suiClient, ownerAddress);
  if (contexts.length === 0) {
    // Drop stale cache from a previous package publish / wallet.
    clearCachedVaultContext(ownerAddress);
    return null;
  }

  const workspace =
    contexts.find((ctx) => ctx.title === WORKSPACE_PROJECT_TITLE) ?? contexts[0];
  writeCachedVaultContext(workspace);
  return workspace;
}

export async function findProjectContextById(
  suiClient: VaultDiscoveryClient,
  ownerAddress: string,
  projectId: string,
): Promise<VaultContext | null> {
  const contexts = await listOwnedProjectContexts(suiClient, ownerAddress);
  return contexts.find((ctx) => ctx.projectId === projectId) ?? null;
}

/**
 * Build a PTB that creates a project and optionally seeds default root directories
 * (scripts / characters / environments / storyboards / video clips / conversations)
 * in one signature.
 */
export function buildCreateProjectTransaction(
  title: string,
  segmentNames: readonly string[] = DEFAULT_WORKSPACE_DIRECTORY_SEGMENTS,
): Transaction {
  const tx = new Transaction();
  const options = vaultPackageOptions();

  if (segmentNames.length === 0) {
    tx.add(
      createProjectEntry({
        ...options,
        arguments: { title },
      }),
    );
    return tx;
  }

  const created = tx.add(
    createProject({
      ...options,
      arguments: { title },
    }),
  );
  const adminCap = created[0];
  const registry = created[1];
  const root = created[2];
  const project = created[3];

  const projectId = tx.add(
    projectObjectId({
      ...options,
      arguments: { project },
    }),
  );

  for (const segmentName of segmentNames) {
    const nameBytes = Array.from(new TextEncoder().encode(segmentName));
    const hashedName = tx.add(
      hashDirectoryName({
        ...options,
        arguments: {
          projectId,
          name: nameBytes,
        },
      }),
    );
    const directory = tx.add(
      createDirectory({
        ...options,
        arguments: {
          parent: root,
          registry,
          nameHash: hashedName,
        },
      }),
    );
    tx.add(
      shareDirectory({
        ...options,
        arguments: { directory },
      }),
    );
  }

  tx.add(
    finalizeProject({
      ...options,
      arguments: {
        adminCap,
        registry,
        root,
        project,
      },
    }),
  );

  return tx;
}

/** @deprecated Use buildCreateProjectTransaction */
export function buildCreateVaultTransaction(): Transaction {
  return buildCreateProjectTransaction(WORKSPACE_PROJECT_TITLE);
}

export function buildGrantAccessTransaction(input: {
  accessRegistryId: string;
  adminCapId: string;
  who: string;
  perm: number;
}): Transaction {
  const tx = new Transaction();
  tx.add(
    grantEntry({
      ...vaultPackageOptions(),
      arguments: {
        registry: input.accessRegistryId,
        admin: input.adminCapId,
        who: input.who,
        perm: input.perm,
      },
    }),
  );
  return tx;
}

export function buildRevokeAccessTransaction(input: {
  accessRegistryId: string;
  adminCapId: string;
  who: string;
}): Transaction {
  const tx = new Transaction();
  tx.add(
    revokeEntry({
      ...vaultPackageOptions(),
      arguments: {
        registry: input.accessRegistryId,
        admin: input.adminCapId,
        who: input.who,
      },
    }),
  );
  return tx;
}

export type FileWriteOp =
  | {
      type: "create-file";
      directoryId: string;
      nameHash: number[];
      mimeType: number[];
      contentBlobId: number[];
      contentHash: number[];
      contentSize: number;
      metadataBlobId: number[];
      walrusEndEpoch: number;
      logicalPath: string;
    }
  | {
      type: "add-version";
      fileId: string;
      contentBlobId: number[];
      contentHash: number[];
      contentSize: number;
      metadataBlobId: number[];
      walrusEndEpoch: number;
      logicalPath: string;
    };

/**
 * Build a single PTB for create-file / add-version mutations.
 * Multiple mutations are batched to minimize wallet signatures.
 */
export function buildFileMutationTransaction(input: {
  accessRegistryId: string;
  mutations: FileWriteOp[];
}): Transaction {
  const tx = new Transaction();
  const options = vaultPackageOptions();

  for (const mutation of input.mutations) {
    if (mutation.type === "create-file") {
      tx.add(
        createFileEntry({
          ...options,
          arguments: {
            directory: mutation.directoryId,
            registry: input.accessRegistryId,
            nameHash: mutation.nameHash,
            mimeType: mutation.mimeType,
            contentBlobId: mutation.contentBlobId,
            contentHash: mutation.contentHash,
            contentSize: mutation.contentSize,
            metadataBlobId: mutation.metadataBlobId,
            walrusEndEpoch: mutation.walrusEndEpoch,
          },
        }),
      );
      continue;
    }

    tx.add(
      addVersionEntry({
        ...options,
        arguments: {
          file: mutation.fileId,
          registry: input.accessRegistryId,
          contentBlobId: mutation.contentBlobId,
          contentHash: mutation.contentHash,
          contentSize: mutation.contentSize,
          metadataBlobId: mutation.metadataBlobId,
          walrusEndEpoch: mutation.walrusEndEpoch,
        },
      }),
    );
  }

  return tx;
}

export function buildMoveFileTransaction(input: {
  fileId: string;
  fromDirectoryId: string;
  toDirectoryId: string;
  accessRegistryId: string;
  nameHash: number[];
}): Transaction {
  const tx = new Transaction();
  tx.add(
    moveFileEntry({
      ...vaultPackageOptions(),
      arguments: {
        file: input.fileId,
        fromDir: input.fromDirectoryId,
        toDir: input.toDirectoryId,
        registry: input.accessRegistryId,
        nameHash: input.nameHash,
      },
    }),
  );
  return tx;
}

export function buildCreateDirectoryTransaction(input: {
  parentDirectoryId: string;
  accessRegistryId: string;
  projectId: string;
  segmentName: string;
}): Transaction {
  const tx = new Transaction();
  const nameHash = nameHashToBytes(computeNameHash(input.projectId, input.segmentName));
  const created = tx.add(
    createDirectory({
      ...vaultPackageOptions(),
      arguments: {
        parent: input.parentDirectoryId,
        registry: input.accessRegistryId,
        nameHash,
      },
    }),
  );
  tx.add(
    shareDirectory({
      ...vaultPackageOptions(),
      arguments: { directory: created },
    }),
  );
  return tx;
}

export function buildCreateDirectoriesTransaction(input: {
  parentDirectoryId: string;
  accessRegistryId: string;
  projectId: string;
  segmentNames: readonly string[];
}): Transaction {
  const tx = new Transaction();
  for (const segmentName of input.segmentNames) {
    const nameHash = nameHashToBytes(computeNameHash(input.projectId, segmentName));
    const created = tx.add(
      createDirectory({
        ...vaultPackageOptions(),
        arguments: {
          parent: input.parentDirectoryId,
          registry: input.accessRegistryId,
          nameHash,
        },
      }),
    );
    tx.add(
      shareDirectory({
        ...vaultPackageOptions(),
        arguments: { directory: created },
      }),
    );
  }
  return tx;
}

export interface VaultStorageDeps {
  vault: VaultContext;
  sealClient: SealClient;
  sessionKey: SessionKey;
  suiClient: SealCompatibleClient;
  signAndExecute: (tx: Transaction) => Promise<{ createdFileIds: string[] } | void>;
}

export async function refreshVaultContext(
  deps: Pick<VaultStorageDeps, "suiClient" | "vault">,
): Promise<VaultContext> {
  const refreshed = await findVaultContext(
    deps.suiClient as unknown as VaultDiscoveryClient,
    deps.vault.ownerAddress,
  );
  if (!refreshed) {
    throw new Error("Workspace project not found for connected wallet.");
  }
  return refreshed;
}

export function nameHashHex(projectId: string, name: string): string {
  return toHex(computeNameHash(projectId, name));
}

export { AccessRegistry, Project, ProjectAdminCap };
