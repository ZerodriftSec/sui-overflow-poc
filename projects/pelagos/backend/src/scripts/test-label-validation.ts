/**
 * Validate the deposit /confirm label-binding hardening: a REAL successful tx by
 * the wallet that is NOT a vault deposit (no Deposited label) must be REJECTED
 * (400), so it can't be used to fabricate a position/History row for any bundle.
 */
import 'dotenv/config';
import fs from 'fs';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from '../services/predict/sui';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:13101';
const MOCK_USDC_TYPE = process.env.MOCK_USDC_TYPE!;
const W = JSON.parse(fs.readFileSync('/tmp/pelagos-test-wallet.json', 'utf8'));
const signer = Ed25519Keypair.deriveKeypair(W.mnemonic);
const owner = signer.toSuiAddress();
const client = getSuiClient();

async function main() {
  // 1) Make a REAL no-label tx: split 1 mUSDC and send it to self.
  const coins = await client.getCoins({ owner, coinType: MOCK_USDC_TYPE });
  const tx = new Transaction();
  const [c] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [tx.pure.u64(1_000_000)]);
  tx.transferObjects([c], tx.pure.address(owner));
  const r = await client.signAndExecuteTransaction({ transaction: tx, signer, options: { showEffects: true } });
  await client.waitForTransaction({ digest: r.digest });
  console.log('no-label self-transfer digest:', r.digest, r.effects?.status.status);

  // 2) Try to confirm it as a basket deposit → must be rejected (no vault label).
  const res = await fetch(`${BASE}/api/deposit/confirm`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bundle_id: 'PBU-HIGH-SHORT', wallet_address: owner, amount_usdc: 1, signature: r.digest }),
  });
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  const blocked = res.status === 400 && /no vault deposit label|cannot bind/i.test(j?.error || '');
  console.log(`\nconfirm forged (no-label) tx → status ${res.status}: ${JSON.stringify(j).slice(0, 160)}`);
  console.log(blocked ? '✅ PASS — no-label tx rejected (cannot fabricate a position)' : '❌ FAIL — forged tx was NOT rejected');
  process.exit(blocked ? 0 : 1);
}
main().catch((e) => { console.error('CRASH', e); process.exit(2); });
