import { PREDICT, getManagedDeployment } from './config';
import { getSuiClient } from './sui';
import { managedManagers } from './manager-registry';
import type { PredictManagerRef, PredictOracle } from './server';
import { bcs } from '@mysten/sui/bcs';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { fromBase64 } from '@mysten/sui/utils';

type JsonRecord = Record<string, unknown>;

const objectCache = new Map<string, { at: number; type: string; json: JsonRecord }>();
const OBJECT_TTL_MS = 1_500;
const RANGE_KEY_BCS = bcs.struct('RangeKey', {
  oracle_id: bcs.Address,
  expiry: bcs.u64(),
  lower_strike: bcs.u64(),
  higher_strike: bcs.u64(),
});
const MANAGER_CREATED_BCS = bcs.struct('PredictManagerCreated', {
  manager_id: bcs.Address,
  owner: bcs.Address,
});
const MANAGER_EVENT_TYPE = `${PREDICT.packageId}::predict_manager::PredictManagerCreated`;
const MANAGER_DISCOVERY_TTL_MS = 30_000;
let managerDiscoveryCache: { at: number; managers: PredictManagerRef[] } | null = null;
let managerDiscoveryPromise: Promise<PredictManagerRef[]> | null = null;

interface ManagerEventsResult {
  events?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ contents?: { bcs?: string | null } | null }>;
  };
}

interface ManagerEventsResponse {
  data?: ManagerEventsResult;
  errors?: Array<{ message: string }>;
}

function graphqlUrl(): string {
  if (process.env.SUI_GRAPHQL_URL) return process.env.SUI_GRAPHQL_URL;
  return PREDICT.network === 'mainnet'
    ? 'https://graphql.mainnet.sui.io/graphql'
    : 'https://graphql.testnet.sui.io/graphql';
}

