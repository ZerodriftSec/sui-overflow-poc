/**
 * DeepBook PLP yield strategies.
 *
 * dUSDC execution owns real PLP shares and, for guarded variants, real long
 * range positions. mUSDC execution is an isolated terminal payoff mirror priced
 * from the same DeepBook quotes; it is not represented as PLP ownership.
 */
import { randomUUID } from 'crypto';
import { quoteStrategy, type StrategyQuote } from './deepbook-strategies';
import { managersForOwner, predictServer } from './predict/server';
import { PREDICT, getManagedDeployment } from './predict/config';
import { getSuiClient } from './predict/sui';
import { previewRangeBatch } from './predict/index';
import { managerIdleBalance } from './predict/structured';
import {
  composeTerminalBands,
  plpStress,
  terminalBandStats,
  type PlpStressResult,
  type TerminalBand,
} from './structured-payoffs';

const RAW = 1_000_000;
const QUOTE_TTL_MS = 90_000;
const HEDGE_FUNDING_BUFFER = 1.12;

export type YieldRisk = 'medium' | 'high';

export interface YieldStrategyDef {
  id: string;
  name: string;
  risk: YieldRisk;
  hedge: 'none' | 'downside' | 'two-way' | 'center';
  plp_target_pct: number;
  thesis: string;
  carry_source: string;
  risk_note: string;
  hedge_strategy_id: string | null;
}

const YIELD_STRATEGIES: YieldStrategyDef[] = [
  {
    id: 'core-market-maker',
    name: 'Core Market Maker',
    risk: 'high',
    hedge: 'none',
    plp_target_pct: 1,
    thesis: 'Own the pooled counterparty side of every DeepBook Predict range trade.',
    carry_source: 'Buyer premiums and bid/ask spread retained in PLP NAV.',
    risk_note: 'Unhedged PLP can lose principal and withdrawals can be liquidity-constrained while liabilities are open.',
    hedge_strategy_id: null,
  },
  {
    id: 'downside-guard',
    name: 'Downside Guard',
    risk: 'medium',
    hedge: 'downside',
    plp_target_pct: 0.88,
    thesis: 'Earn pooled PLP carry while owning a lower-tail BTC range hedge.',
    carry_source: 'PLP premium capture, offset by the live cost of the downside hedge.',
    risk_note: 'The hedge pays only in its terminal lower bands and does not guarantee a principal floor.',
    hedge_strategy_id: 'flush-down',
  },
  {
    id: 'two-way-guard',
    name: 'Two-Way Guard',
    risk: 'medium',
    hedge: 'two-way',
    plp_target_pct: 0.85,
    thesis: 'Pair pooled PLP carry with a two-sided breakout strip across BTC tails.',
    carry_source: 'PLP premium capture, offset by the live cost of both breakout wings.',
    risk_note: 'A quiet settlement can lose the hedge premium while PLP remains exposed to the pooled book.',
    hedge_strategy_id: 'break-range',
  },
  {
    id: 'center-rebate',
    name: 'Center Rebate',
    risk: 'medium',
    hedge: 'center',
    plp_target_pct: 0.9,
    thesis: 'Retain PLP carry and buy back a concentrated slice of near-forward range liability.',
    carry_source: 'PLP premium capture, with a live center-band rebate if BTC pins.',
    risk_note: 'The rebate is local to its terminal bands; it cannot offset unrelated pool liabilities.',
    hedge_strategy_id: 'pin-forward',
  },
];

