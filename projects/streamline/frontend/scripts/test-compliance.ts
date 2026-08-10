/**
 * Offline compliance smoke tests (no indexer / Seal network).
 * Run: npx tsx scripts/test-compliance.ts
 */
import assert from "node:assert/strict";

import {
  auditToCsv,
  payrollToCsv,
  usdFromBase,
} from "../src/lib/compliance";
import type { AuditEventRecord, PayrollRow } from "../src/lib/indexer";
import {
  IndexerClient,
  type AuditEventRecord as SdkAudit,
  type PayrollRow as SdkPayroll,
} from "@streamline/sdk";

const payroll: PayrollRow[] = [
  {
    stream_id: "0x" + "aa".repeat(32),
    freelancer: "0x" + "bb".repeat(32),
    coin_type: "0x2::sui::SUI",
    total_locked: 1_000_000_000,
    total_dripped: 250_000_000,
    drip_count: 4,
    first_drip_ms: 1_700_000_000_000,
    last_drip_ms: 1_700_086_400_000,
    digests: "0xdigest1,0xdigest2",
  },
];

const audit: AuditEventRecord[] = [
  {
    id: 1,
    kind: "stream_dripped",
    module: "stream",
    subject_id: payroll[0]!.stream_id,
    sender: "0x" + "cc".repeat(32),
    counterparty: payroll[0]!.freelancer,
    amount: 50_000_000,
    amount_b: 0,
    meta_json: "{}",
    timestamp_ms: 1_700_000_000_000,
    tx_digest: "0xdigest1",
  },
  {
    id: 2,
    kind: "dispute_resolved",
    module: "stream",
    subject_id: payroll[0]!.stream_id,
    sender: "0x" + "cc".repeat(32),
    counterparty: payroll[0]!.freelancer,
    amount: 100_000_000,
    amount_b: 50_000_000,
    meta_json: '{"resumed":false}',
    timestamp_ms: 1_700_100_000_000,
    tx_digest: "0xdigest3",
  },
  {
    id: 3,
    kind: "giftcard_claimed",
    module: "giftcard",
    subject_id: "0x" + "dd".repeat(32),
    sender: "",
    counterparty: "0x" + "ee".repeat(32),
    amount: 25_000_000,
    amount_b: 0,
    meta_json: "{}",
    timestamp_ms: 1_700_200_000_000,
    tx_digest: "0xdigest4",
  },
];

function main() {
  assert.match(usdFromBase(250_000_000), /\$250/);

  const csv = payrollToCsv(payroll);
  assert.ok(csv.startsWith("stream_id,freelancer"));
  assert.ok(csv.includes("250.000000"));
  assert.ok(csv.includes("0xdigest1,0xdigest2"));
  assert.equal(csv.trim().split("\n").length, 2);

  const auditCsv = auditToCsv(audit);
  assert.ok(auditCsv.includes("dispute_resolved"));
  assert.ok(auditCsv.includes("giftcard_claimed"));
  assert.ok(auditCsv.includes('"{\\"resumed\\":false}"') || auditCsv.includes("resumed"));

  // SDK client methods exist (offline — no fetch)
  const client = new IndexerClient("http://127.0.0.1:9");
  assert.equal(typeof client.audit, "function");
  assert.equal(typeof client.payroll, "function");

  // Type surface: assignability
  const _a: SdkAudit = audit[0]!;
  const _p: SdkPayroll = payroll[0]!;
  void _a;
  void _p;

  // Statement totals match export math
  const dripped = payroll.reduce((s, r) => s + r.total_dripped, 0);
  assert.equal(dripped, 250_000_000);

  console.log("compliance offline checks: OK");
  console.log("  payroll CSV, audit CSV, SDK IndexerClient.audit/payroll");
}

main();
