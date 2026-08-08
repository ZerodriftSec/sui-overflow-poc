/**
 * DeepBook Strategy Engine — prebuilt structured strategies deployed on the
 * DeepBook Predict platform, each one a real range-strip geometry on a live BTC
 * oracle.
 *
 * Every strategy is a parameterization of the SAME on-chain MM-priced range strip
 * (`previewStrip` → `get_range_trade_amounts` devInspect). A strategy maps to:
 *   - a strip half-width in σ (`spanSigma`), and
 *   - a per-bucket sizing geometry (`shape(d)`, d = 0 center … 1 wings)
 * exactly like `strategyProfile` in volatility.ts — we reuse that pin/barbell
 * weight idea and extend it to the full risk-profile taxonomy the UI tags
 * (tail-risk / convexity / payoff shape). NOTHING here invents a price: the strip
 * cost, slippage, and max payout are the protocol's real numbers, and the Greeks
 * come from the shared `computeVolGreeks` measure.
 *
 * The σ that sizes the bands is the oracle's own live implied move
 * (`impliedSigmaRaw`, tenor-aware SVI), so bands stay inside the mintable window.
 */
import * as structured from './predict/structured';
import { impliedSigmaAndIv } from './predict/products';
import { computeVolGreeks, type VolGreeks } from './predict/volatility';
import { predictServer, findActiveOracle } from './predict/server';

const PRICE_SCALE = 1_000_000_000; // 1e9 strike / forward
const DUSDC_DECIMALS = 6;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const MIN_TENOR_YEARS = (3 * 60_000) / YEAR_MS; // ≥3 min to expiry — below this, IV/theta degenerate

export type TailRisk = 'low' | 'med' | 'high';
export type Convexity = 'long' | 'short' | 'neutral';
export type PayoffShape = 'pin' | 'plateau' | 'wings' | 'tail' | 'ladder' | 'capped';
export type ExpiryPref = 'near' | 'mid' | 'far';

/** Where the strip's payoff mass sits relative to the forward — the "range
 *  market" thesis (distinct from the volatility desk's symmetric gamma). */
export type Direction = 'pin' | 'up' | 'down' | 'range' | 'break';

export interface StrategyDef {
  id: string;
  name: string;
  thesis: string;
  tail_risk: TailRisk;
  convexity: Convexity;
  payoff_shape: PayoffShape;
  /** The range-market direction: which region of the price distribution it bets. */
  direction: Direction;
  /** Center offset in σ from the forward: 0 = at the forward, + = above, - = below.
   *  This is what makes a strip DIRECTIONAL (a level bet), not a symmetric vol
   *  structure — the whole strip is placed on a target price region. */
  centerSigma: number;
  /** strip half-width in σ; wider = more OTM coverage. */
  spanSigma: number;
  /** band count (tuned so every band lands inside the mintable window). */
  n: number;
  /** per-bucket sizing weight given normalized distance from center d∈[0,1]. */
  shape: (d: number) => number;
  /** UI summary of the worst case relative to premium paid. */
  risk_note: string;
}

/**
 * The prebuilt "range market" catalogue. Unlike the volatility desk (symmetric
 * straddle/strangle/butterfly/condor = a bet on MAGNITUDE), these are LEVEL and
 * DIRECTIONAL bets on WHERE BTC lands: a strip centered on a target price region
 * (`centerSigma` shifts the whole strip up/down off the forward), with a shaped
 * continuous payoff priced live off DeepBook. Pin/Range are level bets;
 * Rally/Push/Fade/Flush are directional; Break is a two-sided level bet.
 */
