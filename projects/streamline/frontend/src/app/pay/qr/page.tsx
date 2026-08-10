"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";

import { WalletButton } from "@/components/wallet/WalletButton";
import { StreamLineMark } from "@/components/landing/StreamLineMark";
import { parsePosPayParams } from "@/lib/pro-pos";
import { buildPosPay } from "@/lib/streamline-tx";
import { PACKAGE_IDS } from "@/lib/constants";
import { useNetworkVariable, type NetworkName } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { shortAddress, explorerUrl } from "@/lib/format";

function QrPayInner() {
  const search = useSearchParams();
  const qr = useMemo(() => parsePosPayParams(search.toString()), [search]);
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const [status, setStatus] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");

  const openAmount = qr?.amountUsd == null;
  const amountUsd = qr?.amountUsd ?? (Number(amountInput) > 0 ? Number(amountInput) : null);

  const pay = async () => {
    if (!qr || !account) {
      setStatus("Connect a wallet to pay.");
      return;
    }
    if (!(amountUsd && amountUsd > 0)) {
      setStatus("Enter an amount.");
      return;
    }
    setStatus("Preparing payment…");
    setDigest(null);
    try {
      const base = BigInt(Math.round(amountUsd * 1_000_000));
      const bal = await client.getBalance({
        owner: account.address,
        coinType: usdcType,
      });
      if (BigInt(bal.totalBalance) < base) {
        setStatus("Not enough USDC.");
        return;
      }
      const packageId = PACKAGE_IDS[network as NetworkName];
      if (!packageId || packageId === "0x0") {
        setStatus("Payments unavailable on this network.");
        return;
      }
      const tx = buildPosPay({
        packageId,
        usdcType,
        sender: account.address,
        qrId: qr.qrId,
        treasuryId: qr.treasuryId,
        amountBase: base,
      });
      setStatus("Confirm in wallet…");
      await execute(tx, {
        onSuccess: ({ digest: d }) => {
          setDigest(d);
          setStatus("Paid.");
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  if (!qr) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-[14px] font-semibold text-[#111]">Invalid payment code</p>
        <p className="mt-2 text-[12px] text-[#666]">
          This QR is missing required fields.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f4f4f2] font-[family-name:var(--font-inter)] text-[#111]">
      <header className="flex items-center justify-between border-b border-black/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <StreamLineMark size="sm" />
          <span className="text-[13px] font-semibold tracking-tight">Pay</span>
        </div>
        <WalletButton variant="profile" className="!text-[10px]" />
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-[1.5rem] border border-black/8 bg-white/80 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            {qr.org ? `${qr.org} · ` : ""}Payment QR
          </p>
          <p className="mt-2 text-[15px] font-semibold tracking-tight">
            {qr.label}
          </p>

          {openAmount ? (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-[#666]">
                Amount (USDC)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                disabled={!!digest}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[18px] font-semibold tabular text-[#111] outline-none focus:border-black/30 disabled:opacity-60"
              />
            </div>
          ) : (
            <>
              <p className="mt-3 text-[2.4rem] font-semibold tabular leading-none tracking-tight">
                ${amountUsd!.toLocaleString(undefined, {
                  minimumFractionDigits: amountUsd! % 1 ? 2 : 0,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="mt-1 text-[12px] text-[#666]">USDC</p>
            </>
          )}

          <p className="mt-4 text-[12px] text-[#555]">
            Settles into treasury{" "}
            <span className="font-mono text-[#111]">
              {shortAddress(qr.treasuryId, 8, 6)}
            </span>
          </p>

          <button
            type="button"
            disabled={isPending || !!digest || (openAmount && !(amountUsd && amountUsd > 0))}
            onClick={() => void pay()}
            className="mt-5 w-full rounded-2xl bg-[#111] px-4 py-3.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {digest
              ? "Paid"
              : isPending
                ? "Paying…"
                : account
                  ? amountUsd && amountUsd > 0
                    ? `Pay $${amountUsd.toLocaleString()} USDC`
                    : "Enter an amount"
                  : "Connect wallet to pay"}
          </button>

          {status ? (
            <p className="mt-3 text-center text-[11px] text-[#666]">{status}</p>
          ) : null}
          {digest ? (
            <a
              href={explorerUrl(network as NetworkName, "tx", digest)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-[11px] font-medium text-[#111] underline"
            >
              View on explorer
            </a>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function QrPayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[#666]">
          Loading…
        </div>
      }
    >
      <QrPayInner />
    </Suspense>
  );
}
