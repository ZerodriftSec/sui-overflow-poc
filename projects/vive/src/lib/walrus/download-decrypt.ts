import { EncryptedObject, NoAccessError, type SealClient, type SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { sealApprove } from "../../contracts/content_vault/seal_policy";
import { vaultPackageOptions } from "../vault-package";
import { mapPool } from "../storage/sui-rpc-batch";
import {
  SEAL_THRESHOLD,
  type WalrusService,
} from "./constants";
import { fetchWalrusBlobBytes } from "./provider-service";

/** Max concurrent Walrus blob downloads when batch-fetching many blobs at once. */
const BATCH_DOWNLOAD_CONCURRENCY = 6;

/**
 * Max ids verified per `fetchKeys` round in {@link batchDownloadAndDecryptText}.
 *
 * Seal's key verification (`BonehFranklinBLS12381Services.verifyUserSecretKey`)
 * runs entirely synchronously — it's BLS12-381 pairing math with no internal
 * `await` — and processes every id in the batch back-to-back before yielding.
 * A single `fetchKeys` call covering dozens of ids (e.g. every file in an
 * asset folder) can therefore block the main thread for a second or more,
 * freezing the UI while the sidebar loads. Chunking bounds how much pairing
 * work happens per macrotask; {@link yieldToMainThread} between chunks lets
 * the browser paint and handle input in between.
 */
const DECRYPT_VERIFY_CHUNK_SIZE = 8;

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Yield to the browser so pending renders/input are processed before more synchronous crypto work. */
function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function fetchEncryptedBlob(input: {
  blobId: string;
  service?: WalrusService;
}): Promise<Uint8Array> {
  return fetchWalrusBlobBytes({
    blobId: input.blobId,
    service: input.service,
  });
}

export function buildSealApproveTxBytes(
  suiClient: SealCompatibleClient,
  ownerAddress: string,
  accessRegistryId: string,
  idHex: string,
): Promise<Uint8Array> {
  const idBytes = fromHex(idHex.startsWith("0x") ? idHex : `0x${idHex}`);
  const tx = new Transaction();
  tx.setSender(ownerAddress);
  tx.add(
    sealApprove({
      ...vaultPackageOptions(),
      arguments: {
        id: Array.from(idBytes),
        registry: accessRegistryId,
      },
    }),
  );
  return tx.build({ client: suiClient, onlyTransactionKind: true });
}

/** Builds one PTB approving every id at once — used to batch a single `fetchKeys` call. */
export function buildSealApproveTxBytesForIds(
  suiClient: SealCompatibleClient,
  ownerAddress: string,
  accessRegistryId: string,
  idHexes: readonly string[],
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(ownerAddress);
  for (const idHex of idHexes) {
    const idBytes = fromHex(idHex.startsWith("0x") ? idHex : `0x${idHex}`);
    tx.add(
      sealApprove({
        ...vaultPackageOptions(),
        arguments: {
          id: Array.from(idBytes),
          registry: accessRegistryId,
        },
      }),
    );
  }
  return tx.build({ client: suiClient, onlyTransactionKind: true });
}

export async function decryptBytes(input: {
  ciphertext: Uint8Array;
  sessionKey: SessionKey;
  sealClient: SealClient;
  suiClient: SealCompatibleClient;
  projectId: string;
  accessRegistryId: string;
}): Promise<Uint8Array> {
  const parsed = EncryptedObject.parse(input.ciphertext);
  const txBytes = await buildSealApproveTxBytes(
    input.suiClient,
    input.sessionKey.getAddress(),
    input.accessRegistryId,
    parsed.id,
  );

  const plaintext = await input.sealClient.decrypt({
    data: input.ciphertext,
    sessionKey: input.sessionKey,
    txBytes,
  });

  void input.projectId;
  return new Uint8Array(plaintext);
}

export async function downloadAndDecryptBytes(input: {
  blobId: string;
  sessionKey: SessionKey;
  sealClient: SealClient;
  suiClient: SealCompatibleClient;
  projectId?: string;
  accessRegistryId?: string;
  /** @deprecated Prefer projectId. */
  vaultId?: string;
  /** @deprecated Prefer accessRegistryId. */
  capId?: string;
  service?: WalrusService;
}): Promise<Uint8Array> {
  const projectId = input.projectId ?? input.vaultId;
  const accessRegistryId = input.accessRegistryId ?? input.capId;
  if (!projectId || !accessRegistryId) {
    throw new Error("projectId and accessRegistryId are required for decryption.");
  }

  const ciphertext = await fetchEncryptedBlob({
    blobId: input.blobId,
    service: input.service,
  });

  try {
    return await decryptBytes({
      ciphertext,
      sessionKey: input.sessionKey,
      sealClient: input.sealClient,
      suiClient: input.suiClient,
      projectId,
      accessRegistryId,
    });
  } catch (error) {
    if (error instanceof NoAccessError) {
      throw new Error("No access to decryption keys for this project.");
    }
    throw error;
  }
}

export async function downloadAndDecryptText(input: {
  blobId: string;
  sessionKey: SessionKey;
  sealClient: SealClient;
  suiClient: SealCompatibleClient;
  projectId?: string;
  accessRegistryId?: string;
  vaultId?: string;
  capId?: string;
  service?: WalrusService;
}): Promise<string> {
  const bytes = await downloadAndDecryptBytes(input);
  return new TextDecoder().decode(bytes);
}

/**
 * Download + decrypt many Walrus blobs while issuing a single `fetchKeys`
 * call for all of them, instead of one `fetchKeys` round trip per blob.
 *
 * Per the Seal SDK: "It is recommended to call [fetchKeys] once for all ids
 * of all encrypted objects if there are multiple, then call decrypt for each
 * object." Downloads happen in parallel; on success or failure each blobId
 * maps to its decrypted text (or `null` if the blob couldn't be fetched,
 * parsed, or decrypted).
 */
export async function batchDownloadAndDecryptText(input: {
  blobIds: readonly string[];
  sessionKey: SessionKey;
  sealClient: SealClient;
  suiClient: SealCompatibleClient;
  projectId: string;
  accessRegistryId: string;
  service?: WalrusService;
}): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const uniqueBlobIds = [...new Set(input.blobIds)];
  if (uniqueBlobIds.length === 0) return results;

  const ciphertextByBlobId = new Map<string, Uint8Array>();
  await mapPool(uniqueBlobIds, BATCH_DOWNLOAD_CONCURRENCY, async (blobId) => {
    try {
      ciphertextByBlobId.set(
        blobId,
        await fetchEncryptedBlob({ blobId, service: input.service }),
      );
    } catch {
      results.set(blobId, null);
    }
  });

  const idHexByBlobId = new Map<string, string>();
  for (const [blobId, ciphertext] of ciphertextByBlobId) {
    try {
      idHexByBlobId.set(blobId, EncryptedObject.parse(ciphertext).id);
    } catch {
      results.set(blobId, null);
    }
  }
  if (idHexByBlobId.size === 0) return results;

  // Chunk the (blobId, idHex) pairs so each `fetchKeys` round only verifies
  // keys for a handful of ids at a time — see DECRYPT_VERIFY_CHUNK_SIZE.
  const entryChunks = chunkArray([...idHexByBlobId.entries()], DECRYPT_VERIFY_CHUNK_SIZE);

  for (const entryChunk of entryChunks) {
    const blobIdChunk = entryChunk.map(([blobId]) => blobId);
    const idHexesForChunk = [
      ...new Set(entryChunk.map(([, idHex]) => idHex)),
    ];
    const txBytes = await buildSealApproveTxBytesForIds(
      input.suiClient,
      input.sessionKey.getAddress(),
      input.accessRegistryId,
      idHexesForChunk,
    );

    try {
      // One key-server round trip for every id in this chunk. Individual
      // `decrypt()` calls below will hit the resulting cache instead of each
      // triggering their own `fetchKeys` request.
      await input.sealClient.fetchKeys({
        ids: idHexesForChunk,
        txBytes,
        sessionKey: input.sessionKey,
        threshold: SEAL_THRESHOLD,
      });
    } catch {
      // Swallow — per-blob decrypt below retries key fetching individually
      // (via SealClient.decrypt's internal fetchKeys) and records failures.
    }

    for (const blobId of blobIdChunk) {
      const ciphertext = ciphertextByBlobId.get(blobId);
      if (!ciphertext) continue;
      try {
        const plaintext = await input.sealClient.decrypt({
          data: ciphertext,
          sessionKey: input.sessionKey,
          txBytes,
        });
        results.set(blobId, new TextDecoder().decode(plaintext));
      } catch {
        results.set(blobId, null);
      }
    }

    // Let the browser paint/handle input between chunks instead of running
    // every chunk's pairing math back-to-back in one long task.
    await yieldToMainThread();
  }

  return results;
}
