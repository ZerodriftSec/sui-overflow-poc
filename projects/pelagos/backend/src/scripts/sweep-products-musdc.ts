/**
 * Comprehensive on-chain product sweep (mUSDC) with the FRESH TEST WALLET.
 * Exercises the VAULT rail (basket buy → redeem) and the PPN rail (open → early
 * redeem gate) end-to-end against the LIVE backend, measuring the real on-chain
 * fees so we can confirm "selling isn't free" and the maturity gate holds.
 *
 * Run: npx tsx --tsconfig ./tsconfig.dev.json src/scripts/sweep-products-musdc.ts
 */
import 'dotenv/config';
import fs from 'fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from '../services/predict/sui';

const BASE =
  process.env.AUDIT_BASE_URL ??
  'https://479e3gd11te3p23d5vp162u354.ingress.h6i-dedicated.eu-se-1.digitalfrontier.so';
const MOCK_USDC_TYPE = process.env.MOCK_USDC_TYPE!;
const W = JSON.parse(fs.readFileSync('/tmp/pelagos-test-wallet.json', 'utf8'));
const signer = Ed25519Keypair.deriveKeypair(W.mnemonic);
const owner = signer.toSuiAddress();
const client = getSuiClient();

let pass = 0, fail = 0;
const log = (...a: unknown[]) => console.log(...a);
function check(n: string, ok: boolean, d = '') { ok ? pass++ : fail++; log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); }

async function api(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function musdc(): Promise<number> {
  const b = await client.getBalance({ owner, coinType: MOCK_USDC_TYPE });
  return Number(b.totalBalance) / 1e6;
}
async function sign(txBytes: string): Promise<string> {
  const tx = Transaction.from(txBytes);
  const r = await client.signAndExecuteTransaction({ transaction: tx, signer, options: { showEffects: true } });
  if (r.effects?.status.status !== 'success') throw new Error(`tx failed: ${JSON.stringify(r.effects?.status)}`);
  await client.waitForTransaction({ digest: r.digest });
  return r.digest;
}

async function main() {
  log(`\n════════ PRODUCT SWEEP (mUSDC) · wallet ${owner.slice(0, 10)}… ════════`);
  log(`SUI gas: ${(Number((await client.getBalance({ owner })).totalBalance) / 1e9).toFixed(3)} | mUSDC: ${(await musdc()).toFixed(4)}\n`);
  const BUNDLE = 'PBU-HIGH-SHORT';

  // ───────── VAULT RAIL: basket buy → redeem ─────────
  log('1. VAULT (basket) BUY → REDEEM, bundle ' + BUNDLE);
  const before = await musdc();
  const dp = await api('/api/deposit/prepare', { bundle_id: BUNDLE, wallet_address: owner, amount_usdc: 10, currency: 'mUSDC' });
  check('deposit/prepare 200', dp.status === 200, `status=${dp.status} ${dp.status !== 200 ? JSON.stringify(dp.json).slice(0, 160) : 'fee=' + (dp.json?.economics?.fee_usdc ?? dp.json?.fee_usdc)}`);
  if (dp.status !== 200) { log('   aborting vault test'); }
  else {
    const depFee = dp.json?.economics?.fee_usdc ?? dp.json?.fee_usdc ?? 0;
    const tokens = dp.json?.economics?.shares ?? dp.json?.tokens_minted ?? dp.json?.total_tokens;
    const digD = await sign(dp.json.tx_bytes);
    log(`   deposit digest ${digD}`);
    const dc = await api('/api/deposit/confirm', { bundle_id: BUNDLE, wallet_address: owner, amount_usdc: 10, signature: digD, fee_usdc: depFee, tokens_minted: tokens, issue_price: dp.json?.economics?.issue_price ?? 1 });
    check('deposit/confirm ok', dc.status === 201 || dc.status === 200, `status=${dc.status}`);
    await new Promise((r) => setTimeout(r, 2500));
    const afterDep = await musdc();
    check('buy: ~10 mUSDC left the wallet', Math.abs((before - afterDep) - 10) < 0.05, `Δ=${(before - afterDep).toFixed(4)} (deposit fee ${Number(depFee).toFixed(4)})`);

    // redeem
    const rp = await api('/api/deposit/redeem/prepare', { bundle_id: BUNDLE, wallet_address: owner });
    check('redeem/prepare 200', rp.status === 200, `status=${rp.status} exit_fee=${rp.json?.exit_fee_usdc}`);
    if (rp.status === 200) {
      const exitFee = rp.json?.exit_fee_usdc ?? 0;
      const digR = await sign(rp.json.tx_bytes);
      log(`   redeem digest ${digR}`);
      const rc = await api('/api/deposit/redeem/confirm', { bundle_id: BUNDLE, wallet_address: owner, signature: digR, currency: 'mUSDC' });
      check('redeem/confirm ok', rc.status === 200, `status=${rc.status}`);
      await new Promise((r) => setTimeout(r, 2500));
      const afterRed = await musdc();
      const proceeds = afterRed - afterDep;
      check('sell: proceeds returned, net of fee (not free)', proceeds > 9 && proceeds < 10, `got ${proceeds.toFixed(4)} mUSDC back (exit fee quoted ${Number(exitFee).toFixed(4)})`);
      const roundTrip = before - afterRed;
      check('round-trip cost = deposit+redeem fees (~0.5%)', roundTrip > 0.01 && roundTrip < 0.2, `round-trip lost ${roundTrip.toFixed(4)} mUSDC on 10`);
    }
  }

  // ───────── PPN RAIL: open → early-redeem gate ─────────
  log('\n2. PPN open → early-redeem maturity gate');
  const pp = await api('/api/ppn/onchain/prepare', { bundle_id: BUNDLE, wallet_address: owner, amount_usdc: 10, floor: 0.9, tenor: '1D', currency: 'mUSDC' });
  check('ppn/prepare 200', pp.status === 200, `status=${pp.status} ${pp.status !== 200 ? JSON.stringify(pp.json).slice(0, 140) : ''}`);
  if (pp.status === 200 && pp.json?.tx_bytes) {
    const digP = await sign(pp.json.tx_bytes);
    log(`   ppn open digest ${digP}`);
    const pc = await api('/api/ppn/onchain/confirm', { vault_id: pp.json?.vault_id, bundle_id: BUNDLE, wallet_address: owner, amount_usdc: 10, signature: digP });
    check('ppn/confirm ok', pc.status === 200 || pc.status === 201, `status=${pc.status}`);
    const pr = await api('/api/ppn/onchain/redeem/prepare', { bundle_id: BUNDLE, wallet_address: owner });
    check('ppn early-redeem BLOCKED by maturity gate', pr.status === 403, `status=${pr.status} ${JSON.stringify(pr.json).slice(0, 120)}`);
  }

  log(`\n════════ SWEEP RESULT: ${pass} passed, ${fail} failed ════════`);
  log(`final mUSDC: ${(await musdc()).toFixed(4)}\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('SWEEP CRASHED:', e); process.exit(2); });
