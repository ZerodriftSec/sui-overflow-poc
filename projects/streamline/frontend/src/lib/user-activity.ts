/**
 * Personal (User app) activity receipts + bulk export helpers.
 */

import type { AuditEventRecord } from "@/lib/indexer";
import { auditToCsv, downloadText, usdFromBase } from "@/lib/compliance";
import { shortAddress } from "@/lib/format";

export const ACTIVITY_KIND_LABEL: Record<string, string> = {
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
  borrow_opened: "Borrowed against stream",
  borrow_pending: "Borrow pending confirmation",
  stream_funded: "Stream funded",
  stream_request: "Stream request received",
};

export type ActivityKind =
  | keyof typeof ACTIVITY_KIND_LABEL
  | (string & {});

/** One row in the User home Activity list / detail modal. */
export type UserActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  time: string;
  timestampMs: number;
  amount: string | null;
  amountBase: number | null;
  subjectId: string | null;
  counterparty: string | null;
  txDigest: string | null;
  module: string | null;
  metaJson: string | null;
};

export function labelForKind(kind: string): string {
  return ACTIVITY_KIND_LABEL[kind] ?? kind.replace(/_/g, " ");
}

export function auditToActivityItem(
  e: AuditEventRecord,
  formatRelative: (ms: number, now: number) => string,
  now: number
): UserActivityItem {
  const amount =
    e.amount > 0
      ? `${e.kind === "stream_dripped" || e.kind === "giftcard_claimed" ? "+" : ""}${usdFromBase(e.amount)}`
      : null;
  return {
    id: `audit-${e.id}`,
    kind: e.kind,
    title: labelForKind(e.kind),
    time: formatRelative(e.timestamp_ms, now),
    timestampMs: e.timestamp_ms,
    amount,
    amountBase: e.amount > 0 ? e.amount : null,
    subjectId: e.subject_id || null,
    counterparty: e.counterparty || null,
    txDigest: e.tx_digest || null,
    module: e.module || null,
    metaJson: e.meta_json || null,
  };
}

export function buildActivityReceipt(item: UserActivityItem, party: string) {
  return {
    v: 1 as const,
    type: "streamline_activity_receipt",
    exportedAt: Date.now(),
    party,
    event: {
      id: item.id,
      kind: item.kind,
      title: item.title,
      timestampMs: item.timestampMs,
      isoTime: new Date(item.timestampMs).toISOString(),
      amountBase: item.amountBase,
      amountDisplay: item.amount,
      subjectId: item.subjectId,
      counterparty: item.counterparty,
      txDigest: item.txDigest,
      module: item.module,
      metaJson: item.metaJson,
    },
  };
}

export function exportActivityReceipt(item: UserActivityItem, party: string) {
  const receipt = buildActivityReceipt(item, party);
  const stamp = new Date(item.timestampMs).toISOString().slice(0, 10);
  const short = item.txDigest
    ? item.txDigest.slice(0, 10)
    : item.id.slice(0, 12);
  downloadText(
    `streamline-receipt-${stamp}-${short}.json`,
    JSON.stringify(receipt, null, 2),
    "application/json"
  );
}

export function exportActivityAudit(
  rows: AuditEventRecord[],
  party: string,
  opts: { fromMs?: number; fmt: "csv" | "json" }
) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (opts.fmt === "csv") {
    downloadText(
      `streamline-activity-${stamp}.csv`,
      auditToCsv(rows),
      "text/csv"
    );
    return;
  }
  downloadText(
    `streamline-activity-${stamp}.json`,
    JSON.stringify(
      {
        exportedAt: Date.now(),
        party,
        fromMs: opts.fromMs ?? null,
        count: rows.length,
        events: rows,
      },
      null,
      2
    ),
    "application/json"
  );
}

export function formatParty(addr: string | null | undefined): string {
  if (!addr) return "—";
  return shortAddress(addr, 8, 6);
}
