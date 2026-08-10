/**
 * One-shot: create a NEW `Vault<MOCK_USDC>` parameterized for the CURRENT
 * (NEW, 0x598434) mock_usdc coin, so the configured mint and the vault finally
 * agree on one coin type. Finishes the coin migration Tharun's redeploy started
 * (old vault 0xeb84 was still typed for the retired 0xa630b97e coin).
 *
 * SAFE: does not touch the old vault, the faucet, or any existing coins. It
 * creates one brand-new empty shared object + an admin cap to the signer.
 *
 * Run:  RUN=1 npx tsx --tsconfig ./tsconfig.dev.json src/scripts/create-vault-musdc.ts
 */
import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient, getSigner } from '../services/predict/sui';

const VAULT_PKG = process.env.VAULT_PACKAGE_ID!;
const NEW_USDC = process.env.MOCK_USDC_TYPE!; // 0x598434…::mock_usdc::MOCK_USDC

function short(id: string) { return id ? `${id.slice(0, 10)}…${id.slice(-6)}` : '(none)'; }

async function main() {
  if (process.env.RUN !== '1') {
    throw new Error('Dry guard: re-run with RUN=1 once you have reviewed the plan.');
  }
  const client = getSuiClient();
  const signer = getSigner();
  const addr = signer.getPublicKey().toSuiAddress();

  console.log('=== create Vault<MOCK_USDC> (NEW coin type) ===');
  console.log('  signer     :', addr);
  console.log('  vault pkg  :', VAULT_PKG);
  console.log('  coin type  :', NEW_USDC);
  if (!VAULT_PKG || !NEW_USDC) throw new Error('VAULT_PACKAGE_ID or MOCK_USDC_TYPE unset');

  const tx = new Transaction();
  tx.moveCall({
    target: `${VAULT_PKG}::vault::create_vault`,
    typeArguments: [NEW_USDC],
    arguments: [tx.pure.u64(0), tx.pure.u64(0)], // deposit_fee_bps=0, redeem_fee_bps=0 (clean demo)
  });

  const res: any = await client.signAndExecuteTransaction({ transaction: tx, signer });
  const status = res.effects?.status?.status ?? res.effects?.status ?? 'unknown';
  console.log('\n  digest     :', res.digest);
  console.log('  status     :', JSON.stringify(status));
  if (String(JSON.stringify(status)).toLowerCase().includes('fail') || res.effects?.status?.error) {
    console.log('  error      :', res.effects?.status?.error);
    throw new Error('create_vault failed on-chain');
  }
  await client.waitForTransaction({ digest: res.digest });

  // --- extract the new vault id from the VaultCreated event ---
  const created = (res.events ?? []).find((e: any) => String(e.type).endsWith('::vault::VaultCreated'));
  const newVaultId: string | undefined = created?.parsedJson?.vault_id;

  // --- extract the new admin cap from objectChanges ---
  const changes = res.objectChanges ?? [];
  const adminChange = changes.find((c: any) =>
    c.type === 'created' && String(c.objectType).endsWith('::vault::VaultAdminCap'));
  const vaultChange = changes.find((c: any) =>
    c.type === 'created' && String(c.objectType).includes('::vault::Vault<'));

  console.log('\n=== RESULT ===');
  console.log('  new Vault object   :', newVaultId ?? vaultChange?.objectId ?? '(parse failed — see objectChanges)');
  console.log('  new VaultAdminCap  :', adminChange?.objectId ?? '(parse failed)');
  console.log('  vault type         :', vaultChange?.objectType ?? '(n/a)');
  console.log('  explorer           :', `https://suiscan.xyz/testnet/tx/${res.digest}`);

  if (!newVaultId && !vaultChange) {
    console.log('\n  Could not auto-parse. Full objectChanges:');
    console.log(JSON.stringify(changes, null, 2));
  }

  // --- write the two IDs straight into backend/.env (no manual paste-back) ---
  const finalVault = newVaultId ?? vaultChange?.objectId;
  const finalAdmin = adminChange?.objectId;
  if (finalVault && finalAdmin) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const envPath = path.resolve(process.cwd(), '.env');
    let env = fs.readFileSync(envPath, 'utf8');
    fs.writeFileSync(`${envPath}.bak.${Date.now()}`, env); // timestamped backup
    const setLine = (src: string, key: string, val: string) =>
      new RegExp(`^${key}=.*$`, 'm').test(src)
        ? src.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`)
        : `${src.replace(/\n?$/, '\n')}${key}=${val}\n`;
    env = setLine(env, 'VAULT_OBJECT_ID', finalVault);
    env = setLine(env, 'VAULT_ADMIN_CAP_ID', finalAdmin);
    fs.writeFileSync(envPath, env);
    console.log('\n=== backend/.env UPDATED (backup written alongside) ===');
    console.log(`  VAULT_OBJECT_ID=${finalVault}`);
    console.log(`  VAULT_ADMIN_CAP_ID=${finalAdmin}`);
    console.log('\nNEXT: restart the backend (no-watch) so it reloads .env, then the');
    console.log('mUSDC deposit → settle path is live. Tell Claude "vault created" to finish + verify.');
  } else {
    console.log('\n=== COULD NOT AUTO-PARSE IDS — set manually in backend/.env ===');
    console.log(`  VAULT_OBJECT_ID=${finalVault ?? ''}`);
    console.log(`  VAULT_ADMIN_CAP_ID=${finalAdmin ?? ''}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nFAILED:', e?.message ?? e); process.exit(1); });
