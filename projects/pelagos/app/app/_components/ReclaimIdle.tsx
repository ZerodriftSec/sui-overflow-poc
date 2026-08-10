"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, FM } from "../_lib/tokens";
import { useActiveWalletAddress, useWalletSigner } from "../_lib/wallet-bridge";
import { fetchManagers, fetchManagerIdle, prepareManagerWithdraw, confirmPredict } from "../_lib/predict-strip-client";
import { friendlyWalletError } from "../_lib/chain";

/**
 * "Reclaim idle dUSDC" header pill. Over-deposit buffers leave un-positioned
 * dUSDC pooled in the connected wallet's PredictManager; the next open reuses it
 * automatically (backend netting), but this lets the owner pull it back to their
 * wallet without trading. Owner-signed (the Move fn aborts for non-owners).
 * Renders NOTHING unless the wallet has a manager with a reclaimable balance, so
 * it never appears for wallets with nothing to reclaim.
 */
export function ReclaimIdle() {
  const address = useActiveWalletAddress();
  const wallet = useWalletSigner();
  const [managerId, setManagerId] = useState<string | null>(null);
  const [idle, setIdle] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!address) { setManagerId(null); setIdle(0); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const mgrs = await fetchManagers(address).catch(() => []);
      if (mgrs.length === 0) { setManagerId(null); setIdle(0); return; }
      const mid = mgrs[0].manager_id;
      const bal = await fetchManagerIdle(mid).catch(() => ({ idle: 0 }));
      setManagerId(mid);
      setIdle(Number(bal.idle ?? 0));
    } finally {
      inFlight.current = false;
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function reclaim() {
    if (!managerId || !address || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const prep = await prepareManagerWithdraw({ owner: address, manager_id: managerId });
      const digest = await wallet.signAndExecute(prep.tx_bytes);
      const c = await confirmPredict(digest);
      if (!c.ok) throw new Error(`Reclaim failed on-chain (${c.status}).`);
      setMsg(`✓ Reclaimed ${(Number(prep.amount_raw) / 1e6).toFixed(2)} dUSDC`);
      window.setTimeout(() => { setMsg(null); void refresh(); }, 2500);
    } catch (e) {
      setMsg(friendlyWalletError(e));
      window.setTimeout(() => setMsg(null), 5000);
    } finally {
      setBusy(false);
    }
  }

  if (!address || !managerId || (idle < 0.01 && !busy && !msg)) return null;

  return (
    <button
      type="button"
      onClick={reclaim}
      disabled={busy}
      title="Reclaim idle dUSDC collateral parked in your Predict account back to your wallet"
      style={{
        font: `500 12px/1 ${FM}`,
        color: C.tealLight,
        background: "transparent",
        border: `1px solid ${C.tealLight}44`,
        borderRadius: 8,
        padding: "6px 10px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "Reclaiming…" : msg ?? `Reclaim ${idle.toFixed(2)} idle dUSDC`}
    </button>
  );
}
