"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { useStreams } from "@/lib/indexer";
import { useLending, PV_DISCOUNT } from "@/lib/use-lending";
import { effectiveState } from "@/lib/stream-state";
import { buildBorrow, buildRepay } from "@/lib/streamline-tx";
import { USDC_BASE } from "@/lib/stream-math";
import { BorrowFlow } from "./FinanceFlowViz";
import { Card } from "./dashboard-ui";

const usd = (base: number) =>
  (base / USDC_BASE).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

/**
 * Borrow against a live stream. A dripping stream has guaranteed future income,
 * so the freelancer can draw up to 90% of its remaining value now and repay with
 * interest. Testnet stand-in for Scallop/NAVI lending.
 */
export function CollateralPanel() {
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const pool = useLending();
  const { data: streams } = useStreams({ freelancer: account?.address });

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  if (!account) return null;

  const dripping = (streams ?? []).filter((s) => effectiveState(s) === "dripping");

  const borrow = (streamId: string, pvBase: number) => {
    const amt = Number(amounts[streamId]);
    if (!(amt > 0)) {
      setStatus("Enter an amount to borrow.");
      return;
    }
    const principalBase = BigInt(Math.round(amt * USDC_BASE));
    if (principalBase > BigInt(Math.floor(pvBase))) {
      setStatus(`Max borrow is $${usd(pvBase)} (90% of remaining).`);
      return;
    }
    setStatus("Borrowing…");
    execute(
      buildBorrow({
        packageId,
        usdcType,
        poolId: pool.poolId,
        sender: account.address,
        streamId,
        principalBase,
      }),
      {
        onSuccess: () => {
          setStatus("Borrowed — cash sent to your wallet.");
          setAmounts((m) => ({ ...m, [streamId]: "" }));
          pool.refetch();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  const repay = (loanId: string, owedBase: number) => {
    setStatus("Repaying…");
    execute(
      buildRepay({
        packageId,
        usdcType,
        poolId: pool.poolId,
        sender: account.address,
        loanId,
        owedBase: BigInt(Math.ceil(owedBase)),
      }),
      {
        onSuccess: () => {
          setStatus("Loan repaid.");
          pool.refetch();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  return (
    <Card title="Collateral · borrow against a stream">
      <div className="-mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-md text-[11px] text-[#2b2a5e]/45">
          A dripping stream is future income. Draw up to{" "}
          {(PV_DISCOUNT * 100).toFixed(0)}% of its remaining value now, repay with
          interest. Testnet stand-in for Scallop/NAVI lending.
        </p>
        <div className="flex gap-5 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/45">
              Borrow APR
            </p>
            <p className="text-[20px] font-black tabular text-[#c0533a]">
              {pool.borrowAprPct.toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/45">
              Liquidity
            </p>
            <p className="text-[20px] font-black tabular text-[#2b2a5e]">
              ${usd(pool.reserveBase)}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <BorrowFlow />
      </div>

      {/* Borrow against dripping streams */}
      <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[#2b2a5e]/50">
        Your dripping streams
      </p>
      {dripping.length === 0 ? (
        <p className="border border-[#2b2a5e]/12 px-4 py-4 text-[12px] text-[#2b2a5e]/45">
          No dripping streams to borrow against yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {dripping.map((s) => {
            const pvBase = s.remaining * PV_DISCOUNT;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-[#2b2a5e]/12 px-4 py-3"
              >
                <div>
                  <p className="font-mono text-[12px]">{short(s.id)}</p>
                  <p className="text-[11px] text-[#2b2a5e]/55">
                    remaining ${usd(s.remaining)} · max borrow{" "}
                    <strong>${usd(pvBase)}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={amounts[s.id] ?? ""}
                    onChange={(e) =>
                      setAmounts((m) => ({ ...m, [s.id]: e.target.value }))
                    }
                    placeholder="amount"
                    className="w-28 border border-[#2b2a5e]/20 bg-transparent px-2.5 py-2 text-[13px] tabular"
                  />
                  <button
                    onClick={() => borrow(s.id, pvBase)}
                    disabled={isPending}
                    className="bg-[#c0533a] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40"
                  >
                    borrow
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active loans */}
      {pool.loans.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-[11px] uppercase tracking-[0.14em] text-[#2b2a5e]/50">
            Your loans
          </p>
          <div className="flex flex-col gap-2">
            {pool.loans.map((l) => (
              <div
                key={l.loanId}
                className="flex items-center justify-between border border-[#c0533a]/25 bg-[#c0533a]/[0.04] px-4 py-3"
              >
                <div>
                  <p className="font-mono text-[12px]">
                    against {short(l.streamId)}
                  </p>
                  <p className="text-[12px]">
                    borrowed ${usd(l.principalBase)} · owe{" "}
                    <strong className="tabular text-[#c0533a]">
                      ${usd(l.owedBase)}
                    </strong>
                  </p>
                </div>
                <button
                  onClick={() => repay(l.loanId, l.owedBase)}
                  disabled={isPending}
                  className="border border-[#1d9e75] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#1d9e75] hover:bg-[#1d9e75]/[0.06] disabled:opacity-40"
                >
                  repay
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {status && <p className="mt-4 text-[11px] text-[#2b2a5e]/70">{status}</p>}
    </Card>
  );
}
