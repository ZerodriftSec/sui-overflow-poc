"use client";

/**
 * Typed clients for the new dual-mode product engines (Basic/Advanced surfaces).
 * One module so every product page consumes a consistent, typed contract.
 * All endpoints are LIVE (real DeepBook Predict / Polymarket / DeFiLlama /
 * Coinbase data) — see each backend service for sourcing + honest fallbacks.
 */
import { BACKEND_URL } from "./tokens";

async function getJson<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", ...opts });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${path} -> HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  return getJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ───────────────────────── Options chain (Distributed Options · Basic) ────────
export type OptionQuote = {
  // Per-contract premium in dUSDC (0..1); 1 contract pays $1 if in-the-money.
  // bid/ask/mid are REAL DeepBook Predict range prices (mint cost / redeem payout).
  mid: number; bid: number; ask: number; iv: number;
  delta: number; gamma: number; vega: number; theta: number; tradeable: boolean;
  lower_strike: string; higher_strike: string; // raw on-chain band for routing
};
export type OptionStrike = { strike: number; moneyness: number; call: OptionQuote; put: OptionQuote };
export type OptionExpiry = {
  oracle_id: string; expiry: number; tenor_label: string; days_to_expiry: number;
  forward: number; atm_iv: number; strikes: OptionStrike[];
};
export type OptionsChain = {
  underlying: string; spot: number; generated_at: string; source: string;
  contract_payout_usd: number; quote_basis: "per-contract"; expiries: OptionExpiry[];
};
export function fetchOptionsChain(underlying = "BTC"): Promise<OptionsChain> {
  return getJson<OptionsChain>(`/api/options/chain?underlying=${encodeURIComponent(underlying)}`);
}

// Liquidity-depth / risk cap for one strike band — the largest order the pool can
// safely back (≤15% market impact, ≤2% of available pool liquidity). The UI clamps
// the order size to `max_contracts` so nobody can hammer the book or pump a strike.
export type BandDepth = {
  oracle_id: string; lower: string; higher: string;
  marginal_price: number; max_contracts: number;
  binding: "slippage" | "mintable" | "pool" | "depth-floor" | "none";
  pool_capacity_contracts: number; slip_cap: number;
  ladder: { contracts: number; avg_price: number; slippage_pct: number; ok: boolean }[];
};
export function fetchBandDepth(p: { oracle_id: string; expiry: string | number; lower: string; higher: string }): Promise<BandDepth> {
  const q = `oracle_id=${encodeURIComponent(p.oracle_id)}&expiry=${encodeURIComponent(String(p.expiry))}&lower=${encodeURIComponent(p.lower)}&higher=${encodeURIComponent(p.higher)}`;
  return getJson<BandDepth>(`/api/options/depth?${q}`);
}

// ───────────────────────── Custom baskets (Baskets · Advanced) ────────────────
export type CustomTheme = { id: string; label: string; description: string; tier: 90 | 50; keywords: string[] };
export type CustomLeg = {
  market_id: string; conditionId: string; question: string; side: "YES" | "NO";
  probability: number; weight: number; volumeUsd: number; category: string;
  eventTitle?: string; tokenId: string; priceSource: "clob" | "bbo" | "gamma";
};
export type CustomBasket = {
  query: string | null; theme: string | null; nav: number; sigma: number; accepted: boolean;
  diversification: { avg_pair_corr: number; eff_leg_count: number; risk_ratio: number; accepted: boolean; reason: string | null };
  legs: CustomLeg[];
  tranches: { kind: string; attach: number; detach: number; pricePerToken: number; expectedYieldPct: number }[];
  mm: { entry_cost_per_token: number; protocol_bps: number; mm_spread_bps: number };
  sources: { universe: string; candidates_scanned: number; kept_after_filter: number; clob_priced_legs: number; price: string; correlation_model: string; at: number };
};
export function buildCustomBasket(body: { query?: string; theme?: string; target_legs?: number; tier?: 90 | 50; max_per_category?: number }): Promise<CustomBasket> {
  return postJson<CustomBasket>(`/api/custom-baskets/build`, body);
}

