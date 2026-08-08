/**
 * Fully-funded DeepBook structured notes.
 *
 * Terminal notes split principal into real PLP shares, a reclaimable manager
 * buffer, and a live DeepBook range premium. No external APY is assumed. The
 * discrete autocall is a separate mUSDC lifecycle product because DeepBook range
 * positions do not enforce early principal redemption on-chain.
 */
import { randomUUID } from 'crypto';
import { listExpiries, quoteStrategy, type StrategyQuote } from './deepbook-strategies';
import { predictServer } from './predict/server';
import {
  composeTerminalBands,
  plpStress,
  terminalBandStats,
  type AutocallTerms,
  type PlpStressResult,
  type TerminalBand,
} from './structured-payoffs';

const RAW = 1_000_000;
const QUOTE_TTL_MS = 90_000;
const EXECUTION_BUFFER = 1.12;

export type NoteKind =
  | 'participation'
  | 'range-coupon'
  | 'terminal-knock-out'
  | 'terminal-knock-in'
  | 'two-way-buffer'
  | 'autocall';

export interface NotePreset {
  id: string;
  name: string;
  kind: NoteKind;
  risk: 'low' | 'medium';
  reserve_target_pct: number;
  default_tenor_days: number;
  summary: string;
  payoff_condition: string;
  supported_currencies: Array<'dUSDC' | 'mUSDC'>;
  strategy_id: string | null;
}

const NOTE_PRESETS: NotePreset[] = [
  {
    id: 'capital-guard',
    name: 'Capital Guard',
    kind: 'participation',
    risk: 'low',
    reserve_target_pct: 0.92,
    default_tenor_days: 40,
    summary: 'High PLP reserve with capped participation in an upper BTC settlement band.',
    payoff_condition: 'Adds upside when BTC finishes in the participation bands.',
    supported_currencies: ['dUSDC', 'mUSDC'],
    strategy_id: 'rally-above',
  },
  {
    id: 'range-income',
    name: 'Range Coupon',
    kind: 'range-coupon',
    risk: 'low',
    reserve_target_pct: 0.94,
    default_tenor_days: 12,
    summary: 'A compact terminal coupon strip around the forward with a high PLP reserve.',
    payoff_condition: 'Coupon pays by terminal range band; there is no intraday barrier monitoring.',
    supported_currencies: ['dUSDC', 'mUSDC'],
    strategy_id: 'hold-range',
  },
  {
    id: 'terminal-knock-out',
    name: 'Expiry KO Coupon',
    kind: 'terminal-knock-out',
    risk: 'low',
    reserve_target_pct: 0.95,
    default_tenor_days: 40,
    summary: 'Coupon survives only if the final BTC observation remains in its corridor.',
    payoff_condition: 'Terminal observation only: outside the corridor the coupon is knocked out.',
    supported_currencies: ['dUSDC', 'mUSDC'],
    strategy_id: 'pin-forward',
  },
  {
    id: 'terminal-knock-in',
    name: 'Expiry KI Buffer',
    kind: 'terminal-knock-in',
    risk: 'medium',
    reserve_target_pct: 0.9,
    default_tenor_days: 40,
    summary: 'A lower-band strip activates at expiry to offset part of a downside PLP outcome.',
    payoff_condition: 'Terminal observation only: the buffer pays in the lower knock-in bands.',
    supported_currencies: ['dUSDC', 'mUSDC'],
    strategy_id: 'flush-down',
  },
  {
    id: 'two-way-buffer',
    name: 'Two-Way Buffer',
    kind: 'two-way-buffer',
    risk: 'medium',
    reserve_target_pct: 0.88,
    default_tenor_days: 40,
    summary: 'A PLP reserve paired with terminal breakout bands on both sides of the forward.',
    payoff_condition: 'The buffer pays if BTC finishes in either live breakout wing.',
    supported_currencies: ['dUSDC', 'mUSDC'],
    strategy_id: 'break-range',
  },
  {
    id: 'autocall-three',
    name: 'Autocall 3',
    kind: 'autocall',
    risk: 'medium',
    reserve_target_pct: 1,
    default_tenor_days: 12,
    summary: 'Three discrete BTC observations with step-down call barriers and a 70% final knock-in.',
    payoff_condition: 'Calls at the first settled observation above its barrier; otherwise final knock-in terms apply.',
    supported_currencies: ['mUSDC'],
    strategy_id: null,
  },
];

