/**
 * Compliance helpers: payroll CSV/JSON export + Seal auditor disclosure packs.
 */

import type { SuiClient } from "@mysten/sui/client";
import { toBase64 } from "@mysten/sui/utils";

import type { AuditEventRecord, PayrollRow } from "@/lib/indexer";
import { getSealClient } from "@/lib/seal";
import { USDC_BASE } from "@/lib/stream-math";

export function usdFromBase(amount: number | bigint): string {
  const n = Number(amount) / USDC_BASE;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function payrollToCsv(rows: PayrollRow[]): string {
  const header = [
    "stream_id",
    "freelancer",
    "coin_type",
    "total_locked_base",
    "total_dripped_base",
    "total_dripped_usd",
    "drip_count",
    "first_drip_ms",
    "last_drip_ms",
    "tx_digests",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.stream_id,
      r.freelancer,
      r.coin_type,
      r.total_locked,
      r.total_dripped,
      (r.total_dripped / USDC_BASE).toFixed(6),
      r.drip_count,
      r.first_drip_ms ?? "",
      r.last_drip_ms ?? "",
      `"${r.digests}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

export function auditToCsv(rows: AuditEventRecord[]): string {
  const header = [
    "timestamp_ms",
    "kind",
    "module",
    "subject_id",
    "sender",
    "counterparty",
    "amount",
    "amount_b",
    "tx_digest",
    "meta_json",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.timestamp_ms,
      r.kind,
      r.module,
      r.subject_id,
      r.sender,
      r.counterparty,
      r.amount,
      r.amount_b,
      r.tx_digest,
      `"${r.meta_json.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

export type AuditorDisclosurePack = {
  v: 1;
  createdAtMs: number;
  auditor: string;
  orgSender: string;
  period: { fromMs: number | null; toMs: number | null };
  /** Seal ciphertext (base64) encrypted to the auditor's wallet identity. */
  ciphertext: string;
  sealNamespace: string;
  note: string;
};

const THRESHOLD = 1;

/**
 * Encrypt a compliance payload to an auditor wallet via Seal.
 * Auditor decrypts with their own session key + seal_approve(their address).
 */
export async function buildAuditorDisclosurePack(args: {
  suiClient: SuiClient;
  sealNamespace: string;
  orgSender: string;
  auditor: string;
  fromMs: number | null;
  toMs: number | null;
  payload: unknown;
  note?: string;
}): Promise<AuditorDisclosurePack> {
  const client = getSealClient(args.suiClient);
  const data = new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      orgSender: args.orgSender,
      period: { fromMs: args.fromMs, toMs: args.toMs },
      disclosedAtMs: Date.now(),
      body: args.payload,
    })
  );
  const { encryptedObject } = await client.encrypt({
    threshold: THRESHOLD,
    packageId: args.sealNamespace,
    id: args.auditor.replace(/^0x/, ""),
    data,
  });
  return {
    v: 1,
    createdAtMs: Date.now(),
    auditor: args.auditor,
    orgSender: args.orgSender,
    period: { fromMs: args.fromMs, toMs: args.toMs },
    ciphertext: toBase64(encryptedObject),
    sealNamespace: args.sealNamespace,
    note:
      args.note ??
      "StreamLine auditor disclosure pack — decrypt with Seal as the auditor wallet.",
  };
}
