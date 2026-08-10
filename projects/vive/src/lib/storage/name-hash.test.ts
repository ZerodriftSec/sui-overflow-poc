import { describe, expect, test } from "bun:test";
import { fromHex, toHex } from "@mysten/sui/utils";
import {
  buildSealIdentity,
  computeNameHash,
  contentHash,
} from "./name-hash";
import {
  createEmptyPathCache,
  normalizeLogicalPath,
  parentLogicalPath,
  splitLogicalPath,
  upsertPathCacheEntry,
} from "./path-cache";

describe("name-hash", () => {
  test("computeNameHash is project-scoped and stable", () => {
    const projectA = "0x" + "11".repeat(32);
    const projectB = "0x" + "22".repeat(32);
    const a1 = computeNameHash(projectA, "readme.md");
    const a2 = computeNameHash(projectA, "readme.md");
    const b1 = computeNameHash(projectB, "readme.md");

    expect(toHex(a1)).toBe(toHex(a2));
    expect(toHex(a1)).not.toBe(toHex(b1));
    expect(a1.byteLength).toBe(32);
  });

  test("buildSealIdentity prefixes project id bytes", () => {
    const projectId = "0x" + "ab".repeat(32);
    const { idBytes, idHex } = buildSealIdentity({ projectId });
    const projectBytes = fromHex(projectId);
    expect(idBytes.slice(0, 32)).toEqual(projectBytes);
    expect(fromHex(idHex)).toEqual(idBytes);
    expect(idBytes.byteLength).toBeGreaterThan(32);
  });

  test("contentHash returns 32 bytes", () => {
    const hash = contentHash(new TextEncoder().encode("hello"));
    expect(hash.length).toBe(32);
  });
});

describe("path-cache", () => {
  test("normalizes and splits logical paths", () => {
    expect(normalizeLogicalPath("/a/b/c/")).toBe("a/b/c");
    expect(splitLogicalPath("/a/b/c/")).toEqual(["a", "b", "c"]);
    expect(parentLogicalPath("a/b/c")).toBe("a/b");
    expect(parentLogicalPath("a")).toBeNull();
  });

  test("upsertPathCacheEntry stores file metadata", () => {
    const cache = createEmptyPathCache("0xabc");
    const updated = upsertPathCacheEntry(cache, "project/1/manifest.json", {
      kind: "file",
      objectId: "0xfile",
      parentDirectoryId: "0xroot",
      nameHashHex: "deadbeef",
      contentBlobId: "blob1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(updated.entries["project/1/manifest.json"]?.contentBlobId).toBe("blob1");
  });
});
