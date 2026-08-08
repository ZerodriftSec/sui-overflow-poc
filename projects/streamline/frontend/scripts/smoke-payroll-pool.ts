/**
 * Smoke: build payroll PTBs and assert Move call targets.
 * Run: npx tsx scripts/smoke-payroll-pool.ts
 */
import {
  buildCreateStreamFromTreasuryV2,
  buildSuspendPayroll,
  buildResumePayroll,
  buildStopPayroll,
  DEFAULT_STREAM_YIELD_BPS,
} from "../src/lib/streamline-tx";

const PKG = "0x" + "ab".repeat(32);
const USDC = `${PKG}::mock_usdc::MOCK_USDC`;
const TREASURY = "0x" + "aa".repeat(32);
const VAULT = "0x" + "bb".repeat(32);
const STREAM = "0x" + "cc".repeat(32);
const SENDER = "0x" + "11".repeat(32);
const WORKER = "0x" + "22".repeat(32);

type Cmd = {
  $kind?: string;
  MoveCall?: { module?: string; function?: string; package?: string };
};

function moveTargets(tx: { getData: () => { commands: Cmd[] } }): string[] {
  return tx
    .getData()
    .commands.filter((c) => c.$kind === "MoveCall" && c.MoveCall)
    .map((c) => `${c.MoveCall!.package}::${c.MoveCall!.module}::${c.MoveCall!.function}`);
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function has(hay: string[], needle: string) {
  return hay.some((h) => h.includes(needle));
}

{
  const tx = buildCreateStreamFromTreasuryV2({
    packageId: PKG,
    usdcType: USDC,
    sender: SENDER,
    freelancer: WORKER,
    treasuryId: TREASURY,
    vaultId: VAULT,
    milestoneNames: ["payroll"],
    milestoneAmountsBase: [50_000_000n],
    totalBase: 50_000_000n,
    durationMs: 30 * 86_400_000,
    yieldBps: DEFAULT_STREAM_YIELD_BPS,
  });
  const t = moveTargets(tx);
  assert(t.length === 2, `expected 2 calls, got ${t.length}: ${t}`);
  assert(has(t, "treasury::ensure_idle"), `ensure_idle missing: ${t}`);
  assert(has(t, "stream::create_stream_from_treasury_v2"), `create missing: ${t}`);
  console.log("ok  hire + ensure_idle");
}

{
  const tx = buildCreateStreamFromTreasuryV2({
    packageId: PKG,
    usdcType: USDC,
    sender: SENDER,
    freelancer: WORKER,
    treasuryId: TREASURY,
    milestoneNames: ["payroll"],
    milestoneAmountsBase: [10_000_000n],
    totalBase: 10_000_000n,
    durationMs: 86_400_000,
    yieldBps: 0,
  });
  const t = moveTargets(tx);
  assert(t.length === 1, `expected 1 call, got ${t.length}`);
  assert(!has(t, "ensure_idle"), "ensure_idle should be absent");
  assert(has(t, "create_stream_from_treasury_v2"), "create missing");
  console.log("ok  hire without ensure_idle");
}

{
  const ref = { packageId: PKG, usdcType: USDC, streamId: STREAM };
  assert(has(moveTargets(buildSuspendPayroll(ref)), "suspend_payroll"), "suspend");
  assert(has(moveTargets(buildResumePayroll(ref)), "resume_payroll"), "resume");
  assert(
    has(moveTargets(buildStopPayroll({ ...ref, treasuryId: TREASURY })), "stop_payroll"),
    "stop"
  );
  console.log("ok  suspend / resume / stop");
}

assert(DEFAULT_STREAM_YIELD_BPS === 9_999, "yield bps");
console.log("ok  exports");
console.log("\nSMOKE PASS — payroll pool PTB builders");
