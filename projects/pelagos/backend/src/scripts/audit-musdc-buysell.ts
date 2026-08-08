/**
 * LIVE mUSDC buy/sell + economic-safety audit.
 *
 * Signs locally with the operator key but drives the DEPLOYED backend over HTTP,
 * so it verifies the actual hardened image end-to-end:
 *   • BUY      — /sim/open/prepare → sign+execute the real mUSDC deposit → /sim/confirm
 *   • SELL     — /sim/settle at expiry → operator-signed payoff mint → P&L check
 *   • GUARD A  — settle before expiry is blocked (early-claim guard)
 *   • GUARD B  — /confirm with a forged digest is rejected
 *   • GUARD C  — /confirm with another position's real digest is rejected (label mismatch)
 *   • GUARD D  — payoff is capped at premium × MAX_PAYOFF_MULTIPLE (no infinite mint)
 *   • GUARD E  — double-settle is idempotent (no second mint)
 *   • GUARD F  — settle of an unknown id is 404
 *   • GUARD G  — /mm/confirm is disabled (410)
 *
 * Run: npx tsx --tsconfig ./tsconfig.dev.json src/scripts/audit-musdc-buysell.ts
 */
import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient, getSigner } from '../services/predict/sui';

const BASE =
  process.env.AUDIT_BASE_URL ??
  'https://479e3gd11te3p23d5vp162u354.ingress.h6i-dedicated.eu-se-1.digitalfrontier.so';
const MOCK_USDC_TYPE = process.env.MOCK_USDC_TYPE!;
const owner = process.env.SUI_ACTIVE_ADDRESS!;
const client = getSuiClient();
const signer = getSigner();

let pass = 0;
let fail = 0;
const log = (...a: unknown[]) => console.log(...a);
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function api(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json };
}

async function musdcBalance(addr: string): Promise<number> {
  const b = await client.getBalance({ owner: addr, coinType: MOCK_USDC_TYPE });
  return Number(b.totalBalance) / 1e6;
}

/** Sign+execute a prepared deposit; return its on-chain digest after indexing.
 *  The HTTP /open/prepare returns tx_bytes as a JSON-serialized Transaction
 *  (not base64); Transaction.from() accepts the JSON string directly. */
async function signDeposit(prepared: { tx_bytes: string }): Promise<string> {
  const tx = Transaction.from(prepared.tx_bytes);
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`deposit tx failed: ${JSON.stringify(res.effects?.status)}`);
  }
  await client.waitForTransaction({ digest: res.digest });
  return res.digest;
}

