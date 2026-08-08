import type { AuditEventRecord, PayrollRow } from "@/lib/indexer";
import { USDC_BASE } from "@/lib/stream-math";
import type { ProWorkspace } from "@/components/app/pro/types";

const DEMO_ORG = "0x" + "a1".repeat(32);
const USDC_TYPE =
  "0x2::coin::COIN<0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC>";

function usdToBase(usd: number) {
  return Math.round(usd * USDC_BASE);
}

function digest(n: number) {
  const hex = n.toString(16).padStart(8, "0");
  return `0x${hex}${"d".repeat(56)}`;
}

function streamId(n: number) {
  const hex = n.toString(16).padStart(2, "0");
  return `0x${hex.repeat(32)}`;
}

/**
 * Explore-demo compliance fixtures — mirrors the seeded Pro roster so
 * Reports isn't empty without a wallet / indexer.
 */
export function buildDemoCompliance(workspace: ProWorkspace, fromMs?: number) {
  const now = Date.now();
  const active = workspace.workers.filter((w) => w.status !== "pending");

  const payroll: PayrollRow[] = active.map((w, i) => {
    const drippedUsd =
      w.streamedUsd > 0 ? w.streamedUsd : Math.max(200, w.monthlyUsd * 0.28);
    const lockedUsd = w.budget > 0 ? w.budget : w.monthlyUsd * 3;
    const dripCount = Math.max(3, Math.round(drippedUsd / 80));
    const started = w.startedAt ?? now - 86400000 * (10 - i);
    const last = w.status === "paused" ? (w.pausedAt ?? now - 86400000) : now - 3600_000;
    return {
      stream_id: streamId(i + 1),
      freelancer: w.walletAddress.startsWith("0x")
        ? w.walletAddress.padEnd(66, "0").slice(0, 66)
        : `0x${"b".repeat(64)}`,
      coin_type: USDC_TYPE,
      total_locked: usdToBase(lockedUsd),
      total_dripped: usdToBase(drippedUsd),
      drip_count: dripCount,
      first_drip_ms: started,
      last_drip_ms: last,
      digests: [digest(100 + i), digest(200 + i), digest(300 + i)].join(","),
    };
  });

  const audit: AuditEventRecord[] = [];
  let id = 1;

  for (let i = 0; i < payroll.length; i++) {
    const row = payroll[i]!;
    const worker = active[i]!;
    audit.push({
      id: id++,
      kind: "stream_created",
      module: "stream",
      subject_id: row.stream_id,
      sender: DEMO_ORG,
      counterparty: row.freelancer,
      amount: row.total_locked,
      amount_b: 0,
      meta_json: JSON.stringify({ alias: worker.alias }),
      timestamp_ms: row.first_drip_ms ?? now - 86400000 * 12,
      tx_digest: digest(10 + i),
    });
    audit.push({
      id: id++,
      kind: "stream_dripped",
      module: "stream",
      subject_id: row.stream_id,
      sender: DEMO_ORG,
      counterparty: row.freelancer,
      amount: Math.round(row.total_dripped / Math.max(row.drip_count, 1)),
      amount_b: 0,
      meta_json: "{}",
      timestamp_ms: row.last_drip_ms ?? now - 86400000,
      tx_digest: digest(20 + i),
    });
  }

  // Pause / resume story for the paused worker
  const pausedIdx = active.findIndex((w) => w.status === "paused");
  if (pausedIdx >= 0) {
    const row = payroll[pausedIdx]!;
    audit.push({
      id: id++,
      kind: "dispute_raised",
      module: "stream",
      subject_id: row.stream_id,
      sender: row.freelancer,
      counterparty: DEMO_ORG,
      amount: 0,
      amount_b: 0,
      meta_json: '{"reason":"milestone_review"}',
      timestamp_ms: now - 86400000 * 3,
      tx_digest: digest(40),
    });
    audit.push({
      id: id++,
      kind: "dispute_resolved",
      module: "stream",
      subject_id: row.stream_id,
      sender: DEMO_ORG,
      counterparty: row.freelancer,
      amount: usdToBase(400),
      amount_b: 0,
      meta_json: '{"resumed":false}',
      timestamp_ms: now - 86400000 * 2,
      tx_digest: digest(41),
    });
  }

  audit.push({
    id: id++,
    kind: "giftcard_created",
    module: "giftcard",
    subject_id: streamId(9),
    sender: DEMO_ORG,
    counterparty: "",
    amount: usdToBase(250),
    amount_b: 0,
    meta_json: "{}",
    timestamp_ms: now - 86400000 * 5,
    tx_digest: digest(50),
  });
  audit.push({
    id: id++,
    kind: "giftcard_claimed",
    module: "giftcard",
    subject_id: streamId(9),
    sender: "",
    counterparty: payroll[0]?.freelancer ?? DEMO_ORG,
    amount: usdToBase(250),
    amount_b: 0,
    meta_json: "{}",
    timestamp_ms: now - 86400000 * 4,
    tx_digest: digest(51),
  });
  audit.push({
    id: id++,
    kind: "milestone_approved",
    module: "stream",
    subject_id: payroll[0]?.stream_id ?? streamId(1),
    sender: DEMO_ORG,
    counterparty: payroll[0]?.freelancer ?? "",
    amount: usdToBase(1200),
    amount_b: 0,
    meta_json: "{}",
    timestamp_ms: now - 86400000 * 6,
    tx_digest: digest(60),
  });

  const filteredPayroll = fromMs
    ? payroll.filter(
        (r) => (r.last_drip_ms ?? r.first_drip_ms ?? 0) >= fromMs
      )
    : payroll;
  const filteredAudit = fromMs
    ? audit.filter((e) => e.timestamp_ms >= fromMs)
    : audit;

  filteredAudit.sort((a, b) => b.timestamp_ms - a.timestamp_ms);

  return {
    orgSender: DEMO_ORG,
    payroll: filteredPayroll,
    audit: filteredAudit,
  };
}
