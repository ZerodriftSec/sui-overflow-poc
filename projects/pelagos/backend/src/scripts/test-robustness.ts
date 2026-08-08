/**
 * Verifies the 11 swarm-found input-validation breaks are closed: malformed/hostile
 * inputs return a clean 4xx (not 500 / not silently accepted), while the HAPPY PATH
 * (canonical 64-hex addresses + positive numbers) still returns 2xx.
 * Run: AUDIT_BASE_URL=<be> npx tsx --tsconfig ./tsconfig.dev.json src/scripts/test-robustness.ts
 */
import 'dotenv/config';
import { toBase64 } from '@mysten/sui/utils';
import { decodeVaultLabel } from '../services/vault';
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:13101';
const VALID = '0xcad0f800f44a48360c01e9fa2d21e779bd829cb60e7220227ed16bb74d4d73e5'; // 64-hex
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
async function code(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<number> {
  const r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}

async function main() {
  console.log(`\n═══ ROBUSTNESS (hostile input → 4xx) vs ${BASE.slice(0, 48)}… ═══\n`);
  const sampleLabel = 'sim:strip:transport-check';
  const labelBytes = Array.from(new TextEncoder().encode(sampleLabel));
  ok('vault label decodes JSON-RPC byte arrays', decodeVaultLabel(labelBytes) === sampleLabel);
  ok('vault label decodes gRPC base64 strings', decodeVaultLabel(toBase64(Uint8Array.from(labelBytes))) === sampleLabel);

  console.log('ROOT A — malformed Sui address → 400 (was 500):');
  for (const bad of ['0xabc', '0x1234', '0x1', '0xINVALID', 'not-an-address']) {
    ok(`deposit/prepare addr "${bad}" → 4xx`, [400, 422].includes(await code('/api/deposit/prepare', 'POST', { bundle_id: 'PBU-HIGH-SHORT', wallet_address: bad, amount_usdc: 10, currency: 'mUSDC' })));
  }
  ok('deposit/portfolio/0x1234 → 400', (await code('/api/deposit/portfolio/0x1234')) === 400);
  ok('dev/balances/0xabc → 400', (await code('/api/dev/balances/0xabc')) === 400);
  ok('dev/dusdc-balance/0xabc → 4xx (was 500)', [400, 404].includes(await code('/api/dev/dusdc-balance/0xabc')));
  ok('ppn/portfolio/0x123 → 400', (await code('/api/ppn/portfolio/0x123')) === 400);

  console.log('\nROOT B — vol numeric inputs → 400:');
  ok('vol/quote notional_usd=-100 → 400', (await code('/api/vol/quote', 'POST', { strategy: 'strangle', side: 'long', notional_usd: -100 })) === 400);
  ok('vol/quote notional_usd=0 → 400', (await code('/api/vol/quote', 'POST', { strategy: 'strangle', side: 'long', notional_usd: 0 })) === 400);
  ok('vol/quote dust notional_usd=0.001 → 400', (await code('/api/vol/quote', 'POST', { strategy: 'butterfly', side: 'long', notional_usd: 0.001 })) === 400);
  ok('vol/quote position_size_usd=-50 → 400', (await code('/api/vol/quote', 'POST', { strategy: 'straddle', side: 'long', position_size_usd: -50 })) === 400);
  ok('vol/hedge delta_btc=Infinity → 400', (await code('/api/vol/hedge?delta_btc=Infinity')) === 400);

  console.log('\nROOT C — unknown ids → 404/400 (was 500):');
  const fakeMgr = '0x' + '00'.repeat(32);
  ok('predict/managers/<fake>/summary → 4xx', [400, 404].includes(await code(`/api/predict/managers/${fakeMgr}/summary`)));
  ok('predict/managers/<fake>/positions → 4xx', [400, 404].includes(await code(`/api/predict/managers/${fakeMgr}/positions`)));
  ok('predict/vol-surface?strikes=0 → 4xx', [400, 404].includes(await code('/api/predict/vol-surface?strikes=0&underlying=BTC')));

  console.log('\nHAPPY PATH still works (no over-rejection):');
  ok('deposit/prepare VALID 64-hex addr → 200', (await code('/api/deposit/prepare', 'POST', { bundle_id: 'PBU-HIGH-SHORT', wallet_address: VALID, amount_usdc: 10, currency: 'mUSDC' })) === 200);
  const volRes = await fetch(`${BASE}/api/vol/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ strategy: 'straddle', side: 'long', notional_usd: 100 }),
  });
  const volBody = await volRes.json() as { code?: string; strip?: unknown };
  ok(
    'vol quote is live or explicitly upstream-degraded',
    (volRes.status === 200 && volBody.strip !== undefined) ||
      (volRes.status === 503 && volBody.code === 'PREDICT_UNAVAILABLE'),
    `status=${volRes.status} code=${volBody.code ?? 'none'}`,
  );
  const noteSleeveRes = await fetch(`${BASE}/api/vol/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ strategy: 'butterfly', side: 'long', notional_usd: 0.16 }),
  });
  const noteSleeveBody = await noteSleeveRes.json() as { code?: string; strip?: { total_cost_raw?: string; buckets?: Array<{ quantity?: string }> } };
  const noteSleeveLive = noteSleeveRes.status === 200 &&
    BigInt(noteSleeveBody.strip?.total_cost_raw ?? '0') > 0n &&
    (noteSleeveBody.strip?.buckets ?? []).some((b) => BigInt(b.quantity ?? '0') > 0n);
  ok(
    '$0.16 protected-note upside sleeve has live exposure',
    noteSleeveLive || (noteSleeveRes.status === 503 && noteSleeveBody.code === 'PREDICT_UNAVAILABLE'),
    `status=${noteSleeveRes.status} code=${noteSleeveBody.code ?? 'none'}`,
  );
  ok('dev/balances VALID addr → 200', (await code(`/api/dev/balances/${VALID}`)) === 200);
  const optionsRes = await fetch(`${BASE}/api/options/chain?underlying=BTC`);
  const optionsBody = await optionsRes.json() as { code?: string; expiries?: unknown[] };
  ok(
    'options chain is live or explicitly upstream-degraded',
    (optionsRes.status === 200 && Array.isArray(optionsBody.expiries)) ||
      (optionsRes.status === 503 && optionsBody.code === 'PREDICT_UNAVAILABLE'),
    `status=${optionsRes.status} code=${optionsBody.code ?? 'none'}`,
  );

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
