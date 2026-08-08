/**
 * Create (or reuse) a FRESH testnet wallet and fund it with SUI gas + mUSDC, so
 * we can drive real wallet-signed trades (Slush import via mnemonic + programmatic
 * signing) without ever touching the operator or the user's real wallet.
 *
 * Persists to /tmp/pelagos-test-wallet.json: { mnemonic, suiprivkey, address }.
 * Run: npx tsx --tsconfig ./tsconfig.dev.json src/scripts/fund-test-wallet.ts
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { getSuiClient } from '../services/predict/sui';

const WALLET_FILE = '/tmp/pelagos-test-wallet.json';
const LIVE =
  process.env.AUDIT_BASE_URL ??
  'https://479e3gd11te3p23d5vp162u354.ingress.h6i-dedicated.eu-se-1.digitalfrontier.so';
const MOCK_USDC_TYPE = process.env.MOCK_USDC_TYPE!;

async function loadOrCreate(): Promise<{ mnemonic: string; suiprivkey: string; address: string }> {
  try {
    const raw = await fs.readFile(WALLET_FILE, 'utf8');
    const w = JSON.parse(raw);
    if (w.address && w.mnemonic) {
      console.log('reusing existing test wallet:', w.address);
      return w;
    }
  } catch {
    /* create fresh */
  }
  const mnemonic = generateMnemonic(wordlist, 128);
  const kp = Ed25519Keypair.deriveKeypair(mnemonic);
  const w = { mnemonic, suiprivkey: kp.getSecretKey(), address: kp.toSuiAddress() };
  await fs.writeFile(WALLET_FILE, JSON.stringify(w, null, 2));
  console.log('created fresh test wallet:', w.address);
  return w;
}

async function musdc(client: ReturnType<typeof getSuiClient>, addr: string): Promise<number> {
  const b = await client.getBalance({ owner: addr, coinType: MOCK_USDC_TYPE });
  return Number(b.totalBalance) / 1e6;
}

async function main() {
  const client = getSuiClient();
  const w = await loadOrCreate();

  // --- SUI gas via testnet faucet (idempotent; skip if already funded) ---
  let sui = Number((await client.getBalance({ owner: w.address })).totalBalance) / 1e9;
  if (sui < 0.5) {
    console.log('requesting SUI from testnet faucet…');
    try {
      await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: w.address });
    } catch (e) {
      console.log('  faucet v2 error (may be rate-limited):', (e as Error).message);
    }
    // poll for arrival
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      sui = Number((await client.getBalance({ owner: w.address })).totalBalance) / 1e9;
      if (sui >= 0.5) break;
    }
  }
  console.log('SUI gas:', sui.toFixed(4));

  // --- mUSDC via the live dev airdrop (capped at 1M server-side) ---
  let m = await musdc(client, w.address);
  if (m < 100) {
    console.log('airdropping mUSDC from live backend…');
    const res = await fetch(`${LIVE}/api/dev/airdrop-mock-usdc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: w.address, address: w.address, amount: 5000 }),
    });
    console.log('  airdrop status:', res.status, JSON.stringify(await res.json().catch(() => null)));
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      m = await musdc(client, w.address);
      if (m >= 100) break;
    }
  }
  console.log('mUSDC:', m.toFixed(4));

  console.log('\n=== TEST WALLET READY ===');
  console.log('address  :', w.address);
  console.log('mnemonic :', w.mnemonic, '  (for Slush import)');
  console.log('SUI      :', sui.toFixed(4), '| mUSDC:', m.toFixed(4));
  console.log('saved to :', WALLET_FILE);
  if (sui < 0.1) console.log('\n⚠️  LOW SUI — faucet may be rate-limited; rerun or fund manually.');
  process.exit(0);
}

main().catch((e) => {
  console.error('FUND FAILED:', e);
  process.exit(1);
});
