/**
 * READ-ONLY: list every VaultAdminCap the signer owns and the vault_id each is
 * bound to. Tells us whether a NEW Vault<MOCK_USDC> has already been created
 * (a second cap besides the stale 0xafe1cf30 one) without doing any write.
 */
import 'dotenv/config';
import { getSuiClient, getSigner } from '../services/predict/sui';

const VAULT_PKG = process.env.VAULT_PACKAGE_ID!;

async function main() {
  const client = getSuiClient();
  const signer = getSigner();
  const addr = signer.getPublicKey().toSuiAddress();
  console.log('signer:', addr);
  console.log('cap type filter:', `${VAULT_PKG}::vault::VaultAdminCap`);

  const page = await client.getOwnedObjects({
    owner: addr,
    filter: { StructType: `${VAULT_PKG}::vault::VaultAdminCap` },
    options: { showContent: true },
  });
  console.log(`\nfound ${page.data.length} VaultAdminCap(s):`);
  for (const o of page.data) {
    const d = o.data;
    const vaultId = (d?.content as any)?.fields?.vault_id;
    console.log(`  cap ${d?.objectId}  ->  vault_id ${vaultId}`);
  }
  if (page.data.length === 0) console.log('  (none — no vault admin caps owned by signer)');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message ?? e); process.exit(1); });
