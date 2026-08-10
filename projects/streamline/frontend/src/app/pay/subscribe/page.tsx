"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { QRCodeSVG } from "qrcode.react";

import { WalletButton } from "@/components/wallet/WalletButton";
import { StreamLineMark } from "@/components/landing/StreamLineMark";
import { RequestPreviewCard } from "@/components/app/phone/RequestPreviewCard";
import {
  parseSubscriptionShareSearch,
  periodLabel,
  sharePayloadToStreamRequest,
} from "@/lib/pro-subscriptions";
import { useCreateStreamFromRequest } from "@/lib/use-create-stream-from-request";
import { shortAddress } from "@/lib/format";

function SubscribeInner() {
  const search = useSearchParams();
  const payload = useMemo(
    () => parseSubscriptionShareSearch(search.toString()),
    [search]
  );
  const account = useCurrentAccount();
  const request = useMemo(
    () => (payload ? sharePayloadToStreamRequest(payload) : null),
    [payload]
  );
  const { createFromRequest, busy, status, deployed } =
    useCreateStreamFromRequest();
  const [done, setDone] = useState(false);

  const onSubscribe = async () => {
    if (!request || !account) return;
    const ok = await createFromRequest(request);
    if (ok) setDone(true);
  };

  if (!payload || !request) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-[14px] font-semibold text-[#111]">
          Invalid subscription
        </p>
        <p className="mt-2 text-[12px] text-[#666]">
          This link is missing required stream fields.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f4f4f2] font-[family-name:var(--font-inter)] text-[#111]">
      <header className="flex items-center justify-between border-b border-black/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <StreamLineMark size="sm" />
          <span className="text-[13px] font-semibold tracking-tight">
            Subscribe
          </span>
        </div>
        <WalletButton variant="profile" />
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-[1.5rem] border border-black/8 bg-white/80 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            {payload.org || "StreamLine"} · subscription stream
          </p>
          <p className="mt-2 text-[18px] font-semibold tracking-tight">
            {payload.plan}
          </p>
          {payload.customer ? (
            <p className="mt-1 text-[12px] text-[#666]">{payload.customer}</p>
          ) : null}
          <p className="mt-3 text-[2.2rem] font-semibold tabular leading-none tracking-tight">
            $
            {payload.amount.toLocaleString(undefined, {
              minimumFractionDigits: payload.amount % 1 ? 2 : 0,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="mt-1 text-[12px] text-[#666]">
            USDC over {periodLabel({
              durationValue: payload.durationValue,
              durationUnit: payload.durationUnit,
            })}
          </p>

          <div className="mt-4 rounded-2xl border border-black/8 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#555]">
            <p>
              Pays{" "}
              <span className="font-mono text-[#111]">
                {shortAddress(payload.to, 8, 6)}
              </span>{" "}
              as a continuous stream — funds lock on accept and drip for the
              period.
            </p>
            {payload.note ? <p className="mt-1.5">{payload.note}</p> : null}
          </div>

          <div className="mt-4">
            <RequestPreviewCard request={request} />
          </div>

          <div className="mx-auto mt-4 flex w-fit items-center justify-center rounded-2xl border border-black/8 bg-white p-3">
            <QRCodeSVG
              value={
                typeof window !== "undefined" ? window.location.href : ""
              }
              size={112}
              level="M"
            />
          </div>

          {!deployed ? (
            <p className="mt-4 text-center text-[11px] text-[#c0533a]">
              Move package not set for this network.
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy || done || !deployed}
            onClick={() => void onSubscribe()}
            className="mt-5 w-full rounded-2xl bg-[#111] px-4 py-3.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {done
              ? "Subscribed"
              : busy
                ? "Creating stream…"
                : account
                  ? "Subscribe — lock USDC stream"
                  : "Connect wallet to subscribe"}
          </button>

          {status ? (
            <p className="mt-3 break-words text-center text-[11px] text-[#666]">
              {status}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[#666]">
          Loading subscription…
        </div>
      }
    >
      <SubscribeInner />
    </Suspense>
  );
}
