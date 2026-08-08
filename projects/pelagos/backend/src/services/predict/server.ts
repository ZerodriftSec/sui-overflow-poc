import { PREDICT } from './config';
import { managedPredictServer } from './onchain-server';

/**
 * Predict read facade. Managed mode uses direct Sui gRPC object reads; public
 * mode retains the legacy Mysten server adapter for explicit fallback use.
 */

export type OracleStatus = 'pending' | 'active' | 'settled' | string;

export interface PredictOracle {
  predict_id: string;
  oracle_id: string;
  oracle_cap_id?: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: OracleStatus;
  activated_at?: number | null;
  settlement_price?: number | null;
  settled_at?: number | null;
  created_checkpoint?: number;
}

export interface PredictManagerRef {
  manager_id: string;
  owner: string;
  digest?: string;
  checkpoint?: number;
  checkpoint_timestamp_ms?: number;
  package?: string;
}

async function get<T>(pathname: string): Promise<T> {
  const url = `${PREDICT.serverUrl}${pathname}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Predict public server GET ${pathname} failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

// Short TTL cache for the read-only RENDER endpoints (oracle lists / state / SVI /
// price). These change only on oracle/state ticks (seconds), so caching them collapses
// the per-quote round-trips — esp. while the user sculpts (same oracle, new
// weights) — without ever caching a confirmation-critical wallet read.
const getCache = new Map<string, { at: number; data: unknown }>();
async function cachedGet<T>(pathname: string, ttlMs: number): Promise<T> {
  const hit = getCache.get(pathname);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await get<T>(pathname);
  getCache.set(pathname, { at: Date.now(), data });
  if (getCache.size > 512) {
    for (const [k, v] of getCache) if (Date.now() - v.at > 30_000) getCache.delete(k);
  }
  return data;
}

export const predictServer = {
  status: () =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.status()
      : get<Record<string, unknown>>('/status'),
  config: () =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.config()
      : get<Record<string, unknown>>('/config'),

  /** All oracles known to the active read source (across statuses). */
  oracles: () =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oracles()
      : cachedGet<PredictOracle[]>('/oracles', 5_000),

  predictState: (predictId = PREDICT.predictObjectId) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.predictState()
      : get<Record<string, unknown>>(`/predicts/${predictId}/state`),
  predictOracles: (predictId = PREDICT.predictObjectId) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oracles()
      : cachedGet<PredictOracle[]>(`/predicts/${predictId}/oracles`, 5_000),
  vaultSummary: (predictId = PREDICT.predictObjectId) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.vaultSummary()
      : get<Record<string, unknown>>(`/predicts/${predictId}/vault/summary`),

  oracleState: (oracleId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oracleState(oracleId)
      : cachedGet<Record<string, unknown>>(`/oracles/${oracleId}/state`, 4_000),
  oracleSviLatest: (oracleId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oracleSviLatest(oracleId)
      : cachedGet<Record<string, unknown>>(`/oracles/${oracleId}/svi/latest`, 4_000),
  oraclePriceLatest: (oracleId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oraclePriceLatest(oracleId)
      : cachedGet<Record<string, unknown>>(`/oracles/${oracleId}/prices/latest`, 4_000),
  oracleAskBounds: (oracleId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.oracleAskBounds(oracleId)
      : get<Record<string, unknown>>(`/oracles/${oracleId}/ask-bounds`),

  managers: () =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.managers()
      : get<PredictManagerRef[]>('/managers'),
  managerSummary: (managerId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.managerSummary(managerId)
      : get<Record<string, unknown>>(`/managers/${managerId}/summary`),
  managerPositions: (managerId: string) =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.managerPositions(managerId)
      : get<Record<string, unknown>>(`/managers/${managerId}/positions/summary`),
  managerPnl: (managerId: string, range = 'ALL') =>
    PREDICT.mode === 'managed'
      ? managedPredictServer.managerPnl(managerId, range)
      : get<Record<string, unknown>>(`/managers/${managerId}/pnl?range=${range}`),
};

/** Managers owned by a specific address. */
export async function managersForOwner(owner: string): Promise<PredictManagerRef[]> {
  const want = owner.toLowerCase();
  const all = await predictServer.managers();
  return all.filter((m) => (m.owner ?? '').toLowerCase() === want);
}

/**
 * Pick the most useful currently-tradeable oracle: status `active`, soonest
 * expiry first, but skipping oracles that are about to expire. Within the last
 * few minutes the protocol's implied distribution collapses toward a point mass,
 * which pushes every priced band outside the [2%,98%] mintable window (central
 * band > 98% "too certain", wings < 2%) — so the auto-selected front oracle
 * would quote a strip with zero tradeable buckets. A short buffer guarantees the
 * selected oracle has a live, well-priced distribution. Falls back to the
 * soonest active oracle if every oracle is inside the buffer.
 */
export async function findActiveOracle(
  underlying?: string,
  minMsToExpiry = 6 * 60_000,
): Promise<PredictOracle | null> {
  const now = Date.now();
  const want = underlying?.toUpperCase();
  const oracles = await predictServer.predictOracles().catch(() => predictServer.oracles());
  const active = oracles
    .filter((o) => o.status === 'active' && o.expiry > now)
    .filter((o) => (want ? o.underlying_asset?.toUpperCase() === want : true))
    .sort((a, b) => a.expiry - b.expiry);
  return active.find((o) => o.expiry - now >= minMsToExpiry) ?? active[0] ?? null;
}

/**
 * Compute a valid on-grid strike for an oracle. Strikes live on
 * `min_strike + k * tick_size`; this snaps `target` to the nearest grid point.
 * When `target` is omitted, returns the grid point nearest the oracle spot/forward
 * if provided, else `min_strike`.
 */
export function snapStrikeToGrid(oracle: PredictOracle, target?: number): number {
  const { min_strike, tick_size } = oracle;
  if (!tick_size || tick_size <= 0) return min_strike;
  if (target === undefined) return min_strike;
  const k = Math.max(0, Math.round((target - min_strike) / tick_size));
  return min_strike + k * tick_size;
}
