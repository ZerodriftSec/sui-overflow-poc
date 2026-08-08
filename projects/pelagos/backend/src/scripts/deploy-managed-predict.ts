/**
 * Deploy a Pelagos-operated instance of Mysten's official DeepBook Predict
 * testnet contracts, create live BTC oracles, and seed the vault with existing
 * operator dUSDC. The journal makes every external step resumable.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Transaction } from '@mysten/sui/transactions';
import { fetchDeribitSurface, selectTargetExpiries, deriveSvi } from '../services/predict/deribit';
import { addOraclePriceAndSviUpdate } from '../services/predict/feed';
import {
  getManagedDeployment,
  managedManifestPath,
  saveManagedDeployment,
  type ManagedPredictDeployment,
  type ManagedPredictOracle,
} from '../services/predict/config';
import { getSigner, getSuiClient } from '../services/predict/sui';

const SOURCE_REPOSITORY = 'https://github.com/MystenLabs/deepbookv3';
const SOURCE_BRANCH = 'predict-testnet-4-16';
const SOURCE_COMMIT = 'b63a565c6f867103553557912f87ef35574eef42';
const DUSDC_TYPE =
  '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const DUSDC_CURRENCY_ID = '0xf3000dff421833d4bb8ed58fac146d691a3aaba2785aa1989af65a7089ca3e9c';
const CLOCK_ID = '0x6';
const DEFAULT_SEED_RAW = 500_000_000n;
const MIN_STRIKE = 10_000_000_000_000;
const TICK_SIZE = 2_000_000_000;

interface DeploymentJournal {
  version: 1;
  operator: string;
  sourcePath: string;
  selectedExpiries: number[];
  packageId?: string;
  registryId?: string;
  adminCapId?: string;
  upgradeCapId?: string;
  plpTreasuryCapId?: string;
  predictObjectId?: string;
  oracleCapId?: string;
  oracles: ManagedPredictOracle[];
  liquiditySeedRaw: string;
  digests: Record<string, string | string[]>;
}

const sourcePath = path.resolve(
  process.env.PREDICT_MOVE_PACKAGE_PATH ?? path.join(process.cwd(), '..', 'contracts', 'predict'),
);
const journalPath = path.resolve(process.cwd(), 'config', 'predict-deploy.journal.testnet.json');

function writeJournal(journal: DeploymentJournal): void {
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const tmp = `${journalPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, journalPath);
}

function readJournal(): DeploymentJournal | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as DeploymentJournal;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function createdObjects(result: Awaited<ReturnType<ReturnType<typeof getSuiClient>['signAndExecuteTransaction']>>) {
  return (result.objectChanges ?? []).filter((change) => change.type === 'created');
}

function objectIdByType(
  objects: ReturnType<typeof createdObjects>,
  predicate: (type: string) => boolean,
): string {
  const found = objects.find(
    (change) => 'objectType' in change && predicate(String(change.objectType)),
  );
  return found && 'objectId' in found ? found.objectId : '';
}

async function executeStep(name: string, tx: Transaction, gasBudget: number) {
  tx.setGasBudget(gasBudget);
  const client = getSuiClient();
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: getSigner() });
  if (result.effects.status.status !== 'success') {
    throw new Error(`${name} failed: ${result.effects.status.error ?? 'unknown execution failure'}`);
  }
  await client.waitForTransaction({ digest: result.digest, timeout: 60_000 });
  console.log(`${name}: ${result.digest}`);
  return result;
}

function buildPackage(): { modules: string[]; dependencies: string[] } {
  const sui = process.env.SUI_BINARY ?? 'sui';
  const output = execFileSync(
    sui,
    ['move', 'build', '--dump-bytecode-as-base64', '--path', sourcePath],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  return JSON.parse(output) as { modules: string[]; dependencies: string[] };
}

async function publish(journal: DeploymentJournal): Promise<void> {
  if (journal.packageId) return;
  const built = buildPackage();
  const tx = new Transaction();
  const upgradeCap = tx.publish(built);
  tx.transferObjects([upgradeCap], tx.pure.address(journal.operator));
  const result = await executeStep('publish Predict package', tx, 10_000_000_000);
  const created = createdObjects(result);
  const registry = created.find(
    (change) => 'objectType' in change && String(change.objectType).endsWith('::registry::Registry'),
  );
  if (!registry || !('objectId' in registry) || !('objectType' in registry)) {
    throw new Error('Publish succeeded but Registry was not present in object changes');
  }
  const packageId = String(registry.objectType).split('::')[0];
  const adminCapId = objectIdByType(created, (type) => type === `${packageId}::registry::AdminCap`);
  const upgradeCapId = objectIdByType(created, (type) => type.includes('::package::UpgradeCap'));
  const plpTreasuryCapId = objectIdByType(
    created,
    (type) => type.endsWith(`::coin::TreasuryCap<${packageId}::plp::PLP>`),
  );
  if (!adminCapId || !upgradeCapId || !plpTreasuryCapId) {
    throw new Error(
      `Publish outputs incomplete: admin=${adminCapId} upgrade=${upgradeCapId} plp=${plpTreasuryCapId}`,
    );
  }
  Object.assign(journal, {
    packageId,
    registryId: registry.objectId,
    adminCapId,
    upgradeCapId,
    plpTreasuryCapId,
  });
  journal.digests.publish = result.digest;
  writeJournal(journal);
}

async function initializePredict(journal: DeploymentJournal): Promise<void> {
  if (journal.predictObjectId) return;
  const tx = new Transaction();
  tx.moveCall({
    target: `${journal.packageId!}::registry::create_predict`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(journal.registryId!),
      tx.object(journal.adminCapId!),
      tx.object(DUSDC_CURRENCY_ID),
      tx.object(journal.plpTreasuryCapId!),
      tx.object(CLOCK_ID),
    ],
  });
  const result = await executeStep('initialize Predict<DUSDC>', tx, 2_000_000_000);
  const predictObjectId = objectIdByType(
    createdObjects(result),
    (type) => type === `${journal.packageId}::predict::Predict`,
  );
  if (!predictObjectId) throw new Error('Predict initialization returned no shared Predict object');
  journal.predictObjectId = predictObjectId;
  journal.digests.initialize = result.digest;
  writeJournal(journal);
}

async function createOracleCap(journal: DeploymentJournal): Promise<void> {
  if (journal.oracleCapId) return;
  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${journal.packageId!}::registry::create_oracle_cap`,
    arguments: [tx.object(journal.adminCapId!)],
  });
  tx.transferObjects([cap], tx.pure.address(journal.operator));
  const result = await executeStep('create OracleSVICap', tx, 500_000_000);
  const oracleCapId = objectIdByType(
    createdObjects(result),
    (type) => type === `${journal.packageId}::oracle::OracleSVICap`,
  );
  if (!oracleCapId) throw new Error('Oracle cap transaction returned no OracleSVICap');
  journal.oracleCapId = oracleCapId;
  journal.digests.oracle_cap = result.digest;
  writeJournal(journal);
}

async function createOracles(journal: DeploymentJournal): Promise<void> {
  for (const expiry of journal.selectedExpiries) {
    if (journal.oracles.some((oracle) => oracle.expiry === expiry)) continue;
    const tx = new Transaction();
    tx.moveCall({
      target: `${journal.packageId!}::registry::create_oracle`,
      arguments: [
        tx.object(journal.registryId!),
        tx.object(journal.predictObjectId!),
        tx.object(journal.adminCapId!),
        tx.object(journal.oracleCapId!),
        tx.pure.string('BTC'),
        tx.pure.u64(expiry),
        tx.pure.u64(MIN_STRIKE),
        tx.pure.u64(TICK_SIZE),
      ],
    });
    const result = await executeStep(
      `create BTC oracle ${new Date(expiry).toISOString()}`,
      tx,
      50_000_000_000,
    );
    const oracleId = objectIdByType(
      createdObjects(result),
      (type) => type === `${journal.packageId}::oracle::OracleSVI`,
    );
    if (!oracleId) throw new Error(`Oracle creation returned no OracleSVI for ${expiry}`);
    journal.oracles.push({
      oracleId,
      underlyingAsset: 'BTC',
      expiry,
      minStrike: MIN_STRIKE,
      tickSize: TICK_SIZE,
      createdDigest: result.digest,
    });
    const digests = Array.isArray(journal.digests.oracle_create)
      ? journal.digests.oracle_create
      : [];
    journal.digests.oracle_create = [...digests, result.digest];
    writeJournal(journal);
  }
}

async function activateOracles(journal: DeploymentJournal): Promise<void> {
  const surface = await fetchDeribitSurface();
  const digests = Array.isArray(journal.digests.oracle_activate)
    ? [...journal.digests.oracle_activate]
    : [];
  for (const oracle of journal.oracles) {
    const response = await getSuiClient().grpc.getObject({
      objectId: oracle.oracleId,
      include: { json: true },
    });
    const json = (response.object.json ?? {}) as Record<string, unknown>;
    if (json.active === true) continue;
    const market = surface.expiries.find((item) => item.expiry === oracle.expiry);
    if (!market) throw new Error(`Deribit no longer lists ${new Date(oracle.expiry).toISOString()}`);
    const tx = new Transaction();
    tx.moveCall({
      target: `${journal.packageId!}::registry::register_oracle_cap`,
      arguments: [
        tx.object(oracle.oracleId),
        tx.object(journal.adminCapId!),
        tx.object(journal.oracleCapId!),
      ],
    });
    tx.moveCall({
      target: `${journal.packageId!}::oracle::activate`,
      arguments: [tx.object(oracle.oracleId), tx.object(journal.oracleCapId!), tx.object(CLOCK_ID)],
    });
    addOraclePriceAndSviUpdate(tx, {
      packageId: journal.packageId!,
      oracleId: oracle.oracleId,
      capId: journal.oracleCapId!,
      spot: surface.spot,
      forward: market.forward,
      svi: deriveSvi(oracle.expiry, market.atmIv),
    });
    const result = await executeStep(
      `activate BTC oracle ${new Date(oracle.expiry).toISOString()}`,
      tx,
      2_000_000_000,
    );
    digests.push(result.digest);
    journal.digests.oracle_activate = digests;
    writeJournal(journal);
  }
}

async function seedLiquidity(journal: DeploymentJournal): Promise<void> {
  if (journal.digests.liquidity) return;
  const amount = BigInt(journal.liquiditySeedRaw);
  const client = getSuiClient();
  const { data: coins } = await client.getCoins({ owner: journal.operator, coinType: DUSDC_TYPE });
  const total = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
  if (total < amount) throw new Error(`Operator has ${total} raw dUSDC, needs ${amount}`);
  const tx = new Transaction();
  const [primary, ...rest] = coins.map((coin) => coin.coinObjectId);
  if (rest.length > 0) tx.mergeCoins(tx.object(primary), rest.map((id) => tx.object(id)));
  const [deposit] = tx.splitCoins(tx.object(primary), [tx.pure.u64(amount)]);
  const plp = tx.moveCall({
    target: `${journal.packageId!}::predict::supply`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(journal.predictObjectId!), deposit, tx.object(CLOCK_ID)],
  });
  tx.transferObjects([plp], tx.pure.address(journal.operator));
  const result = await executeStep('seed Predict vault liquidity', tx, 2_000_000_000);
  journal.digests.liquidity = result.digest;
  writeJournal(journal);
}

async function main(): Promise<void> {
  if (getManagedDeployment()) {
    throw new Error(`Managed Predict is already configured at ${managedManifestPath}`);
  }
  if (!fs.existsSync(path.join(sourcePath, 'Move.toml'))) {
    throw new Error(`Predict Move package not found at ${sourcePath}`);
  }

  const operator = getSigner().getPublicKey().toSuiAddress();
  const surface = await fetchDeribitSurface();
  const selected = selectTargetExpiries(surface);
  if (selected.length < 4) throw new Error(`Need four Deribit expiries; found ${selected.length}`);
  const seedRaw = BigInt(process.env.PREDICT_LIQUIDITY_SEED_RAW ?? DEFAULT_SEED_RAW);

  const suiBalance = await getSuiClient().getBalance({ owner: operator });
  const dusdcBalance = await getSuiClient().getBalance({ owner: operator, coinType: DUSDC_TYPE });
  if (BigInt(dusdcBalance.totalBalance) < seedRaw) {
    throw new Error(`Insufficient existing dUSDC: ${dusdcBalance.totalBalance} raw, need ${seedRaw}`);
  }
  console.log(`Operator: ${operator}`);
  console.log(`SUI balance: ${suiBalance.totalBalance} MIST`);
  console.log(`dUSDC balance: ${dusdcBalance.totalBalance} raw`);
  console.log(`Move source: ${sourcePath}`);
  console.log(`Expiries: ${selected.map((item) => new Date(item.expiry).toISOString()).join(', ')}`);

  let journal = readJournal();
  if (journal && journal.operator !== operator) {
    throw new Error(`Deployment journal belongs to ${journal.operator}, current signer is ${operator}`);
  }
  journal ??= {
    version: 1,
    operator,
    sourcePath,
    selectedExpiries: selected.map((item) => item.expiry),
    oracles: [],
    liquiditySeedRaw: seedRaw.toString(),
    digests: {},
  };
  writeJournal(journal);

  await publish(journal);
  await initializePredict(journal);
  await createOracleCap(journal);
  await createOracles(journal);
  await activateOracles(journal);
  await seedLiquidity(journal);

  const manifest: ManagedPredictDeployment = {
    version: 1,
    mode: 'managed',
    network: 'testnet',
    deployedAt: new Date().toISOString(),
    operator,
    source: {
      repository: SOURCE_REPOSITORY,
      branch: SOURCE_BRANCH,
      commit: SOURCE_COMMIT,
      packagePath: 'contracts/predict',
    },
    packageId: journal.packageId!,
    registryId: journal.registryId!,
    adminCapId: journal.adminCapId!,
    upgradeCapId: journal.upgradeCapId!,
    predictObjectId: journal.predictObjectId!,
    oracleCapId: journal.oracleCapId!,
    dusdcType: DUSDC_TYPE,
    dusdcCurrencyId: DUSDC_CURRENCY_ID,
    liquiditySeedRaw: journal.liquiditySeedRaw,
    oracles: journal.oracles,
    digests: journal.digests,
  };
  saveManagedDeployment(manifest);
  fs.rmSync(journalPath, { force: true });
  console.log(`Managed deployment manifest: ${managedManifestPath}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error(`Deployment journal retained at ${journalPath}`);
  process.exit(1);
});
