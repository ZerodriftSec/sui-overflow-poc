"use client";

import { ConfidentialBalancePanel } from "@/components/app/ConfidentialBalancePanel";

export default function ConfidentialPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-lg font-semibold text-[#111]">
        Confidential balance
      </h1>
      <p className="mb-5 text-[12px] text-[#666]">
        Hold USDC with the amount hidden. Wrapping binds your balance to a
        Poseidon commitment; only the pool&apos;s aggregate reserve is public.
        Every wrap/withdraw is Groth16-verified on-chain (Tier 1 · hides amounts).
      </p>
      <ConfidentialBalancePanel />
    </div>
  );
}
