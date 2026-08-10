/**
 * On-chain dUSDC (DeepBook Predict) end-to-end: ensure a BalanceManager, open a
 * real range strip funded in dUSDC, confirm it. Verifies the dUSDC settlement rail
 * (distinct from the mUSDC sim rail) actually works on-chain against the live BE.
 * Run: npx tsx --tsconfig ./tsconfig.dev.json src/scripts/test-dusdc.ts
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
  if (r.effects?.status.status !== 'success') throw new Error('tx failed: ' + JSON.stringify(r.effects?.status));
  await client.waitForTransaction({ digest: r.digest });
  return r.digest;
}

async function main() {
  console.log(`\n═══ dUSDC (DeepBook Predict) on-chain trade ═══\n`);
  const bal = await api(`/api/dev/dusdc-balance/${owner}`, 'GET');
  ok('dUSDC balance available', Number(bal.json?.dusdc) > 2, `dUSDC=${bal.json?.dusdc}`);

  // 1) pick a live oracle + a tradeable ATM-ish strike from the chain
  const chain = await api('/api/options/chain?underlying=BTC', 'GET');
  const exps = chain.json?.expiries ?? [];
  const exp = exps[2] ?? exps[0];
  ok('live chain → oracle/expiry', !!exp?.oracle_id, exp ? `oracle ${String(exp.oracle_id).slice(0, 10)} ${exp.tenor_label}` : 'none');
  if (!exp) process.exit(1);
  const tradeable = (exp.strikes ?? []).filter((s: any) => s.call?.tradeable && s.call?.lower_strike && s.call?.higher_strike);
  const strike = tradeable[Math.floor(tradeable.length / 2)] ?? tradeable[0];
  ok('tradeable strike with range bounds', !!strike, strike ? `K=${strike.strike} ask=${strike.call.ask}` : 'none');
  if (!strike) process.exit(1);

  // 2) ensure a BalanceManager
  let managerId: string | null = null;
  const mgrs = await api(`/api/predict/managers?owner=${owner}`, 'GET');
  managerId = (mgrs.json?.[0]?.manager_id) ?? (Array.isArray(mgrs.json?.managers) ? mgrs.json.managers[0]?.manager_id : null);
  if (!managerId) {
    console.log('no manager → creating one…');
    const mp = await api('/api/predict/manager/prepare', 'POST', { owner });
    ok('manager/prepare 200', mp.status === 200 && !!mp.json?.tx_bytes, `status=${mp.status}`);
    const mdig = await sign(mp.json.tx_bytes);
    const mc = await api('/api/predict/confirm', 'POST', { digest: mdig });
    managerId = mc.json?.created_manager_id ?? null;
    ok('manager confirmed + id returned', !!managerId, `manager=${String(managerId).slice(0, 12)}`);
  } else {
    ok('reusing existing manager', true, String(managerId).slice(0, 12));
  }
  if (!managerId) process.exit(1);

  // 3) open a 1-contract dUSDC range strip on that strike
  const qtyRaw = String(1_000_000);
  const depositRaw = String(Math.ceil(Number(strike.call.ask) * 1.25 * 1_000_000) + 1_000_000);
  const op = await api('/api/predict/strip/open/prepare', 'POST', {
    owner, manager_id: managerId, oracle_id: exp.oracle_id, expiry: String(exp.expiry),
    buckets: [{ lower: strike.call.lower_strike, higher: strike.call.higher_strike, quantity: qtyRaw }],
    deposit_amount_raw: depositRaw,
  });
  ok('strip/open/prepare 200 + tx_bytes + bucket_count', op.status === 200 && !!op.json?.tx_bytes && op.json?.bucket_count >= 1,
    `status=${op.status} buckets=${op.json?.bucket_count} ${op.status !== 200 ? JSON.stringify(op.json).slice(0, 120) : ''}`);
  if (op.status !== 200 || !op.json?.tx_bytes) { console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`); process.exit(fail === 0 ? 0 : 1); }

  const preDusdc = Number((await api(`/api/dev/dusdc-balance/${owner}`, 'GET')).json?.dusdc ?? 0);
  const odig = await sign(op.json.tx_bytes);
  console.log(`   strip open digest ${odig}`);
  const oc = await api('/api/predict/confirm', 'POST', { digest: odig });
  ok('strip open confirms on-chain', oc.status === 200 && (oc.json?.ok || /success/i.test(oc.json?.status || '')), `status=${oc.status} ${JSON.stringify(oc.json).slice(0, 90)}`);
  await new Promise((r) => setTimeout(r, 2500));
  const postDusdc = Number((await api(`/api/dev/dusdc-balance/${owner}`, 'GET')).json?.dusdc ?? 0);
  ok('dUSDC actually spent on the strip (real settlement rail)', preDusdc - postDusdc > 0.5, `Δ=${(preDusdc - postDusdc).toFixed(4)} dUSDC`);

  // 4) the manager now holds the committed dUSDC. A DeepBook Predict range strip
  // rests as a limit order until matched, so /positions stays [] (open_positions:0)
  // until a fill — the committed collateral shows in the manager SUMMARY's
  // trading_balance/account_value, which is the correct invariant to assert.
  const summ = await api(`/api/predict/managers/${managerId}/summary`, 'GET');
  const tradingBal = Number(summ.json?.trading_balance ?? summ.json?.account_value ?? 0);
  ok('manager reflects committed dUSDC (resting range order; /positions is [] until filled)',
    summ.status === 200 && tradingBal > 0, `trading_balance=${tradingBal} open_positions=${summ.json?.open_positions}`);

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('dUSDC TEST CRASHED:', e); process.exit(2); });
