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
 * The client-side opening of a confidential balance: only the holder knows
 * (value, blinding); on-chain just Poseidon(value, blinding) is stored. Kept in
 * localStorage — like a note wallet, losing it means you can't prove a withdraw.
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

export function ConfidentialBalancePanel() {
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

  const wrap = useCallback(async () => {
    if (!address || !packageId || packageId === "0x0") return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setStatus("Proving…");
    try {
      const value = toBaseUnits(n); // bigint base units (6dp)
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

  const unwrap = useCallback(async () => {
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
          setStatus("Withdrawn to your wallet ✓");
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [conf, address, packageId, usdcType, poolId, execute]);

  if (!address) {
    return (
      <p className="rounded-2xl border border-black/8 bg-white/70 px-4 py-6 text-center text-[12px] text-[#666]">
        Connect a wallet to hold a confidential balance.
      </p>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-black/8 bg-white/80 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
      {conf ? (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            Your confidential balance
          </p>
          <p className="mt-2 text-[2.4rem] font-semibold tabular leading-none tracking-tight text-[#111]">
            {usd(conf.value)}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-[#666]">
            On-chain, only a Poseidon commitment of this amount is stored — the
            value is hidden. Only you (this browser) hold the opening needed to
            withdraw.
          </p>
          <button
            type="button"
            disabled={busy || isPending}
            onClick={() => void unwrap()}
            className="mt-5 w-full rounded-2xl bg-[#111] px-4 py-3.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy || isPending ? "Working…" : `Withdraw ${usd(conf.value)} to wallet`}
          </button>
        </>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            Hide USDC
          </p>
          <p className="mt-2 text-[12px] leading-snug text-[#666]">
            Wrap USDC into a confidential balance. The amount is proven with a
            Groth16 wrap proof and stored on-chain only as a commitment — the pool
            holds the funds, but no one can read your balance.
          </p>
          <label className="mt-4 block text-[11px] font-medium text-[#666]">
            Amount (USDC)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[18px] font-semibold tabular text-[#111] outline-none focus:border-black/30"
          />
          <button
            type="button"
            disabled={busy || isPending}
            onClick={() => void wrap()}
            className="mt-4 w-full rounded-2xl bg-[#111] px-4 py-3.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy || isPending ? "Working…" : "Hide amount on-chain"}
          </button>
        </>
      )}
      {status ? (
        <p className="mt-3 text-center text-[11px] text-[#666]">{status}</p>
      ) : null}
    </div>
  );
}
