"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { pk } from "@/lib/shielded";
import { getSpendKey } from "@/lib/shielded-store";
import { myShieldedAddress } from "@/lib/shielded-address";

/**
 * Compact "your private receive address" card — the sl1… shielded address the
 * connected wallet shares to get paid privately. Reusable on the light Wallet
 * home and the dark Pro overview via `variant`. Derives the address from the
 * local spend key; robust clipboard copy with an execCommand fallback.
 */
export function PrivateReceiveCard({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const account = useCurrentAccount();
  const address = account?.address ?? "";
  const [addr, setAddr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) {
      setAddr("");
      return;
    }
    const sk = getSpendKey(address);
    let cancelled = false;
    pk(sk).then((pkv) => {
      if (!cancelled) setAddr(myShieldedAddress(sk, pkv));
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const copy = useCallback(async () => {
    if (!addr) return;
    const ok = await (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(addr);
          return true;
        }
      } catch {
        /* fall through */
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = addr;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const done = document.execCommand("copy");
        document.body.removeChild(ta);
        return done;
      } catch {
        return false;
      }
    })();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [addr]);

  if (!address || !addr) return null;

  const dark = variant === "dark";
  return (
    <div
      className={
        dark
          ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          : "rounded-2xl border border-black/10 bg-black/[0.015] p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
            dark ? "text-white/55" : "text-[#333]"
          }`}
        >
          Private receive address
        </p>
        <span
          className={`text-[8px] ${dark ? "text-white/35" : "text-[#9aa0a6]"}`}
        >
          share to get paid privately
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code
          className={`flex-1 truncate rounded-lg px-2 py-1.5 font-mono text-[10px] ${
            dark
              ? "bg-white/[0.06] text-white/85"
              : "border border-black/8 bg-white text-[#333]"
          }`}
        >
          {addr}
        </code>
        <button
          type="button"
          onClick={copy}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-semibold ${
            dark ? "bg-white text-[#0a0a0a]" : "bg-[#111] text-white"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
