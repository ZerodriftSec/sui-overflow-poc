"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { useAuditEvents } from "@/lib/indexer";
import { exportActivityAudit } from "@/lib/user-activity";
import { phoneFlowFooter, phoneFlowOverlay } from "./phoneStyles";

type PhoneExportActivityModalProps = {
  open: boolean;
  onClose: () => void;
};

function daysAgoMs(days: number): number {
  return Date.now() - days * 86_400_000;
}

export function PhoneExportActivityModal({
  open,
  onClose,
}: PhoneExportActivityModalProps) {
  const account = useCurrentAccount();
  const party = account?.address;
  const [rangeDays, setRangeDays] = useState<30 | 90 | 365 | 0>(90);
  const [status, setStatus] = useState<string | null>(null);

  const fromMs = rangeDays === 0 ? undefined : daysAgoMs(rangeDays);
  const auditQ = useAuditEvents({
    party,
    fromMs,
    limit: 500,
  });

  const rows = auditQ.data ?? [];
  const countLabel = useMemo(() => {
    if (auditQ.isLoading) return "Loading…";
    if (auditQ.isError) return "Indexer unavailable";
    return `${rows.length} event${rows.length === 1 ? "" : "s"}`;
  }, [auditQ.isLoading, auditQ.isError, rows.length]);

  if (!open) return null;

  const onExport = (fmt: "csv" | "json") => {
    if (!party) {
      setStatus("Connect a wallet first.");
      return;
    }
    if (rows.length === 0) {
      setStatus("No events in this period to export.");
      return;
    }
    exportActivityAudit(rows, party, { fromMs, fmt });
    setStatus(`Downloaded ${fmt.toUpperCase()} (${rows.length} events).`);
  };

  return (
    <div
      className={phoneFlowOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Export activity"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
          Profile
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#111]">
          Export activity
        </h2>
        <p className="mt-1 text-[12px] leading-snug text-[#666]">
          Download your personal audit trail for the selected period.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              [30, "30d"],
              [90, "90d"],
              [365, "1y"],
              [0, "All"],
            ] as const
          ).map(([days, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setRangeDays(days);
                setStatus(null);
              }}
              className={`rounded-2xl px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                rangeDays === days
                  ? "bg-[#111] text-white"
                  : "border border-black/10 bg-white/80 text-[#444]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-white/80 px-3.5 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#888]">
            Ready to export
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#111]">{countLabel}</p>
        </div>

        {status && (
          <p className="mt-3 text-[11px] text-[#1a5c38]">{status}</p>
        )}
      </div>

      <div className={phoneFlowFooter}>
        <button
          type="button"
          disabled={!party || rows.length === 0 || auditQ.isLoading}
          onClick={() => onExport("csv")}
          className="w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled={!party || rows.length === 0 || auditQ.isLoading}
          onClick={() => onExport("json")}
          className="w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] disabled:opacity-40"
        >
          Export JSON
        </button>
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
