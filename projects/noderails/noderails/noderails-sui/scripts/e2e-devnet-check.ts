/**
 * Devnet E2E checklist validator — run after `pnpm deploy:sui:devnet`.
 * Verifies publish output shape and documents regression steps for EVM/Solana.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLISHED = resolve(ROOT, 'deployData/published.json');

interface PublishedShape {
  network: string;
  escrowPackageId: string | null;
  merchantManagerPackageId: string | null;
  escrowConfigObjectId: string | null;
  paymentRegistryObjectId: string | null;
  merchantManagerConfigObjectId: string | null;
}

async function main() {
  const raw = await readFile(PUBLISHED, 'utf8');
  const data = JSON.parse(raw) as PublishedShape;
  const required: (keyof PublishedShape)[] = [
    'escrowPackageId',
    'merchantManagerPackageId',
    'escrowConfigObjectId',
    'paymentRegistryObjectId',
    'merchantManagerConfigObjectId',
  ];
  const missing = required.filter((k) => !data[k]?.trim());
  if (missing.length > 0) {
    console.error('E2E blocked: published.json missing fields:', missing.join(', '));
    console.error('Run: pnpm deploy:sui:devnet with Sui CLI configured.');
    process.exit(1);
  }
  console.log('✓ published.json complete for', data.network);
  console.log('\nManual E2E (devnet):');
  console.log('  1. Admin: register SupportedChain chainId=201 with package + object IDs');
  console.log('  2. setup-cli: SUI_DEPLOYMENTS + Indexer sui manifest');
  console.log('  3. Checkout: Sui wallet → capture native SUI → indexer PaymentCaptured');
  console.log('  4. Wait settlement timelock → PaymentSettled webhook');
  console.log('  5. Refund / dispute / merchant payout paths');
  console.log('  6. Regression: EVM Sepolia + Solana devnet checkout unchanged');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
