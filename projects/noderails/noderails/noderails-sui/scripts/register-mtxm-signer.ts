/**
 * Register platform signer on EscrowConfig (transaction authority + Ed25519 auth key).
 *
 * Copy deployData/published.example.json → deployData/published.json after publish.
 *
 * Usage:
 *   SUI_DEPLOYER_PRIVATE_KEY=<suiprivkey or base64> \
 *   MTXM_SIGNER_ADDRESS=0x... \
 *   MTXM_SIGNER_PUBKEY_B64=<base64 32-byte pubkey> \
 *   tsx scripts/register-mtxm-signer.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUI_ROOT = path.resolve(__dirname, '..');

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function loadPublished(): {
  escrowPackageId: string;
  escrowConfigObjectId: string;
  network: string;
} {
  const p = path.join(SUI_ROOT, 'deployData/published.json');
  if (!fs.existsSync(p)) {
    throw new Error('Create deployData/published.json from deployData/published.example.json first');
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    escrowPackageId: string;
    escrowConfigObjectId: string;
    network: string;
  };
  if (!raw.escrowPackageId || !raw.escrowConfigObjectId) {
    throw new Error('deployData/published.json missing escrowPackageId or escrowConfigObjectId');
  }
  return raw;
}

function keypairFromSecretBytes(bytes: Uint8Array): Ed25519Keypair {
  if (bytes.length === 33) return Ed25519Keypair.fromSecretKey(bytes.slice(1));
  if (bytes.length === 32) return Ed25519Keypair.fromSecretKey(bytes);
  throw new Error(`Invalid secret key length: ${bytes.length}`);
}

function resolveKeypair(): Ed25519Keypair {
  const fromEnv = process.env.SUI_DEPLOYER_PRIVATE_KEY?.trim();
  if (!fromEnv) {
    throw new Error('Set SUI_DEPLOYER_PRIVATE_KEY (suiprivkey, hex, or base64)');
  }
  if (fromEnv.startsWith('suiprivkey')) return Ed25519Keypair.fromSecretKey(fromEnv);
  const bytes = fromEnv.startsWith('0x')
    ? new Uint8Array(Buffer.from(fromEnv.slice(2), 'hex'))
    : fromBase64(fromEnv);
  return keypairFromSecretBytes(bytes);
}

function parseListEnv(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const published = loadPublished();
  const rpc =
    published.network === 'mainnet'
      ? getFullnodeUrl('mainnet')
      : published.network === 'testnet'
        ? getFullnodeUrl('testnet')
        : getFullnodeUrl('devnet');
  const client = new SuiClient({ url: rpc });
  const keypair = resolveKeypair();
  const sender = keypair.toSuiAddress();

  const mtxmSignerAddress = requireEnv('MTXM_SIGNER_ADDRESS');
  const mtxmSignerPubkeyB64 = requireEnv('MTXM_SIGNER_PUBKEY_B64');

  const txAuthorities = [...new Set([...parseListEnv('EXISTING_TX_AUTHORITIES'), mtxmSignerAddress])];
  const noderailsKeysB64 = [
    ...new Set([...parseListEnv('EXISTING_NODERAILS_KEYS_B64'), mtxmSignerPubkeyB64]),
  ];
  const noderailsKeyBytes = noderailsKeysB64.map((k) => Array.from(fromBase64(k)));

  console.log('Updating EscrowConfig');
  console.log('  package:', published.escrowPackageId);
  console.log('  config:', published.escrowConfigObjectId);
  console.log('  sender:', sender);

  const tx = new Transaction();
  tx.setSender(sender);
  tx.moveCall({
    target: `${published.escrowPackageId}::admin::set_transaction_authorities`,
    arguments: [tx.object(published.escrowConfigObjectId), tx.pure.vector('address', txAuthorities)],
  });
  tx.moveCall({
    target: `${published.escrowPackageId}::admin::set_authorized_noderails_keys`,
    arguments: [
      tx.object(published.escrowConfigObjectId),
      tx.pure.vector('vector<u8>', noderailsKeyBytes),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`On-chain update failed: ${result.effects?.status?.error ?? 'unknown'}`);
  }

  console.log('Success. Digest:', result.digest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
