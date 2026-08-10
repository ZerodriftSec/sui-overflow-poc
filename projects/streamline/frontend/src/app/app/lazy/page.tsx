"use client";

import { LazyStreamPanel } from "@/components/app/LazyStreamPanel";

export default function LazyStreamPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-lg font-semibold text-[#111]">Lazy private streams</h1>
      <p className="mb-5 text-[12px] text-[#666]">
        Confidential streams that vest linearly and settle in a single proof — no
        per-drip transactions, no keeper. (Phase 1 · testnet)
      </p>
      <LazyStreamPanel />
    </div>
  );
}
