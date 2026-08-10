"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

import { useNetworkVariable } from "./networks";

const YEAR_MS = 31_536_000_000;
/** Present-value discount on a stream's remaining balance (mirrors PV_DISCOUNT_BPS). */
export const PV_DISCOUNT = 0.9;

/** Max borrowable base units: 90% of remaining, capped by pool liquidity. */
export function streamPresentValueBase(remainingBase: number): number {
  return Math.floor(remainingBase * PV_DISCOUNT);
}

export function maxBorrowableBase(
  remainingBase: number,
  poolReserveBase: number
): number {
  return Math.min(streamPresentValueBase(remainingBase), poolReserveBase);
}

/**
 * Demo / pitch: when the lending pool has no liquidity (or isn't deployed),
 * still allow borrowing up to 90% of stream remaining — UI + local pending loan.
 */
export function maxBorrowableBaseOrDemo(
  remainingBase: number,
  poolReserveBase: number
): { maxBase: number; demo: boolean } {
  const pv = streamPresentValueBase(remainingBase);
  if (pv <= 0) return { maxBase: 0, demo: false };
  const capped = Math.min(pv, Math.max(0, poolReserveBase));
  if (capped > 0) return { maxBase: capped, demo: false };
  return { maxBase: pv, demo: true };
}

export type Loan = {
  loanId: string;
  streamId: string;
  principalBase: number;
  /** Live amount owed (principal + accrued borrow interest), base units. */
  owedBase: number;
  openedMs: number;
};

export type LendingState = {
  poolId: string;
  borrowAprPct: number;
  reserveBase: number;
  loans: Loan[];
  isLoading: boolean;
  refetch: () => void;
};

/**
 * Live view of the lending pool and the signer's open loans. Reads pool state +
 * owned LoanReceipts and ticks each loan's `owed` forward every second with the
 * same interest formula as the Move `owed` view.
 */
export function useLending(): LendingState {
  const account = useCurrentAccount();
  const poolId = useNetworkVariable("lendingPoolId");
  const usdcType = useNetworkVariable("usdcType");
  // LoanReceipt's type is pinned to the package that introduced it (v7).
  const definingPkg = useNetworkVariable("lendingDefiningPackage");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const enabled = !!poolId && poolId !== "0x0";

  const poolQ = useSuiClientQuery(
    "getObject",
    { id: poolId, options: { showContent: true } },
    { enabled, refetchInterval: 15_000 }
  );

  const loanType = `${definingPkg}::collateral::LoanReceipt<${usdcType}>`;
  const loansQ = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "",
      filter: { StructType: loanType },
      options: { showContent: true },
    },
    { enabled: enabled && !!account, refetchInterval: 15_000 }
  );

  const pf =
    poolQ.data?.data?.content?.dataType === "moveObject"
      ? (poolQ.data.data.content.fields as Record<string, string>)
      : undefined;
  const borrowAprBps = pf ? Number(pf["borrow_apr_bps"]) : 0;

  const loans: Loan[] = useMemo(
    () =>
      (loansQ.data?.data ?? [])
        .map((o) => {
          const c = o.data?.content;
          if (c?.dataType !== "moveObject") return null;
          const f = c.fields as Record<string, string>;
          const principal = Number(f["principal"] ?? 0);
          const opened = Number(f["opened_ms"] ?? 0);
          const aprBps = Number(f["borrow_apr_bps"] ?? borrowAprBps);
          const dt = Math.max(0, now - opened);
          const interest = (principal * aprBps * dt) / (10_000 * YEAR_MS);
          return {
            loanId: o.data!.objectId,
            streamId: String(f["stream_id"]),
            principalBase: principal,
            owedBase: principal + interest,
            openedMs: opened,
          };
        })
        .filter((l): l is Loan => l !== null && l.principalBase > 0),
    [loansQ.data, now, borrowAprBps]
  );

  return {
    poolId,
    borrowAprPct: borrowAprBps / 100,
    reserveBase: pf ? Number(pf["reserve"]) : 0,
    loans,
    isLoading: poolQ.isLoading || loansQ.isLoading,
    refetch: () => {
      poolQ.refetch();
      loansQ.refetch();
    },
  };
}
