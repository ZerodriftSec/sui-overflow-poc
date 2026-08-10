import { describe, expect, test } from "bun:test";
import { bcs } from "@mysten/sui/bcs";
import { toHex } from "@mysten/sui/utils";
import { DirEntry, Directory } from "../../contracts/content_vault/directory";
import { File, VersionInfo } from "../../contracts/content_vault/file";
import { computeNameHash } from "./name-hash";
import {
  resolveFileAtLogicalPath,
  resolveFileObjectIdAtLogicalPath,
} from "./on-chain-path";

function addr(byte: number): string {
  return "0x" + byte.toString(16).padStart(2, "0").repeat(32);
}

function mockClient(objects: Map<string, Uint8Array>) {
  return {
    core: {
      getObject: async ({ objectId }: { objectId: string }) => {
        const content = objects.get(objectId);
        if (!content) {
          throw new Error(`Object not found: ${objectId}`);
        }
        return { object: { objectId, content } };
      },
      getDynamicField: async ({
        parentId,
        name,
      }: {
        parentId: string;
        name: { type: string; bcs: Uint8Array };
      }) => {
        const key = `${parentId}:${toHex(name.bcs)}`;
        const content = objects.get(key);
        if (!content) {
          throw new Error(`Dynamic field not found: ${key}`);
        }
        // Mimic CoreClient Field layout: uid(32) || name || value
        const fieldContent = new Uint8Array(32 + name.bcs.length + content.length);
        fieldContent.set(new Uint8Array(32), 0);
        fieldContent.set(name.bcs, 32);
        fieldContent.set(content, 32 + name.bcs.length);
        return {
          dynamicField: {
            $kind: "DynamicField" as const,
            value: { type: "value", bcs: content },
          },
        };
      },
    },
  };
}

