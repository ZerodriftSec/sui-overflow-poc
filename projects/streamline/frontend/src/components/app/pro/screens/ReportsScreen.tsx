"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import {
  auditToCsv,
  buildAuditorDisclosurePack,
  downloadText,
  payrollToCsv,
  usdFromBase,
} from "@/lib/compliance";
import { buildDemoCompliance } from "@/lib/demo-compliance";
import { shortAddress } from "@/lib/format";
import { isHexAddress, suinsBrand } from "@/lib/handle";
import { useAuditEvents, usePayrollStatement } from "@/lib/indexer";
import { useNetworkVariable } from "@/lib/networks";
import { resolveRecipient } from "@/lib/suins";
import { useProWorkspace } from "../ProWorkspaceContext";
import {
  ProCard,
  ProChip,
  ProEyebrow,
  ProStat,
} from "../ui";

const KIND_LABEL: Record<string, string> = {
  stream_created: "Stream created",
  milestone_raised: "Milestone raised",
  milestone_approved: "Milestone approved",
  stream_dripped: "Drip",
  dispute_raised: "Dispute raised",
  resolution_proposed: "Resolution proposed",
  dispute_resolved: "Dispute resolved",
  giftcard_created: "Gift card created",
  giftcard_claimed: "Gift card claimed",
  giftcard_cancelled: "Gift card cancelled",
};

function daysAgoMs(days: number): number {
  return Date.now() - days * 86_400_000;
}