const STRATEGY_DEFS: StrategyDef[] = [
  {
    id: 'pin-forward',
    name: 'Pin the Forward',
    thesis: 'BTC settles right where the market expects — a tight strip on the forward that pays most at the peak of the implied distribution.',
    tail_risk: 'low', convexity: 'short', payoff_shape: 'pin', direction: 'pin',
    centerSigma: 0, spanSigma: 1.4, n: 6,
    shape: (d) => 0.12 + (1 - d) * 1.5,
    risk_note: 'Max loss = premium; best when BTC finishes near the forward, worst on a large move.',
  },
  {
    id: 'rally-above',
    name: 'Rally Above',
    thesis: 'BTC pushes up and settles above the forward — the payoff sits on a higher price band.',
    tail_risk: 'med', convexity: 'long', payoff_shape: 'pin', direction: 'up',
    centerSigma: 1.3, spanSigma: 1.5, n: 7,
    shape: (d) => 0.14 + (1 - d) * 1.3,
    risk_note: 'Max loss = premium; pays if BTC climbs into the target band, expires worthless below it.',
  },
  {
    id: 'push-higher',
    name: 'Push Higher',
    thesis: 'A stretch move up — a cheap strip on a high band that pays big if BTC rips through the upper tail.',
    tail_risk: 'high', convexity: 'long', payoff_shape: 'tail', direction: 'up',
    centerSigma: 2.2, spanSigma: 1.6, n: 7,
    shape: (d) => 0.16 + (1 - d) * 1.2,
    risk_note: 'Low premium, large payout if BTC stretches to the upper band; worthless if it stalls.',
  },
  {
    id: 'fade-lower',
    name: 'Fade Lower',
    thesis: 'BTC slips and settles below the forward — the payoff sits on a lower price band.',
    tail_risk: 'med', convexity: 'long', payoff_shape: 'pin', direction: 'down',
    centerSigma: -1.3, spanSigma: 1.5, n: 7,
    shape: (d) => 0.14 + (1 - d) * 1.3,
    risk_note: 'Max loss = premium; pays if BTC falls into the target band, expires worthless above it.',
  },
  {
    id: 'flush-down',
    name: 'Flush Down',
    thesis: 'A sharp move down — a cheap strip on a low band that pays big on a downside flush.',
    tail_risk: 'high', convexity: 'long', payoff_shape: 'tail', direction: 'down',
    centerSigma: -2.2, spanSigma: 1.6, n: 7,
    shape: (d) => 0.16 + (1 - d) * 1.2,
    risk_note: 'Low premium, large payout on a downside flush; worthless if BTC holds up.',
  },
  {
    id: 'hold-range',
    name: 'Hold the Range',
    thesis: 'BTC stays inside a band around the forward — a wide plateau covering the middle of the distribution.',
    tail_risk: 'low', convexity: 'short', payoff_shape: 'plateau', direction: 'range',
    centerSigma: 0, spanSigma: 2.6, n: 8,
    shape: (d) => (d < 0.55 ? 0.9 + (0.55 - d) : 0.06),
    risk_note: 'Max loss = premium; pays across a wide middle band, decays if BTC breaks out.',
  },
  {
    id: 'break-range',
    name: 'Break the Range',
    thesis: 'BTC leaves the band in either direction — wings that pay on a decisive move away from the forward.',
    tail_risk: 'med', convexity: 'long', payoff_shape: 'wings', direction: 'break',
    centerSigma: 0, spanSigma: 2.4, n: 8,
    shape: (d) => 0.15 + d * 1.1,
    risk_note: 'Max loss = premium; gains as BTC moves off the forward either way, worst if it pins.',
  },
];

/** Public list shape for GET /strategies (no internal geometry leaked). */
export interface StrategyListItem {
  id: string;
  name: string;
  thesis: string;
  tail_risk: TailRisk;
  convexity: Convexity;
  payoff_shape: PayoffShape;
  direction: Direction;
}

export function listStrategies(): StrategyListItem[] {
  return STRATEGY_DEFS.map((s) => ({
    id: s.id,
    name: s.name,
    thesis: s.thesis,
    tail_risk: s.tail_risk,
    convexity: s.convexity,
    payoff_shape: s.payoff_shape,
    direction: s.direction,
  }));
}

function findStrategy(id: string): StrategyDef | undefined {
  return STRATEGY_DEFS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Oracle resolution (near / mid / far across live BTC tenors)
// ---------------------------------------------------------------------------

interface ResolvedOracle {
  oracle_id: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  forward_raw: number;
}

function tenorLabel(ms: number): string {
  if (ms <= 0) return 'expired';
  const m = ms / 60_000;
  if (m < 90) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 36) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  const d = h / 24;
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
}

/**
 * Resolve a live BTC oracle by expiry preference. `near`/`mid`/`far` pick the
 * first/middle/last of the active BTC oracles sorted near→far (mirrors the term
 * basket's `resolveTermOracles`). Falls back to the soonest active oracle.
 */
/** All active BTC oracles as selectable expiries (advanced "pick a strike"). */
export async function listExpiries(): Promise<
  Array<{ oracle_id: string; expiry: number; t_years: number; tenor_label: string }>
> {
  const now = Date.now();
  const oracles = await predictServer.predictOracles().catch(() => predictServer.oracles());
  return oracles
    .filter((o) => o.status === 'active' && o.expiry > now + 6 * 60_000 && o.underlying_asset?.toUpperCase() === 'BTC')
    .sort((a, b) => a.expiry - b.expiry)
    .map((o) => ({
      oracle_id: o.oracle_id,
      expiry: o.expiry,
      t_years: (o.expiry - now) / (365.25 * 24 * 3600 * 1000),
      tenor_label: tenorLabel(o.expiry - now),
    }));
}

