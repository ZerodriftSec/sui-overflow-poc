"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { QRCodeSVG } from "qrcode.react";

import { WalletButton } from "@/components/wallet/WalletButton";
import { StreamLineMark } from "@/components/landing/StreamLineMark";
import { parseInvoiceShareSearch } from "@/lib/pro-invoices";
import { useNetworkVariable, type NetworkName } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { shortAddress, explorerUrl } from "@/lib/format";

function InvoicePayInner() {
  const search = useSearchParams();
  const invoice = useMemo(
    () => parseInvoiceShareSearch(search.toString()),
    [search]
  );
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const [status, setStatus] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);

  const pay = async () => {
    if (!invoice || !account) {
      setStatus("Connect a wallet to pay.");
      return;
    }
    if (account.address.toLowerCase() === invoice.to.toLowerCase()) {
      setStatus("You can’t pay your own invoice.");
      return;
    }
    setStatus("Preparing transfer…");
    setDigest(null);
    try {
      const base = BigInt(Math.round(invoice.amount * 1_000_000));
      const bal = await client.getBalance({
        owner: account.address,
        coinType: usdcType,
      });
      if (BigInt(bal.totalBalance) < base) {
        setStatus("Not enough USDC.");
        return;
      }
      const coinPage = await client.getCoins({
        owner: account.address,
        coinType: usdcType,
        limit: 50,
      });
      if (coinPage.data.length === 0) {
        setStatus("No USDC in wallet.");
        return;
      }
      const tx = new Transaction();
      const primary = tx.object(coinPage.data[0].coinObjectId);
      if (coinPage.data.length > 1) {
        tx.mergeCoins(
          primary,
          coinPage.data.slice(1).map((c) => tx.object(c.coinObjectId))
        );
      }
      const [out] = tx.splitCoins(primary, [tx.pure.u64(base)]);
      tx.transferObjects([out], tx.pure.address(invoice.to));

      setStatus("Confirm in wallet…");
      await execute(
        tx,
        {
          onSuccess: ({ digest: d }) => {
            setDigest(d);
            setStatus("Paid.");
          },
          onError: (e) => setStatus(e.message),
        },
        // The invoice transfers USDC straight to the payee, so the sponsor must
        // allow-list that address as a transfer recipient.
        { allowedRecipients: [invoice.to] }
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  if (!invoice) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-[14px] font-semibold text-[#111]">Invalid invoice</p>
        <p className="mt-2 text-[12px] text-[#666]">
          This payment link is missing required fields.
        </p>
      </div>
    );
  }

  const overdue =
    invoice.due != null && invoice.due < Date.now() && !digest;

  return (
    <div className="min-h-[100dvh] bg-[#f4f4f2] font-[family-name:var(--font-inter)] text-[#111]">
      <header className="flex items-center justify-between border-b border-black/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <StreamLineMark size="sm" />
          <span className="text-[13px] font-semibold tracking-tight">
            Pay invoice
          </span>
        </div>
        <WalletButton
          variant="profile"
          className="!text-[10px]"
        />
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-[1.5rem] border border-black/8 bg-white/80 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            {invoice.number}
            {invoice.org ? ` · ${invoice.org}` : ""}
          </p>
          <p className="mt-2 text-[15px] font-semibold tracking-tight">
            {invoice.customer}
          </p>
          <p className="mt-3 text-[2.4rem] font-semibold tabular leading-none tracking-tight">
            ${invoice.amount.toLocaleString(undefined, {
              minimumFractionDigits: invoice.amount % 1 ? 2 : 0,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="mt-1 text-[12px] text-[#666]">USDC</p>

          <div className="mt-4 space-y-1.5 text-[12px] text-[#555]">
            <p>
              Pay to{" "}
              <span className="font-mono text-[#111]">
                {shortAddress(invoice.to, 8, 6)}
              </span>
            </p>
            {invoice.due ? (
              <p className={overdue ? "text-[#b45309]" : ""}>
                Due {new Date(invoice.due).toLocaleDateString()}
                {overdue ? " · overdue" : ""}
              </p>
            ) : null}
            {invoice.note ? <p>{invoice.note}</p> : null}
          </div>

          <div className="mx-auto mt-5 flex w-fit items-center justify-center rounded-2xl border border-black/8 bg-white p-3">
            <QRCodeSVG
              value={
                typeof window !== "undefined" ? window.location.href : ""
              }
              size={120}
              level="M"
            />
          </div>

          <button
            type="button"
            disabled={isPending || !!digest}
            onClick={() => void pay()}
            className="mt-5 w-full rounded-2xl bg-[#111] px-4 py-3.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {digest
              ? "Paid"
              : isPending
                ? "Paying…"
                : account
                  ? `Pay $${invoice.amount.toLocaleString()} USDC`
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

export default function InvoicePayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[#666]">
          Loading invoice…
        </div>
      }
    >
      <InvoicePayInner />
    </Suspense>
  );
}
