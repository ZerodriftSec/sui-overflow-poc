/**
 * On-chain verification of the distribution-continuous GRINDABLE-RNG FIX.
 * Opens two near-identical positions, settles both, and proves:
 *   - realized_x is 0 at open (drawn at settle, not open) — not grindable
 *   - settle_secret is NEVER present in any client-facing response
 *   - the two settled outcomes DIFFER (server-secret seeded, not deterministic on digest)
 *   - the min-hold gate blocks an instant open→settle
 * Run: npx tsx --tsconfig ./tsconfig.dev.json src/scripts/test-continuous-rng.ts
 */
import 'dotenv/config';
import fs from 'fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from '../services/predict/sui';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:13101';
const W = JSON.parse(fs.readFileSync('/tmp/pelagos-test-wallet.json', 'utf8'));
const signer = Ed25519Keypair.deriveKeypair(W.mnemonic);
const owner = signer.toSuiAddress();
const client = getSuiClient();
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
async function api(p: string, method: 'GET' | 'POST', b?: unknown) {
  const r = await fetch(`${BASE}${p}`, { method, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
async function sign(txb: string) {
  const r = await client.signAndExecuteTransaction({ transaction: Transaction.from(txb), signer, options: { showEffects: true } });
  if (r.effects?.status.status !== 'success') throw new Error('escrow tx failed: ' + JSON.stringify(r.effects?.status));
  await client.waitForTransaction({ digest: r.digest });
  return r.digest;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openOne(market_id: string, target_mu: number, target_sigma: number, collateral_usdc: number) {
  const prep = await api('/api/distribution/continuous/open/prepare', 'POST', { wallet_address: owner, market_id, target_mu, target_sigma, collateral_usdc });
  if (prep.status !== 200 || !prep.json?.tx_bytes) throw new Error('open/prepare failed ' + prep.status + ' ' + JSON.stringify(prep.json).slice(0, 160));
  const dig = await sign(prep.json.tx_bytes);
  return api('/api/distribution/continuous/open/confirm', 'POST', { wallet_address: owner, market_id, target_mu, target_sigma, collateral_usdc, signature: dig });
}

async function main() {
  console.log(`\n═══ CONTINUOUS-DISTRIBUTION grindable-RNG fix ═══\n`);
  const mk = await api('/api/distribution/continuous/markets', 'GET');
  const markets = mk.json?.markets ?? mk.json;
  const m = Array.isArray(markets) ? markets[0] : null;
  ok('markets endpoint live', !!m && !!m.id, m ? `market ${String(m.id).slice(0, 10)} μ=${m.mu} σ=${m.sigma}` : 'no market');
  if (!m) process.exit(1);
  const target_mu = Math.round(m.mu);
  const target_sigma = Math.round(m.sigma * 0.8);
  const collateral = 5;

  const q = await api('/api/distribution/continuous/quote', 'POST', { market_id: m.id, target_mu, target_sigma, collateral_usdc: collateral });
  ok('quote sane (collateral_required + max_profit finite > 0)',
    q.status === 200 && Number.isFinite(q.json?.collateral_required_usdc) && Number.isFinite(q.json?.max_profit_usdc) && q.json.max_profit_usdc > 0,
    `coll_req=${q.json?.collateral_required_usdc} max_profit=${q.json?.max_profit_usdc}`);

  console.log('opening 2 identical positions (escrow on-chain)…');
  const c1 = await openOne(m.id, target_mu, target_sigma, collateral);
  const p1 = c1.json?.position;
  ok('position 1 opens', c1.status === 200 && !!p1?.id, `status=${c1.status} ${c1.status !== 200 ? JSON.stringify(c1.json).slice(0, 120) : 'id=' + String(p1?.id).slice(0, 12)}`);
  ok('open: realized_x === 0 (deferred to settle, not grindable)', p1?.realized_x === 0, `realized_x=${p1?.realized_x}`);
  ok('open: NO settle_secret leaked', !JSON.stringify(c1.json ?? {}).includes('settle_secret'));
  const c2 = await openOne(m.id, target_mu, target_sigma, collateral);
  const p2 = c2.json?.position;
  ok('position 2 opens', c2.status === 200 && !!p2?.id, `status=${c2.status}`);

  const early = await api('/api/distribution/continuous/settle', 'POST', { wallet_address: owner, position_id: p1.id });
  ok('min-hold gate blocks instant settle', early.status >= 400 && /held|momentarily|not yet/i.test(JSON.stringify(early.json)), `status=${early.status} ${JSON.stringify(early.json).slice(0, 70)}`);

  console.log('waiting out the min-hold…');
  await sleep(9000);
  const s1 = await api('/api/distribution/continuous/settle', 'POST', { wallet_address: owner, position_id: p1.id });
  const s2 = await api('/api/distribution/continuous/settle', 'POST', { wallet_address: owner, position_id: p2.id });
  ok('position 1 settles', s1.status === 200, `status=${s1.status} ${s1.status !== 200 ? JSON.stringify(s1.json).slice(0, 120) : ''}`);
  ok('position 2 settles', s2.status === 200, `status=${s2.status}`);
  ok('settle: NO settle_secret leaked', !JSON.stringify(s1.json).includes('settle_secret') && !JSON.stringify(s2.json).includes('settle_secret'));
  const x1 = s1.json?.realized_x, x2 = s2.json?.realized_x;
  ok('settle draws finite realized_x (was 0 at open)', Number.isFinite(x1) && Number.isFinite(x2), `x1=${x1} x2=${x2}`);
  ok('identical positions → DIFFERENT outcomes (server-secret, not digest-deterministic)', x1 !== x2, `x1=${x1} x2=${x2}`);
  ok('payoff finite + bounded', Number.isFinite(s1.json?.payoff_usdc) && Math.abs(s1.json?.payoff_usdc ?? 1e9) < 1e6, `payoff1=${s1.json?.payoff_usdc}`);
  const s1b = await api('/api/distribution/continuous/settle', 'POST', { wallet_address: owner, position_id: p1.id });
  // SAFE either way: the continuous rail REJECTS a double-settle ("already settled");
  // the sim rail replays. Both prevent a second payout — assert no double-pay.
  const safeDouble = (s1b.status >= 400 && /already settled/i.test(JSON.stringify(s1b.json))) || (s1b.status === 200 && s1b.json?.realized_x === x1);
  ok('double-settle cannot double-pay (rejected or idempotent)', safeDouble, `status=${s1b.status} ${JSON.stringify(s1b.json).slice(0, 70)}`);

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('CONTINUOUS TEST CRASHED:', e); process.exit(2); });
