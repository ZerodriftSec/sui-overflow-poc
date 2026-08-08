"use client";

import { ShieldedPanel } from "@/components/app/ShieldedPanel";

export default function ShieldedPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-lg font-semibold text-[#111]">Shielded pool</h1>
      <p className="mb-5 text-[12px] text-[#666]">
        Deposit into a shared pool, then transfer and withdraw privately. A
        note-commitment + nullifier design (Zcash/Tornado-shaped) hides who pays whom,
        not just amounts — every operation is Groth16-verified on-chain. (Phase 2 ·
        testnet)
      </p>
      <ShieldedPanel />
    </div>
  );
}
