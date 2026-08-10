/**
 * Shared helpers for the v2 scripts.
 *
 * `loadKeypair` and `sharedObjectMut` are intentionally duplicated from
 * `test-utils.ts` so this module has no transitive dependencies on the
 * e2e / seed scripts and can be imported by the upgrade script, which
 * runs with a different signer (a `SECRET_KEY` env var) than the others.
 */

import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient } from "@mysten/sui/client";

export async function executeTransaction(
  client: SuiClient,
  tx: Transaction,
  signer: Ed25519Keypair,
): Promise<unknown> {
  return client.signAndExecuteTransaction({
    transaction: tx,
    signer,
  });
}
