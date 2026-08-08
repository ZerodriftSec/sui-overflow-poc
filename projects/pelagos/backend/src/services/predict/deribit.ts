const DERIBIT_API = 'https://www.deribit.com/api/v2/public';
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

interface DeribitResponse<T> {
  jsonrpc: string;
  result?: T;
  error?: { code: number; message: string };
}

interface DeribitInstrument {
  instrument_name: string;
  expiration_timestamp: number;
  strike: number;
  option_type: 'call' | 'put';
}

interface DeribitSummary {
  instrument_name: string;
  mark_iv?: number;
  underlying_price?: number;
  open_interest?: number;
}

interface DeribitIndex {
  index_price: number;
  estimated_delivery_price?: number;
}

export interface DeribitExpirySurface {
  expiry: number;
  forward: number;
  atmIv: number;
  sampleCount: number;
}

export interface DeribitSurface {
  source: 'deribit';
  receivedAt: number;
  spot: number;
  expiries: DeribitExpirySurface[];
}

export interface PredictSviParams {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

async function deribit<T>(method: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${DERIBIT_API}/${method}?${query}`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'pelagos-predict-oracle/1.0' },
    });
    if (!res.ok) throw new Error(`Deribit ${method} returned HTTP ${res.status}`);
    const body = (await res.json()) as DeribitResponse<T>;
    if (body.error || body.result === undefined) {
      throw new Error(`Deribit ${method} failed: ${body.error?.message ?? 'missing result'}`);
    }
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fetch a complete, internally consistent BTC option surface from Deribit's public API. */
export async function fetchDeribitSurface(): Promise<DeribitSurface> {
  const [index, instruments, summaries] = await Promise.all([
    deribit<DeribitIndex>('get_index_price', { index_name: 'btc_usd' }),
    deribit<DeribitInstrument[]>('get_instruments', {
      currency: 'BTC',
      kind: 'option',
      expired: 'false',
    }),
    deribit<DeribitSummary[]>('get_book_summary_by_currency', {
      currency: 'BTC',
      kind: 'option',
    }),
  ]);

  const spot = Number(index.index_price);
  if (!Number.isFinite(spot) || spot <= 0) throw new Error('Deribit returned an invalid BTC index');

  const instrumentByName = new Map(instruments.map((item) => [item.instrument_name, item]));
  const grouped = new Map<number, Array<DeribitSummary & DeribitInstrument>>();
  for (const summary of summaries) {
    const instrument = instrumentByName.get(summary.instrument_name);
    if (!instrument) continue;
    const row = { ...summary, ...instrument };
    const rows = grouped.get(instrument.expiration_timestamp) ?? [];
    rows.push(row);
    grouped.set(instrument.expiration_timestamp, rows);
  }

  const expiries: DeribitExpirySurface[] = [];
  for (const [expiry, rows] of grouped) {
    const forwards = rows
      .map((row) => Number(row.underlying_price))
      .filter((value) => Number.isFinite(value) && value > 0);
    const forward = median(forwards);
    if (!Number.isFinite(forward) || forward <= 0) continue;

    const ivRows = rows
      .map((row) => ({
        iv: Number(row.mark_iv) / 100,
        distance: Math.abs(Math.log(Number(row.strike) / forward)),
        openInterest: Math.max(0, Number(row.open_interest ?? 0)),
      }))
      .filter((row) => Number.isFinite(row.iv) && row.iv >= 0.08 && row.iv <= 2.5)
      .filter((row) => Number.isFinite(row.distance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 16);
    if (ivRows.length === 0) continue;

    let weightedIv = 0;
    let totalWeight = 0;
    for (const row of ivRows) {
      const weight = Math.sqrt(row.openInterest + 1) / (0.01 + row.distance);
      weightedIv += row.iv * weight;
      totalWeight += weight;
    }
    const atmIv = clamp(weightedIv / totalWeight, 0.08, 2.5);
    expiries.push({ expiry, forward, atmIv, sampleCount: ivRows.length });
  }

  expiries.sort((a, b) => a.expiry - b.expiry);
  if (expiries.length === 0) throw new Error('Deribit returned no usable BTC option expiries');
  return { source: 'deribit', receivedAt: Date.now(), spot, expiries };
}

/** Select distinct listed expiries nearest 3d, 7d, 14d, and 30d target tenors. */
export function selectTargetExpiries(
  surface: DeribitSurface,
  now = Date.now(),
  targetsDays = [3, 7, 14, 30],
): DeribitExpirySurface[] {
  const minExpiry = now + 36 * 60 * 60 * 1000;
  const maxExpiry = now + 75 * 24 * 60 * 60 * 1000;
  const candidates = surface.expiries.filter(
    (item) => item.expiry >= minExpiry && item.expiry <= maxExpiry,
  );
  const selected: DeribitExpirySurface[] = [];
  const used = new Set<number>();

  for (const targetDays of targetsDays) {
    const target = now + targetDays * 24 * 60 * 60 * 1000;
    const candidate = candidates
      .filter((item) => !used.has(item.expiry))
      .sort((a, b) => Math.abs(a.expiry - target) - Math.abs(b.expiry - target))[0];
    if (!candidate) continue;
    selected.push(candidate);
    used.add(candidate.expiry);
  }

  for (const candidate of candidates) {
    if (selected.length >= targetsDays.length) break;
    if (!used.has(candidate.expiry)) selected.push(candidate);
  }
  return selected.sort((a, b) => a.expiry - b.expiry);
}

export function marketForExpiry(surface: DeribitSurface, expiry: number): DeribitExpirySurface {
  const exact = surface.expiries.find((item) => item.expiry === expiry);
  if (exact) return exact;
  const nearest = [...surface.expiries].sort(
    (a, b) => Math.abs(a.expiry - expiry) - Math.abs(b.expiry - expiry),
  )[0];
  if (!nearest) throw new Error(`No Deribit market data available for expiry ${expiry}`);
  return { ...nearest, expiry, forward: nearest.forward || surface.spot };
}

/** Conservative raw-SVI fit preserving the observed ATM total variance. */
export function deriveSvi(expiry: number, atmIv: number, now = Date.now()): PredictSviParams {
  const years = Math.max((expiry - now) / YEAR_MS, 1 / (365.25 * 24));
  const totalVariance = clamp(atmIv, 0.08, 2.5) ** 2 * years;
  return {
    a: Math.max(totalVariance * 0.7, 1e-7),
    b: Math.max(totalVariance * 3, 1e-6),
    rho: -0.25,
    m: 0,
    sigma: 0.1,
  };
}
