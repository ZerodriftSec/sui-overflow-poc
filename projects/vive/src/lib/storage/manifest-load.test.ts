import { describe, expect, test } from "bun:test";
import {
  buildProjectManifest,
  serializeProjectManifest,
} from "../project-manifest";
import { loadManifestByBlobId } from "./manifest-load";
import type { Project } from "../project";
import type { WalrusStorageContext } from "./walrus-storage";

function mockProject(projectId: string, manifestBlobId: string | null): Project {
  return {
    id: projectId,
    title: "Test",
    ownerAddress: "0x" + "11".repeat(32),
    vaultId: "0x" + "22".repeat(32),
    walrusPathPrefix: `project/${projectId}/`,
    manifestPath: "manifest.json",
    manifestBlobId,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    phases: {
      script: {
        status: "active",
        approvedVersion: null,
        currentVersion: 0,
        approvedBlobId: null,
        currentBlobId: null,
      },
      design: {
        status: "locked",
        approvedVersion: null,
        currentVersion: 0,
        approvedBlobId: null,
        currentBlobId: null,
      },
      storyboard: {
        status: "locked",
        approvedVersion: null,
        currentVersion: 0,
        approvedBlobId: null,
        currentBlobId: null,
      },
      film: {
        status: "locked",
        approvedVersion: null,
        currentVersion: 0,
        approvedBlobId: null,
        currentBlobId: null,
      },
    },
  };
}

function mockCtx(): WalrusStorageContext {
  return {
    vault: {
      projectId: "0x" + "22".repeat(32),
      vaultId: "0x" + "22".repeat(32),
      accessRegistryId: "0x" + "33".repeat(32),
      capId: "0x" + "33".repeat(32),
      rootDirectoryId: "0x" + "44".repeat(32),
      adminCapId: "0x" + "55".repeat(32),
      ownerAddress: "0x" + "11".repeat(32),
      title: "Studio Workspace",
      pathIndexBlobId: null,
      registryBlobId: null,
    },
    sealClient: {} as never,
    sessionKey: {} as never,
    suiClient: {} as never,
    signAndExecute: async () => ({ createdFileIds: [] }),
  };
}

describe("loadManifestByBlobId", () => {
  test("returns null when manifestBlobId is missing", async () => {
    const loaded = await loadManifestByBlobId(
      mockCtx(),
      mockProject("proj-1", null),
    );
    expect(loaded).toBeNull();
  });

  test("decrypts sealed manifest blob and returns script assets", async () => {
    const projectId = "proj-1";
    const manifest = buildProjectManifest({
      projectId,
      title: "Test",
      ownerAddress: "0x" + "11".repeat(32),
      vaultId: "0x" + "22".repeat(32),
      walrusPathPrefix: `project/${projectId}/`,
      manifestPath: "manifest.json",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
      scriptAssets: [
        {
          id: "script-1",
          title: "Pilot",
          blobId: "script-blob",
          updatedAt: new Date().toISOString(),
          currentVersion: 1,
          versions: [
            {
              version: 1,
              blobId: "script-blob",
              savedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      designAssets: [],
      storyboardAssets: [],
      filmAssets: [],
    });

    const loaded = await loadManifestByBlobId(
      mockCtx(),
      mockProject(projectId, "manifest-blob"),
      async () => serializeProjectManifest(manifest),
    );

    expect(loaded?.scriptAssets).toHaveLength(1);
    expect(loaded?.scriptAssets[0]?.title).toBe("Pilot");
  });

  test("returns null when decrypted manifest belongs to another project", async () => {
    const manifest = buildProjectManifest({
      projectId: "other-project",
      title: "Test",
      ownerAddress: "0x" + "11".repeat(32),
      vaultId: "0x" + "22".repeat(32),
      walrusPathPrefix: "project/other-project/",
      manifestPath: "manifest.json",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
      scriptAssets: [],
      designAssets: [],
      storyboardAssets: [],
      filmAssets: [],
    });

    const loaded = await loadManifestByBlobId(
      mockCtx(),
      mockProject("proj-1", "manifest-blob"),
      async () => serializeProjectManifest(manifest),
    );

    expect(loaded).toBeNull();
  });
});
