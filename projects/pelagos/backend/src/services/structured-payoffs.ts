/**
 * Pure payoff and PLP risk math shared by DeepBook yield strategies, notes, and
 * mUSDC lifecycle settlement. No RPC calls and no pricing assumptions live here.
 */

export interface TerminalBand {
  lower_usd: number;
  higher_usd: number;
  payout_usd: number;
}

export interface SignedPayoff {
  sign: 1 | -1;
  bands: TerminalBand[];
}

const PAYOFF_DOMAIN_MAX = 1_000_000_000;
const MONEY_EPSILON = 1e-8;

function finiteMoney(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function nonNegativeMoney(value: number, label: string): number {
  const finite = finiteMoney(value, label);
  if (finite < 0) throw new Error(`${label} must be non-negative`);
  return finite;
}

/**
 * Build a non-overlapping, exhaustive terminal payout schedule over (0, $1bn].
 * Each source contributes its signed payout in the interval it covers. Adjacent
 * intervals with the same payout are merged so the schedule stays compact.
 */
export function composeTerminalBands(args: {
  base_usd: number;
  payoffs?: SignedPayoff[];
  floor_at_zero?: boolean;
}): TerminalBand[] {
  const base = finiteMoney(args.base_usd, 'base_usd');
  const payoffs = args.payoffs ?? [];
  const boundaries = new Set<number>([0, PAYOFF_DOMAIN_MAX]);

  for (const source of payoffs) {
    for (const band of source.bands) {
      const lower = finiteMoney(band.lower_usd, 'band.lower_usd');
      const higher = finiteMoney(band.higher_usd, 'band.higher_usd');
      nonNegativeMoney(band.payout_usd, 'band.payout_usd');
      if (!(lower < higher)) throw new Error('terminal payoff band must have lower < higher');
      boundaries.add(Math.max(0, Math.min(PAYOFF_DOMAIN_MAX, lower)));
      boundaries.add(Math.max(0, Math.min(PAYOFF_DOMAIN_MAX, higher)));
    }
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const built: TerminalBand[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const lower = sorted[i];
    const higher = sorted[i + 1];
    if (!(higher > lower)) continue;
    const probe = lower + (higher - lower) / 2;
    let payout = base;
    for (const source of payoffs) {
      for (const band of source.bands) {
        if (probe > band.lower_usd && probe <= band.higher_usd) {
          payout += source.sign * band.payout_usd;
        }
      }
    }
    if (args.floor_at_zero !== false) payout = Math.max(0, payout);
    payout = Math.round(payout * 1e6) / 1e6;

    const previous = built[built.length - 1];
    if (previous && Math.abs(previous.payout_usd - payout) <= MONEY_EPSILON) {
      previous.higher_usd = higher;
    } else {
      built.push({ lower_usd: lower, higher_usd: higher, payout_usd: payout });
    }
  }
  return built;
}

export function terminalBandStats(bands: TerminalBand[]): {
  minimum_usd: number;
  maximum_usd: number;
} {
  if (bands.length === 0) return { minimum_usd: 0, maximum_usd: 0 };
  return {
    minimum_usd: Math.min(...bands.map((band) => band.payout_usd)),
    maximum_usd: Math.max(...bands.map((band) => band.payout_usd)),
  };
}

export interface PlpVaultInputs {
  balance_usd: number;
  nav_usd: number;
  marked_liability_usd: number;
  max_payout_usd: number;
  total_shares: number;
  share_price: number;
}

export interface PlpStressResult {
  deposit_usd: number;
  expected_shares: number;
  post_deposit_pool_share: number;
  mark_value_usd: number;
  all_current_liabilities_expire_usd: number;
  current_book_max_payout_bound_usd: number;
  theoretical_minimum_usd: number;
  post_deposit_utilization: number;
  post_deposit_withdrawable_pool_usd: number;
}

/**
 * Exact pro-rata values for a new PLP deposit against the CURRENT book.
 *
 * The protocol defines NAV = balance - marked liabilities. A depositor receives
 * D/(NAV + D) of the post-deposit pool (ignoring only integer share rounding).
 * The max-payout row is a conservative current-book bound, not a forecast: future
 * trades can add liabilities after the quote.
 */
export function plpStress(vault: PlpVaultInputs, depositUsd: number): PlpStressResult {
  const deposit = finiteMoney(depositUsd, 'deposit_usd');
  if (!(deposit >= 0)) throw new Error('deposit_usd must be non-negative');
  const balance = nonNegativeMoney(vault.balance_usd, 'balance_usd');
  const nav = nonNegativeMoney(vault.nav_usd, 'nav_usd');
  const markedLiability = nonNegativeMoney(vault.marked_liability_usd, 'marked_liability_usd');
  const maxPayout = nonNegativeMoney(vault.max_payout_usd, 'max_payout_usd');
  const totalShares = nonNegativeMoney(vault.total_shares, 'total_shares');
  const sharePrice = nonNegativeMoney(vault.share_price, 'share_price');
  const derivedNav = Math.max(0, balance - markedLiability);
  if (Math.abs(nav - derivedNav) > 0.000001) {
    throw new Error('PLP snapshot is inconsistent: nav_usd must equal balance_usd - marked_liability_usd');
  }
  if (totalShares > 0) {
    if (!(sharePrice > 0)) throw new Error('share_price must be positive when PLP shares exist');
    const derivedSharePrice = nav / totalShares;
    const tolerance = Math.max(0.00000001, Math.abs(derivedSharePrice) * 0.000001);
    if (Math.abs(sharePrice - derivedSharePrice) > tolerance) {
      throw new Error('PLP snapshot is inconsistent: share_price must equal nav_usd / total_shares');
    }
  }
  const postNav = nav + deposit;
  const poolShare = postNav > 0 ? deposit / postNav : 0;
  const expectedShares = sharePrice > 0 ? deposit / sharePrice : deposit;
  const noLiabilityEquity = balance + deposit;
  const maxPayoutEquity = Math.max(0, noLiabilityEquity - maxPayout);
  const withdrawable = maxPayoutEquity;

  return {
    deposit_usd: deposit,
    expected_shares: expectedShares,
    post_deposit_pool_share: poolShare,
    mark_value_usd: deposit,
    all_current_liabilities_expire_usd: poolShare * noLiabilityEquity,
    current_book_max_payout_bound_usd: poolShare * maxPayoutEquity,
    theoretical_minimum_usd: 0,
    post_deposit_utilization: noLiabilityEquity > 0 ? maxPayout / noLiabilityEquity : 0,
    post_deposit_withdrawable_pool_usd: withdrawable,
  };
}

export interface AutocallObservation {
  oracle_id: string;
  observation_ms: number;
  call_barrier_usd: number;
  /** Total coupon paid if the note calls at this observation. */
  coupon_usd: number;
  settlement_usd?: number | null;
}

export interface AutocallTerms {
  principal_usd: number;
  initial_reference_usd: number;
  knock_in_barrier_usd: number;
  coupon_budget_usd?: number;
  coupon_source?: string;
  coupon_oracle_id?: string;
  observations: AutocallObservation[];
}

export interface SettlementOracle {
  oracle_id: string;
  settlement_price?: unknown;
}

/** Convert one authoritative raw 1e9 oracle settlement to USD, or null while pending. */
export function authoritativeSettlementUsd(
  oracles: SettlementOracle[],
  oracleId: string,
): number | null {
  const raw = oracles.find((oracle) => oracle.oracle_id === oracleId)?.settlement_price;
  if (raw == null) return null;
  const price = Number(raw) / 1e9;
  return Number.isFinite(price) && price > 0 ? price : null;
}

export type AutocallDecision =
  | { status: 'pending'; next_observation_ms: number }
  | { status: 'awaiting_settlement'; observation_ms: number; oracle_id: string }
  | { status: 'called'; observation_index: number; settlement_usd: number; payout_usd: number }
  | { status: 'matured'; knocked_in: boolean; settlement_usd: number; payout_usd: number };

/** Resolve a discrete-observation autocall from authoritative oracle settlements. */
export function resolveAutocall(terms: AutocallTerms, nowMs: number): AutocallDecision {
  const principal = finiteMoney(terms.principal_usd, 'principal_usd');
  const initial = finiteMoney(terms.initial_reference_usd, 'initial_reference_usd');
  const knockIn = finiteMoney(terms.knock_in_barrier_usd, 'knock_in_barrier_usd');
  finiteMoney(nowMs, 'now_ms');
  if (!(principal > 0) || !(initial > 0)) throw new Error('autocall principal and initial reference must be positive');
  if (!(knockIn > 0)) throw new Error('autocall knock-in barrier must be positive');
  if (terms.observations.length === 0) throw new Error('autocall requires at least one observation');

  const observations = [...terms.observations].sort((a, b) => a.observation_ms - b.observation_ms);
  for (let i = 0; i < observations.length; i++) {
    const observation = observations[i];
    finiteMoney(observation.observation_ms, `observations[${i}].observation_ms`);
    if (!(finiteMoney(observation.call_barrier_usd, `observations[${i}].call_barrier_usd`) > 0)) {
      throw new Error(`observations[${i}].call_barrier_usd must be positive`);
    }
    nonNegativeMoney(observation.coupon_usd, `observations[${i}].coupon_usd`);
    if (nowMs < observation.observation_ms) {
      return { status: 'pending', next_observation_ms: observation.observation_ms };
    }
    if (observation.settlement_usd == null || !Number.isFinite(observation.settlement_usd)) {
      return {
        status: 'awaiting_settlement',
        observation_ms: observation.observation_ms,
        oracle_id: observation.oracle_id,
      };
    }
    const settlement = nonNegativeMoney(observation.settlement_usd, `observations[${i}].settlement_usd`);
    if (settlement >= observation.call_barrier_usd) {
      return {
        status: 'called',
        observation_index: i,
        settlement_usd: settlement,
        payout_usd: principal + Math.max(0, observation.coupon_usd),
      };
    }
  }

  const final = observations[observations.length - 1];
  const settlement = final.settlement_usd as number;
  const knockedIn = settlement < knockIn;
  return {
    status: 'matured',
    knocked_in: knockedIn,
    settlement_usd: settlement,
    payout_usd: knockedIn ? principal * Math.max(0, settlement / initial) : principal,
  };
}
