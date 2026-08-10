/**
 * READ-ONLY on-chain ground-truth check. No writes. Resolves the mock_usdc /
 * vault split-brain question decisively: what coin type is the configured vault
 * actually parameterized for, and where does the real mUSDC liquidity sit.
 */
import 'dotenv/config';
import { getSuiClient, getSigner } from '../services/predict/sui';

const OLD = '0xa630b97e9c5f1cd9804553018c9c14cf38a3ce51c341899ba7bc92a5f7c6a2af::mock_usdc::MOCK_USDC';
const NEW = '0x598434be38a69bf97b70490d320a698445990de38eb36e2f4c9d41dbe1ff3e45::mock_usdc::MOCK_USDC';
const SUI = '0x2::sui::SUI';

const VAULT = process.env.VAULT_OBJECT_ID!;
const ADMIN = process.env.VAULT_ADMIN_CAP_ID!;
const NEW_FAUCET = process.env.MOCK_USDC_FAUCET_ID ?? '0xd1f67a0ec1d4b26631fcd1810f16bbc0fdf88a83cfe04c26ad400566528a07f0';
const TCAP = process.env.MOCK_USDC_TREASURY_CAP_ID!;
const META = process.env.MOCK_USDC_METADATA_ID!;

async function objType(client: any, id: string, label: string) {
  if (!id) { console.log(`  ${label}: (unset)`); return null; }
  try {
    const response = await client.grpc.getObject({ objectId: id, include: { json: true } });
    const o = response.object;
    const owner = o.owner;
    const ownerStr = owner.$kind === 'Shared'
      ? 'SHARED'
      : owner.$kind === 'AddressOwner'
        ? `addr:${owner.AddressOwner.slice(0,10)}…`
        : JSON.stringify(owner);
    console.log(`  ${label} ${id.slice(0,10)}…`);
    console.log(`      type : ${o.type}`);
    console.log(`      owner: ${ownerStr}`);
    const f = o.json as Record<string, unknown> | null;
    if (f) {
      const interesting: Record<string, any> = {};
      for (const k of ['vault_id','admin','total_shares','deposit_fee_bps','redeem_fee_bps']) if (k in f) interesting[k] = f[k];
      if (Object.keys(interesting).length) console.log(`      fields: ${JSON.stringify(interesting)}`);
    }
    return o.type as string;
  } catch (e) { console.log(`  ${label} ${id.slice(0,10)}…: THREW ${e}`); return null; }
}

async function bal(client: any, owner: string, coinType: string, label: string) {
  try {
    const b = await client.getBalance({ owner, coinType });
    const dp = 1e6;
    console.log(`  ${label}: ${(Number(BigInt(b.totalBalance))/dp).toLocaleString()} (${b.coinObjectCount} coins)`);
  } catch (e) { console.log(`  ${label}: ERR ${e}`); }
}

async function main() {
  const client = getSuiClient();
  const signer = getSigner();
  const addr = signer.getPublicKey().toSuiAddress();

  console.log('\n=== SIGNER ===');
  console.log('  address:', addr);
  await bal(client, addr, SUI, 'SUI gas');
  await bal(client, addr, OLD, 'OLD mUSDC (0xa630b97e)');
  await bal(client, addr, NEW, 'NEW mUSDC (0x598434be)');

  console.log('\n=== CONFIGURED VAULT (the decisive check) ===');
  const vt = await objType(client, VAULT, 'Vault      ');
  await objType(client, ADMIN, 'VaultAdmin ');

  console.log('\n=== MOCK_USDC OBJECTS ===');
  await objType(client, NEW_FAUCET, 'NEW Faucet ');
  await objType(client, TCAP, 'TreasuryCap');
  await objType(client, META, 'Metadata   ');

  console.log('\n=== VERDICT ===');
  if (vt?.includes('0xa630b97e') || vt?.includes('a630b97e')) {
    console.log('  Vault is OLD-typed (0xa630b97e). NEW mint (0x598434) CANNOT deposit here → real mismatch.');
    console.log('  OLD-mUSDC balance above tells us if all-OLD path has liquidity.');
  } else if (vt?.includes('0x598434') || vt?.includes('598434')) {
    console.log('  Vault is NEW-typed (0x598434). NO MISMATCH — NEW mint deposits here fine. Do NOT create a new vault.');
  } else {
    console.log('  Vault type did not match either package — inspect the printed type string above.');
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });
