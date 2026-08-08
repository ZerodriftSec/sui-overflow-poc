/**
 * Seal-encrypt Pro roster workers to the org wallet (at-rest privacy).
 * Reuses stream::seal_approve — identity = org address bytes.
 */

import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, fromHex, toBase64 } from "@mysten/sui/utils";
import type { SessionKey } from "@mysten/seal";

import type { ProWorker, WorkersSealed } from "@/components/app/pro/types";
import { getSealClient } from "@/lib/seal";

export type { WorkersSealed };

const THRESHOLD = 1;

const idForAddress = (address: string) => address.replace(/^0x/, "");

/** Encrypt the full worker roster to the org wallet identity. */
export async function encryptWorkers(args: {
  suiClient: SuiClient;
  sealNamespace: string;
  orgAddress: string;
  workers: ProWorker[];
}): Promise<WorkersSealed> {
  const client = getSealClient(args.suiClient);
  const data = new TextEncoder().encode(JSON.stringify(args.workers));
  const { encryptedObject } = await client.encrypt({
    threshold: THRESHOLD,
    packageId: args.sealNamespace,
    id: idForAddress(args.orgAddress),
    data,
  });
  return {
    v: 1,
    ciphertextB64: toBase64(encryptedObject),
    sealNamespace: args.sealNamespace,
  };
}

/** Decrypt a sealed roster with an org session key + seal_approve. */
export async function decryptWorkers(args: {
  suiClient: SuiClient;
  /** Latest package (where seal_approve lives). */
  packageId: string;
  sessionKey: SessionKey;
  orgAddress: string;
  sealed: WorkersSealed;
}): Promise<ProWorker[]> {
  const client = getSealClient(args.suiClient);
  const ciphertext = fromBase64(args.sealed.ciphertextB64);

  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::stream::seal_approve`,
    arguments: [tx.pure.vector("u8", fromHex(idForAddress(args.orgAddress)))],
  });
  const txBytes = await tx.build({
    client: args.suiClient,
    onlyTransactionKind: true,
  });

  const plaintext = await client.decrypt({
    data: ciphertext,
    sessionKey: args.sessionKey,
    txBytes,
  });
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as ProWorker[];
  if (!Array.isArray(parsed)) throw new Error("Invalid sealed roster payload");
  return parsed;
}