async function resolveOracle(pref: ExpiryPref, oracleId?: string): Promise<ResolvedOracle> {
  const now = Date.now();
  const oracles = await predictServer.predictOracles().catch(() => predictServer.oracles());
  const active = oracles
    .filter((o) => o.status === 'active' && o.expiry > now + 6 * 60_000 && o.underlying_asset?.toUpperCase() === 'BTC')
    .sort((a, b) => a.expiry - b.expiry);
  // An explicit oracle (advanced: a specific picked expiry) wins if still active;
  // otherwise fall back to the near/mid/far preference.
  let chosen = oracleId ? active.find((o) => o.oracle_id === oracleId) : undefined;
  if (!chosen && active.length > 0) {
    if (pref === 'far') chosen = active[active.length - 1];
    else if (pref === 'mid') chosen = active[Math.floor((active.length - 1) / 2)];
    else chosen = active[0];
  }
  if (!chosen) {
    const f = await findActiveOracle('BTC');
    if (!f) throw new Error('no active BTC oracle');
    const fp = (await predictServer.oraclePriceLatest(f.oracle_id)) as { forward?: number; spot?: number };
    return {
      oracle_id: f.oracle_id,
      expiry: f.expiry,
      min_strike: f.min_strike,
      tick_size: f.tick_size,
      forward_raw: Number(fp.forward ?? fp.spot ?? f.min_strike),
    };
  }
  const p = (await predictServer.oraclePriceLatest(chosen.oracle_id)) as { forward?: number; spot?: number };
  return {
    oracle_id: chosen.oracle_id,
    expiry: chosen.expiry,
    min_strike: chosen.min_strike,
    tick_size: chosen.tick_size,
    forward_raw: Number(p.forward ?? p.spot ?? chosen.min_strike),
  };
}

// ---------------------------------------------------------------------------
// Quote (real on-chain pricing via previewStrip)
// ---------------------------------------------------------------------------

export interface StrategyQuote {
  strategy_id: string;
  name: string;
  thesis: string;
  tail_risk: TailRisk;
  convexity: Convexity;
  payoff_shape: PayoffShape;
  direction: Direction;
  risk_note: string;
  oracle_id: string;
  expiry: string;
  tenor_label: string;
  notional_usd: number;
  forward_usd: number;
  /** The target price the strip is centered on (forward for pin/range/break;
   *  above/below it for directional plays). Used to frame "Above $X" in the UI. */
  center_usd: number;
  sigma_usd: number;
  atm_iv: number;
  t_years: number;
  /** worst case = premium paid (a bought strip). */
  max_loss_usd: number;
  strip: structured.StripQuote;
  greeks: VolGreeks;
  dusdc_decimals: number;
  /** tags the data origin so the UI never mistakes a fallback for a live mark. */
  source: 'deepbook-onchain' | 'deepbook-onchain-untradeable';
}

// Small in-memory cache: a strip quote fires many devInspect reads, so we serve
// identical (strategy, notional, tenor) requests from the last real on-chain
// result for a short window. Keyed without sender (pricing is sender-independent).
const QUOTE_TTL_MS = 8_000;
const quoteCache = new Map<string, { at: number; quote: StrategyQuote }>();

/** Build the per-bucket weight vector for a strategy across n ordered buckets. */
function strategyWeights(def: StrategyDef): number[] {
  const center = (def.n - 1) / 2;
  const maxd = Math.max(center, 1);
  return Array.from({ length: def.n }, (_, i) => {
    const d = Math.abs(i - center) / maxd; // 0 center … 1 wings of the strip
    return Math.max(0, def.shape(d));
  });
}

