"use client";

/**
 * Privacy relayer client — hide tx origin for pool ops.
 *
 * Proof-only (spend / settle / withdraw): POST structured fields; relayer signs.
 * Deposit / open: two-step — user transfers USDC to relayer, then POST proof.
 */

import { useQuery } from "@tanstack/react-query";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import type { SuiClient } from "@mysten/sui/client";

import type { NetworkName } from "@/lib/constants";

export type RelayerKind =
  | "spend"
  | "withdraw"
  | "settle"
  | "deposit"
  | "open";

export type RelayerStatus = {
  enabled: boolean;
  address: string | null;
};

export function usePrivacyRelayer() {
  return useQuery({
    queryKey: ["privacy-relayer"],
    queryFn: async (): Promise<RelayerStatus> => {
      try {
        const res = await fetch("/api/relayer");
        if (!res.ok) return { enabled: false, address: null };
        return (await res.json()) as RelayerStatus;
      } catch {
        return { enabled: false, address: null };
      }
    },
    staleTime: 5 * 60_000,
  });
}

export type RelayPayload = {
  network: NetworkName;
  kind: RelayerKind;
  packageId: string;
  coinType: string;
  poolId: string;
  proof: Uint8Array;
  // spend / settle / withdraw
  root?: bigint;
  nf?: bigint;
  cm1?: bigint;
  cm2?: bigint;
  cipher1?: Uint8Array;
  // withdraw
  amount?: bigint;
  cmChange?: bigint;
  recipient?: string;
  // settle
  engagementId?: string;
  paramsCommitment?: bigint;
  nowSec?: bigint;
  workerCiphertext?: Uint8Array;
  // deposit / open
  cm?: bigint;
  amountBase?: bigint;
  ciphertext?: Uint8Array;
};

function b64(u?: Uint8Array): string | undefined {
  return u && u.length ? toBase64(u) : undefined;
}

/** Submit a proof-gated (or funded) op through the privacy relayer. */
export async function relaySubmit(
  payload: RelayPayload
): Promise<{ digest: string; sender: string }> {
  const body = {
    network: payload.network,
    kind: payload.kind,
    packageId: payload.packageId,
    coinType: payload.coinType,
    poolId: payload.poolId,
    proofB64: toBase64(payload.proof),
    root: payload.root?.toString(),
    nf: payload.nf?.toString(),
    cm1: payload.cm1?.toString(),
    cm2: payload.cm2?.toString(),
    cipher1B64: b64(payload.cipher1),
    amount: payload.amount?.toString(),
    cmChange: payload.cmChange?.toString(),
    recipient: payload.recipient,
    engagementId: payload.engagementId,
    paramsCommitment: payload.paramsCommitment?.toString(),
    nowSec: payload.nowSec?.toString(),
    workerCipherB64: b64(payload.workerCiphertext),
    cm: payload.cm?.toString(),
    amountBase: payload.amountBase?.toString(),
    ciphertextB64: b64(payload.ciphertext),
  };

  const res = await fetch("/api/relayer/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    digest?: string;
    sender?: string;
    error?: string;
  };
  if (!res.ok || !json.digest) {
    throw new Error(json.error || `relayer_http_${res.status}`);
  }
  return { digest: json.digest, sender: json.sender ?? "" };
}

/**
 * Build a user-signed transfer of USDC to the relayer (step 1 of relayed deposit).
 */
export function buildFundRelayerTx(a: {
  sender: string;
  relayerAddress: string;
  coinType: string;
  amountBase: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSenderIfNotSet(a.sender);
  const coin = coinWithBalance({ type: a.coinType, balance: a.amountBase });
  tx.transferObjects([coin], tx.pure.address(a.relayerAddress));
  return tx;
}

/**
 * Wait until the relayer address holds at least `amountBase` of `coinType`
 * (after the user's fund transfer lands).
 */
export async function waitForRelayerBalance(
  client: SuiClient,
  relayerAddress: string,
  coinType: string,
  amountBase: bigint,
  opts?: { timeoutMs?: number; pollMs?: number }
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const pollMs = opts?.pollMs ?? 1_200;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const bal = await client.getBalance({
      owner: relayerAddress,
      coinType,
    });
    if (BigInt(bal.totalBalance) >= amountBase) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("relayer_fund_timeout");
}