export interface YieldQuote {
  quote_id: string;
  quoted_at: number;
  expires_at: number;
  strategy: Omit<YieldStrategyDef, 'hedge_strategy_id'>;
  capital_usd: number;
  capital_raw: string;
  allocation: {
    plp_usd: number;
    plp_raw: string;
    hedge_funding_usd: number;
    hedge_funding_raw: string;
    hedge_cost_usd: number;
    hedge_cost_raw: string;
    manager_buffer_usd: number;
    manager_buffer_raw: string;
  };
  vault: {
    balance_usd: number;
    nav_usd: number;
    marked_liability_usd: number;
    max_payout_usd: number;
    available_liquidity_usd: number;
    remaining_risk_capacity_usd: number;
    share_price: number;
    lifetime_share_return: number;
    utilization: number;
    deployed_at: string | null;
  };
  plp_stress: PlpStressResult;
  scenarios: Array<{
    id: 'mark' | 'current-book-bound' | 'hedge-best' | 'theoretical-minimum';
    label: string;
    value_usd: number;
    return_pct: number;
    kind: 'base' | 'risk' | 'upside';
  }>;
  hedge: null | {
    name: string;
    oracle_id: string;
    expiry: string;
    tenor_label: string;
    forward_usd: number;
    cost_usd: number;
    exit_bid_usd: number;
    best_payout_usd: number;
    buckets: TerminalBand[];
    raw_buckets: Array<{ lower: string; higher: string; quantity: string }>;
  };
  reference_book: {
    label: string;
    premium_usd: number;
    midpoint_liability_usd: number;
    max_liability_usd: number;
    oracle_id: string;
    expiry: string;
    tenor_label: string;
    forward_usd: number;
    buckets: TerminalBand[];
  };
  musdc_model: {
    description: string;
    expected_terminal_usd: number;
    minimum_terminal_usd: number;
    maximum_terminal_usd: number;
    terminal_bands: TerminalBand[];
  };
  execution: {
    d_usdc: 'deepbook-plp' | 'deepbook-plp-plus-hedge';
    m_usdc: 'isolated-reference-payoff';
  };
}

const quoteCache = new Map<string, YieldQuote>();

const usd = (raw: unknown): number => Number(raw ?? 0) / RAW;
const round = (value: number, decimals = 6): number => {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
};

function publicStrategy(def: YieldStrategyDef): Omit<YieldStrategyDef, 'hedge_strategy_id'> {
  const { hedge_strategy_id: _internal, ...rest } = def;
  return rest;
}

