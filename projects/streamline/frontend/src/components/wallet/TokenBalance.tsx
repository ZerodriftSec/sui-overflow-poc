"use client";

import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { USDC_BASE } from "@/lib/stream-math";

/**
 * Live SLT (StreamLine Token — the testnet mock-USDC) balance for the connected
 * wallet. Polls every few seconds so it ticks as faucet/drip/claim land.
 */
export function TokenBalance({ dark }: { dark?: boolean }) {
  const account = useCurrentAccount();
  const usdcType = useNetworkVariable("usdcType");

  const { data } = useSuiClientQuery(
    "getBalance",
    { owner: account?.address ?? "", coinType: usdcType },
    { enabled: !!account, refetchInterval: 15000 }
  );

  if (!account) return null;

  const bal = data ? Number(BigInt(data.totalBalance)) / USDC_BASE : 0;
  const text = bal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div
      className={`flex items-center gap-1.5 border px-3 py-2 text-[10px] uppercase tracking-[0.12em] ${
        dark
          ? "border-white/15 text-white/80"
          : "border-[#2b2a5e]/20 text-[#2b2a5e]/80"
      }`}
      title="StreamLine Token balance (testnet)"
    >
      <span className="tabular font-semibold">{text}</span>
      <span className="opacity-55">SLT</span>
    </div>
  );
}
