"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import type { StreamRecord } from "@/lib/indexer";
import {
  loanRepayPerSec,
  netDripPerSec,
  rememberPendingBorrow,
  readPendingBorrows,
  loanForStream,
} from "@/lib/loan-ui";
import { useNetworkVariable } from "@/lib/networks";
import { USDC_BASE } from "@/lib/stream-math";
import { effectiveState, liveRemainingBase } from "@/lib/stream-state";
import { useGaslessExecute } from "@/lib/use-gasless";
import {
  maxBorrowableBaseOrDemo,
  useLending,
  PV_DISCOUNT,
} from "@/lib/use-lending";
import { buildBorrow } from "@/lib/streamline-tx";

const usd = (base: number, digits = 2) =>
  (base / USDC_BASE).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

type PhoneBorrowAgainstViewProps = {
  stream: StreamRecord;
  label: string;
  onBack: () => void;
  onBorrowed?: () => void;
};

export function PhoneBorrowAgainstView({
  stream,
  label,
  onBack,
  onBorrowed,
}: PhoneBorrowAgainstViewProps) {
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const pool = useLending();
  const { execute, isPending } = useGaslessExecute();

  const [amountUsd, setAmountUsd] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingBorrows, setPendingBorrows] = useState(readPendingBorrows);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const view = effectiveState(stream);
  const isDripping = view === "dripping";
  const remainingLive = isDripping
    ? liveRemainingBase(stream, now)
    : stream.remaining;
  const { maxBase: maxBorrowBase, demo: demoBorrow } = maxBorrowableBaseOrDemo(
    remainingLive,
    pool.reserveBase
  );
  const maxBorrowUsd = maxBorrowBase / USDC_BASE;

  const existingLoan = loanForStream(stream.id, pool.loans, pendingBorrows);
  const deployed =
    !!packageId && packageId !== "0x0" && !!pool.poolId && pool.poolId !== "0x0";

  const repayPerSec = existingLoan
    ? loanRepayPerSec(existingLoan, stream) / USDC_BASE
    : 0;
  const netPerSec = netDripPerSec(existingLoan, stream) / USDC_BASE;

  const blockReason = useMemo(() => {
    if (existingLoan && maxBorrowBase <= 0) return null;
    if (maxBorrowBase <= 0) {
      return "Nothing left to borrow against on this stream.";
    }
    // Demo path unlocks even when pool/liquidity isn't live.
    if (demoBorrow) return null;
    if (!isDripping) return "Only dripping streams can be borrowed against.";
    if (!deployed) return "Lending pool is not available on this network yet.";
    return null;
  }, [
    isDripping,
    deployed,
    maxBorrowBase,
    existingLoan,
    demoBorrow,
  ]);

  useEffect(() => {
    if (blockReason) {
      setAmountUsd(0);
      return;
    }
    setAmountUsd((prev) => {
      if (prev <= 0 || prev > maxBorrowUsd) return maxBorrowUsd;
      return prev;
    });
  }, [blockReason, maxBorrowUsd]);

  const amountBase = Math.round(amountUsd * USDC_BASE);
  const canBorrow =
    !blockReason && amountBase > 0 && amountBase <= maxBorrowBase && !!account;

  const onBorrow = () => {
    if (!account || !canBorrow) return;

    // Pitch / empty-pool path — local receipt, no on-chain liquidity needed.
    if (demoBorrow || !deployed) {
      rememberPendingBorrow(stream.id, amountBase);
      setPendingBorrows(readPendingBorrows());
      setStatus(
        "Borrowed — demo credit against this stream. Future drips would repay automatically."
      );
      onBorrowed?.();
      return;
    }

    setStatus("Awaiting signature…");
    execute(
      buildBorrow({
        packageId,
        usdcType,
        poolId: pool.poolId,
        sender: account.address,
        streamId: stream.id,
        principalBase: BigInt(amountBase),
      }),
      {
        onSuccess: () => {
          rememberPendingBorrow(stream.id, amountBase);
          setPendingBorrows(readPendingBorrows());
          setStatus(
            "Borrowed — USDC sent to your wallet. Future drips repay the loan automatically."
          );
          pool.refetch();
          window.setTimeout(() => pool.refetch(), 2500);
          onBorrowed?.();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  const detailsMode = !!existingLoan;

  return (
    <div className="sl-scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 self-start text-[9px] font-medium text-[#666]"
      >
        ← Stream
      </button>

      <div className="flex flex-col gap-3 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
            {detailsMode ? "Borrow details" : "Borrow against"}
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-[#666]">{label}</p>
        </div>

        {existingLoan && (
          <section className="rounded-2xl border border-[#e85d2a]/30 bg-[#e85d2a]/[0.06] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#e85d2a]">
              Active loan
            </p>
            <p className="mt-2 text-[2rem] font-bold tabular-nums leading-none text-[#111]">
              {usd(existingLoan.owedBase, 2)}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-[#666]">
              Borrowed {usd(existingLoan.principalBase, 2)} · repaying from stream
            </p>
            {isDripping && (
              <div className="mt-3 border-t border-[#e85d2a]/15 pt-3">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full bg-[#e85d2a]"
                    style={{
                      width: `${Math.min(100, (repayPerSec / (repayPerSec + netPerSec || 1)) * 100)}%`,
                    }}
                  />
                  <div className="h-full flex-1 bg-[#1d9e75]" />
                </div>
                <p className="mt-2 text-[10px] font-medium leading-snug">
                  <span className="text-[#e85d2a]">−${repayPerSec.toFixed(4)} / sec to loan</span>
                  <span className="text-[#888]"> · </span>
                  <span className="text-[#1d9e75]">+${netPerSec.toFixed(4)} / sec to you</span>
                </p>
              </div>
            )}
          </section>
        )}

        {!detailsMode && (
          <section className="rounded-2xl border border-black/10 bg-white p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
              You can borrow up to
            </p>
            <p className="mt-2 text-[2rem] font-bold tabular-nums leading-none text-[#111]">
              {usd(maxBorrowBase, 2)}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-[#666]">
              {(PV_DISCOUNT * 100).toFixed(0)}% of remaining ({usd(remainingLive, 2)})
              {demoBorrow ? " · demo liquidity" : ""}
            </p>
          </section>
        )}

        {detailsMode ? (
          <p className="rounded-2xl border border-dashed border-black/12 bg-[#fafafa] px-3 py-4 text-center text-[11px] leading-snug text-[#666]">
            One loan per stream. This stream is already borrowed against — its
            drips repay the loan automatically until it&apos;s cleared.
          </p>
        ) : blockReason ? (
          <p className="rounded-2xl border border-dashed border-black/12 bg-[#fafafa] px-3 py-4 text-center text-[11px] leading-snug text-[#666]">
            {blockReason}
          </p>
        ) : (
          maxBorrowBase > 0 && (
            <>
              <section className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
                    Borrow amount
                  </p>
                  <p className="text-[18px] font-bold tabular-nums text-[#111]">
                    {usd(amountBase, 2)}
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(maxBorrowUsd, 0.01)}
                  step={maxBorrowUsd >= 100 ? 1 : 0.01}
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(Number(e.target.value))}
                  className="mt-4 w-full accent-[#e85d2a]"
                />
                <div className="mt-2 flex justify-between text-[10px] tabular text-[#888]">
                  <span>$0</span>
                  <span>{usd(maxBorrowBase, 2)}</span>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat
                  label="Borrow APR"
                  value={`${(pool.borrowAprPct || 12).toFixed(0)}%`}
                />
                <MiniStat label="Repay" value="Auto from drips" />
              </div>

              <p className="text-[10px] leading-snug text-[#888]">
                {demoBorrow
                  ? "Demo borrow against this stream’s remaining value — no pool liquidity required."
                  : "Cash arrives now. Future drips repay the loan automatically — no liquidation risk as the stream drains."}
              </p>
            </>
          )
        )}

        {status && (
          <p
            className={`rounded-xl px-3 py-2.5 text-center text-[11px] leading-snug ${
              status.startsWith("Borrowed")
                ? "border border-[#1d9e75]/25 bg-[#1d9e75]/[0.06] text-[#1a5c38]"
                : "text-[#666]"
            }`}
          >
            {status}
          </p>
        )}

        {!detailsMode && maxBorrowBase > 0 && !blockReason && (
          <button
            type="button"
            onClick={onBorrow}
            disabled={!canBorrow || isPending || (!demoBorrow && pool.isLoading)}
            className="mt-2 w-full rounded-2xl bg-[#e85d2a] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
          >
            {isPending ? "Borrowing…" : `Borrow ${usd(amountBase, 2)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#888]">
        {label}
      </p>
      <p className="mt-1 text-[12px] font-semibold leading-snug text-[#111]">{value}</p>
    </div>
  );
}
