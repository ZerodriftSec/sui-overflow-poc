import type { StreamRecord } from "@/lib/indexer";
import { USDC_BASE } from "@/lib/stream-math";
import type { Loan } from "@/lib/use-lending";

/** Gross drip rate in base units per second. */
export function dripPerSecBase(stream: StreamRecord): number {
  if (stream.duration_ms <= 0) return 0;
  return (stream.total / stream.duration_ms) * 1000;
}

/** Share of each drip routed to loan repayment (0–1). */
export function loanRepayShare(loan: Loan, stream: StreamRecord): number {
  if (stream.remaining <= 0) return 1;
  return Math.min(1, loan.owedBase / stream.remaining);
}

export function loanRepayPerSec(loan: Loan, stream: StreamRecord): number {
  const drip = dripPerSecBase(stream);
  return drip * loanRepayShare(loan, stream);
}

export function netDripPerSec(loan: Loan | undefined, stream: StreamRecord): number {
  const drip = dripPerSecBase(stream);
  if (!loan) return drip;
  return Math.max(0, drip - loanRepayPerSec(loan, stream));
}

/** Estimated earned that reached the wallet after loan repay routing. */
export function netEarnedBase(
  earnedBase: number,
  loan: Loan | undefined,
  stream: StreamRecord
): number {
  if (!loan || stream.total <= 0) return earnedBase;
  const routed = earnedBase * loanRepayShare(loan, stream);
  return Math.max(0, earnedBase - routed);
}

export function usdFromBase(base: number, digits = 3) {
  return (base / USDC_BASE).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const PENDING_KEY = "sl-pending-borrows";

type PendingBorrow = {
  streamId: string;
  principalBase: number;
  at: number;
};

export function rememberPendingBorrow(streamId: string, principalBase: number) {
  if (typeof window === "undefined") return;
  const list = readPendingBorrows().filter((p) => p.streamId !== streamId);
  list.push({ streamId, principalBase, at: Date.now() });
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10)));
}

export function readPendingBorrows(): PendingBorrow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingBorrow[];
    return parsed.filter((p) => Date.now() - p.at < 300_000);
  } catch {
    return [];
  }
}

export function clearPendingBorrow(streamId: string) {
  if (typeof window === "undefined") return;
  const next = readPendingBorrows().filter((p) => p.streamId !== streamId);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
}

export function loanForStream(
  streamId: string,
  loans: Loan[],
  pending: PendingBorrow[]
): Loan | undefined {
  const onChain = loans.find((l) => l.streamId === streamId);
  if (onChain) return onChain;
  const p = pending.find((b) => b.streamId === streamId);
  if (!p) return undefined;
  return {
    loanId: `pending-${streamId}`,
    streamId,
    principalBase: p.principalBase,
    owedBase: p.principalBase,
    openedMs: p.at,
  };
}
