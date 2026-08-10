"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { useYieldVault } from "@/lib/use-yield";
import { buildVaultDeposit, buildVaultRedeem } from "@/lib/streamline-tx";
import { USDC_BASE } from "@/lib/stream-math";
import { YieldSplitFlow } from "./FinanceFlowViz";
import { Card } from "./dashboard-ui";

const usd = (base: number) =>
  (base / USDC_BASE).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

/**
 * Yield panel — deposit the streamed token into the Scallop-shaped vault and
 * watch it compound live. On mainnet this routes to real Scallop; on testnet it
 * uses streamline::yield_vault. Mirrors the "Scallop (yield)" stream split leg.
 */
export function YieldPanel() {
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const vault = useYieldVault();

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  if (!account) return null;

  const deposit = () => {
    const amt = Number(amount);
    if (!(amt > 0)) {
      setStatus("Enter an amount.");
      return;
    }
    setStatus("Depositing…");
    execute(
      buildVaultDeposit({
        packageId,
        usdcType,
        vaultId: vault.vaultId,
        sender: account.address,
        amountBase: BigInt(Math.round(amt * USDC_BASE)),
      }),
      {
        onSuccess: () => {
          setStatus("Deposited — now earning yield.");
          setAmount("");
          vault.refetch();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  const redeem = (receiptId: string) => {
    setStatus("Redeeming…");
    execute(
      buildVaultRedeem({
        packageId,
        usdcType,
        vaultId: vault.vaultId,
        sender: account.address,
        receiptId,
      }),
      {
        onSuccess: () => {
          setStatus("Redeemed principal + interest.");
          vault.refetch();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  return (
    <Card title="Yield · Scallop-style vault">
      <div className="-mt-2 mb-5 flex flex-wrap items-end justify-between gap-3">
        <p className="text-[11px] text-[#2b2a5e]/45">
          Deposit SLT and it compounds at a fixed rate. Testnet stand-in for
          Scallop&apos;s lending pool — same deposit/redeem shape.
        </p>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#2b2a5e]/45">
            APR
          </p>
          <p className="text-[22px] font-black tabular text-[#1d9e75]">
            {vault.aprPct.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mb-5">
        <YieldSplitFlow />
      </div>

      {/* Live position value */}
      <div className="mb-5 border border-[#1d9e75]/25 bg-[#1d9e75]/[0.05] p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[#2b2a5e]/50">
          Your deposited value · live
        </p>
        <p className="mt-1 text-[clamp(28px,5vw,44px)] font-black leading-none tabular text-[#2b2a5e]">
          ${usd(vault.totalValueBase)}
        </p>
        <p className="mt-1 text-[11px] text-[#1d9e75]">
          {vault.positions.length > 0
            ? "compounding every second"
            : "no deposits yet"}
        </p>
      </div>

      {/* Deposit */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="amount (SLT)"
          className="w-40 border border-[#2b2a5e]/20 bg-transparent px-3 py-2.5 text-[14px] tabular"
        />
        <button
          onClick={deposit}
          disabled={isPending}
          className="bg-[#1d9e75] px-5 py-2.5 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? "…" : "deposit — gasless"}
        </button>
      </div>

      {/* Positions */}
      {vault.positions.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {vault.positions.map((p) => (
            <div
              key={p.receiptId}
              className="flex items-center justify-between border border-[#2b2a5e]/12 px-4 py-3"
            >
              <div>
                <p className="font-mono text-[12px]">
                  {p.receiptId.slice(0, 8)}…{p.receiptId.slice(-4)}
                </p>
                <p className="tabular text-[13px] font-semibold">
                  ${usd(p.valueBase)}
                </p>
              </div>
              <button
                onClick={() => redeem(p.receiptId)}
                disabled={isPending}
                className="border border-[#2b2a5e]/30 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#2b2a5e]/80 hover:border-[#1d9e75] disabled:opacity-40"
              >
                redeem
              </button>
            </div>
          ))}
        </div>
      )}

      {status && (
        <p className="mt-4 text-[11px] text-[#2b2a5e]/70">{status}</p>
      )}
    </Card>
  );
}
