"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

import { useNetworkVariable } from "./networks";

/** Index fixed-point scale (mirrors yield_vault.move: 1.0 == 1e12). */
const SCALE = 1e12;
const YEAR_MS = 31_536_000_000;

export type YieldPosition = {
  receiptId: string;
  shares: number;
  /** Live underlying value (base units) at the current tick. */
  valueBase: number;
};

export type YieldVaultState = {
  vaultId: string;
  aprPct: number;
  /** Live value of all the signer's positions (base units). */
  totalValueBase: number;
  positions: YieldPosition[];
  isLoading: boolean;
  refetch: () => void;
};

/** Underlying-per-share index projected to `now` (mirrors project_index). */
function projectedIndex(
  index: number,
  aprBps: number,
  lastMs: number,
  now: number
): number {
  if (now <= lastMs) return index;
  const dt = now - lastMs;
  return index + (index * aprBps * dt) / (10_000 * YEAR_MS);
}

/**
 * Live view of the Scallop-shaped yield vault and the signer's deposits. Reads
 * vault state + owned VaultReceipt objects and ticks the value forward every
 * second using the same interest formula as the Move contract.
 */
export function useYieldVault(): YieldVaultState {
  const account = useCurrentAccount();
  const vaultId = useNetworkVariable("yieldVaultId");
  const usdcType = useNetworkVariable("usdcType");
  // VaultReceipt's type is pinned to the package that introduced it (v6), not
  // the latest — so the owned-object filter must use the defining package.
  const definingPkg = useNetworkVariable("yieldDefiningPackage");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const enabled = !!vaultId && vaultId !== "0x0";

  const vaultQ = useSuiClientQuery(
    "getObject",
    { id: vaultId, options: { showContent: true } },
    { enabled, refetchInterval: 15_000 }
  );

  const receiptType = `${definingPkg}::yield_vault::VaultReceipt<${usdcType}>`;
  const receiptsQ = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "",
      filter: { StructType: receiptType },
      options: { showContent: true },
    },
    { enabled: enabled && !!account, refetchInterval: 15_000 }
  );

  const fields =
    vaultQ.data?.data?.content?.dataType === "moveObject"
      ? (vaultQ.data.data.content.fields as Record<string, string>)
      : undefined;

  const aprBps = fields ? Number(fields["apr_bps"]) : 0;
  const index = fields ? Number(fields["index"]) : SCALE;
  const lastMs = fields ? Number(fields["last_ms"]) : now;
  const liveIndex = projectedIndex(index, aprBps, lastMs, now);

  const positions: YieldPosition[] = (receiptsQ.data?.data ?? [])
    .map((o) => {
      const c = o.data?.content;
      if (c?.dataType !== "moveObject") return null;
      const f = c.fields as Record<string, string>;
      const shares = Number(f["shares"] ?? 0);
      return {
        receiptId: o.data!.objectId,
        shares,
        valueBase: (shares * liveIndex) / SCALE,
      };
    })
    .filter((p): p is YieldPosition => p !== null && p.shares > 0);

  return {
    vaultId,
    aprPct: aprBps / 100,
    totalValueBase: positions.reduce((a, p) => a + p.valueBase, 0),
    positions,
    isLoading: vaultQ.isLoading || receiptsQ.isLoading,
    refetch: () => {
      vaultQ.refetch();
      receiptsQ.refetch();
    },
  };
}
