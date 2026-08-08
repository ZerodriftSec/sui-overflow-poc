import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";

import type { NetworkName } from "./config.js";

export type ExecuteResult = {
  digest: string;
  /** Present when the executor returned object changes (keypair path). */
  objectChanges?: ReadonlyArray<{
    type: string;
    objectType?: string;
    objectId?: string;
  }>;
};

export type StreamLineSigner = {
  address: string;
  signAndExecute: (tx: Transaction) => Promise<ExecuteResult>;
};

/** Sign and execute with an Ed25519 keypair (agents / scripts). */
export function createKeypairSigner(opts: {
  keypair: Ed25519Keypair;
  client: SuiClient;
}): StreamLineSigner {
  const address = opts.keypair.toSuiAddress();
  return {
    address,
    async signAndExecute(tx) {
      tx.setSenderIfNotSet(address);
      const result = await opts.client.signAndExecuteTransaction({
        signer: opts.keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });
      await opts.client.waitForTransaction({ digest: result.digest });
      return {
        digest: result.digest,
        objectChanges: result.objectChanges as ExecuteResult["objectChanges"],
      };
    },
  };
}

export type SponsorSignerOptions = {
  keypair: Ed25519Keypair;
  client: SuiClient;
  network: NetworkName;
  /**
   * Base URL of the StreamLine app sponsor proxy, e.g.
   * `https://app.example.com/api/sponsor` (POST) and
   * `…/api/sponsor/execute` derived by appending `/execute`.
   */
  sponsorUrl: string;
};

/**
 * Gasless path via the app's Enoki sponsor HTTP proxy.
 * Never embeds Enoki private keys — only calls your server.
 */
export function createSponsoredKeypairSigner(
  opts: SponsorSignerOptions
): StreamLineSigner {
  const address = opts.keypair.toSuiAddress();
  const sponsorUrl = opts.sponsorUrl.replace(/\/$/, "");
  const executeUrl = sponsorUrl.endsWith("/execute")
    ? sponsorUrl
    : `${sponsorUrl}/execute`;
  const createUrl = sponsorUrl.endsWith("/execute")
    ? sponsorUrl.replace(/\/execute$/, "")
    : sponsorUrl;

  return {
    address,
    async signAndExecute(tx) {
      tx.setSenderIfNotSet(address);
      const kindBytes = await tx.build({
        client: opts.client,
        onlyTransactionKind: true,
      });

      const sponsorRes = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: opts.network,
          sender: address,
          transactionKindBytes: toBase64(kindBytes),
        }),
      });
      if (!sponsorRes.ok) {
        throw new Error(await sponsorError(sponsorRes));
      }
      const { bytes, digest } = (await sponsorRes.json()) as {
        bytes: string;
        digest: string;
      };

      const signed = await opts.keypair.signTransaction(fromBase64(bytes));

      const execRes = await fetch(executeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest, signature: signed.signature }),
      });
      if (!execRes.ok) {
        throw new Error(await sponsorError(execRes));
      }
      const out = (await execRes.json()) as { digest: string };
      await opts.client.waitForTransaction({ digest: out.digest });

      // Fetch effects so callers can parse the created Stream id.
      const got = await opts.client.getTransactionBlock({
        digest: out.digest,
        options: { showObjectChanges: true },
      });
      return {
        digest: out.digest,
        objectChanges: got.objectChanges as ExecuteResult["objectChanges"],
      };
    },
  };
}

async function sponsorError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as {
      detail?: { errors?: Array<{ message?: string }> };
      error?: string;
    };
    const detail =
      j?.detail?.errors?.[0]?.message ?? j?.error ?? `HTTP ${res.status}`;
    return `Sponsorship failed: ${detail}`;
  } catch {
    return `Sponsorship failed (HTTP ${res.status})`;
  }
}
