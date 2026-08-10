"use client";

import { useCallback, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";

import { PACKAGE_IDS, type NetworkName } from "./constants";

/**
 * Gasless execution via Enoki sponsorship.
 *
 * Flow: build the transaction *kind* → ask our `/api/sponsor` proxy (which holds
 * the secret Enoki key) to wrap it with sponsor gas → sign the sponsored bytes
 * with the connected wallet → submit through `/api/sponsor/execute`. If no
 * sponsor key is configured, we fall back to a normal wallet-paid transaction so
 * the app keeps working in local/dev.
 */

type Handlers = {
  onSuccess?: (result: { digest: string }) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
};

type ExecuteOpts = {
  /** Extra addresses this tx sends objects to (e.g. a transfer recipient), so
   *  the Enoki sponsor allow-lists them. Sender is always allowed. */
  allowedRecipients?: string[];
};

/** Whether the server has an Enoki sponsor key configured (cached). */
export function useSponsorshipEnabled() {
  return useQuery({
    queryKey: ["sponsorship-enabled"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/sponsor");
        if (!res.ok) return false;
        const json = (await res.json()) as { enabled?: boolean };
        return json.enabled === true;
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useGaslessExecute() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { network } = useSuiClientContext();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(
    async (tx: Transaction, handlers: Handlers = {}, opts: ExecuteOpts = {}) => {
      if (!account) {
        handlers.onError?.(new Error("No wallet connected"));
        handlers.onSettled?.();
        return;
      }
      setIsPending(true);

      try {
        // Decide the path up front so we never half-build a tx and then fall
        // back (which would consume/re-resolve coin inputs twice).
        let sponsored = false;
        try {
          const probe = await fetch("/api/sponsor");
          sponsored =
            probe.ok && ((await probe.json()) as { enabled?: boolean }).enabled === true;
        } catch {
          sponsored = false;
        }

        if (sponsored) {
          const digest = await runSponsored(
            tx,
            account.address,
            network as NetworkName,
            client,
            signTransaction,
            opts.allowedRecipients
          );
          handlers.onSuccess?.({ digest });
        } else {
          const res = await signAndExecute({ transaction: tx });
          handlers.onSuccess?.({ digest: res.digest });
        }
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsPending(false);
        handlers.onSettled?.();
      }
    },
    [account, client, network, signTransaction, signAndExecute]
  );

  return { execute, isPending };
}

async function runSponsored(
  tx: Transaction,
  sender: string,
  network: NetworkName,
  client: ReturnType<typeof useSuiClient>,
  signTransaction: ReturnType<typeof useSignTransaction>["mutateAsync"],
  allowedRecipients?: string[]
): Promise<string> {
  tx.setSenderIfNotSet(sender);
  const kindBytes = await tx.build({ client, onlyTransactionKind: true });

  const sponsorRes = await fetch("/api/sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      network,
      sender,
      transactionKindBytes: toBase64(kindBytes),
      allowedRecipients,
      // Tell the server which package we targeted so its allow-list matches
      // ours (server-side env can otherwise resolve a stale package).
      packageId: PACKAGE_IDS[network],
    }),
  });
  if (!sponsorRes.ok) {
    throw new Error(await sponsorMessage(sponsorRes));
  }
  const { bytes, digest } = (await sponsorRes.json()) as {
    bytes: string;
    digest: string;
  };

  const { signature } = await signTransaction({
    transaction: Transaction.from(fromBase64(bytes)),
    chain: `sui:${network}`,
  });

  const execRes = await fetch("/api/sponsor/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ digest, signature }),
  });
  if (!execRes.ok) {
    throw new Error(await sponsorMessage(execRes));
  }
  const out = (await execRes.json()) as { digest: string };

  await client.waitForTransaction({ digest: out.digest });
  return out.digest;
}

async function sponsorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const detail =
      j?.detail?.errors?.[0]?.message ?? j?.error ?? `HTTP ${res.status}`;
    return `Sponsorship failed: ${detail}`;
  } catch {
    return `Sponsorship failed (HTTP ${res.status})`;
  }
}
