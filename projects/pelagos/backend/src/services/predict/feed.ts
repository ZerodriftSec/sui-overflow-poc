import { Transaction } from '@mysten/sui/transactions';
import {
  PREDICT,
  getManagedDeployment,
  saveManagedDeployment,
  type ManagedPredictOracle,
} from './config';
import {
  deriveSvi,
  fetchDeribitSurface,
  marketForExpiry,
  selectTargetExpiries,
  type DeribitExpirySurface,
  type DeribitSurface,
  type PredictSviParams,
} from './deribit';
import { getSigner, getSuiClient } from './sui';

const FLOAT_SCALING = 1_000_000_000;
const DEFAULT_INTERVAL_MS = 10_000;
const RETRY_INTERVAL_MS = 3_000;
const MAINTENANCE_INTERVAL_MS = 30 * 60 * 1000;
const MIN_ROLLOVER_HORIZON_MS = 36 * 60 * 60 * 1000;

export interface PredictFeedState {
  enabled: boolean;
  running: boolean;
  in_flight: boolean;
  interval_ms: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_digest: string | null;
  last_error: string | null;
  consecutive_failures: number;
  source: 'deribit';
  pushed_oracles: number;
}

const intervalMs = Math.max(
  5_000,
  Number(process.env.PREDICT_FEED_INTERVAL_MS ?? DEFAULT_INTERVAL_MS),
);

const feedState: PredictFeedState = {
  enabled: PREDICT.mode === 'managed' && process.env.PREDICT_FEED_ENABLED !== 'false',
  running: false,
  in_flight: false,
  interval_ms: intervalMs,
  last_attempt_at: null,
  last_success_at: null,
  last_digest: null,
  last_error: null,
  consecutive_failures: 0,
  source: 'deribit',
  pushed_oracles: 0,
};

let timer: NodeJS.Timeout | null = null;
let lastMaintenanceAt = 0;

