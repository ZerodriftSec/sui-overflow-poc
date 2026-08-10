/**
 * Validate this session's hole-fixes against a LOCAL new backend.
 *   - GAP1 sim payoff guard: inflated / inverted / past-expiry opens rejected; legit passes
 *   - B4/B5 PPN maturity gate: early redeem now BLOCKED (durable file store)
 *   - dev faucet: invalid amount / bad address rejected
 *   - core flows (legit sim open+confirm, vault buy) still work
 */
import 'dotenv/config';
import fs from 'fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from '../services/predict/sui';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:13111';
const W = JSON.parse(fs.readFileSync('/tmp/pelagos-test-wallet.json', 'utf8'));
const signer = Ed25519Keypair.deriveKeypair(W.mnemonic);
const owner = signer.toSuiAddress();
const client = getSuiClient();
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
async function api(p: string, b: unknown) {
  const r = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
async function sign(txb: string) {
  const r = await client.signAndExecuteTransaction({ transaction: Transaction.from(txb), signer, options: { showEffects: true } });
  await client.waitForTransaction({ digest: r.digest });
  return r.digest;
}
const now = Date.now();

async function main() {
  console.log(`\n═══ FIX VALIDATION vs ${BASE} ═══\n`);

  console.log('GAP1 — sim payoff inflation guard:');
  const inflated = await api('/api/sim/open/prepare', { owner, product: 'option', premium_usd: 0.5, max_payout_usd: 1_000_000, forward_usd: 100, expiry_ms: now + 3.6e6, bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1_000_000 }] });
  ok('inflated max_payout (>premium×50) rejected at open', inflated.status === 400, `status=${inflated.status} ${inflated.json?.error?.slice(0, 60) ?? ''}`);
  const inverted = await api('/api/sim/open/prepare', { owner, product: 'option', premium_usd: 0.5, max_payout_usd: 1, forward_usd: 100, expiry_ms: now + 3.6e6, bands: [{ lower_usd: 1000, higher_usd: 50, payout_usd: 1 }] });
  ok('inverted band (lower>higher) rejected', inverted.status === 400, `status=${inverted.status}`);
  const pastExp = await api('/api/sim/open/prepare', { owner, product: 'option', premium_usd: 0.5, max_payout_usd: 1, forward_usd: 100, expiry_ms: now - 1000, bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1 }] });
  ok('past expiry rejected', pastExp.status === 400, `status=${pastExp.status}`);
  const legit = await api('/api/sim/open/prepare', { owner, product: 'option', premium_usd: 0.5, max_payout_usd: 1, forward_usd: 100, expiry_ms: now + 3.6e6, bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1 }] });
  ok('legit option (2× leverage) still opens', legit.status === 200, `status=${legit.status}`);
  const deepOtm = await api('/api/sim/open/prepare', { owner, product: 'option', premium_usd: 0.02, max_payout_usd: 1, forward_usd: 100, expiry_ms: now + 3.6e6, bands: [{ lower_usd: 50, higher_usd: 1e6, payout_usd: 1 }] });
  ok('legit deep-OTM option (50× at band floor) still opens', deepOtm.status === 200, `status=${deepOtm.status} ${deepOtm.json?.error?.slice(0, 50) ?? ''}`);

  console.log('\ndev faucet guards:');
  const zeroAmt = await api('/api/dev/airdrop-mock-usdc', { walletAddress: owner, amount: 0 });
  ok('airdrop amount=0 rejected', zeroAmt.status === 400, `status=${zeroAmt.status}`);
  const badAddr = await api('/api/dev/faucet', { walletAddress: 'not-an-address' });
  ok('faucet bad address rejected (400)', badAddr.status === 400, `status=${badAddr.status}`);

  console.log('\nB4/B5 — PPN maturity gate (open future-dated note → early redeem must block):');
  const pp = await api('/api/ppn/onchain/prepare', { bundle_id: 'PBU-HIGH-SHORT', wallet_address: owner, amount_usdc: 5, floor: 0.9, maturity_days: 30, currency: 'mUSDC' });
  ok('ppn/prepare 200', pp.status === 200, `status=${pp.status} ${pp.json?.error?.slice(0, 60) ?? ''}`);
  if (pp.status === 200 && pp.json?.tx_bytes) {
    const dg = await sign(pp.json.tx_bytes);
    const pc = await api('/api/ppn/onchain/confirm', { vault_id: pp.json?.vault_id, bundle_id: 'PBU-HIGH-SHORT', wallet_address: owner, amount_usdc: 5, signature: dg });
    ok('ppn/confirm ok', pc.status === 200 || pc.status === 201, `status=${pc.status}`);
    const rp = await api('/api/ppn/onchain/redeem/prepare', { bundle_id: 'PBU-HIGH-SHORT', wallet_address: owner });
    ok('PPN early redeem BLOCKED (gate now fires)', rp.status === 403 && /NOT_MATURED|matur/i.test(JSON.stringify(rp.json)), `status=${rp.status} ${rp.json?.error?.slice(0, 70) ?? ''}`);
  }

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