describe("on-chain-path", () => {
  test("resolveFileAtLogicalPath reads registry via directory + file tables", async () => {
    const projectId = addr(0x11);
    const rootDirectoryId = addr(0x22);
    const entriesTableId = addr(0x33);
    const fileId = addr(0x44);
    const versionsTableId = addr(0x55);
    const logicalPath = "registry.json";
    const nameHash = computeNameHash(projectId, logicalPath);
    const nameBcs = bcs.vector(bcs.u8()).serialize(nameHash).toBytes();
    const versionKeyBcs = bcs.u64().serialize(1).toBytes();

    const objects = new Map<string, Uint8Array>();
    objects.set(
      rootDirectoryId,
      Directory.serialize({
        id: rootDirectoryId,
        name_hash: [],
        parent: null,
        project_id: projectId,
        entries: { id: entriesTableId, size: 1n },
        entry_count: 1n,
        created_at_ms: 1n,
      }).toBytes(),
    );
    objects.set(
      `${entriesTableId}:${toHex(nameBcs)}`,
      DirEntry.serialize({ is_directory: false, object_id: fileId }).toBytes(),
    );
    objects.set(
      fileId,
      File.serialize({
        id: fileId,
        directory_id: rootDirectoryId,
        project_id: projectId,
        name_hash: Array.from(nameHash),
        mime_type: Array.from(new TextEncoder().encode("application/json")),
        current_version: 1n,
        version_count: 1n,
        versions: { id: versionsTableId, size: 1n },
        seal_id_prefix: Array.from(new Uint8Array(32)),
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );
    objects.set(
      `${versionsTableId}:${toHex(versionKeyBcs)}`,
      VersionInfo.serialize({
        version: 1n,
        content_blob_id: Array.from(new TextEncoder().encode("content-blob")),
        content_hash: Array.from(new Uint8Array(32).fill(1)),
        content_size: 12n,
        metadata_blob_id: Array.from(new TextEncoder().encode("meta-blob")),
        walrus_end_epoch: 100n,
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );

    const client = mockClient(objects) as never;
    const resolved = await resolveFileAtLogicalPath(client, {
      projectId,
      rootDirectoryId,
      logicalPath,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.fileId).toBe(fileId);
    expect(resolved?.contentBlobId).toBe("content-blob");
    expect(resolved?.metadataBlobId).toBe("meta-blob");
    expect(resolved?.mimeType).toBe("application/json");
    expect(resolved?.currentVersion).toBe(1);

    const fileObjectId = await resolveFileObjectIdAtLogicalPath(client, {
      projectId,
      rootDirectoryId,
      logicalPath,
    });
    expect(fileObjectId).toBe(fileId);
  });

  test("resolveFileAtLogicalPath reads conversations from the conversations Directory", async () => {
    const projectId = addr(0x11);
    const rootDirectoryId = addr(0x22);
    const conversationsDirectoryId = addr(0x77);
    const rootEntriesTableId = addr(0x33);
    const conversationEntriesTableId = addr(0x88);
    const fileId = addr(0x44);
    const versionsTableId = addr(0x55);
    const logicalPath =
      "project/abc/Conversations/text:script/conv-1.json";
    const nameHash = computeNameHash(projectId, logicalPath);
    const conversationsSegmentHash = computeNameHash(projectId, "conversations");
    const conversationsSegmentBcs = bcs
      .vector(bcs.u8())
      .serialize(conversationsSegmentHash)
      .toBytes();
    const nameBcs = bcs.vector(bcs.u8()).serialize(nameHash).toBytes();
    const versionKeyBcs = bcs.u64().serialize(1).toBytes();

    const objects = new Map<string, Uint8Array>();
    objects.set(
      rootDirectoryId,
      Directory.serialize({
        id: rootDirectoryId,
        name_hash: [],
        parent: null,
        project_id: projectId,
        entries: { id: rootEntriesTableId, size: 1n },
        entry_count: 1n,
        created_at_ms: 1n,
      }).toBytes(),
    );
    objects.set(
      `${rootEntriesTableId}:${toHex(conversationsSegmentBcs)}`,
      DirEntry.serialize({
        is_directory: true,
        object_id: conversationsDirectoryId,
      }).toBytes(),
    );
    objects.set(
      conversationsDirectoryId,
      Directory.serialize({
        id: conversationsDirectoryId,
        name_hash: Array.from(conversationsSegmentHash),
        parent: rootDirectoryId,
        project_id: projectId,
        entries: { id: conversationEntriesTableId, size: 1n },
        entry_count: 1n,
        created_at_ms: 1n,
      }).toBytes(),
    );
    objects.set(
      `${conversationEntriesTableId}:${toHex(nameBcs)}`,
      DirEntry.serialize({ is_directory: false, object_id: fileId }).toBytes(),
    );
    objects.set(
      fileId,
      File.serialize({
        id: fileId,
        directory_id: conversationsDirectoryId,
        project_id: projectId,
        name_hash: Array.from(nameHash),
        mime_type: Array.from(new TextEncoder().encode("application/json")),
        current_version: 1n,
        version_count: 1n,
        versions: { id: versionsTableId, size: 1n },
        seal_id_prefix: Array.from(new Uint8Array(32)),
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );
    objects.set(
      `${versionsTableId}:${toHex(versionKeyBcs)}`,
      VersionInfo.serialize({
        version: 1n,
        content_blob_id: Array.from(new TextEncoder().encode("conversation-blob")),
        content_hash: Array.from(new Uint8Array(32).fill(1)),
        content_size: 12n,
        metadata_blob_id: Array.from(new TextEncoder().encode("meta-blob")),
        walrus_end_epoch: 100n,
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );

    const client = mockClient(objects) as never;
    const resolved = await resolveFileAtLogicalPath(client, {
      projectId,
      rootDirectoryId,
      logicalPath,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.fileId).toBe(fileId);
    expect(resolved?.parentDirectoryId).toBe(conversationsDirectoryId);
    expect(resolved?.contentBlobId).toBe("conversation-blob");
  });

  test("resolveFileAtLogicalPath falls back to root for legacy flat conversations", async () => {
    const projectId = addr(0x11);
    const rootDirectoryId = addr(0x22);
    const rootEntriesTableId = addr(0x33);
    const fileId = addr(0x44);
    const versionsTableId = addr(0x55);
    const logicalPath =
      "project/abc/Conversations/text:script/conv-legacy.json";
    const nameHash = computeNameHash(projectId, logicalPath);
    const nameBcs = bcs.vector(bcs.u8()).serialize(nameHash).toBytes();
    const versionKeyBcs = bcs.u64().serialize(1).toBytes();

    const objects = new Map<string, Uint8Array>();
    objects.set(
      rootDirectoryId,
      Directory.serialize({
        id: rootDirectoryId,
        name_hash: [],
        parent: null,
        project_id: projectId,
        entries: { id: rootEntriesTableId, size: 1n },
        entry_count: 1n,
        created_at_ms: 1n,
      }).toBytes(),
    );
    objects.set(
      `${rootEntriesTableId}:${toHex(nameBcs)}`,
      DirEntry.serialize({ is_directory: false, object_id: fileId }).toBytes(),
    );
    objects.set(
      fileId,
      File.serialize({
        id: fileId,
        directory_id: rootDirectoryId,
        project_id: projectId,
        name_hash: Array.from(nameHash),
        mime_type: Array.from(new TextEncoder().encode("application/json")),
        current_version: 1n,
        version_count: 1n,
        versions: { id: versionsTableId, size: 1n },
        seal_id_prefix: Array.from(new Uint8Array(32)),
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );
    objects.set(
      `${versionsTableId}:${toHex(versionKeyBcs)}`,
      VersionInfo.serialize({
        version: 1n,
        content_blob_id: Array.from(
          new TextEncoder().encode("legacy-conversation-blob"),
        ),
        content_hash: Array.from(new Uint8Array(32).fill(1)),
        content_size: 12n,
        metadata_blob_id: Array.from(new TextEncoder().encode("meta-blob")),
        walrus_end_epoch: 100n,
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );

    const client = mockClient(objects) as never;
    const resolved = await resolveFileAtLogicalPath(client, {
      projectId,
      rootDirectoryId,
      logicalPath,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.fileId).toBe(fileId);
    expect(resolved?.parentDirectoryId).toBe(rootDirectoryId);
    expect(resolved?.contentBlobId).toBe("legacy-conversation-blob");
  });

  test("resolveFileAtLogicalPath returns null when path is missing", async () => {
    const projectId = addr(0x11);
    const rootDirectoryId = addr(0x22);
    const entriesTableId = addr(0x33);

    const objects = new Map<string, Uint8Array>();
    objects.set(
      rootDirectoryId,
      Directory.serialize({
        id: rootDirectoryId,
        name_hash: [],
        parent: null,
        project_id: projectId,
        entries: { id: entriesTableId, size: 0n },
        entry_count: 0n,
        created_at_ms: 1n,
      }).toBytes(),
    );

    const resolved = await resolveFileAtLogicalPath(mockClient(objects) as never, {
      projectId,
      rootDirectoryId,
      logicalPath: "registry.json",
    });
    expect(resolved).toBeNull();
  });

  test("resolveCurrentVersionBlobs follows File.current_version", async () => {
    const fileId = addr(0x44);
    const versionsTableId = addr(0x55);
    const objects = new Map<string, Uint8Array>();
    objects.set(
      fileId,
      File.serialize({
        id: fileId,
        directory_id: addr(0x22),
        project_id: addr(0x11),
        name_hash: Array.from(new Uint8Array(32)),
        mime_type: Array.from(new TextEncoder().encode("application/json")),
        current_version: 2n,
        version_count: 2n,
        versions: { id: versionsTableId, size: 2n },
        seal_id_prefix: Array.from(new Uint8Array(32)),
        created_at_ms: 1n,
        created_by: addr(0x66),
      }).toBytes(),
    );
    objects.set(
      `${versionsTableId}:${toHex(bcs.u64().serialize(2).toBytes())}`,
      VersionInfo.serialize({
        version: 2n,
        content_blob_id: Array.from(new TextEncoder().encode("manifest-v2")),
        content_hash: Array.from(new Uint8Array(32).fill(2)),
        content_size: 20n,
        metadata_blob_id: Array.from(new TextEncoder().encode("meta-v2")),
        walrus_end_epoch: 100n,
        created_at_ms: 2n,
        created_by: addr(0x66),
      }).toBytes(),
    );

    const { resolveCurrentVersionBlobs } = await import("./on-chain-path");
    const resolved = await resolveCurrentVersionBlobs(
      mockClient(objects) as never,
      fileId,
    );
    expect(resolved?.contentBlobId).toBe("manifest-v2");
    expect(resolved?.currentVersion).toBe(2);
  });
});
