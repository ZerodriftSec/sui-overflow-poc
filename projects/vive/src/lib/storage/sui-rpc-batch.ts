import { bcs as suiBcs } from "@mysten/sui/bcs";
import { toHex } from "@mysten/bcs";
import { blake2b } from "@noble/hashes/blake2.js";
import type { SealCompatibleClient } from "@mysten/seal";

/** Sui multi-get limit — stay under public RPC rate caps. */
export const GET_OBJECTS_CHUNK_SIZE = 50;

/** Max concurrent multi-get batches in flight. */
export const GET_OBJECTS_BATCH_CONCURRENCY = 2;

interface CoreGetObjectsResponse {
  objects: Array<
    | Error
    | {
        objectId?: string;
        id?: string;
        content?: Uint8Array | Promise<Uint8Array>;
      }
  >;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function isMissingObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("missing")
  );
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("too many requests") ||
    message.includes("429") ||
    message.includes("rate limit")
  );
}

/** Match `@mysten/sui` dynamic field object id derivation. */
export function deriveDynamicFieldId(
  parentId: string,
  typeTag: string,
  key: Uint8Array,
): string {
  const address = suiBcs.Address.serialize(parentId).toBytes();
  const tag = suiBcs.TypeTag.serialize(typeTag).toBytes();
  const keyLength = suiBcs.u64().serialize(key.length).toBytes();
  const hash = blake2b.create({ dkLen: 32 });
  hash.update(new Uint8Array([0xf0]));
  hash.update(address);
  hash.update(keyLength);
  hash.update(key);
  hash.update(tag);
  return `0x${toHex(hash.digest().slice(0, 32))}`;
}

/** Strip the `Field` wrapper (uid + name) and return the stored value bytes. */
export function skipDynamicFieldWrapper(
  content: Uint8Array,
  nameBcsLength: number,
): Uint8Array | null {
  const valueOffset = 32 + nameBcsLength;
  if (content.length <= valueOffset) return null;
  return content.slice(valueOffset);
}

export async function getObjectsContentBatched(
  client: SealCompatibleClient,
  objectIds: string[],
): Promise<Map<string, Uint8Array>> {
  const contents = new Map<string, Uint8Array>();
  if (objectIds.length === 0) return contents;

  const uniqueIds = [...new Set(objectIds)];
  const core = client.core as
    | {
        getObjects?: (input: {
          objectIds: string[];
          include?: { content?: boolean };
        }) => Promise<CoreGetObjectsResponse>;
        getObject?: (input: {
          objectId: string;
          include?: { content?: boolean };
        }) => Promise<{ object?: { content?: Uint8Array | Promise<Uint8Array> } }>;
      }
    | undefined;

  if (core?.getObjects) {
    const chunks = chunkArray(uniqueIds, GET_OBJECTS_CHUNK_SIZE);
    await mapPool(chunks, GET_OBJECTS_BATCH_CONCURRENCY, async (chunkIds) => {
      try {
        const response = await core.getObjects!({
          objectIds: chunkIds,
          include: { content: true },
        });
        for (let index = 0; index < response.objects.length; index += 1) {
          const entry = response.objects[index];
          if (entry instanceof Error) continue;
          const objectId = entry.objectId ?? entry.id ?? chunkIds[index];
          const content = entry.content;
          if (!content) continue;
          contents.set(
            objectId,
            content instanceof Uint8Array ? content : await content,
          );
        }
      } catch (error) {
        if (!isMissingObjectError(error)) throw error;
      }
    });
    return contents;
  }

  await mapPool(uniqueIds, GET_OBJECTS_BATCH_CONCURRENCY, async (objectId) => {
    if (!core?.getObject) return;
    try {
      const { object } = await core.getObject({
        objectId,
        include: { content: true },
      });
      const content = object?.content;
      if (!content) return;
      contents.set(
        objectId,
        content instanceof Uint8Array ? content : await content,
      );
    } catch (error) {
      if (!isMissingObjectError(error)) throw error;
    }
  });

  return contents;
}