export interface NoteQuote {
  quote_id: string;
  quoted_at: number;
  expires_at: number;
  preset: Omit<NotePreset, 'strategy_id'>;
  principal_usd: number;
  actual_tenor_days: number;
  oracle: null | {
    oracle_id: string;
    expiry: string;
    tenor_label: string;
    forward_usd: number;
  };
  allocation: {
    plp_reserve_usd: number;
    plp_reserve_raw: string;
    strip_funding_usd: number;
    strip_funding_raw: string;
    strip_cost_usd: number;
    strip_cost_raw: string;
    manager_buffer_usd: number;
    manager_buffer_raw: string;
  } | null;
  outcomes: {
    reserve_if_plp_unchanged_usd: number;
    current_book_bound_usd: number;
    exit_now_usd: number;
    market_midpoint_usd: number;
    best_case_usd: number;
    theoretical_minimum_usd: number;
    musdc_minimum_usd: number;
  };
  barrier: null | {
    monitoring: 'terminal' | 'discrete';
    lower_usd: number;
    upper_usd: number;
    condition: string;
  };
  strip: null | {
    name: string;
    cost_usd: number;
    exit_bid_usd: number;
    best_payout_usd: number;
    buckets: TerminalBand[];
    raw_buckets: Array<{ lower: string; higher: string; quantity: string }>;
  };
  plp_stress: PlpStressResult | null;
  terminal_bands: TerminalBand[];
  autocall_terms: AutocallTerms | null;
  execution: {
    d_usdc: 'plp-plus-strip' | 'unsupported';
    m_usdc: 'canonical-terminal-note' | 'canonical-autocall';
  };
  risk_disclosure: string;
  musdc_risk_disclosure: string;
}