function strategyById(id: string): YieldStrategyDef {
  const found = YIELD_STRATEGIES.find((strategy) => strategy.id === id);
  if (!found) throw new Error(`unknown yield strategy '${id}'`);
  return found;
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

function rawBuckets(quote: StrategyQuote): Array<{ lower: string; higher: string; quantity: string }> {
  return quote.strip.buckets
    .filter((bucket) => bucket.tradeable && BigInt(bucket.quantity) > 0n)
    .map((bucket) => ({ lower: bucket.lower, higher: bucket.higher, quantity: bucket.quantity }));
}

function midpointValue(quote: StrategyQuote): number {
  return (usd(quote.strip.total_cost_raw) + usd(quote.strip.total_redeem_value_raw)) / 2;
}

function addScenario(
  capital: number,
  id: YieldQuote['scenarios'][number]['id'],
  label: string,
  value: number,
  kind: YieldQuote['scenarios'][number]['kind'],
): YieldQuote['scenarios'][number] {
  return {
    id,
    label,
    value_usd: round(Math.max(0, value)),
    return_pct: round(capital > 0 ? ((value - capital) / capital) * 100 : 0, 3),
    kind,
  };
}

function pruneQuotes(now = Date.now()): void {
  for (const [id, quote] of quoteCache) {
    if (quote.expires_at <= now) quoteCache.delete(id);
  }
}

export function listYieldStrategies(): { strategies: Array<Omit<YieldStrategyDef, 'hedge_strategy_id'>> } {
  return { strategies: YIELD_STRATEGIES.map(publicStrategy) };
}

export async function quoteYieldStrategy(args: {
  strategyId: string;
  capitalUsd: number;
  sender?: string;
}): Promise<YieldQuote> {
  const def = strategyById(args.strategyId);
  const capital = Number(args.capitalUsd);
  if (!Number.isFinite(capital) || capital < 5 || capital > 250) {
    throw new Error('capital_usd must be between 5 and 250 for the testnet pool');
  }

  const capitalRaw = BigInt(Math.round(capital * RAW));
  const referenceBudget = Math.max(0.05, capital * 0.04);
  const hedgeBudget = def.hedge_strategy_id ? Math.max(0.05, capital * (1 - def.plp_target_pct)) : 0;

  const [vaultRaw, reference, hedgeQuote] = await Promise.all([
    predictServer.vaultSummary(),
    quoteStrategy({
      strategyId: 'pin-forward',
      notionalUsd: referenceBudget,
      expiryPref: 'mid',
      sender: args.sender,
    }),
    def.hedge_strategy_id
      ? quoteStrategy({
          strategyId: def.hedge_strategy_id,
          notionalUsd: hedgeBudget,
          expiryPref: def.hedge === 'downside' || def.hedge === 'two-way' ? 'far' : 'mid',
          sender: args.sender,
        })
      : Promise.resolve(null),
  ]);

  const hedgeCostRaw = hedgeQuote ? BigInt(hedgeQuote.strip.total_cost_raw) : 0n;
  const hedgeFundingRaw = hedgeQuote
    ? (hedgeCostRaw * BigInt(Math.round(HEDGE_FUNDING_BUFFER * 100))) / 100n
    : 0n;
  if (hedgeFundingRaw >= capitalRaw) throw new Error('hedge funding consumes the full capital allocation');
  const plpRaw = capitalRaw - hedgeFundingRaw;
  const managerBufferRaw = hedgeFundingRaw - hedgeCostRaw;

  const balance = usd(vaultRaw.vault_balance);
  const nav = usd(vaultRaw.vault_value);
  const marked = usd(vaultRaw.total_mtm);
  const maxPayout = usd(vaultRaw.total_max_payout);
  const available = usd(vaultRaw.available_liquidity);
  const remaining = usd(vaultRaw.remaining_risk_capacity);
  const totalShares = usd(vaultRaw.plp_total_supply);
  const sharePrice = Number(vaultRaw.plp_share_price ?? 1);
  const plpUsd = usd(plpRaw);
  const stress = plpStress(
    {
      balance_usd: balance,
      nav_usd: nav,
      marked_liability_usd: marked,
      max_payout_usd: maxPayout,
      total_shares: totalShares,
      share_price: sharePrice,
    },
    plpUsd,
  );

  const bufferUsd = usd(managerBufferRaw);
  const hedgeCost = usd(hedgeCostRaw);
  const hedgeExit = hedgeQuote ? usd(hedgeQuote.strip.total_redeem_value_raw) : 0;
  const hedgeBest = hedgeQuote ? usd(hedgeQuote.strip.realized_max_payout_raw) : 0;
  const hedgeBands = hedgeQuote ? quoteBands(hedgeQuote) : [];
  const referenceBands = quoteBands(reference);
  const referencePremium = usd(reference.strip.total_cost_raw);
  const referenceMid = midpointValue(reference);
  const referenceMax = usd(reference.strip.realized_max_payout_raw);

  // Isolated mUSDC counterparty mirror: capital funds the hedge; the reference
  // buyer premium is earned, reference payout is owed, and hedge payout is added.
  const terminalBands = composeTerminalBands({
    base_usd: capital - hedgeCost + referencePremium,
    payoffs: [
      { sign: -1, bands: referenceBands },
      ...(hedgeBands.length > 0 ? [{ sign: 1 as const, bands: hedgeBands }] : []),
    ],
  });
  const terminalStats = terminalBandStats(terminalBands);
  const modelExpected = capital - hedgeCost + referencePremium - referenceMid + (hedgeQuote ? midpointValue(hedgeQuote) : 0);

  const deployedAt = getManagedDeployment()?.deployedAt ?? null;
  const now = Date.now();
  const quote: YieldQuote = {
    quote_id: randomUUID(),
    quoted_at: now,
    expires_at: now + QUOTE_TTL_MS,
    strategy: publicStrategy(def),
    capital_usd: round(capital),
    capital_raw: capitalRaw.toString(),
    allocation: {
      plp_usd: round(plpUsd),
      plp_raw: plpRaw.toString(),
      hedge_funding_usd: round(usd(hedgeFundingRaw)),
      hedge_funding_raw: hedgeFundingRaw.toString(),
      hedge_cost_usd: round(hedgeCost),
      hedge_cost_raw: hedgeCostRaw.toString(),
      manager_buffer_usd: round(bufferUsd),
      manager_buffer_raw: managerBufferRaw.toString(),
    },
    vault: {
      balance_usd: round(balance),
      nav_usd: round(nav),
      marked_liability_usd: round(marked),
      max_payout_usd: round(maxPayout),
      available_liquidity_usd: round(available),
      remaining_risk_capacity_usd: round(remaining),
      share_price: round(sharePrice, 8),
      lifetime_share_return: round(sharePrice - 1, 8),
      utilization: round(Number(vaultRaw.utilization ?? 0), 8),
      deployed_at: deployedAt,
    },
    plp_stress: stress,
    scenarios: [
      addScenario(capital, 'mark', 'Mark now', plpUsd + bufferUsd + hedgeExit, 'base'),
      addScenario(capital, 'current-book-bound', 'Current-book max-payout bound', stress.current_book_max_payout_bound_usd + bufferUsd, 'risk'),
      addScenario(
        capital,
        'hedge-best',
        hedgeQuote ? 'Hedge best band · PLP held at mark' : 'Current liabilities expire',
        hedgeQuote
          ? plpUsd + bufferUsd + hedgeBest
          : stress.all_current_liabilities_expire_usd + bufferUsd,
        'upside',
      ),
      addScenario(capital, 'theoretical-minimum', 'Theoretical minimum', bufferUsd, 'risk'),
    ],
    hedge: hedgeQuote
      ? {
          name: hedgeQuote.name,
          oracle_id: hedgeQuote.oracle_id,
          expiry: hedgeQuote.expiry,
          tenor_label: hedgeQuote.tenor_label,
          forward_usd: hedgeQuote.forward_usd,
          cost_usd: round(hedgeCost),
          exit_bid_usd: round(hedgeExit),
          best_payout_usd: round(hedgeBest),
          buckets: hedgeBands,
          raw_buckets: rawBuckets(hedgeQuote),
        }
      : null,
    reference_book: {
      label: 'Pin the Forward buyer flow',
      premium_usd: round(referencePremium),
      midpoint_liability_usd: round(referenceMid),
      max_liability_usd: round(referenceMax),
      oracle_id: reference.oracle_id,
      expiry: reference.expiry,
      tenor_label: reference.tenor_label,
      forward_usd: reference.forward_usd,
      buckets: referenceBands,
    },
    musdc_model: {
      description: 'Isolated testnet counterparty payoff using the live DeepBook reference premium and terminal bands.',
      expected_terminal_usd: round(modelExpected),
      minimum_terminal_usd: round(terminalStats.minimum_usd),
      maximum_terminal_usd: round(terminalStats.maximum_usd),
      terminal_bands: terminalBands,
    },
    execution: {
      d_usdc: hedgeQuote ? 'deepbook-plp-plus-hedge' : 'deepbook-plp',
      m_usdc: 'isolated-reference-payoff',
    },
  };
  pruneQuotes(now);
  quoteCache.set(quote.quote_id, quote);
  return quote;
}

export function getYieldQuote(quoteId: string): YieldQuote {
  pruneQuotes();
  const quote = quoteCache.get(quoteId);
  if (!quote) throw new Error('yield quote is missing or expired; request a fresh quote');
  return quote;
}

export async function yieldAccount(owner: string): Promise<{
  owner: string;
  coin_type: string;
  coin_count: number;
  shares_raw: string;
  shares: number;
  share_price: number;
  value_usd: number;
  manager_idle_usd: number;
  range_bid_value_usd: number;
  total_value_usd: number;
  manager_count: number;
  range_position_count: number;
  range_mark_status: 'live' | 'settled' | 'unavailable' | 'empty';
  managers: Array<{
    manager_id: string;
    idle_usd: number;
    range_bid_value_usd: number;
    ranges: Array<{
      oracle_id: string;
      expiry: string;
      lower_usd: number;
      higher_usd: number;
      quantity: number;
      bid_value_usd: number;
      max_payout_usd: number;
      mark_status: 'live' | 'settled' | 'unavailable';
    }>;
  }>;
  available_pool_liquidity_usd: number;
  coins: Array<{ coin_object_id: string; balance_raw: string }>;
}> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(owner)) throw new Error('owner must be a 32-byte Sui address');
  const coinType = `${PREDICT.packageId}::plp::PLP`;
  const [coinsResult, vaultRaw, managerRefs, oracles] = await Promise.all([
    getSuiClient().getCoins({ owner, coinType }),
    predictServer.vaultSummary(),
    managersForOwner(owner),
    predictServer.predictOracles().catch(() => predictServer.oracles()),
  ]);
  const sharesRaw = coinsResult.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
  const sharePrice = Number(vaultRaw.plp_share_price ?? 1);
  const shares = usd(sharesRaw);
  const oracleById = new Map(oracles.map((oracle) => [oracle.oracle_id.toLowerCase(), oracle]));
  const managerAccounts = await Promise.all(managerRefs.map(async (manager) => {
    const [idleRaw, rawPositions] = await Promise.all([
      managerIdleBalance(manager.manager_id),
      predictServer.managerPositions(manager.manager_id),
    ]);
    const rawRanges = ((rawPositions as { ranges?: Array<{
      oracle_id: string;
      expiry: string;
      lower_strike: string;
      higher_strike: string;
      quantity: string;
    }> }).ranges ?? []).filter((range) => BigInt(range.quantity) > 0n);
    const marked = new Map<number, { bid: bigint; status: 'live' | 'settled' | 'unavailable' }>();
    const groups = new Map<string, Array<{ index: number; range: typeof rawRanges[number] }>>();
    rawRanges.forEach((range, index) => {
      const key = `${range.oracle_id.toLowerCase()}|${range.expiry}`;
      const group = groups.get(key) ?? [];
      group.push({ index, range });
      groups.set(key, group);
    });
    await Promise.all([...groups.values()].map(async (group) => {
      const first = group[0].range;
      const oracle = oracleById.get(first.oracle_id.toLowerCase());
      if (oracle?.settlement_price != null) {
        const settlement = BigInt(String(oracle.settlement_price));
        for (const item of group) {
          const hit = settlement > BigInt(item.range.lower_strike) && settlement <= BigInt(item.range.higher_strike);
          marked.set(item.index, { bid: hit ? BigInt(item.range.quantity) : 0n, status: 'settled' });
        }
        return;
      }
      try {
        const quotes = await previewRangeBatch({
          oracleId: first.oracle_id,
          expiry: first.expiry,
          sender: owner,
          bands: group.map((item) => ({
            lower: item.range.lower_strike,
            higher: item.range.higher_strike,
            quantity: BigInt(item.range.quantity),
          })),
        });
        quotes.forEach((quote, offset) => {
          marked.set(group[offset].index, {
            bid: quote.ok ? quote.redeem_payout : 0n,
            status: quote.ok ? 'live' : 'unavailable',
          });
        });
      } catch {
        for (const item of group) marked.set(item.index, { bid: 0n, status: 'unavailable' });
      }
    }));
    const ranges = rawRanges.map((range, index) => {
      const mark = marked.get(index) ?? { bid: 0n, status: 'unavailable' as const };
      return {
        oracle_id: range.oracle_id,
        expiry: range.expiry,
        lower_usd: round(Number(range.lower_strike) / 1e9, 2),
        higher_usd: round(Number(range.higher_strike) / 1e9, 2),
        quantity: round(usd(range.quantity)),
        bid_value_usd: round(usd(mark.bid)),
        max_payout_usd: round(usd(range.quantity)),
        mark_status: mark.status,
      };
    });
    return {
      manager_id: manager.manager_id,
      idle_usd: round(usd(idleRaw)),
      range_bid_value_usd: round(ranges.reduce((sum, range) => sum + range.bid_value_usd, 0)),
      ranges,
    };
  }));
  const managerIdleUsd = managerAccounts.reduce((sum, manager) => sum + manager.idle_usd, 0);
  const rangeBidValueUsd = managerAccounts.reduce((sum, manager) => sum + manager.range_bid_value_usd, 0);
  const rangeStatuses = managerAccounts.flatMap((manager) => manager.ranges.map((range) => range.mark_status));
  const rangeMarkStatus = rangeStatuses.length === 0
    ? 'empty' as const
    : rangeStatuses.includes('unavailable')
      ? 'unavailable' as const
      : rangeStatuses.every((status) => status === 'settled')
        ? 'settled' as const
        : 'live' as const;
  const plpValue = shares * sharePrice;
  return {
    owner,
    coin_type: coinType,
    coin_count: coinsResult.data.length,
    shares_raw: sharesRaw.toString(),
    shares: round(shares),
    share_price: round(sharePrice, 8),
    value_usd: round(plpValue),
    manager_idle_usd: round(managerIdleUsd),
    range_bid_value_usd: round(rangeBidValueUsd),
    total_value_usd: round(plpValue + managerIdleUsd + rangeBidValueUsd),
    manager_count: managerAccounts.length,
    range_position_count: managerAccounts.reduce((sum, manager) => sum + manager.ranges.length, 0),
    range_mark_status: rangeMarkStatus,
    managers: managerAccounts,
    available_pool_liquidity_usd: round(usd(vaultRaw.available_liquidity)),
    coins: coinsResult.data.map((coin) => ({ coin_object_id: coin.coinObjectId, balance_raw: coin.balance })),
  };
}
