"use client";

import { StreamLineMark } from "@/components/landing/StreamLineMark";
import type { PhoneAppRoute } from "./types";

/** Two apps only: the personal Wallet and StreamLine Business (Pro). Everything
 * private — shielded pool, lazy streams, confidential balances — now lives
 * inside Business → Tools → Private vault. */
export function PhoneLauncher({
  onOpen,
}: {
  onOpen: (route: PhoneAppRoute) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-6">
      <p className="mb-4 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9aa0a6]">
        Your apps
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpen("user")}
          className="group flex flex-col items-start gap-3 rounded-[22px] border border-black/8 bg-white p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-[#f1f2f4]">
            <StreamLineMark size="sm" variant="default" className="!h-7 !w-7" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-[#111]">
              Wallet
            </span>
            <span className="mt-0.5 block text-[10px] leading-tight text-[#9aa0a6]">
              Personal — pay, receive, request
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpen("pro")}
          className="group flex flex-col items-start gap-3 rounded-[22px] border border-white/12 bg-[#141414] p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-transform duration-200 active:scale-[0.98]"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-white/[0.08]">
            <StreamLineMark size="sm" variant="pro" className="!h-7 !w-7" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-white">
              Business
            </span>
            <span className="mt-0.5 block text-[10px] leading-tight text-white/45">
              Payroll · treasury · private vault
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
