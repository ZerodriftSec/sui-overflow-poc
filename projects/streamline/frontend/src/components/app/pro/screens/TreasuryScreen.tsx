"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import {
  OnramperModal,
  onramperConfigured,
  type OnrampMode,
} from "@/components/wallet/OnramperWidget";
import { useProWorkspace } from "../ProWorkspaceContext";
import { YIELD_APY, bucketLabel, fmtUsd } from "../types";
import {
  CompositionBar,
  ProCard,
  ProEyebrow,
  ProStat,
} from "../ui";

export function TreasuryScreen() {
  const { workspace, totals, setModal, resetDemo } = useProWorkspace();
  const account = useCurrentAccount();
  const [rampMode, setRampMode] = useState<OnrampMode | null>(null);
  const alloc = workspace.pool.allocation;
  const invested = alloc.yield_vault + alloc.reserve;
  const apyHint = `${(YIELD_APY * 100).toFixed(0)}% APR on yield vault`;
  const canRamp = onramperConfigured && !!account;

  return (
    <div className="space-y-6">
      <div>
        <ProEyebrow>Treasury</ProEyebrow>
        <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
          Idle capital & yield
        </h1>
        <p className="mt-1 max-w-xl text-[13px] text-white/45">
          Fund the pool, withdraw to the org wallet, or rebalance idle float
          into yield. Coverage floor stays reserved for drip liquidity.
        </p>
      </div>

      <OnramperModal
        open={rampMode !== null}
        mode={rampMode ?? "buy"}
        onClose={() => setRampMode(null)}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProStat
          label="Treasury total"
          value={fmtUsd(totals.poolBalance)}
          hint={apyHint}
          accent
        />
        <ProStat
          label="Yield accrued"
          value={fmtUsd(totals.yieldEarned)}
          hint="Simulated vault tick"
        />
        <ProStat
          label="Invested"
          value={fmtUsd(invested, 0)}
          hint={`${fmtUsd(alloc.yield_vault, 0)} vault · ${fmtUsd(alloc.reserve, 0)} reserve`}
        />
        <ProStat
          label="Liquid for claims"
          value={fmtUsd(alloc.idle, 0)}
          hint={`Floor ${fmtUsd(totals.floor, 0)}`}
        />
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute inset-x-2 inset-y-1 rounded-[1.5rem] bg-black/45 blur-xl"
          aria-hidden
        />
        <div className="relative rounded-[1.5rem] border border-white/[0.1] bg-transparent p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.55),0_2px_10px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className="sl-glass-btn-dark sl-glass-btn-dark-primary flex !w-full flex-col items-center gap-1 !px-2 !py-3 !text-[11px]"
              onClick={() => setModal("fund")}
            >
              <FundIcon />
              Fund
            </button>
            <button
              type="button"
              className="sl-glass-btn-dark flex !w-full flex-col items-center gap-1 !px-2 !py-3 !text-[11px]"
              onClick={() => setModal("withdraw")}
            >
              <WithdrawIcon />
              Withdraw
            </button>
            <button
              type="button"
              className="sl-glass-btn-dark flex !w-full flex-col items-center gap-1 !px-2 !py-3 !text-[11px]"
              onClick={() => setModal("invest")}
            >
              <RebalanceIcon />
              Rebalance
            </button>
          </div>
          {canRamp ? (
            <div className="mt-2 border-t border-white/[0.06] pt-2">
              <p className="mb-1.5 px-0.5 text-[8px] font-medium uppercase tracking-[0.14em] text-white/25">
                Fiat on/off-ramp · card or bank
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="sl-glass-btn-dark !w-full !px-3 !py-2.5 !text-[11px]"
                  onClick={() => setRampMode("buy")}
                >
                  Buy USDC
                </button>
                <button
                  type="button"
                  className="sl-glass-btn-dark !w-full !px-3 !py-2.5 !text-[11px]"
                  onClick={() => setRampMode("sell")}
                >
                  Sell USDC
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ProCard>
          <ProEyebrow>Allocation</ProEyebrow>
          <p className="mt-3 text-[28px] font-semibold tabular text-white">
            {fmtUsd(alloc.idle + alloc.yield_vault + alloc.reserve)}
          </p>
          <div className="mt-5">
            <CompositionBar
              segments={[
                {
                  key: "idle",
                  label: bucketLabel("idle"),
                  value: alloc.idle,
                  color: "bg-white/75",
                  stripe: true,
                },
                {
                  key: "yield",
                  label: bucketLabel("yield_vault"),
                  value: alloc.yield_vault,
                  color: "bg-[#1d9e75]",
                },
                {
                  key: "reserve",
                  label: bucketLabel("reserve"),
                  value: alloc.reserve,
                  color: "bg-white/35",
                  stripe: true,
                },
              ]}
            />
          </div>
        </ProCard>

        <ProCard>
          <ProEyebrow>How it works</ProEyebrow>
          <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-white/55">
            <li>
              <span className="text-white">Liquid</span> — instantly available
              to cover claim PTBs.
            </li>
            <li>
              <span className="text-white">Yield vault</span> — StreamLine’s
              on-protocol vault (Scallop-shaped on testnet). Org keeps the yield.
            </li>
            <li>
              <span className="text-white">Reserve</span> — optional buffer you
              can peel back without touching the vault.
            </li>
            <li>
              Claims pull liquidity across buckets automatically when wired to
              chain.
            </li>
          </ul>
        </ProCard>
      </div>

      <ProCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <ProEyebrow>Workspace</ProEyebrow>
            <p className="mt-2 text-[14px] text-white/70">
              Org:{" "}
              <span className="text-white">{workspace.orgName}</span>
            </p>
            <p className="mt-1 text-[12px] text-white/35">
              Frontend workspace only — backend & Move payroll hooks come next.
            </p>
          </div>
          <button
            type="button"
            className="sl-glass-btn-dark !px-4 !py-2 !text-[11px]"
            onClick={() => {
              if (
                window.confirm(
                  "Reset this wallet’s Pro workspace to the sample payroll?"
                )
              ) {
                resetDemo();
              }
            }}
          >
            Reset sample data
          </button>
        </div>
      </ProCard>
    </div>
  );
}

function FundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v10M8 11l4 4 4-4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RebalanceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h12M16 7l-2.5-2.5M16 7l-2.5 2.5M20 17H8M8 17l2.5-2.5M8 17l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