export async function quoteStrategy(args: {
  strategyId: string;
  notionalUsd: number;
  expiryPref?: ExpiryPref;
  oracleId?: string;
  sender?: string;
}): Promise<StrategyQuote> {
  const def = findStrategy(args.strategyId);
  if (!def) {
    throw new Error(`unknown strategy ${args.strategyId}; valid: ${STRATEGY_DEFS.map((s) => s.id).join(', ')}`);
  }
  const pref: ExpiryPref = args.expiryPref ?? 'mid';
  // Internal structured products fund small hedge sleeves (for example $0.60 of
  // a $10 note). The public route still buckets standalone tickets at $10+, but
  // the shared engine must preserve those fully-funded sub-dollar allocations.
  const notionalUsd = Math.max(0.01, Number(args.notionalUsd) || 100);

  // Resolve the oracle FIRST, then key the cache on the RESOLVED oracle_id. A
  // raw, caller-supplied oracle_id is sender-controlled and may be random per
  // request — keying on it would miss every time and fan out unbounded
  // devInspect reads. resolveOracle collapses any unknown/expired id onto the
  // active near/mid/far oracle, so the resolved id is the right cache dimension.
  const o = await resolveOracle(pref, args.oracleId);

  const cacheKey = `${def.id}|${notionalUsd}|${pref}|${o.oracle_id}`;
  const hit = quoteCache.get(cacheKey);
  if (hit && Date.now() - hit.at < QUOTE_TTL_MS) return hit.quote;

  const budgetRaw = BigInt(Math.round(notionalUsd * 10 ** DUSDC_DECIMALS));

  // σ = the oracle's live implied move (tenor-aware SVI), floored to the grid so
  // every band sits inside the protocol's mintable window. `sviAtmIv` is the TRUE
  // SVI ATM IV — used for the headline so it matches /surface and /density; the
  // floored σ is only used to size bands (back-implying IV off it over-states IV
  // by several vol points when the floor binds on short tenors).
  const { sigmaRaw, atmIv: sviAtmIv } = await impliedSigmaAndIv(
    { oracle_id: o.oracle_id, expiry: o.expiry, min_strike: o.min_strike, tick_size: o.tick_size },
    o.forward_raw,
    Math.max(o.tick_size, Math.round(o.forward_raw * 0.005)),
  );

  // Directional strips place the whole payoff on a target price region: center the
  // strip at forward + centerSigma·σ (clamped to a valid strike). centerSigma = 0
  // for pin/range/break (on the forward), ±N for the directional Rally/Fade plays.
  const centerRaw = Math.max(o.min_strike, Math.round(o.forward_raw + def.centerSigma * sigmaRaw));
  const strip = await structured.previewStrip({
    oracle: { oracle_id: o.oracle_id, expiry: o.expiry, min_strike: o.min_strike, tick_size: o.tick_size },
    muRaw: centerRaw,
    sigmaRaw,
    n: def.n,
    budgetRaw,
    spanSigma: def.spanSigma,
    weights: strategyWeights(def),
    sender: args.sender,
  });

  const forwardUsd = o.forward_raw / PRICE_SCALE;
  const sigmaUsd = sigmaRaw / PRICE_SCALE;
  const tYears = (Number(o.expiry) - Date.now()) / YEAR_MS;
  // Reject essentially-expired oracles: at tYears→0 back-implied IV and per-day
  // theta degenerate. resolveOracle already buffers the near/mid/far path; this
  // also guards an explicitly-passed oracle_id that slipped inside the window.
  if (!(tYears > MIN_TENOR_YEARS)) {
    throw new Error('no active BTC oracle with enough time to expiry');
  }
  // Headline IV = true SVI ATM IV (matches /surface, /density); fall back to the
  // back-implied value only when SVI is unavailable.
  const atmIv = sviAtmIv ?? sigmaUsd / (forwardUsd * Math.sqrt(Math.max(tYears, 1e-9)));
  const greeks = computeVolGreeks(strip, forwardUsd, sigmaUsd, tYears);

  const tradeable = strip.buckets.some((b) => b.tradeable && Number(b.quantity) > 0);
  const maxLossUsd = Number(strip.total_cost_raw) / 10 ** DUSDC_DECIMALS;

  const quote: StrategyQuote = {
    strategy_id: def.id,
    name: def.name,
    thesis: def.thesis,
    tail_risk: def.tail_risk,
    convexity: def.convexity,
    payoff_shape: def.payoff_shape,
    direction: def.direction,
    risk_note: def.risk_note,
    oracle_id: o.oracle_id,
    expiry: String(o.expiry),
    tenor_label: tenorLabel(Number(o.expiry) - Date.now()),
    notional_usd: notionalUsd,
    forward_usd: forwardUsd,
    center_usd: centerRaw / PRICE_SCALE,
    sigma_usd: sigmaUsd,
    atm_iv: atmIv,
    t_years: tYears,
    max_loss_usd: maxLossUsd,
    strip,
    greeks,
    dusdc_decimals: DUSDC_DECIMALS,
    source: tradeable ? 'deepbook-onchain' : 'deepbook-onchain-untradeable',
  };
  quoteCache.set(cacheKey, { at: Date.now(), quote });
  return quote;
}