// ───────────────────────── DeepBook strategies (DeepBook · both modes) ────────
export type RangeDirection = "pin" | "up" | "down" | "range" | "break";
export type DeepBookStrategy = {
  id: string; name: string; thesis: string;
  tail_risk: "low" | "med" | "high"; convexity: "long" | "short" | "neutral";
  payoff_shape: "pin" | "plateau" | "wings" | "tail" | "ladder" | "capped";
  direction: RangeDirection;
};
export type DeepBookBucket = {
  lower: string; higher: string; weight: number; lower_usd: number; higher_usd: number;
  tradeable: boolean; unit_price: number; quantity: string; mint_cost_raw: string;
  redeem_value_raw: string; max_payout_raw: string; slippage_raw: string; spread_raw: string; avg_price: number;
};
export type DeepBookQuote = {
  strategy_id: string; name: string; thesis: string; tail_risk: string; convexity: string;
  payoff_shape: string; direction: RangeDirection; risk_note: string; oracle_id: string; expiry: string; tenor_label: string;
  notional_usd: number; forward_usd: number; center_usd: number; sigma_usd: number; atm_iv: number; t_years: number;
  max_loss_usd: number;
  strip: { oracle_id: string; expiry: string; mu_usd: number; sigma_usd: number; n: number; budget_raw: string;
    buckets: DeepBookBucket[]; total_cost_raw: string; total_redeem_value_raw: string; total_max_payout_raw: string;
    realized_max_payout_raw: string; total_slippage_raw: string; round_trip_spread_raw: string; expected_value_raw: string };
  greeks: { delta_btc: number; gamma: number; vega_usd: number; theta_usd_day: number; position_value_usd: number };
  dusdc_decimals: number; source: string;
};
export function fetchDeepBookStrategies(): Promise<{ strategies: DeepBookStrategy[] }> {
  return getJson(`/api/deepbook/strategies`);
}
export interface DeepBookExpiry { oracle_id: string; expiry: number; t_years: number; tenor_label: string }
export function fetchDeepBookExpiries(): Promise<{ expiries: DeepBookExpiry[] }> {
  return getJson(`/api/deepbook/expiries`);
}
export function quoteDeepBookStrategy(body: { strategy_id: string; notional_usd: number; expiry_pref?: "near" | "mid" | "far"; oracle_id?: string; sender?: string }): Promise<DeepBookQuote> {
  return postJson<DeepBookQuote>(`/api/deepbook/quote`, body);
}

// ───────────────────────── DeepBook PLP yield strategies ──────────────────────
export type YieldStrategy = {
  id: string; name: string; risk: "medium" | "high"; hedge: "none" | "downside" | "two-way" | "center";
  plp_target_pct: number; thesis: string; carry_source: string; risk_note: string;
};
export type TerminalBand = { lower_usd: number; higher_usd: number; payout_usd: number };
export type YieldQuote = {
  quote_id: string; quoted_at: number; expires_at: number; strategy: YieldStrategy; capital_usd: number; capital_raw: string;
  allocation: {
    plp_usd: number; plp_raw: string; hedge_funding_usd: number; hedge_funding_raw: string;
    hedge_cost_usd: number; hedge_cost_raw: string; manager_buffer_usd: number; manager_buffer_raw: string;
  };
  vault: {
    balance_usd: number; nav_usd: number; marked_liability_usd: number; max_payout_usd: number;
    available_liquidity_usd: number; remaining_risk_capacity_usd: number; share_price: number;
    lifetime_share_return: number; utilization: number; deployed_at: string | null;
  };
  plp_stress: {
    deposit_usd: number; expected_shares: number; post_deposit_pool_share: number; mark_value_usd: number;
    all_current_liabilities_expire_usd: number; current_book_max_payout_bound_usd: number;
    theoretical_minimum_usd: number; post_deposit_utilization: number; post_deposit_withdrawable_pool_usd: number;
  };
  scenarios: { id: string; label: string; value_usd: number; return_pct: number; kind: "base" | "risk" | "upside" }[];
  hedge: null | {
    name: string; oracle_id: string; expiry: string; tenor_label: string; forward_usd: number;
    cost_usd: number; exit_bid_usd: number; best_payout_usd: number; buckets: TerminalBand[];
    raw_buckets: { lower: string; higher: string; quantity: string }[];
  };
  reference_book: {
    label: string; premium_usd: number; midpoint_liability_usd: number; max_liability_usd: number;
    oracle_id: string; expiry: string; tenor_label: string; forward_usd: number; buckets: TerminalBand[];
  };
  musdc_model: {
    description: string; expected_terminal_usd: number; minimum_terminal_usd: number;
    maximum_terminal_usd: number; terminal_bands: TerminalBand[];
  };
  execution: { d_usdc: string; m_usdc: string };
};
export type YieldAccount = {
  owner: string; coin_type: string; coin_count: number; shares_raw: string; shares: number; share_price: number;
  value_usd: number; manager_idle_usd: number; range_bid_value_usd: number; total_value_usd: number;
  manager_count: number; range_position_count: number; range_mark_status: "live" | "settled" | "unavailable" | "empty";
  managers: {
    manager_id: string; idle_usd: number; range_bid_value_usd: number;
    ranges: { oracle_id: string; expiry: string; lower_usd: number; higher_usd: number; quantity: number; bid_value_usd: number; max_payout_usd: number; mark_status: "live" | "settled" | "unavailable" }[];
  }[];
  available_pool_liquidity_usd: number; coins: { coin_object_id: string; balance_raw: string }[];
};
export type CanonicalOpen = {
  tx_bytes: string; sender: string; dry_run: { ok: boolean | null; status: string; error?: string };
  quote_id: string; rail: string; sim_id?: string; label?: string; bucket_count?: number; wallet_draw_raw?: string;
};
export type AccountPreparedTx = {
  tx_bytes: string; sender: string; dry_run: { ok: boolean | null; status: string; error?: string };
  bucket_count?: number; remaining_count?: number;
};
export function fetchYieldStrategies(): Promise<{ strategies: YieldStrategy[] }> {
  return getJson(`/api/deepbook/yield/strategies`);
}
export function quoteYieldStrategy(body: { strategy_id: string; capital_usd: number; sender?: string }): Promise<YieldQuote> {
  return postJson<YieldQuote>(`/api/deepbook/yield/quote`, body);
}
export function fetchYieldAccount(owner: string): Promise<YieldAccount> {
  return getJson(`/api/deepbook/yield/account/${encodeURIComponent(owner)}`);
}
export function prepareYieldOpen(body: { quote_id: string; owner: string; currency: "dUSDC" | "mUSDC"; manager_id?: string }): Promise<CanonicalOpen> {
  return postJson<CanonicalOpen>(`/api/deepbook/yield/open/prepare`, body);
}
export function prepareYieldRangeExit(body: { owner: string; manager_id: string }): Promise<AccountPreparedTx> {
  return postJson<AccountPreparedTx>(`/api/deepbook/yield/ranges/exit/prepare`, body);
}

