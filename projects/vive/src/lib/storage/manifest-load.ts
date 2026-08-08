import type { WalrusStorageContext } from "./walrus-storage";
import {
  parseProjectManifest,
  type ProjectManifest,
} from "../project-manifest";
import { downloadAndDecryptText } from "../walrus/download-decrypt";
import type { Project } from "../project";

type DecryptText = typeof downloadAndDecryptText;

/** Decrypt a project's sealed manifest blob. Used when the on-chain path index misses. */
export async function loadManifestByBlobId(
  ctx: WalrusStorageContext,
  project: Project,
  decryptText: DecryptText = downloadAndDecryptText,
): Promise<ProjectManifest | null> {
  const blobId = project.manifestBlobId?.trim();
  if (!blobId) return null;

  const text = await decryptText({
    blobId,
    sessionKey: ctx.sessionKey,
    sealClient: ctx.sealClient,
    suiClient: ctx.suiClient,
    projectId: ctx.vault.projectId,
    accessRegistryId: ctx.vault.accessRegistryId,
  });
  const manifest = parseProjectManifest(text);
  if (!manifest || manifest.projectId !== project.id) {
    return null;
  }
  return manifest;
}
