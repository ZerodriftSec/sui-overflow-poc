"use client";

import { useState } from "react";
import { useSuiClientContext } from "@mysten/dapp-kit";

import {
  copyToClipboard,
  explorerUrl,
  shortAddress,
} from "@/lib/format";
import type { NetworkName } from "@/lib/networks";
import {
  exportActivityReceipt,
  formatParty,
  type UserActivityItem,
} from "@/lib/user-activity";
import { phoneFlowOverlay } from "./phoneStyles";

type PhoneActivityDetailModalProps = {
  item: UserActivityItem | null;
  party: string;
  onClose: () => void;
};

export function PhoneActivityDetailModal({
  item,
  party,
  onClose,
}: PhoneActivityDetailModalProps) {
  const { network } = useSuiClientContext();
  const [copied, setCopied] = useState<"digest" | "receipt" | null>(null);

  if (!item) return null;

  const onCopyDigest = async () => {
    if (!item.txDigest) return;
    if (await copyToClipboard(item.txDigest)) {
      setCopied("digest");
      setTimeout(() => setCopied(null), 1400);
    }
  };

  const onExport = () => {
    exportActivityReceipt(item, party);
    setCopied("receipt");
    setTimeout(() => setCopied(null), 1400);
  };

  const rows: { label: string; value: string }[] = [
    { label: "Type", value: item.title },
    {
      label: "When",
      value: new Date(item.timestampMs).toLocaleString(),
    },
    ...(item.amount
      ? [{ label: "Amount", value: item.amount }]
      : []),
    ...(item.subjectId
      ? [
          {
            label: "Subject",
            value: shortAddress(item.subjectId, 10, 8),
          },
        ]
      : []),
    ...(item.counterparty
      ? [{ label: "Counterparty", value: formatParty(item.counterparty) }]
      : []),
    ...(item.module ? [{ label: "Module", value: item.module }] : []),
    ...(item.txDigest
      ? [{ label: "Tx digest", value: shortAddress(item.txDigest, 10, 8) }]
      : []),
  ];

  return (
    <div
      className={phoneFlowOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Activity detail"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
          Receipt
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#111]">
          {item.title}
        </h2>
        <p className="mt-1 text-[12px] leading-snug text-[#666]">
          Audit details for this event. Export a receipt or open the transaction
          on-chain.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-white/80">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-start justify-between gap-3 border-b border-black/5 px-3.5 py-2.5 last:border-b-0"
            >
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                {r.label}
              </span>
              <span className="min-w-0 break-all text-right text-[11px] font-medium text-[#111]">
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {copied && (
          <p className="mt-3 text-[11px] text-[#1a5c38]">
            {copied === "digest" ? "Digest copied." : "Receipt downloaded."}
          </p>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-2 border-t border-black/8 bg-white/70 backdrop-blur-md px-4 py-3">
        <button
          type="button"
          onClick={onExport}
          className="w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
        >
          Export receipt
        </button>
        {item.txDigest && (
          <>
            <button
              type="button"
              onClick={() => void onCopyDigest()}
              className="w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              {copied === "digest" ? "Copied" : "Copy digest"}
            </button>
            <a
              href={explorerUrl(network as NetworkName, "tx", item.txDigest)}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              View on explorer
            </a>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