// ───────────────────────── Fully-funded structured notes ──────────────────────
export type NotePreset = {
  id: string; name: string; kind: "participation" | "range-coupon" | "terminal-knock-out" | "terminal-knock-in" | "two-way-buffer" | "autocall";
  risk: "low" | "medium"; reserve_target_pct: number; default_tenor_days: number; summary: string;
  payoff_condition: string; supported_currencies: ("dUSDC" | "mUSDC")[];
};
export type NoteQuote = {
  quote_id: string; quoted_at: number; expires_at: number; preset: NotePreset; principal_usd: number; actual_tenor_days: number;
  oracle: null | { oracle_id: string; expiry: string; tenor_label: string; forward_usd: number };
  allocation: null | {
    plp_reserve_usd: number; plp_reserve_raw: string; strip_funding_usd: number; strip_funding_raw: string;
    strip_cost_usd: number; strip_cost_raw: string; manager_buffer_usd: number; manager_buffer_raw: string;
  };
  outcomes: {
    reserve_if_plp_unchanged_usd: number; current_book_bound_usd: number; exit_now_usd: number;
    market_midpoint_usd: number; best_case_usd: number; theoretical_minimum_usd: number; musdc_minimum_usd: number;
  };
  barrier: null | { monitoring: "terminal" | "discrete"; lower_usd: number; upper_usd: number; condition: string };
  strip: null | {
    name: string; cost_usd: number; exit_bid_usd: number; best_payout_usd: number;
    buckets: TerminalBand[]; raw_buckets: { lower: string; higher: string; quantity: string }[];
  };
  plp_stress: null | {
    deposit_usd: number; expected_shares: number; post_deposit_pool_share: number;
    current_book_max_payout_bound_usd: number; post_deposit_utilization: number;
  };
  terminal_bands: TerminalBand[];
  autocall_terms: null | {
    principal_usd: number; initial_reference_usd: number; knock_in_barrier_usd: number;
    coupon_budget_usd?: number; coupon_source?: string; coupon_oracle_id?: string;
    observations: { oracle_id: string; observation_ms: number; call_barrier_usd: number; coupon_usd: number }[];
  };
  execution: { d_usdc: "plp-plus-strip" | "unsupported"; m_usdc: "canonical-terminal-note" | "canonical-autocall" };
  risk_disclosure: string;
  musdc_risk_disclosure: string;
};
export function fetchNotePresets(): Promise<{ presets: NotePreset[] }> {
  return getJson(`/api/notes/strategies`);
}
export function quoteNote(body: { principal_usd: number; preset_id: string; tenor_days?: number; sender?: string }): Promise<NoteQuote> {
  return postJson<NoteQuote>(`/api/notes/quote`, body);
}
export function prepareNoteOpen(body: { quote_id: string; owner: string; currency: "dUSDC" | "mUSDC"; manager_id?: string }): Promise<CanonicalOpen> {
  return postJson<CanonicalOpen>(`/api/notes/open/prepare`, body);
}