async function discoverManagers(): Promise<PredictManagerRef[]> {
  const hit = managerDiscoveryCache;
  if (hit && Date.now() - hit.at < MANAGER_DISCOVERY_TTL_MS) return hit.managers;
  if (managerDiscoveryPromise) return managerDiscoveryPromise;

  managerDiscoveryPromise = (async () => {
    const client = new SuiGraphQLClient({ url: graphqlUrl(), network: PREDICT.network });
    const discovered: PredictManagerRef[] = [];
    let after: string | null = null;
    let pages = 0;
    do {
      const response: ManagerEventsResponse = await client.query<
        ManagerEventsResult,
        { type: string; first: number; after: string | null }
      >({
        query: `
          query PredictManagers($type: String!, $first: Int!, $after: String) {
            events(first: $first, after: $after, filter: { type: $type }) {
              pageInfo { hasNextPage endCursor }
              nodes { contents { bcs } }
            }
          }
        `,
        variables: { type: MANAGER_EVENT_TYPE, first: 50, after },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join('; '));
      const events: ManagerEventsResult['events'] = response.data?.events;
      if (!events) break;
      for (const event of events.nodes) {
        if (!event.contents?.bcs) continue;
        try {
          const parsed = MANAGER_CREATED_BCS.parse(fromBase64(event.contents.bcs));
          discovered.push({
            manager_id: parsed.manager_id,
            owner: parsed.owner,
            package: PREDICT.packageId,
          });
        } catch {
          // Ignore one malformed historical event without hiding other managers.
        }
      }
      after = events.pageInfo.hasNextPage ? events.pageInfo.endCursor : null;
      pages += 1;
    } while (after && pages < 10);

    const merged = new Map<string, PredictManagerRef>();
    for (const manager of [...discovered, ...managedManagers()]) {
      merged.set(manager.manager_id.toLowerCase(), manager);
    }
    const managers = [...merged.values()];
    managerDiscoveryCache = { at: Date.now(), managers };
    return managers;
  })();

  try {
    return await managerDiscoveryPromise;
  } finally {
    managerDiscoveryPromise = null;
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readObject(objectId: string): Promise<{ type: string; json: JsonRecord }> {
  const hit = objectCache.get(objectId);
  if (hit && Date.now() - hit.at < OBJECT_TTL_MS) return hit;
  const response = await getSuiClient().grpc.getObject({ objectId, include: { json: true } });
  const json = record(response.object.json);
  const value = { at: Date.now(), type: response.object.type, json };
  objectCache.set(objectId, value);
  return value;
}

function deployment() {
  const managed = getManagedDeployment();
  if (!managed || PREDICT.mode !== 'managed') {
    throw new Error('Managed Predict deployment is not configured');
  }
  return managed;
}

function oracleStatus(json: JsonRecord, expiry: number): string {
  if (json.settlement_price !== null && json.settlement_price !== undefined) return 'settled';
  if (Date.now() >= expiry) return 'pending_settlement';
  return json.active === true ? 'active' : 'pending';
}

function oracleRef(
  manifestOracle: ReturnType<typeof deployment>['oracles'][number],
  json: JsonRecord,
): PredictOracle {
  const status = oracleStatus(json, manifestOracle.expiry);
  return {
    predict_id: PREDICT.predictObjectId,
    oracle_id: manifestOracle.oracleId,
    oracle_cap_id: deployment().oracleCapId,
    underlying_asset: manifestOracle.underlyingAsset,
    expiry: manifestOracle.expiry,
    min_strike: manifestOracle.minStrike,
    tick_size: manifestOracle.tickSize,
    status,
    activated_at: status === 'active' ? numeric(json.timestamp) : null,
    settlement_price:
      json.settlement_price === null || json.settlement_price === undefined
        ? null
        : numeric(json.settlement_price),
    settled_at: status === 'settled' ? numeric(json.timestamp) : null,
  };
}

async function oraclePayload(oracleId: string) {
  const item = deployment().oracles.find(
    (oracle) => oracle.oracleId.toLowerCase() === oracleId.toLowerCase(),
  );
  if (!item) throw new Error(`oracle not found: ${oracleId}`);
  const object = await readObject(item.oracleId);
  if (!object.type.startsWith(`${PREDICT.packageId}::oracle::OracleSVI`)) {
    throw new Error(`Unexpected oracle type for ${oracleId}: ${object.type}`);
  }

  const prices = record(object.json.prices);
  const svi = record(object.json.svi);
  const rho = record(svi.rho);
  const m = record(svi.m);
  const timestamp = numeric(object.json.timestamp);
  const oracle = oracleRef(item, object.json);
  const latestPrice = {
    package: PREDICT.packageId,
    oracle_id: item.oracleId,
    spot: numeric(prices.spot),
    forward: numeric(prices.forward),
    onchain_timestamp: timestamp,
  };
  const latestSvi = {
    package: PREDICT.packageId,
    oracle_id: item.oracleId,
    a: numeric(svi.a),
    b: numeric(svi.b),
    rho: numeric(rho.magnitude),
    rho_negative: rho.is_negative === true,
    m: numeric(m.magnitude),
    m_negative: m.is_negative === true,
    sigma: numeric(svi.sigma),
    onchain_timestamp: timestamp,
  };
  return { oracle, latestPrice, latestSvi, json: object.json };
}

async function predictPayload() {
  const object = await readObject(PREDICT.predictObjectId);
  if (!object.type.startsWith(`${PREDICT.packageId}::predict::Predict`)) {
    throw new Error(`Unexpected Predict object type: ${object.type}`);
  }
  return object.json;
}

async function rangePositions(tableId: string): Promise<Array<{
  oracle_id: string;
  expiry: string;
  lower_strike: string;
  higher_strike: string;
  quantity: string;
}>> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tableId)) return [];
  const out: Array<{
    oracle_id: string;
    expiry: string;
    lower_strike: string;
    higher_strike: string;
    quantity: string;
  }> = [];
  let cursor: string | null | undefined;
  do {
    const page = await getSuiClient().grpc.listDynamicFields({
      parentId: tableId,
      cursor,
      limit: 100,
      include: { value: true },
    });
    for (const field of page.dynamicFields) {
      if (!field.name?.bcs || !field.value?.bcs || field.valueType !== 'u64') continue;
      try {
        const key = RANGE_KEY_BCS.parse(field.name.bcs);
        out.push({
          oracle_id: key.oracle_id,
          expiry: String(key.expiry),
          lower_strike: String(key.lower_strike),
          higher_strike: String(key.higher_strike),
          quantity: String(bcs.u64().parse(field.value.bcs)),
        });
      } catch {
        // This table is typed RangeKey -> u64; ignore an undecodable entry rather
        // than corrupting the rest of the wallet account response.
      }
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return out;
}

export const managedPredictServer = {
  async status(): Promise<Record<string, unknown>> {
    const oracles = await managedPredictServer.oracles();
    const active = oracles.filter((oracle) => oracle.status === 'active' && oracle.expiry > Date.now());
    const states = await Promise.all(active.map((oracle) => oraclePayload(oracle.oracle_id)));
    const ages = states.map((state) => Date.now() - state.latestPrice.onchain_timestamp);
    const fresh = ages.filter((age) => age >= 0 && age <= 30_000).length;
    if (fresh === 0) {
      const youngest = ages.length ? Math.min(...ages) : null;
      throw new Error(`Managed Predict has no quoteable oracle (youngest update age: ${youngest ?? 'n/a'}ms)`);
    }
    return {
      status: 'ok',
      mode: 'managed',
      transport: 'sui-grpc-direct',
      market_data_source: 'deribit',
      package_id: PREDICT.packageId,
      predict_id: PREDICT.predictObjectId,
      active_oracles: active.length,
      fresh_oracles: fresh,
      freshest_update_age_ms: Math.min(...ages),
    };
  },

  async config(): Promise<Record<string, unknown>> {
    const state = await predictPayload();
    return {
      mode: 'managed',
      predict_id: PREDICT.predictObjectId,
      package_id: PREDICT.packageId,
      quote_assets: record(record(state.treasury_config).accepted_quotes).contents ?? [],
      pricing: state.pricing_config ?? null,
      risk: state.risk_config ?? null,
      trading_paused: state.trading_paused ?? null,
      source: deployment().source,
    };
  },

  async oracles(): Promise<PredictOracle[]> {
    const entries = deployment().oracles;
    const states = await Promise.all(entries.map((oracle) => readObject(oracle.oracleId)));
    return entries.map((oracle, index) => oracleRef(oracle, states[index].json));
  },

  async predictState(): Promise<Record<string, unknown>> {
    const state = await predictPayload();
    return {
      predict_id: PREDICT.predictObjectId,
      pricing: state.pricing_config ?? null,
      risk: state.risk_config ?? null,
      trading_paused: state.trading_paused ?? null,
      quote_assets: record(record(state.treasury_config).accepted_quotes).contents ?? [],
    };
  },

  async vaultSummary(): Promise<Record<string, unknown>> {
    const state = await predictPayload();
    const vault = record(state.vault);
    const treasury = record(state.treasury_cap);
    const supply = numeric(record(treasury.total_supply).value);
    const balance = numeric(vault.balance);
    const totalMtm = numeric(vault.total_mtm);
    const totalMaxPayout = numeric(vault.total_max_payout);
    const balanceRaw = BigInt(String(vault.balance ?? 0));
    const currentMaxPayoutRaw = BigInt(String(vault.total_max_payout ?? 0));
    const maxExposurePctRaw = BigInt(
      String(record(state.risk_config).max_total_exposure_pct ?? 0),
    );
    const riskLimitRaw = (balanceRaw * maxExposurePctRaw) / 1_000_000_000n;
    const remainingRiskCapacityRaw =
      riskLimitRaw > currentMaxPayoutRaw ? riskLimitRaw - currentMaxPayoutRaw : 0n;
    const vaultValue = Math.max(0, balance - totalMtm);
    return {
      predict_id: PREDICT.predictObjectId,
      vault_balance: balance,
      vault_value: vaultValue,
      available_liquidity: Math.max(0, balance - totalMaxPayout),
      remaining_risk_capacity: Number(remainingRiskCapacityRaw),
      total_mtm: totalMtm,
      total_max_payout: totalMaxPayout,
      plp_total_supply: supply,
      plp_share_price: supply > 0 ? vaultValue / supply : 1,
      utilization: balance > 0 ? totalMaxPayout / balance : 0,
    };
  },

  async oracleState(oracleId: string): Promise<Record<string, unknown>> {
    const payload = await oraclePayload(oracleId);
    return {
      oracle: payload.oracle,
      latest_price: payload.latestPrice,
      latest_svi: payload.latestSvi,
      ask_bounds: null,
    };
  },

  async oraclePriceLatest(oracleId: string): Promise<Record<string, unknown>> {
    return (await oraclePayload(oracleId)).latestPrice;
  },

  async oracleSviLatest(oracleId: string): Promise<Record<string, unknown>> {
    return (await oraclePayload(oracleId)).latestSvi;
  },

  async oracleAskBounds(_oracleId: string): Promise<Record<string, unknown>> {
    return { override: null };
  },

  async managers(): Promise<PredictManagerRef[]> {
    try {
      return await discoverManagers();
    } catch (error) {
      console.warn(
        '[predict] GraphQL manager discovery failed; using persistent registry:',
        error instanceof Error ? error.message : String(error),
      );
      return managedManagers();
    }
  },

  async managerSummary(managerId: string): Promise<Record<string, unknown>> {
    const object = await readObject(managerId);
    if (!object.type.startsWith(`${PREDICT.packageId}::predict_manager::PredictManager`)) {
      throw new Error(`manager not found: ${managerId}`);
    }
    const positions = record(object.json.positions);
    const ranges = record(object.json.range_positions);
    return {
      manager_id: managerId,
      owner: object.json.owner,
      position_count: numeric(positions.size),
      range_position_count: numeric(ranges.size),
      source: 'sui-grpc-direct',
    };
  },

  async managerPositions(managerId: string): Promise<Record<string, unknown>> {
    const object = await readObject(managerId);
    if (!object.type.startsWith(`${PREDICT.packageId}::predict_manager::PredictManager`)) {
      throw new Error(`manager not found: ${managerId}`);
    }
    const rangesTable = record(object.json.range_positions);
    const ranges = await rangePositions(String(rangesTable.id ?? ''));
    return {
      manager_id: managerId,
      owner: object.json.owner,
      positions: [],
      ranges,
      onchain_summary: {
        position_count: numeric(record(object.json.positions).size),
        range_position_count: numeric(rangesTable.size),
      },
    };
  },

  async managerPnl(managerId: string, range = 'ALL'): Promise<Record<string, unknown>> {
    return {
      manager_id: managerId,
      range,
      series_type: 'realized_pnl',
      points: [],
      current_unrealized_pnl: 0,
      current_total_pnl: 0,
    };
  },
};
