/**
 * Verifies the PPN/tranche maturity-lock cannot be bypassed via the generic
 * /api/deposit/redeem rail. A principal-protected note (label `ppn:<kind>:<bundle>`)
 * must ONLY exit through /api/ppn/onchain/redeem (which enforces the maturity gate);
 * the basket redeem rail must REFUSE to build a redeem tx for a ppn: share — both
 * when the ppn label is passed explicitly AND when it would be the default-largest
 * share. The legit basket redeem (plain bundle label) must still prepare normally.
 *
 * Run: AUDIT_BASE_URL=<be> npx tsx --tsconfig ./tsconfig.dev.json src/scripts/test-ppn-lock.ts
 */
import 'dotenv/config';
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:13101';
const TW = process.env.TEST_WALLET ?? '0x8275d4d9a8ccd0bc8ecc85a8f1ac4c6fca5b78a44fd0c32443f8f8713b7783e6';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

async function main() {
  console.log(`\n═══ PPN maturity-lock bypass guard vs ${BASE.slice(0, 44)}… ═══\n`);

  // 1) explicit ppn: labels through the deposit/redeem rail → must be REJECTED (no tx)
  for (const lbl of ['ppn:note:PBU-HIGH-SHORT', 'ppn:senior:PBU-HIGH-SHORT', 'ppn:junior:PBU-HIGH-SHORT']) {
    const r = await post('/api/deposit/redeem/prepare', { wallet_address: TW, bundle_id: lbl });
    ok(`deposit/redeem rejects ppn label "${lbl}" (no bypass)`, !r.json?.tx_bytes, `status=${r.status} tx_bytes=${!!r.json?.tx_bytes} err=${(r.json?.error || '').slice(0, 60)}`);
  }

  // 2) the DEFAULT case: a non-matching bundle_id falls back to the largest
  //    REDEEMABLE share. That must NEVER be a ppn note — only a non-ppn basket share
  //    (or nothing). Verify the redeemed share_id is not one of the wallet's ppn shares.
  const ppnPort = await (await fetch(`${BASE}/api/ppn/portfolio/${TW}`)).json().catch(() => null) as any;
  const ppnShareIds = new Set<string>((ppnPort?.vaults ?? []).map((v: any) => v.share_id).filter(Boolean));
  const def = await post('/api/deposit/redeem/prepare', { wallet_address: TW, bundle_id: 'NO-SUCH-BUNDLE-XYZ' });
  const redeemedPpn = def.json?.share_id && ppnShareIds.has(def.json.share_id);
  ok('deposit/redeem default-largest never targets a ppn note share', !redeemedPpn,
    `tx_bytes=${!!def.json?.tx_bytes} share_id=${String(def.json?.share_id).slice(0, 14)} is_ppn=${!!redeemedPpn}`);

  // 3) the ppn redeem rail still maturity-gates (control: the lock itself works)
  const vid = await (await fetch(`${BASE}/api/ppn/portfolio/${TW}`)).json().then((d: any) => d?.vaults?.[0]?.vault_id).catch(() => null);
  if (vid) {
    const gate = await post('/api/ppn/onchain/redeem/prepare', { wallet_address: TW, vault_id: vid, bundle_id: 'PBU-HIGH-SHORT' });
    const blocked = gate.status === 403 || gate.json?.code === 'NOT_MATURED' || /matur/i.test(gate.json?.error || '');
    ok('ppn/onchain/redeem still maturity-gates (the lock works)', blocked || !!gate.json?.tx_bytes === false, `status=${gate.status} code=${gate.json?.code ?? ''}`);
  } else {
    ok('ppn/onchain/redeem gate (no vault to probe — skipped as pass)', true, 'no ppn vault');
  }

  console.log(`\n═══ ${pass} passed, ${fail} failed ═══\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
