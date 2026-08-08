/**
 * Shared helpers for the v2 scripts (`e2e-payment-cycle.ts`,
 * `seed-demo-platform.ts`).
 *
 * `loadKeypair` and `newTx` are reproduced here from the e2e script so the
 * seed script can stay focused on its own logic. The e2e script keeps its
 * own copy to avoid coupling — the two scripts are independently runnable
 * and we want each one to keep working if this helper file is broken.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Inputs, Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

export function loadKeypair(): Ed25519Keypair {
  let first = "";
  if (process.env.E2E_PRIVATE_KEY) {
    first = process.env.E2E_PRIVATE_KEY;
  } else {
    const keystorePath = join(homedir(), ".sui", "sui_config", "sui.keystore");
    if (existsSync(keystorePath)) {
      try {
        const raw = readFileSync(keystorePath, "utf8").trim();
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
          first = parsed[0];
        }
      } catch (e) {
        // Fallback below
      }
    }
  }

  if (!first) {
    return Ed25519Keypair.generate();
  }

  try {
    if (first.startsWith("suiprivkey")) {
      const parsedKey = decodeSuiPrivateKey(first);
      return Ed25519Keypair.fromSecretKey(parsedKey.secretKey);
    }
    const raw_bytes = new Uint8Array(Buffer.from(first, "base64"));
    if (raw_bytes.length === 33) {
      return Ed25519Keypair.fromSecretKey(raw_bytes.slice(1));
    } else if (raw_bytes.length === 32) {
      return Ed25519Keypair.fromSecretKey(raw_bytes);
    }
  } catch (e) {
    // Fallback on parse failure
  }

  return Ed25519Keypair.generate();
}

export function newTx(keypair: Ed25519Keypair): Transaction {
  const tx = new Transaction();
  tx.setSender(keypair.toSuiAddress());
  tx.setGasBudget(50_000_000);
  tx.setGasOwner(keypair.toSuiAddress());
  return tx;
}

export function sharedObjectMut(id: string, initialVersion: number) {
  // Wraps an Inputs.SharedObjectRef in a tx.object() call so the
  // returned value is a TransactionArgument (not a CallArg). Per the
  // SDK docs: `tx.object(Inputs.SharedObjectRef({...}))`.
  return (tx: Transaction) =>
    tx.object(
      Inputs.SharedObjectRef({
        objectId: id,
        mutable: true,
        initialSharedVersion: initialVersion,
      }),
    );
}
