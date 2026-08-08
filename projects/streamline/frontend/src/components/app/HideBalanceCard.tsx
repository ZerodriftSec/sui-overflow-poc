"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useSuiClientContext } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { toBaseUnits } from "@/lib/stream-math";
import {
  commit,
  randomBlinding,
  proveWrap,
  proveUnwrap,
  buildConfWrap,
  buildConfUnwrap,
} from "@/lib/confidential";
import { CONF_BALANCE_POOL, type NetworkName } from "@/lib/constants";

/**
 * "Hide your USDC" as a normal money action — wraps public USDC into a
 * confidential balance (Poseidon commitment, Groth16 wrap proof) and reveals it
 * back on demand. Compact + variant-aware so it lives in the Wallet home and Pro
 * treasury instead of a separate vault. Shares the `sl-conf:` opening store with
 * the confidential-balance panel, so both stay in sync.
 */
type ConfAccount = { value: string; blinding: string };
const storeKey = (a: string) => `sl-conf:${a.toLowerCase()}`;
function loadConf(a: string): ConfAccount | null {
  if (typeof localStorage === "undefined" || !a) return null;
  try {
    const raw = localStorage.getItem(storeKey(a));
    return raw ? (JSON.parse(raw) as ConfAccount) : null;
  } catch {
    return null;
  }
}
function saveConf(a: string, acc: ConfAccount) {
  try {
    localStorage.setItem(storeKey(a), JSON.stringify(acc));
  } catch {
    /* private mode */
  }
}
function clearConf(a: string) {
  try {
    localStorage.removeItem(storeKey(a));
  } catch {
    /* ignore */
  }
}

const usd = (base: string) => `$${(Number(base) / 1_000_000).toFixed(2)}`;

export function HideBalanceCard({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const account = useCurrentAccount();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const address = account?.address ?? "";
  const poolId = CONF_BALANCE_POOL[(network as NetworkName) ?? "testnet"];

  const [conf, setConf] = useState<ConfAccount | null>(null);
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConf(loadConf(address));
  }, [address]);

  const hide = useCallback(async () => {
    if (!address || !packageId || packageId === "0x0") return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setStatus("Proving…");
    try {
      const value = toBaseUnits(n);
      const blinding = randomBlinding();
      const commitment = await commit(value, blinding);
      const pf = await proveWrap(value, blinding);
      const tx = buildConfWrap({
        packageId,
        coinType: usdcType,
        sender: address,
        poolId,
        amountBase: value,
        commitment,
        proof: pf.proof,
      });
      setStatus("Confirm…");
      await execute(tx, {
        onSuccess: () => {
          const acc = { value: value.toString(), blinding: blinding.toString() };
          saveConf(address, acc);
          setConf(acc);
          setStatus("Hidden on-chain ✓");
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [address, packageId, usdcType, poolId, amount, execute]);

  const reveal = useCallback(async () => {
    if (!conf || !address || !packageId || packageId === "0x0") return;
    setBusy(true);
    setStatus("Proving…");
    try {
      const value = BigInt(conf.value);
      const pf = await proveUnwrap(value, BigInt(conf.blinding));
      const tx = buildConfUnwrap({
        packageId,
        coinType: usdcType,
        sender: address,
        poolId,
        valueBase: value,
        proof: pf.proof,
      });
      setStatus("Confirm…");
      await execute(tx, {
        onSuccess: () => {
          clearConf(address);
          setConf(null);
          setStatus("Revealed to your wallet ✓");
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [conf, address, packageId, usdcType, poolId, execute]);

  if (!address) return null;

  const dark = variant === "dark";
  const shell = dark
    ? "rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
    : "rounded-2xl border border-black/10 bg-black/[0.015] p-3.5";
  const label = dark ? "text-white/45" : "text-[#888]";
  const strong = dark ? "text-white" : "text-[#111]";
  const sub = dark ? "text-white/40" : "text-[#888]";
  const primaryBtn = dark
    ? "w-full rounded-xl bg-white px-4 py-2.5 text-[12px] font-semibold text-[#0a0a0a] transition-opacity disabled:opacity-40"
    : "w-full rounded-xl bg-[#111] px-4 py-2.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40";
  const input = dark
    ? "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[15px] font-semibold tabular text-white outline-none focus:border-white/30"
    : "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[15px] font-semibold tabular text-[#111] outline-none focus:border-black/30";

  return (
    <div className={shell}>
      {conf ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${label}`}
            >
              Hidden balance
            </p>
            <span className={`text-[8px] ${sub}`}>on-chain: commitment only</span>
          </div>
          <p className={`mt-1.5 text-[1.4rem] font-semibold tabular leading-none ${strong}`}>
            {usd(conf.value)}
          </p>
          <p className={`mt-1.5 text-[10px] leading-snug ${sub}`}>
            Only a Poseidon commitment is on-chain — nobody can read this amount.
            Only this browser holds the opening.
          </p>
          <button
            type="button"
            disabled={busy || isPending}
            onClick={() => void reveal()}
            className={`mt-3 ${primaryBtn}`}
          >
            {busy || isPending ? "Working…" : `Reveal ${usd(conf.value)} to wallet`}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${label}`}
            >
              Hide your USDC
            </p>
            <span className={`text-[8px] ${sub}`}>ZK · amount hidden</span>
          </div>
          <p className={`mt-1 text-[10px] leading-snug ${sub}`}>
            Wrap USDC into a confidential balance — the amount is proven and
            stored on-chain only as a commitment.
          </p>
          <div className="mt-2.5 flex items-end gap-2">
            <label className="flex-1">
              <span className={`mb-1 block text-[9px] font-medium ${sub}`}>
                Amount (USDC)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={busy || isPending}
              onClick={() => void hide()}
              className={`${primaryBtn} !w-auto shrink-0 px-5`}
            >
              {busy || isPending ? "…" : "Hide"}
            </button>
          </div>
        </>
      )}
      {status ? (
        <p className={`mt-2 text-center text-[10px] ${sub}`}>{status}</p>
      ) : null}
    </div>
  );
}
