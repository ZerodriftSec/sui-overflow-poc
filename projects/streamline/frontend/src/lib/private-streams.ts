/**
 * Chain reads for private (confidential) streams. These never touch the
 * indexer: confidential streams emit no amounts, so the dashboards read the
 * objects directly and decrypt the secrets locally (Seal / local cache).
 */
import type { SuiClient } from "@mysten/sui/client";

export type PrivateStreamOnChain = {
  id: string;
  sender: string;
  freelancer: string;
  coinType: string;
  /** Public in aggregate: the locked reserve still on the object. */
  reserve: bigint;
  /** 0 locked · 1 pending_review · 2 dripping · 3 paused · 4 done */
  state: number;
  nMilestones: number;
  currentMilestone: number;
  remainingCommitment: Uint8Array;
  earnedCommitment: Uint8Array;
  /** Seal envelope bytes (empty when the stream predates v3). */
  encryptedSecrets: Uint8Array;
  reviewDeadlineMs: number;
};

const SECRETS_FIELD = "seal_secrets";
const REVIEW_FIELD = "review_deadline_ms";

function bytesField(name: string) {
  return {
    type: "vector<u8>",
    value: Array.from(new TextEncoder().encode(name)),
  };
}

async function readDynamicField(
  client: SuiClient,
  parentId: string,
  name: string
): Promise<unknown | null> {
  try {
    const res = await client.getDynamicFieldObject({
      parentId,
      name: bytesField(name),
    });
    const content = res.data?.content;
    if (content?.dataType !== "moveObject") return null;
    return (content.fields as Record<string, unknown>)["value"] ?? null;
  } catch {
    return null;
  }
}

/** Extract `T` from `...::stream::ConfidentialStream<T>`. */
function typeParam(typeStr: string): string {
  const start = typeStr.indexOf("<");
  const end = typeStr.lastIndexOf(">");
  return start >= 0 && end > start ? typeStr.slice(start + 1, end).trim() : "";
}

/** vector<u8> fields come back as number[] (or base64 string on some nodes). */
function asBytes(v: unknown): Uint8Array {
  if (Array.isArray(v)) return new Uint8Array(v as number[]);
  if (typeof v === "string") {
    try {
      return Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
    } catch {
      return new Uint8Array();
    }
  }
  return new Uint8Array();
}

export async function fetchPrivateStream(
  client: SuiClient,
  streamId: string
): Promise<PrivateStreamOnChain | null> {
  const obj = await client.getObject({
    id: streamId,
    options: { showContent: true, showType: true },
  });
  const content = obj.data?.content;
  if (content?.dataType !== "moveObject") return null;
  const f = content.fields as Record<string, unknown>;

  const [secrets, review] = await Promise.all([
    readDynamicField(client, streamId, SECRETS_FIELD),
    readDynamicField(client, streamId, REVIEW_FIELD),
  ]);

  return {
    id: streamId,
    sender: String(f["sender"]),
    freelancer: String(f["freelancer"]),
    coinType: typeParam(obj.data?.type ?? ""),
    reserve: BigInt(String(f["reserve"] ?? "0")),
    state: Number(f["state"] ?? 0),
    nMilestones: Number(f["n_milestones"] ?? 0),
    currentMilestone: Number(f["current_milestone"] ?? 0),
    remainingCommitment: asBytes(f["remaining_commitment"]),
    earnedCommitment: asBytes(f["earned_commitment"]),
    encryptedSecrets: asBytes(secrets),
    reviewDeadlineMs: Number(review ?? 0),
  };
}

/**
 * Discover private streams involving `address` (as sender or freelancer) via
 * `ConfStreamCreated` events. `confPackageId` is the package version that
 * defined the event type (v2), which Sui pins event types to.
 */
export async function findPrivateStreamIds(
  client: SuiClient,
  confPackageId: string,
  address: string
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
  for (let page = 0; page < 10; page++) {
    const res = await client.queryEvents({
      query: {
        MoveEventType: `${confPackageId}::stream::ConfStreamCreated`,
      },
      cursor,
      limit: 50,
      order: "descending",
    });
    for (const ev of res.data) {
      const j = ev.parsedJson as {
        stream_id?: string;
        sender?: string;
        freelancer?: string;
      };
      if (j.stream_id && (j.sender === address || j.freelancer === address)) {
        ids.push(j.stream_id);
      }
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return [...new Set(ids)];
}