function scaled(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Cannot scale invalid value ${value}`);
  return BigInt(Math.round(value * FLOAT_SCALING));
}

function addSviValue(
  tx: Transaction,
  packageId: string,
  params: PredictSviParams,
) {
  const rho = tx.moveCall({
    target: `${packageId}::i64::from_parts`,
    arguments: [tx.pure.u64(scaled(Math.abs(params.rho))), tx.pure.bool(params.rho < 0)],
  });
  const m = tx.moveCall({
    target: `${packageId}::i64::from_parts`,
    arguments: [tx.pure.u64(scaled(Math.abs(params.m))), tx.pure.bool(params.m < 0)],
  });
  return tx.moveCall({
    target: `${packageId}::oracle::new_svi_params`,
    arguments: [
      tx.pure.u64(scaled(params.a)),
      tx.pure.u64(scaled(params.b)),
      rho,
      m,
      tx.pure.u64(scaled(params.sigma)),
    ],
  });
}

export function addOraclePriceAndSviUpdate(
  tx: Transaction,
  args: {
    packageId: string;
    oracleId: string;
    capId: string;
    spot: number;
    forward: number;
    svi: PredictSviParams;
  },
): void {
  const prices = tx.moveCall({
    target: `${args.packageId}::oracle::new_price_data`,
    arguments: [tx.pure.u64(scaled(args.spot)), tx.pure.u64(scaled(args.forward))],
  });
  tx.moveCall({
    target: `${args.packageId}::oracle::update_prices`,
    arguments: [tx.object(args.oracleId), tx.object(args.capId), prices, tx.object(PREDICT.clockId)],
  });
  const svi = addSviValue(tx, args.packageId, args.svi);
  tx.moveCall({
    target: `${args.packageId}::oracle::update_svi`,
    arguments: [tx.object(args.oracleId), tx.object(args.capId), svi, tx.object(PREDICT.clockId)],
  });
}

function addPriceUpdate(
  tx: Transaction,
  args: { packageId: string; oracleId: string; capId: string; spot: number; forward: number },
): void {
  const prices = tx.moveCall({
    target: `${args.packageId}::oracle::new_price_data`,
    arguments: [tx.pure.u64(scaled(args.spot)), tx.pure.u64(scaled(args.forward))],
  });
  tx.moveCall({
    target: `${args.packageId}::oracle::update_prices`,
    arguments: [tx.object(args.oracleId), tx.object(args.capId), prices, tx.object(PREDICT.clockId)],
  });
}

async function execute(tx: Transaction, gasBudget = 300_000_000): Promise<string> {
  tx.setGasBudget(gasBudget);
  const client = getSuiClient();
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: getSigner() });
  if (result.effects.status.status !== 'success') {
    throw new Error(result.effects.status.error ?? 'Predict oracle transaction failed');
  }
  await client.waitForTransaction({ digest: result.digest, timeout: 20_000 });
  return result.digest;
}

async function oracleJson(oracleId: string): Promise<Record<string, unknown>> {
  const response = await getSuiClient().grpc.getObject({ objectId: oracleId, include: { json: true } });
  return (response.object.json ?? {}) as Record<string, unknown>;
}

async function activateOracle(
  oracle: ManagedPredictOracle,
  market: DeribitExpirySurface,
  surface: DeribitSurface,
): Promise<string> {
  const managed = getManagedDeployment();
  if (!managed) throw new Error('Managed deployment disappeared during oracle activation');
  const tx = new Transaction();
  tx.moveCall({
    target: `${managed.packageId}::registry::register_oracle_cap`,
    arguments: [tx.object(oracle.oracleId), tx.object(managed.adminCapId), tx.object(managed.oracleCapId)],
  });
  tx.moveCall({
    target: `${managed.packageId}::oracle::activate`,
    arguments: [tx.object(oracle.oracleId), tx.object(managed.oracleCapId), tx.object(PREDICT.clockId)],
  });
  addOraclePriceAndSviUpdate(tx, {
    packageId: managed.packageId,
    oracleId: oracle.oracleId,
    capId: managed.oracleCapId,
    spot: surface.spot,
    forward: market.forward,
    svi: deriveSvi(oracle.expiry, market.atmIv),
  });
  return execute(tx);
}

async function createOracle(
  surface: DeribitSurface,
  market: DeribitExpirySurface,
): Promise<ManagedPredictOracle> {
  const managed = getManagedDeployment();
  if (!managed) throw new Error('Managed deployment is missing');
  const minStrike = Number(process.env.PREDICT_ORACLE_MIN_STRIKE_RAW ?? 10_000_000_000_000);
  const tickSize = Number(process.env.PREDICT_ORACLE_TICK_SIZE_RAW ?? 2_000_000_000);
  const tx = new Transaction();
  tx.moveCall({
    target: `${managed.packageId}::registry::create_oracle`,
    arguments: [
      tx.object(managed.registryId),
      tx.object(managed.predictObjectId),
      tx.object(managed.adminCapId),
      tx.object(managed.oracleCapId),
      tx.pure.string('BTC'),
      tx.pure.u64(market.expiry),
      tx.pure.u64(minStrike),
      tx.pure.u64(tickSize),
    ],
  });
  // The official 100,001-strike grid allocates 196 dynamic pages. Current
  // testnet simulation is ~38 SUI gross storage gas, so leave safe headroom.
  tx.setGasBudget(50_000_000_000);
  const client = getSuiClient();
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: getSigner() });
  if (result.effects.status.status !== 'success') {
    throw new Error(result.effects.status.error ?? 'Oracle creation failed');
  }
  await client.waitForTransaction({ digest: result.digest, timeout: 20_000 });
  const created = (result.objectChanges ?? []).find(
    (change) =>
      change.type === 'created' &&
      'objectType' in change &&
      change.objectType.startsWith(`${managed.packageId}::oracle::OracleSVI`),
  );
  if (!created || !('objectId' in created)) throw new Error('Oracle creation did not return OracleSVI');

  const oracle: ManagedPredictOracle = {
    oracleId: created.objectId,
    underlyingAsset: 'BTC',
    expiry: market.expiry,
    minStrike,
    tickSize,
    createdDigest: result.digest,
  };
  saveManagedDeployment({ ...managed, oracles: [...managed.oracles, oracle] });
  await activateOracle(oracle, market, surface);
  return oracle;
}

async function maintainOracles(surface: DeribitSurface): Promise<void> {
  const managed = getManagedDeployment();
  if (!managed) return;
  const now = Date.now();

  for (const oracle of managed.oracles) {
    const json = await oracleJson(oracle.oracleId);
    let settled = json.settlement_price !== null && json.settlement_price !== undefined;
    if (oracle.expiry <= now && !settled) {
      const market = marketForExpiry(surface, oracle.expiry);
      const tx = new Transaction();
      addPriceUpdate(tx, {
        packageId: managed.packageId,
        oracleId: oracle.oracleId,
        capId: managed.oracleCapId,
        spot: surface.spot,
        forward: market.forward,
      });
      const settledDigest = await execute(tx);
      const latest = getManagedDeployment();
      if (latest) {
        saveManagedDeployment({
          ...latest,
          oracles: latest.oracles.map((item) =>
            item.oracleId === oracle.oracleId ? { ...item, settledDigest } : item,
          ),
        });
      }
      settled = true;
    }
    if (settled && !oracle.compactDigest) {
      const tx = new Transaction();
      tx.moveCall({
        target: `${managed.packageId}::predict::compact_settled_oracle`,
        arguments: [
          tx.object(managed.predictObjectId),
          tx.object(oracle.oracleId),
          tx.object(managed.oracleCapId),
        ],
      });
      const compactDigest = await execute(tx, 10_000_000_000);
      const latest = getManagedDeployment();
      if (latest) {
        saveManagedDeployment({
          ...latest,
          oracles: latest.oracles.map((item) =>
            item.oracleId === oracle.oracleId ? { ...item, compactDigest } : item,
          ),
        });
      }
      continue;
    }
    if (oracle.expiry > now && json.active !== true) {
      await activateOracle(oracle, marketForExpiry(surface, oracle.expiry), surface);
    }
  }

  const current = getManagedDeployment();
  if (!current) return;
  const covered = current.oracles.filter((oracle) => oracle.expiry >= now + MIN_ROLLOVER_HORIZON_MS);
  if (covered.length >= 4) return;
  const existingExpiries = new Set(current.oracles.map((oracle) => oracle.expiry));
  const preferred = selectTargetExpiries(surface, now);
  const candidates = [...preferred, ...surface.expiries]
    .filter((market, index, all) => all.findIndex((item) => item.expiry === market.expiry) === index)
    .filter(
      (market) =>
        market.expiry >= now + MIN_ROLLOVER_HORIZON_MS &&
        market.expiry <= now + 75 * 24 * 60 * 60 * 1000,
    );
  for (const market of candidates) {
    if (covered.length >= 4) break;
    if (existingExpiries.has(market.expiry)) continue;
    const created = await createOracle(surface, market);
    covered.push(created);
    existingExpiries.add(created.expiry);
  }
}

export async function pushPredictOracleTick(): Promise<string | null> {
  if (!feedState.enabled || feedState.in_flight) return null;
  const managed = getManagedDeployment();
  if (!managed) return null;
  feedState.in_flight = true;
  feedState.last_attempt_at = new Date().toISOString();
  try {
    const surface = await fetchDeribitSurface();
    if (Date.now() - lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
      await maintainOracles(surface);
      lastMaintenanceAt = Date.now();
    }

    const latest = getManagedDeployment();
    if (!latest) throw new Error('Managed deployment is missing');
    const active = latest.oracles.filter((oracle) => oracle.expiry > Date.now() + 10_000);
    if (active.length === 0) throw new Error('No unexpired managed oracles to update');
    const tx = new Transaction();
    for (const oracle of active) {
      const market = marketForExpiry(surface, oracle.expiry);
      addOraclePriceAndSviUpdate(tx, {
        packageId: latest.packageId,
        oracleId: oracle.oracleId,
        capId: latest.oracleCapId,
        spot: surface.spot,
        forward: market.forward,
        svi: deriveSvi(oracle.expiry, market.atmIv),
      });
    }
    const digest = await execute(tx, 500_000_000);
    feedState.last_success_at = new Date().toISOString();
    feedState.last_digest = digest;
    feedState.last_error = null;
    feedState.consecutive_failures = 0;
    feedState.pushed_oracles = active.length;
    return digest;
  } catch (error) {
    feedState.last_error = error instanceof Error ? error.message : String(error);
    feedState.consecutive_failures += 1;
    throw error;
  } finally {
    feedState.in_flight = false;
  }
}

function scheduleNext(delayMs = intervalMs): void {
  if (!feedState.running) return;
  timer = setTimeout(async () => {
    let nextDelay = intervalMs;
    try {
      await pushPredictOracleTick();
    } catch (error) {
      console.error('[predict-feed]', error instanceof Error ? error.message : error);
      nextDelay = RETRY_INTERVAL_MS;
    } finally {
      scheduleNext(nextDelay);
    }
  }, delayMs);
  timer.unref();
}

export function startPredictFeed(): void {
  if (!feedState.enabled || feedState.running) return;
  feedState.running = true;
  void pushPredictOracleTick()
    .then(() => scheduleNext())
    .catch((error) => {
      console.error('[predict-feed]', error instanceof Error ? error.message : error);
      scheduleNext(RETRY_INTERVAL_MS);
    });
}

export function stopPredictFeed(): void {
  feedState.running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

export function predictFeedStatus(): PredictFeedState {
  return { ...feedState };
}