async function openPosition(args: {
  product: string;
  premium: number;
  maxPayout: number;
  forward: number;
  expiryMs: number | null;
  bands: Array<{ lower_usd: number; higher_usd: number; payout_usd: number }>;
  name: string;
}): Promise<{ sim_id: string; tx_bytes: string; label: string }> {
  const { status, json } = await api('/api/sim/open/prepare', 'POST', {
    owner,
    product: args.product,
    name: args.name,
    premium_usd: args.premium,
    max_payout_usd: args.maxPayout,
    forward_usd: args.forward,
    expiry_ms: args.expiryMs,
    bands: args.bands,
    oracle_id: null,
  });
  if (status !== 200) throw new Error(`open/prepare failed ${status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  log(`\n════════ LIVE mUSDC BUY/SELL + SAFETY AUDIT ════════`);
  log(`backend: ${BASE}`);
  log(`buyer  : ${owner}`);
  const suiBal = await client.getBalance({ owner });
  const startMusdc = await musdcBalance(owner);
  log(`SUI gas: ${(Number(suiBal.totalBalance) / 1e9).toFixed(4)} | mUSDC: ${startMusdc.toFixed(4)}\n`);
  if (Number(suiBal.totalBalance) < 5e7) throw new Error('operator has insufficient SUI for gas');
  if (startMusdc < 5) throw new Error('operator has insufficient mUSDC; airdrop first');

  const now = Date.now();

  // ───────── 1. BUY a real option (future expiry) ─────────
  log('1. BUY — option, premium $0.50, expiry +1h');
  const A = await openPosition({
    product: 'option',
    premium: 0.5,
    maxPayout: 1,
    forward: 100,
    expiryMs: now + 3_600_000,
    bands: [
      { lower_usd: 0, higher_usd: 50, payout_usd: 0 },
      { lower_usd: 50, higher_usd: 1_000_000, payout_usd: 1 },
    ],
    name: 'AUDIT call (future)',
  });
  const digA = await signDeposit(A);
  log(`   deposit digest: ${digA}`);
  const confA = await api('/api/sim/confirm', 'POST', { sim_id: A.sim_id, digest: digA });
  check('buy: real deposit confirms → open', confA.status === 200 && confA.json?.status === 'open',
    `status=${confA.status} pos=${confA.json?.status}`);

  // ───────── GUARD A: early-settle blocked ─────────
  log('\n2. GUARD — settle BEFORE expiry must be blocked');
  const earlyA = await api('/api/sim/settle', 'POST', { sim_id: A.sim_id });
  check('early-settle blocked (400 + "not yet at expiry")',
    earlyA.status === 400 && /not yet at expiry|until expiry/i.test(earlyA.json?.error || ''),
    `status=${earlyA.status} err="${earlyA.json?.error}"`);

  // ───────── GUARD B: forged digest rejected ─────────
  log('\n3. GUARD — /confirm with a FORGED digest must be rejected');
  const B = await openPosition({
    product: 'option', premium: 0.5, maxPayout: 1, forward: 100, expiryMs: now + 3_600_000,
    bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1 }], name: 'AUDIT forged-digest',
  });
  const forged = '0x' + 'de'.repeat(32);
  const confB = await api('/api/sim/confirm', 'POST', { sim_id: B.sim_id, digest: forged });
  check('forged digest rejected (no on-chain tx)',
    confB.status === 400 && /did not resolve|successful on-chain|required/i.test(confB.json?.error || ''),
    `status=${confB.status} err="${confB.json?.error}"`);

  // ───────── GUARD C: cross-position replay rejected ─────────
  log('\n4. GUARD — /confirm reusing ANOTHER position\'s real deposit must be rejected');
  const C = await openPosition({
    product: 'option', premium: 0.5, maxPayout: 1, forward: 100, expiryMs: now + 3_600_000,
    bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1 }], name: 'AUDIT replay',
  });
  // reuse A's real deposit digest for position C (different label) → must mismatch
  const confC = await api('/api/sim/confirm', 'POST', { sim_id: C.sim_id, digest: digA });
  check('cross-position digest reuse rejected (label mismatch)',
    confC.status === 400 && /label mismatch|does not match this position/i.test(confC.json?.error || ''),
    `status=${confC.status} err="${confC.json?.error}"`);

  // ───────── 5. SELL — settle a real option at expiry ─────────
  log('\n5. SELL — option, premium $0.50, ALREADY expired, forward in $1 band → expect payoff $1');
  // Open NEAR-FUTURE (the open-guard now correctly rejects already-expired opens),
  // then wait it out before settling.
  const expiryD = Date.now() + 6000;
  const D = await openPosition({
    product: 'option', premium: 0.5, maxPayout: 1, forward: 100, expiryMs: expiryD,
    bands: [
      { lower_usd: 0, higher_usd: 50, payout_usd: 0 },
      { lower_usd: 50, higher_usd: 1_000_000, payout_usd: 1 },
    ],
    name: 'AUDIT call (ITM at expiry)',
  });
  const digD = await signDeposit(D);
  const confD = await api('/api/sim/confirm', 'POST', { sim_id: D.sim_id, digest: digD });
  check('sell-setup: deposit confirms', confD.status === 200 && confD.json?.status === 'open');
  while (Date.now() < expiryD + 1000) await new Promise((r) => setTimeout(r, 500));
  const preSettle = await musdcBalance(owner);
  const settleD = await api('/api/sim/settle', 'POST', { sim_id: D.sim_id });
  check('settle at expiry succeeds', settleD.status === 200, `status=${settleD.status}`);
  check('payoff = $1.00 (forward in band)', Math.abs((settleD.json?.payoff_usd ?? 0) - 1) < 1e-6,
    `payoff=${settleD.json?.payoff_usd}`);
  check('P&L = +$0.50 (payoff − premium)', Math.abs((settleD.json?.pnl_usd ?? 0) - 0.5) < 1e-6,
    `pnl=${settleD.json?.pnl_usd}`);
  // confirm the mint actually landed on-chain
  await new Promise((r) => setTimeout(r, 2500));
  const postSettle = await musdcBalance(owner);
  check('payoff actually minted on-chain (+~$1 mUSDC)', postSettle - preSettle > 0.9,
    `Δ=${(postSettle - preSettle).toFixed(4)} mUSDC`);

  // ───────── GUARD E: double-settle idempotent ─────────
  log('\n6. GUARD — double-settle must NOT mint twice');
  const preDouble = await musdcBalance(owner);
  const settleD2 = await api('/api/sim/settle', 'POST', { sim_id: D.sim_id });
  await new Promise((r) => setTimeout(r, 2000));
  const postDouble = await musdcBalance(owner);
  check('double-settle idempotent (replays booked result, no 2nd mint)',
    settleD2.status === 200 && postDouble - preDouble < 0.001,
    `status=${settleD2.status} Δ=${(postDouble - preDouble).toFixed(4)}`);

  // ───────── GUARD D: no infinite mint — overstated payoff REJECTED AT OPEN ─────────
  // (Hardened this session: the open-guard caps max_payout at premium×50, blocking the
  // inflation BEFORE any deposit — stronger than the old settle-time cap.)
  log('\n7. GUARD — overstated payoff rejected at open (premium×50 cap)');
  const capRej = await api('/api/sim/open/prepare', 'POST', {
    owner, product: 'dist', name: 'AUDIT cap', premium_usd: 0.5, max_payout_usd: 1e12,
    forward_usd: 100, expiry_ms: now + 3_600_000,
    bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1e12 }], oracle_id: null,
  });
  check('inflated payoff rejected at open (no infinite mint)',
    capRej.status === 400 && /premium|exceed/i.test(capRej.json?.error || ''),
    `status=${capRej.status} err="${capRej.json?.error}"`);

  // ───────── GUARD F: unknown id ─────────
  log('\n8. GUARD — settle unknown id → 404');
  const unk = await api('/api/sim/settle', 'POST', { sim_id: 'does-not-exist-zzz' });
  check('unknown sim id → 404', unk.status === 404, `status=${unk.status}`);

  // ───────── GUARD G: mm/confirm disabled ─────────
  log('\n9. GUARD — /mm/confirm (off-chain double-spend) disabled → 410');
  const mm = await api('/api/mm/confirm', 'POST', { product_type: 'basket', size_usdc: 100 });
  check('mm/confirm disabled (410)', mm.status === 410 && mm.json?.code === 'MM_FILL_DISABLED',
    `status=${mm.status} code=${mm.json?.code}`);

  const endMusdc = await musdcBalance(owner);
  log(`\n════════ RESULT: ${pass} passed, ${fail} failed ════════`);
  log(`mUSDC start ${startMusdc.toFixed(4)} → end ${endMusdc.toFixed(4)} (net ${(endMusdc - startMusdc).toFixed(4)})`);
  log(`(net reflects: −premiums deposited +payoffs minted, expected ≈ +$0 to +$50 from the cap test)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('AUDIT CRASHED:', e);
  process.exit(2);
});
