/**
 * Local store for private-stream secrets (values + Poseidon blindings).
 *
 * The chain only ever sees commitments; whoever holds these secrets can prove
 * drips/claims. Until Seal key-sharing ships, secrets live in the creating
 * wallet's localStorage — meaning only that wallet can act on the stream.
 */
import type { SuiClient } from "@mysten/sui/client";

export type PrivateStreamSecret = {
  streamId: string;
  coinType: string;
  totalBase: string;
  milestones: number;
  freelancer: string;
  remainingBase: string;
  rRemaining: string;
  earnedBase: string;
  rEarned: string;
  createdAt: number;
};

const keyFor = (addr: string) => `streamline:conf:${addr}`;

export function loadSecrets(addr: string): PrivateStreamSecret[] {
  try {
    return JSON.parse(localStorage.getItem(keyFor(addr)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveSecrets(addr: string, secrets: PrivateStreamSecret[]) {
  localStorage.setItem(keyFor(addr), JSON.stringify(secrets));
}

export function addSecret(addr: string, secret: PrivateStreamSecret) {
  saveSecrets(addr, [secret, ...loadSecrets(addr)]);
}

export function updateSecret(
  addr: string,
  streamId: string,
  patch: Partial<PrivateStreamSecret>
): PrivateStreamSecret[] {
  const next = loadSecrets(addr).map((s) =>
    s.streamId === streamId ? { ...s, ...patch } : s
  );
  saveSecrets(addr, next);
  return next;
}

/** Resolve the ConfidentialStream object id created by a transaction. */
export async function findCreatedConfidentialStream(
  client: SuiClient,
  digest: string
): Promise<string | null> {
  try {
    await client.waitForTransaction({ digest });
    const tb = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const created = tb.objectChanges?.find(
      (c) =>
        c.type === "created" &&
        "objectType" in c &&
        typeof c.objectType === "string" &&
        c.objectType.includes("::stream::ConfidentialStream")
    );
    return created && "objectId" in created ? created.objectId : null;
  } catch {
    return null;
  }
}
