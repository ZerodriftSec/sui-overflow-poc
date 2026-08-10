/**
 * JSON-driven Sui publish + initialize for NodeRails Move packages.
 *
 * Usage:
 *   DEPLOY_CONFIG=./deploy.devnet.json tsx scripts/deploy-from-config.ts
 *   pnpm deploy:devnet
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUI_ROOT = path.resolve(__dirname, '..');

interface DeployConfig {
  network: string;
  chainId: number;
  rpcUrl: string;
  gasBudget: number;
  preDeploy: { build: boolean; test: boolean; publish: boolean };
  escrow: {
    initialize: boolean;
    upgrade?: boolean;
    feeRecipient: string;
    superAdmin: string;
    transactionAuthorities: string[];
    authorizedNoderailsKeys: string[];
  };
  merchantManager: {
    initialize: boolean;
    superAdmin: string;
  };
}

interface PublishedOutput {
  network: string;
  chainId: number;
  escrowPackageId: string | null;
  merchantManagerPackageId: string | null;
  escrowConfigObjectId: string | null;
  paymentRegistryObjectId: string | null;
  walletRegistryObjectId: string | null;
  merchantManagerConfigObjectId: string | null;
  nonceRegistryObjectId: string | null;
  escrowUpgradeCapId: string | null;
  merchantManagerUpgradeCapId: string | null;
  publishedAt: string | null;
}

function loadConfig(): DeployConfig {
  const candidate =
    process.env.DEPLOY_CONFIG?.trim() ||
    process.argv[2]?.trim() ||
    path.join(SUI_ROOT, 'deploy.devnet.json');
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(SUI_ROOT, candidate);
  if (!fs.existsSync(abs)) throw new Error(`Deploy config not found: ${abs}`);
  return JSON.parse(fs.readFileSync(abs, 'utf8')) as DeployConfig;
}

function run(cmd: string, args: string[], cwd: string): void {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function keypairFromSecretBytes(bytes: Uint8Array): Ed25519Keypair {
  if (bytes.length === 33) {
    // Sui keystore format: 1-byte signature-scheme flag + 32-byte seed.
    return Ed25519Keypair.fromSecretKey(bytes.slice(1));
  }
  if (bytes.length === 32) {
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  throw new Error(`Wrong secretKey size. Expected 32 bytes (or 33-byte Sui keystore entry), got ${bytes.length}.`);
}

function resolveKeypair(): Ed25519Keypair {
  const fromEnv = process.env.SUI_DEPLOYER_PRIVATE_KEY?.trim();
  if (fromEnv) {
    if (fromEnv.startsWith('suiprivkey')) {
      return Ed25519Keypair.fromSecretKey(fromEnv);
    }
    const bytes = fromEnv.startsWith('0x')
      ? new Uint8Array(Buffer.from(fromEnv.slice(2), 'hex'))
      : fromBase64(fromEnv);
    return keypairFromSecretBytes(bytes);
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const keyPath = path.join(home, '.sui', 'sui_config', 'sui.keystore');
  if (!fs.existsSync(keyPath)) {
    throw new Error('Set SUI_DEPLOYER_PRIVATE_KEY or configure ~/.sui/sui_config/sui.keystore');
  }
  const keystore = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as string[];
  if (!keystore[0]) throw new Error('Empty Sui keystore');
  const entry = keystore[0];
  if (entry.startsWith('suiprivkey')) {
    return Ed25519Keypair.fromSecretKey(entry);
  }
  return keypairFromSecretBytes(fromBase64(entry));
}

interface SuiPublishResult {
  digest: string;
  effects?: { status: { status: string; error?: string } };
  objectChanges?: Array<{
    type: string;
    packageId?: string;
    objectId?: string;
    objectType?: string;
  }>;
}

function parseSuiCliJson(stdout: string): SuiPublishResult {
  const start = stdout.indexOf('{');
  if (start < 0) {
    throw new Error(`Sui CLI did not return JSON:\n${stdout.slice(0, 800)}`);
  }
  return JSON.parse(stdout.slice(start)) as SuiPublishResult;
}

function loadExistingPublication(
  packageDir: string,
  network: string,
): { packageId: string; upgradeCapId: string | null } | null {
  const publishedToml = path.join(packageDir, 'Published.toml');
  if (!fs.existsSync(publishedToml)) return null;
  const content = fs.readFileSync(publishedToml, 'utf8');
  const section = `[published.${network}]`;
  const idx = content.indexOf(section);
  if (idx < 0) return null;
  const chunk = content.slice(idx);
  const packageId = chunk.match(/published-at\s*=\s*"([^"]+)"/)?.[1];
  const upgradeCapId = chunk.match(/upgrade-capability\s*=\s*"([^"]+)"/)?.[1] ?? null;
  if (!packageId) return null;
  return { packageId, upgradeCapId };
}

function publishPackage(packageDir: string, network: string, gasBudget: number) {
  const relPath = path.relative(SUI_ROOT, packageDir);
  const existing = loadExistingPublication(packageDir, network);
  if (existing) {
    console.log(`Reusing published ${path.basename(packageDir)} on ${network}: ${existing.packageId}`);
    return { ...existing, digest: 'existing' };
  }
  const res = spawnSync(
    'sui',
    ['client', 'publish', '--json', '--gas-budget', String(gasBudget), relPath],
    { cwd: SUI_ROOT, encoding: 'utf8', env: process.env },
  );
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.status !== 0) {
    if (output.includes('already published')) {
      const afterPublish = loadExistingPublication(packageDir, network);
      if (afterPublish) {
        console.log(`Reusing published ${path.basename(packageDir)} on ${network}: ${afterPublish.packageId}`);
        return { ...afterPublish, digest: 'existing' };
      }
    }
    throw new Error(`sui client publish failed for ${relPath}:\n${output.slice(0, 1200)}`);
  }
  const result = parseSuiCliJson(res.stdout ?? '');
  const status = result.effects?.status;
  if (status?.status !== 'success') {
    throw new Error(`Publish failed for ${relPath}: ${status?.error ?? 'unknown on-chain error'}`);
  }
  const packageId = result.objectChanges?.find((c) => c.type === 'published')?.packageId;
  const upgradeCapId =
    result.objectChanges?.find((c) => c.type === 'created' && c.objectType?.includes('UpgradeCap'))?.objectId ??
    null;
  if (!packageId) {
    throw new Error(`Publish succeeded but no packageId in response for ${relPath}`);
  }
  return { packageId, upgradeCapId, digest: result.digest };
}

async function executeTransaction(
  client: SuiClient,
  keypair: Ed25519Keypair,
  buildTx: (tx: Transaction) => void,
  gasBudget: number,
) {
  const tx = new Transaction();
  tx.setSender(keypair.toSuiAddress());
  buildTx(tx);
  tx.setGasBudget(gasBudget);
  const coins = await client.getCoins({ owner: keypair.toSuiAddress(), limit: 1 });
  const gasCoin = coins.data[0];
  if (!gasCoin) throw new Error('No SUI coins available for gas payment');
  tx.setGasPayment([
    { objectId: gasCoin.coinObjectId, version: gasCoin.version, digest: gasCoin.digest },
  ]);
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  const status = result.effects?.status;
  if (status?.status !== 'success') {
    throw new Error(`Transaction failed: ${status?.error ?? 'unknown on-chain error'}`);
  }
  return result;
}

async function initializeEscrow(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  cfg: DeployConfig['escrow'],
  gasBudget: number,
) {
  const result = await executeTransaction(client, keypair, (tx) => {
    tx.moveCall({
      target: `${packageId}::escrow::initialize`,
      arguments: [
        tx.pure.address(cfg.feeRecipient),
        tx.pure.address(cfg.superAdmin),
        tx.pure.vector('address', cfg.transactionAuthorities),
        tx.pure.vector('vector<u8>', cfg.authorizedNoderailsKeys.map((k) => Array.from(fromBase64(k)))),
      ],
    });
  }, gasBudget);
  const created = result.objectChanges?.filter((c) => c.type === 'created') ?? [];
  const configId = created.find((c) => c.objectType?.includes('EscrowConfig'))?.objectId ?? null;
  const registryId = created.find((c) => c.objectType?.includes('PaymentRegistry'))?.objectId ?? null;
  const walletRegistryId = created.find((c) => c.objectType?.includes('WalletRegistry'))?.objectId ?? null;
  return { configId, registryId, walletRegistryId, digest: result.digest };
}

async function initializeWalletRegistry(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  gasBudget: number,
) {
  const result = await executeTransaction(client, keypair, (tx) => {
    tx.moveCall({
      target: `${packageId}::escrow::initialize_wallet_registry`,
      arguments: [],
    });
  }, gasBudget);
  const created = result.objectChanges?.filter((c) => c.type === 'created') ?? [];
  const walletRegistryId = created.find((c) => c.objectType?.includes('WalletRegistry'))?.objectId ?? null;
  return { walletRegistryId, digest: result.digest };
}

async function upgradeEscrowPackage(
  packageDir: string,
  upgradeCapId: string,
  network: string,
  gasBudget: number,
): Promise<{ packageId: string; digest: string }> {
  const relPath = path.relative(SUI_ROOT, packageDir);
  const res = spawnSync(
    'sui',
    [
      'client',
      'upgrade',
      '--upgrade-capability',
      upgradeCapId,
      '--json',
      '--gas-budget',
      String(gasBudget),
      relPath,
    ],
    { cwd: SUI_ROOT, encoding: 'utf8', env: process.env },
  );
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.status !== 0) {
    throw new Error(`sui client upgrade failed:\n${output.slice(0, 1200)}`);
  }
  const result = parseSuiCliJson(res.stdout ?? '');
  const status = result.effects?.status;
  if (status?.status !== 'success') {
    throw new Error(`Upgrade failed: ${status?.error ?? 'unknown on-chain error'}`);
  }
  const packageId = result.objectChanges?.find((c) => c.type === 'published')?.packageId;
  if (!packageId) {
    throw new Error('Upgrade succeeded but no packageId in response');
  }
  console.log(`Upgraded ${path.basename(packageDir)} on ${network}: ${packageId}`);
  return { packageId, digest: result.digest };
}

async function initializeMerchantManager(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  superAdmin: string,
  gasBudget: number,
) {
  const result = await executeTransaction(client, keypair, (tx) => {
    tx.moveCall({
      target: `${packageId}::payout::initialize`,
      arguments: [tx.pure.address(superAdmin)],
    });
  }, gasBudget);
  const created = result.objectChanges?.filter((c) => c.type === 'created') ?? [];
  const configId = created.find((c) => c.objectType?.includes('MerchConfig'))?.objectId ?? null;
  const nonceId = created.find((c) => c.objectType?.includes('NonceRegistry'))?.objectId ?? null;
  return { configId, nonceId, digest: result.digest };
}

async function main() {
  const config = loadConfig();
  run('sui', ['client', 'switch', '--env', config.network], SUI_ROOT);
  const client = new SuiClient({ url: config.rpcUrl || getFullnodeUrl(config.network as 'devnet') });
  const keypair = resolveKeypair();
  console.log('Deployer:', keypair.toSuiAddress());

  if (config.preDeploy.build) {
    run('sui', ['move', 'build', '--path', 'packages/noderails_escrow'], SUI_ROOT);
    run('sui', ['move', 'build', '--path', 'packages/noderails_merchant_manager'], SUI_ROOT);
  }
  if (config.preDeploy.test) {
    run('sui', ['move', 'test', '--path', 'packages/noderails_escrow'], SUI_ROOT);
    run('sui', ['move', 'test', '--path', 'packages/noderails_merchant_manager'], SUI_ROOT);
  }

  const outPath = path.join(SUI_ROOT, 'deployData', 'published.json');
  const out: PublishedOutput = fs.existsSync(outPath)
    ? { ...(JSON.parse(fs.readFileSync(outPath, 'utf8')) as PublishedOutput), network: config.network, chainId: config.chainId }
    : {
        network: config.network,
        chainId: config.chainId,
        escrowPackageId: null,
        merchantManagerPackageId: null,
        escrowConfigObjectId: null,
        paymentRegistryObjectId: null,
        walletRegistryObjectId: null,
        merchantManagerConfigObjectId: null,
        nonceRegistryObjectId: null,
        escrowUpgradeCapId: null,
        merchantManagerUpgradeCapId: null,
        publishedAt: null,
      };

  if (config.preDeploy.publish) {
    console.log('Publishing noderails_escrow...');
    const escrowPub = publishPackage(
      path.join(SUI_ROOT, 'packages/noderails_escrow'),
      config.network,
      config.gasBudget,
    );
    out.escrowPackageId = escrowPub.packageId;
    out.escrowUpgradeCapId = escrowPub.upgradeCapId;
    console.log('Escrow package:', escrowPub.packageId);

    console.log('Publishing noderails_merchant_manager...');
    const mmPub = publishPackage(
      path.join(SUI_ROOT, 'packages/noderails_merchant_manager'),
      config.network,
      config.gasBudget,
    );
    out.merchantManagerPackageId = mmPub.packageId;
    out.merchantManagerUpgradeCapId = mmPub.upgradeCapId;
    console.log('Merchant manager package:', mmPub.packageId);

    if (config.escrow.initialize && out.escrowPackageId && !out.escrowConfigObjectId) {
      const init = await initializeEscrow(client, keypair, out.escrowPackageId, config.escrow, config.gasBudget);
      out.escrowConfigObjectId = init.configId;
      out.paymentRegistryObjectId = init.registryId;
      out.walletRegistryObjectId = init.walletRegistryId;
      console.log('Escrow config:', init.configId, 'registry:', init.registryId, 'walletRegistry:', init.walletRegistryId);
    } else if (out.escrowConfigObjectId) {
      console.log('Escrow already initialized:', out.escrowConfigObjectId);
    }

    if (
      config.escrow.upgrade &&
      out.escrowPackageId &&
      out.escrowUpgradeCapId
    ) {
      const upgraded = await upgradeEscrowPackage(
        path.join(SUI_ROOT, 'packages/noderails_escrow'),
        out.escrowUpgradeCapId,
        config.network,
        config.gasBudget,
      );
      out.escrowPackageId = upgraded.packageId;
      console.log('Escrow package upgraded:', upgraded.packageId);
    }

    if (out.escrowPackageId && !out.walletRegistryObjectId) {
      const walletInit = await initializeWalletRegistry(
        client,
        keypair,
        out.escrowPackageId,
        config.gasBudget,
      );
      out.walletRegistryObjectId = walletInit.walletRegistryId;
      console.log('Wallet registry initialized:', walletInit.walletRegistryId);
    }

    if (config.merchantManager.initialize && out.merchantManagerPackageId && !out.merchantManagerConfigObjectId) {
      const init = await initializeMerchantManager(
        client,
        keypair,
        out.merchantManagerPackageId,
        config.merchantManager.superAdmin,
        config.gasBudget,
      );
      out.merchantManagerConfigObjectId = init.configId;
      out.nonceRegistryObjectId = init.nonceId;
      console.log('Merchant manager config:', init.configId, 'nonce registry:', init.nonceId);
    } else if (out.merchantManagerConfigObjectId) {
      console.log('Merchant manager already initialized:', out.merchantManagerConfigObjectId);
    }

    out.publishedAt = new Date().toISOString();
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