export function ReportsScreen({ onBack }: { onBack?: () => void }) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const embedded = usePhoneEmbedded();
  const { workspace, isDemo } = useProWorkspace();
  const sealNamespace = useNetworkVariable("originalPackageId");
  const sender = account?.address;

  const [rangeDays, setRangeDays] = useState<30 | 90 | 365 | 0>(90);
  const [auditorInput, setAuditorInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fromMs = rangeDays === 0 ? undefined : daysAgoMs(rangeDays);

  const payrollQ = usePayrollStatement({
    sender: isDemo ? undefined : sender,
    fromMs,
  });
  const auditQ = useAuditEvents({
    party: isDemo ? undefined : sender,
    fromMs,
    limit: 400,
  });

  const demo = useMemo(
    () => (isDemo ? buildDemoCompliance(workspace, fromMs) : null),
    [isDemo, workspace, fromMs]
  );

  const payroll = isDemo ? demo!.payroll : (payrollQ.data ?? []);
  const audit = isDemo ? demo!.audit : (auditQ.data ?? []);
  const loading = !isDemo && (payrollQ.isLoading || auditQ.isLoading);
  const indexerError = !isDemo && (payrollQ.isError || auditQ.isError);

  const totals = useMemo(() => {
    const dripped = payroll.reduce(
      (s: number, r: (typeof payroll)[number]) => s + r.total_dripped,
      0
    );
    const streams = payroll.length;
    const disputes = audit.filter(
      (e: (typeof audit)[number]) =>
        e.kind === "dispute_raised" ||
        e.kind === "dispute_resolved" ||
        e.kind === "resolution_proposed"
    ).length;
    return { dripped, streams, disputes };
  }, [payroll, audit]);

  const onExportPayroll = (fmt: "csv" | "json") => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") {
      downloadText(
        `streamline-payroll-${stamp}.csv`,
        payrollToCsv(payroll),
        "text/csv"
      );
    } else {
      downloadText(
        `streamline-payroll-${stamp}.json`,
        JSON.stringify(
          {
            exportedAt: Date.now(),
            sender: sender ?? demo?.orgSender ?? null,
            demo: isDemo,
            fromMs: fromMs ?? null,
            rows: payroll,
          },
          null,
          2
        ),
        "application/json"
      );
    }
  };

  const onExportAudit = (fmt: "csv" | "json") => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") {
      downloadText(
        `streamline-audit-${stamp}.csv`,
        auditToCsv(audit),
        "text/csv"
      );
    } else {
      downloadText(
        `streamline-audit-${stamp}.json`,
        JSON.stringify(
          {
            exportedAt: Date.now(),
            party: sender ?? demo?.orgSender ?? null,
            demo: isDemo,
            fromMs: fromMs ?? null,
            events: audit,
          },
          null,
          2
        ),
        "application/json"
      );
    }
  };

  const onShareAuditor = async () => {
    if (isDemo) {
      setStatus("Connect a wallet to encrypt a Seal disclosure pack.");
      return;
    }
    if (!account || !sender) {
      setStatus("Connect a wallet first.");
      return;
    }
    const raw = auditorInput.trim();
    if (!raw) {
      setStatus("Enter an auditor @handle or 0x address.");
      return;
    }
    setBusy(true);
    setStatus("Resolving auditor…");
    try {
      let auditor = raw;
      if (!isHexAddress(raw)) {
        const resolved = await resolveRecipient(client, raw);
        if (!resolved?.address) {
          setStatus("Could not resolve that handle.");
          setBusy(false);
          return;
        }
        auditor = resolved.address;
      }
      setStatus("Encrypting disclosure pack…");
      const pack = await buildAuditorDisclosurePack({
        suiClient: client,
        sealNamespace,
        orgSender: sender,
        auditor,
        fromMs: fromMs ?? null,
        toMs: null,
        payload: {
          payroll,
          auditTimeline: audit.slice(0, 200),
        },
        note: "Period payroll + audit timeline for voluntary disclosure.",
      });
      downloadText(
        `streamline-auditor-pack-${Date.now()}.json`,
        JSON.stringify(pack, null, 2),
        "application/json"
      );
      setStatus(
        `Pack encrypted to ${shortAddress(auditor)}. Share the file only with that auditor.`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!sender && !isDemo) {
    return (
      <div className={embedded ? "px-1 py-4" : "p-6"}>
        <ProEyebrow>Compliance</ProEyebrow>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
          Reports
        </h1>
        <p className="mt-2 text-[13px] text-white/45">
          Connect a wallet to export payroll statements and audit timelines.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "space-y-4 px-1 pb-4 pt-1"
          : "space-y-6 p-6 md:p-8"
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {onBack && embedded ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Overview
            </button>
          ) : (
            <ProEyebrow>Compliance</ProEyebrow>
          )}
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white md:text-2xl">
            Reports & audit
          </h1>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-white/45 md:text-[13px]">
            {isDemo
              ? "Explore-demo sample payroll & timeline — exports work; Seal packs need a connected wallet."
              : "Cryptographic payment history from the indexer — export statements, review disputes, and selectively disclose to an auditor handle."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isDemo ? (
            <span className="mr-1 rounded-full border border-white/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/40">
              Demo
            </span>
          ) : null}
          {([30, 90, 365, 0] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRangeDays(d)}
              className={`rounded-full px-3 py-1 text-[11px] ${
                rangeDays === d
                  ? "bg-white text-[#0a0a0a]"
                  : "border border-white/12 text-white/50 hover:text-white"
              }`}
            >
              {d === 0 ? "All" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <ProStat label="Paid out" value={usdFromBase(totals.dripped)} />
        <ProStat label="Streams" value={String(totals.streams)} />
        <ProStat label="Dispute events" value={String(totals.disputes)} />
      </div>

      <ProCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
              Payroll statement
            </p>
            <p className="mt-0.5 text-[12px] text-white/45">
              Per-stream drip totals with transaction digests.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onExportPayroll("csv")}
              disabled={!payroll.length}
              className="rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/80 disabled:opacity-40"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => onExportPayroll("json")}
              disabled={!payroll.length}
              className="rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/80 disabled:opacity-40"
            >
              JSON
            </button>
          </div>
        </div>
        {loading && (
          <p className="mt-3 text-[12px] text-white/40">Loading payroll…</p>
        )}
        {indexerError && (
          <p className="mt-3 text-[12px] text-amber-400/90">
            Indexer unavailable — start the indexer or check NEXT_PUBLIC_INDEXER_URL.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {payroll.slice(0, embedded ? 5 : 12).map((r) => (
            <div
              key={r.stream_id}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[10px] text-white/55">
                  {shortAddress(r.freelancer)}
                </p>
                <p className="truncate font-mono text-[9px] text-white/30">
                  {shortAddress(r.stream_id)} · {r.drip_count} drips
                </p>
              </div>
              <p className="shrink-0 text-[13px] font-semibold text-white">
                {usdFromBase(r.total_dripped)}
              </p>
            </div>
          ))}
          {!loading && !payroll.length && !indexerError && (
            <p className="text-[12px] text-white/40">No drips in this period.</p>
          )}
        </div>
      </ProCard>

      <ProCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
              Audit timeline
            </p>
            <p className="mt-0.5 text-[12px] text-white/45">
              Streams, milestones, disputes, gift cards.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onExportAudit("csv")}
              disabled={!audit.length}
              className="rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/80 disabled:opacity-40"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => onExportAudit("json")}
              disabled={!audit.length}
              className="rounded-xl border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/80 disabled:opacity-40"
            >
              JSON
            </button>
          </div>
        </div>
        <div className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto">
          {audit.slice(0, 80).map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ProChip>{KIND_LABEL[e.kind] ?? e.kind}</ProChip>
                  <span className="font-mono text-[9px] text-white/30">
                    {e.tx_digest ? shortAddress(e.tx_digest) : "—"}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-white/35">
                  {e.subject_id ? shortAddress(e.subject_id) : e.module}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {e.amount > 0 && (
                  <p className="text-[11px] text-white/70">
                    {usdFromBase(e.amount)}
                  </p>
                )}
                <p className="text-[9px] text-white/30">
                  {e.timestamp_ms
                    ? new Date(e.timestamp_ms).toLocaleString()
                    : ""}
                </p>
              </div>
            </div>
          ))}
          {!loading && !audit.length && !indexerError && (
            <p className="text-[12px] text-white/40">
              No audit events yet — disputes and gift cards appear after the
              indexer upgrade is deployed.
            </p>
          )}
        </div>
      </ProCard>

      <ProCard>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
          Selective disclosure
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">
          Encrypt this period’s payroll + timeline to an auditor wallet via Seal.
          They decrypt with their own key — no plaintext leaves your device until
          you share the pack file.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder:text-white/30"
            placeholder={`auditor@${suinsBrand()} or 0x…`}
            value={auditorInput}
            onChange={(e) => setAuditorInput(e.target.value)}
            disabled={isDemo}
          />
          <button
            type="button"
            disabled={busy || isDemo || (!payroll.length && !audit.length)}
            onClick={() => void onShareAuditor()}
            className="rounded-xl bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] disabled:opacity-40"
          >
            {busy ? "Working…" : isDemo ? "Connect to encrypt" : "Encrypt pack"}
          </button>
        </div>
        {status && (
          <p className="mt-2 text-[11px] leading-snug text-white/55">{status}</p>
        )}
      </ProCard>
    </div>
  );
}