export class NoteQuoteError extends Error {
  code: 'BAD_PRINCIPAL' | 'UNKNOWN_PRESET' | 'BAD_TENOR' | 'NO_ORACLES';
  constructor(code: NoteQuoteError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const quoteCache = new Map<string, NoteQuote>();
const usd = (raw: unknown): number => Number(raw ?? 0) / RAW;
const round = (value: number, decimals = 6): number => {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
};

function publicPreset(preset: NotePreset): Omit<NotePreset, 'strategy_id'> {
  const { strategy_id: _internal, ...rest } = preset;
  return rest;
}

function presetById(id: string): NotePreset {
  const preset = NOTE_PRESETS.find((item) => item.id === id);
  if (!preset) {
    throw new NoteQuoteError(
      'UNKNOWN_PRESET',
      `unknown preset_id '${id}'. Valid: ${NOTE_PRESETS.map((item) => item.id).join(', ')}`,
    );
  }
  return preset;
}

function quoteBands(quote: StrategyQuote): TerminalBand[] {
  return quote.strip.buckets
    .filter((bucket) => bucket.tradeable && Number(bucket.quantity) > 0)
    .map((bucket) => ({
      lower_usd: bucket.lower_usd,
      higher_usd: bucket.higher_usd,
      payout_usd: usd(bucket.max_payout_raw),
    }));
}

function midpointValue(quote: StrategyQuote): number {
  return (usd(quote.strip.total_cost_raw) + usd(quote.strip.total_redeem_value_raw)) / 2;
}

function pruneQuotes(now = Date.now()): void {
  for (const [id, quote] of quoteCache) {
    if (quote.expires_at <= now) quoteCache.delete(id);
  }
}

async function quoteAutocall(preset: NotePreset, principal: number, sender?: string): Promise<NoteQuote> {
  const expiries = (await listExpiries()).slice(0, 3);
  if (expiries.length < 3) throw new NoteQuoteError('NO_ORACLES', 'Autocall 3 requires three active BTC observations');
  const now = Date.now();
  const [prices, couponReference] = await Promise.all([
    Promise.all(
      expiries.map(async (expiry) => {
        const price = (await predictServer.oraclePriceLatest(expiry.oracle_id)) as { forward?: number; spot?: number };
        return Number(price.spot ?? price.forward ?? 0) / 1e9;
      }),
    ),
    quoteStrategy({
      strategyId: 'pin-forward',
      notionalUsd: Math.max(0.05, principal * 0.03),
      expiryPref: 'mid',
      oracleId: expiries[2].oracle_id,
      sender,
    }),
  ]);
  const initial = prices[0];
  if (!(initial > 0)) throw new NoteQuoteError('NO_ORACLES', 'autocall reference price is unavailable');
  const barrierRatios = [1, 0.975, 0.95];
  const couponBudget = Math.min(principal * 0.05, usd(couponReference.strip.total_cost_raw));
  if (!(couponBudget > 0)) throw new NoteQuoteError('NO_ORACLES', 'autocall coupon reference premium is unavailable');
  const finalTenorMs = Math.max(1, expiries[2].expiry - now);
  const couponFractions = expiries.map((expiry) => Math.max(0, Math.min(1, (expiry.expiry - now) / finalTenorMs)));
  const observations = expiries.map((expiry, index) => ({
    oracle_id: expiry.oracle_id,
    observation_ms: expiry.expiry,
    call_barrier_usd: round(initial * barrierRatios[Math.min(index, barrierRatios.length - 1)], 2),
    coupon_usd: round(couponBudget * couponFractions[Math.min(index, couponFractions.length - 1)]),
  }));
  const terms: AutocallTerms = {
    principal_usd: principal,
    initial_reference_usd: initial,
    knock_in_barrier_usd: round(initial * 0.7, 2),
    coupon_budget_usd: round(couponBudget),
    coupon_source: 'Time-accrued DeepBook final-expiry counterparty premium',
    coupon_oracle_id: couponReference.oracle_id,
    observations,
  };
  const maxCoupon = observations[observations.length - 1].coupon_usd;
  const quote: NoteQuote = {
    quote_id: randomUUID(),
    quoted_at: now,
    expires_at: now + QUOTE_TTL_MS,
    preset: publicPreset(preset),
    principal_usd: round(principal),
    actual_tenor_days: round((observations[observations.length - 1].observation_ms - now) / 86_400_000, 2),
    oracle: {
      oracle_id: observations[observations.length - 1].oracle_id,
      expiry: String(observations[observations.length - 1].observation_ms),
      tenor_label: `${Math.max(1, Math.round((observations[observations.length - 1].observation_ms - now) / 86_400_000))}d`,
      forward_usd: initial,
    },
    allocation: null,
    outcomes: {
      reserve_if_plp_unchanged_usd: principal,
      current_book_bound_usd: 0,
      exit_now_usd: principal,
      market_midpoint_usd: principal,
      best_case_usd: principal + maxCoupon,
      theoretical_minimum_usd: 0,
      musdc_minimum_usd: 0,
    },
    barrier: {
      monitoring: 'discrete',
      lower_usd: terms.knock_in_barrier_usd,
      upper_usd: observations[0].call_barrier_usd,
      condition: 'Discrete call observations; 70% knock-in is tested only at final maturity.',
    },
    strip: null,
    plp_stress: null,
    terminal_bands: [],
    autocall_terms: terms,
    execution: { d_usdc: 'unsupported', m_usdc: 'canonical-autocall' },
    risk_disclosure: 'Autocall coupons are conditional. If no call occurs and the final 70% barrier is breached, redemption falls one-for-one with BTC from the initial reference.',
    musdc_risk_disclosure: 'Autocall coupons are conditional. This isolated mUSDC testnet receipt is not dUSDC or a DeepBook position; below the final 70% barrier, redemption follows BTC one-for-one.',
  };
  pruneQuotes(now);
  quoteCache.set(quote.quote_id, quote);
  return quote;
}

export async function quoteNote(args: {
  principalUsd: number;
  presetId: string;
  tenorDays?: number;
  sender?: string;
}): Promise<NoteQuote> {
  const principal = Number(args.principalUsd);
  if (!Number.isFinite(principal) || principal < 5 || principal > 250) {
    throw new NoteQuoteError('BAD_PRINCIPAL', 'principal_usd must be between 5 and 250 for the testnet pool');
  }
  const preset = presetById(String(args.presetId));
  const tenor = args.tenorDays === undefined ? preset.default_tenor_days : Number(args.tenorDays);
  if (!Number.isFinite(tenor) || tenor <= 0 || tenor > 365) {
    throw new NoteQuoteError('BAD_TENOR', 'tenor_days must be in (0, 365]');
  }
  if (preset.kind === 'autocall') return quoteAutocall(preset, principal, args.sender);

  const principalRaw = BigInt(Math.round(principal * RAW));
  const targetStripBudget = Math.max(0.05, principal * (1 - preset.reserve_target_pct));
  const expiries = await listExpiries();
  if (expiries.length === 0) throw new NoteQuoteError('NO_ORACLES', 'No active BTC expiry is available');
  const requestedExpiry = Date.now() + tenor * 86_400_000;
  const selectedExpiry = expiries.reduce((nearest, candidate) =>
    Math.abs(candidate.expiry - requestedExpiry) < Math.abs(nearest.expiry - requestedExpiry)
      ? candidate
      : nearest,
  );
  const [stripQuote, vaultRaw] = await Promise.all([
    quoteStrategy({
      strategyId: preset.strategy_id as string,
      notionalUsd: targetStripBudget,
      oracleId: selectedExpiry.oracle_id,
      sender: args.sender,
    }),
    predictServer.vaultSummary(),
  ]);

  const stripCostRaw = BigInt(stripQuote.strip.total_cost_raw);
  const stripFundingRaw = (stripCostRaw * BigInt(Math.round(EXECUTION_BUFFER * 100))) / 100n;
  if (stripFundingRaw >= principalRaw) {
    throw new NoteQuoteError('BAD_PRINCIPAL', 'principal is too small for this note and its execution buffer');
  }
  const plpRaw = principalRaw - stripFundingRaw;
  const managerBufferRaw = stripFundingRaw - stripCostRaw;
  const plpUsd = usd(plpRaw);
  const managerBuffer = usd(managerBufferRaw);
  const stripCost = usd(stripCostRaw);
  const stripExit = usd(stripQuote.strip.total_redeem_value_raw);
  const stripBest = usd(stripQuote.strip.realized_max_payout_raw);
  const bands = quoteBands(stripQuote);
  const staticBase = plpUsd + managerBuffer;
  const terminalBands = composeTerminalBands({ base_usd: staticBase, payoffs: [{ sign: 1, bands }] });
  const stats = terminalBandStats(terminalBands);

  const balance = usd(vaultRaw.vault_balance);
  const nav = usd(vaultRaw.vault_value);
  const stress = plpStress(
    {
      balance_usd: balance,
      nav_usd: nav,
      marked_liability_usd: usd(vaultRaw.total_mtm),
      max_payout_usd: usd(vaultRaw.total_max_payout),
      total_shares: usd(vaultRaw.plp_total_supply),
      share_price: Number(vaultRaw.plp_share_price ?? 1),
    },
    plpUsd,
  );
  const lower = bands.length ? Math.min(...bands.map((band) => band.lower_usd)) : stripQuote.forward_usd;
  const upper = bands.length ? Math.max(...bands.map((band) => band.higher_usd)) : stripQuote.forward_usd;
  const barrier = preset.kind === 'participation'
    ? null
    : {
        monitoring: 'terminal' as const,
        lower_usd: round(lower, 2),
        upper_usd: round(upper, 2),
        condition: preset.payoff_condition,
      };
  const now = Date.now();
  const quote: NoteQuote = {
    quote_id: randomUUID(),
    quoted_at: now,
    expires_at: now + QUOTE_TTL_MS,
    preset: publicPreset(preset),
    principal_usd: round(principal),
    actual_tenor_days: round((Number(stripQuote.expiry) - now) / 86_400_000, 2),
    oracle: {
      oracle_id: stripQuote.oracle_id,
      expiry: stripQuote.expiry,
      tenor_label: stripQuote.tenor_label,
      forward_usd: stripQuote.forward_usd,
    },
    allocation: {
      plp_reserve_usd: round(plpUsd),
      plp_reserve_raw: plpRaw.toString(),
      strip_funding_usd: round(usd(stripFundingRaw)),
      strip_funding_raw: stripFundingRaw.toString(),
      strip_cost_usd: round(stripCost),
      strip_cost_raw: stripCostRaw.toString(),
      manager_buffer_usd: round(managerBuffer),
      manager_buffer_raw: managerBufferRaw.toString(),
    },
    outcomes: {
      reserve_if_plp_unchanged_usd: round(staticBase),
      current_book_bound_usd: round(stress.current_book_max_payout_bound_usd + managerBuffer),
      exit_now_usd: round(plpUsd + managerBuffer + stripExit),
      market_midpoint_usd: round(plpUsd + managerBuffer + midpointValue(stripQuote)),
      best_case_usd: round(stats.maximum_usd),
      theoretical_minimum_usd: 0,
      musdc_minimum_usd: round(stats.minimum_usd),
    },
    barrier,
    strip: {
      name: stripQuote.name,
      cost_usd: round(stripCost),
      exit_bid_usd: round(stripExit),
      best_payout_usd: round(stripBest),
      buckets: bands,
      raw_buckets: stripQuote.strip.buckets
        .filter((bucket) => bucket.tradeable && BigInt(bucket.quantity) > 0n)
        .map((bucket) => ({ lower: bucket.lower, higher: bucket.higher, quantity: bucket.quantity })),
    },
    plp_stress: stress,
    terminal_bands: terminalBands,
    autocall_terms: null,
    execution: { d_usdc: 'plp-plus-strip', m_usdc: 'canonical-terminal-note' },
    risk_disclosure: 'The PLP reserve is market-making exposure, not cash or guaranteed principal. Its NAV can fall, manager idle collateral is pooled, and withdrawals can be constrained while liabilities remain open.',
    musdc_risk_disclosure: 'The displayed terminal schedule is canonical for this isolated mUSDC testnet receipt. It does not confer PLP ownership, dUSDC rights, or DeepBook settlement.',
  };
  pruneQuotes(now);
  quoteCache.set(quote.quote_id, quote);
  return quote;
}

export function listStrategies(): { presets: Array<Omit<NotePreset, 'strategy_id'>> } {
  return { presets: NOTE_PRESETS.map(publicPreset) };
}

export function getNoteQuote(quoteId: string): NoteQuote {
  pruneQuotes();
  const quote = quoteCache.get(quoteId);
  if (!quote) throw new Error('note quote is missing or expired; request a fresh quote');
  return quote;
}
