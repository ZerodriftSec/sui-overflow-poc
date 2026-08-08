import { describe, expect, test } from "bun:test";
import type { Transaction } from "@mysten/sui/transactions";
import {
  createDeferredWalrusStorageContext,
  flushDeferredWalrusWrites,
  hasDeferredWalrusWrites,
  writeBytesAtPath,
  writeTextsAtLogicalPaths,
  type WalrusStorageContext,
} from "./walrus-storage";
import type { VaultContext } from "../vault";

function mockVault(): VaultContext {
  const projectId = "0x" + "11".repeat(32);
  const registryId = "0x" + "22".repeat(32);
  const rootId = "0x" + "33".repeat(32);
  const adminCapId = "0x" + "44".repeat(32);
  return {
    projectId,
    vaultId: projectId,
    accessRegistryId: registryId,
    capId: registryId,
    rootDirectoryId: rootId,
    adminCapId,
    ownerAddress: "0x" + "55".repeat(32),
    title: "Studio Workspace",
    pathIndexBlobId: null,
    registryBlobId: null,
  };
}

describe("deferred walrus writes", () => {
  test("batches multiple path writes into a single signAndExecute", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    const signed: Transaction[] = [];

    const base: WalrusStorageContext = {
      vault: mockVault(),
      sealClient: {
        encrypt: async ({ data }: { data: Uint8Array }) => ({
          encryptedObject: data,
        }),
      } as never,
      sessionKey: {} as never,
      suiClient: {
        core: {
          getObject: async () => {
            throw new Error("Object not found");
          },
          getDynamicField: async () => {
            throw new Error("Dynamic field not found");
          },
        },
      } as never,
      signAndExecute: async (tx) => {
        signed.push(tx);
        return { createdFileIds: ["0x" + "66".repeat(32), "0x" + "77".repeat(32)] };
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          newlyCreated: {
            blobObject: {
              blobId: `blob-${crypto.randomUUID()}`,
              id: "0xblob",
              storage: { endEpoch: 1000 },
            },
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      const deferred = createDeferredWalrusStorageContext(base);
      await writeBytesAtPath(deferred, "a/one.txt", new TextEncoder().encode("one"));
      await writeBytesAtPath(deferred, "a/two.txt", new TextEncoder().encode("two"));
      expect(hasDeferredWalrusWrites(deferred)).toBe(true);
      expect(signed.length).toBe(0);

      await flushDeferredWalrusWrites(deferred);
      expect(signed.length).toBe(1);
      expect(hasDeferredWalrusWrites(deferred)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("writeTextsAtLogicalPaths batches unrelated paths into a single signAndExecute", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    const signed: Transaction[] = [];

    const ctx: WalrusStorageContext = {
      vault: mockVault(),
      sealClient: {
        encrypt: async ({ data }: { data: Uint8Array }) => ({
          encryptedObject: data,
        }),
      } as never,
      sessionKey: {} as never,
      suiClient: {
        core: {
          getObject: async () => {
            throw new Error("Object not found");
          },
          getDynamicField: async () => {
            throw new Error("Dynamic field not found");
          },
        },
      } as never,
      signAndExecute: async (tx) => {
        signed.push(tx);
        return { createdFileIds: ["0x" + "88".repeat(32), "0x" + "99".repeat(32)] };
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          newlyCreated: {
            blobObject: {
              blobId: `blob-${crypto.randomUUID()}`,
              id: "0xblob",
              storage: { endEpoch: 1000 },
            },
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      // Simulates creating a project: an unrelated manifest path and a
      // top-level registry path written together instead of two round trips.
      const refs = await writeTextsAtLogicalPaths(ctx, [
        { logicalPath: "project/p1/manifest.json", text: "manifest" },
        { logicalPath: "registry.json", text: "registry" },
      ]);

      expect(signed.length).toBe(1);
      expect(refs.length).toBe(2);
      expect(refs[0]?.blobId).toBeTruthy();
      expect(refs[1]?.blobId).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps deferred writes queued when on-chain flush fails", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    const base: WalrusStorageContext = {
      vault: mockVault(),
      sealClient: {
        encrypt: async ({ data }: { data: Uint8Array }) => ({
          encryptedObject: data,
        }),
      } as never,
      sessionKey: {} as never,
      suiClient: {
        core: {
          getObject: async () => {
            throw new Error("Object not found");
          },
          getDynamicField: async () => {
            throw new Error("Dynamic field not found");
          },
        },
      } as never,
      signAndExecute: async () => {
        throw new Error("InsufficientCoinBalance");
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          newlyCreated: {
            blobObject: {
              blobId: `blob-${crypto.randomUUID()}`,
              id: "0xblob",
              storage: { endEpoch: 1000 },
            },
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      const deferred = createDeferredWalrusStorageContext(base);
      await writeBytesAtPath(deferred, "a/one.txt", new TextEncoder().encode("one"));
      expect(hasDeferredWalrusWrites(deferred)).toBe(true);

      await expect(flushDeferredWalrusWrites(deferred)).rejects.toThrow(
        "Not enough SUI",
      );
      expect(hasDeferredWalrusWrites(deferred)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
