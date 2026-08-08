"use client";

import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";

import { USDC_BASE } from "@/lib/stream-math";

/** Decode a little-endian u64 (Move devInspect return) to a JS number of USDC. */
function u64ToUsdc(bytes: number[] | Uint8Array): number {
  let v = 0n;
  for (let i = 0; i < bytes.length; i++) v |= BigInt(bytes[i]) << BigInt(8 * i);
  return Number(v) / USDC_BASE;
}

/** Find the Treasury shared object created by an `open` tx. */
export async function findCreatedTreasury(
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
        c.objectType.includes("::treasury::Treasury")
    );
    return created && "objectId" in created ? created.objectId : null;
  } catch {
    return null;
  }
}

/**
 * Read a stream's funding source: the treasury id if it was funded from a
 * payroll pool (has the `payroll_treasury` dynamic field), else null for a
 * wallet-funded stream. Lets the payer's Delete route to the right refund path
 * — `cancel_to_treasury` (back to the pool) vs `cancel` (back to the wallet).
 */
export async function readStreamTreasuryId(
  client: SuiClient,
  a: { packageId: string; usdcType: string; streamId: string; sender: string }
): Promise<string | null> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.packageId}::stream::payroll_treasury_id`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.streamId)],
  });
  const res = await client.devInspectTransactionBlock({
    sender: a.sender,
    transactionBlock: tx,
  });
  // Option<ID> BCS: tag byte (0 = None, 1 = Some) then 32 id bytes.
  const bytes = res.results?.[0]?.returnValues?.[0]?.[0] ?? [];
  if (bytes[0] !== 1 || bytes.length < 33) return null;
  return (
    "0x" +
    Array.from(bytes.slice(1, 33))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Find the shared `Stream` object created by a create/hire tx. */
export async function findCreatedStream(
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
        c.objectType.includes("::stream::Stream<")
    );
    return created && "objectId" in created ? created.objectId : null;
  } catch {
    return null;
  }
}

export type TreasuryState = { idle: number; invested: number; reserve: number };

/** Read live idle + invested + reserve USDC via the treasury's view functions. */
export async function readTreasuryState(
  client: SuiClient,
  a: {
    packageId: string;
    usdcType: string;
    treasuryId: string;
    vaultId: string;
    sender: string;
  }
): Promise<TreasuryState> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.packageId}::treasury::idle_value`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId)],
  });
  tx.moveCall({
    target: `${a.packageId}::treasury::invested_value`,
    typeArguments: [a.usdcType],
    arguments: [
      tx.object(a.treasuryId),
      tx.object(a.vaultId),
      tx.pure.u64(BigInt(Date.now())),
    ],
  });
  tx.moveCall({
    target: `${a.packageId}::treasury::reserve_value`,
    typeArguments: [a.usdcType],
    arguments: [tx.object(a.treasuryId)],
  });
  const res = await client.devInspectTransactionBlock({
    sender: a.sender,
    transactionBlock: tx,
  });
  const idleBytes = res.results?.[0]?.returnValues?.[0]?.[0] ?? [];
  const investedBytes = res.results?.[1]?.returnValues?.[0]?.[0] ?? [];
  const reserveBytes = res.results?.[2]?.returnValues?.[0]?.[0] ?? [];
  return {
    idle: u64ToUsdc(idleBytes),
    invested: u64ToUsdc(investedBytes),
    reserve: u64ToUsdc(reserveBytes),
  };
}

export function useTreasuryState(
  client: SuiClient,
  a: {
    packageId: string;
    usdcType: string;
    treasuryId: string | undefined;
    vaultId: string;
    sender: string;
  }
) {
  return useQuery({
    queryKey: ["treasury", a.treasuryId, a.sender],
    queryFn: () =>
      readTreasuryState(client, {
        packageId: a.packageId,
        usdcType: a.usdcType,
        treasuryId: a.treasuryId!,
        vaultId: a.vaultId,
        sender: a.sender,
      }),
    enabled: !!(a.treasuryId && a.sender && a.packageId !== "0x0"),
    refetchInterval: 15_000,
  });
}
