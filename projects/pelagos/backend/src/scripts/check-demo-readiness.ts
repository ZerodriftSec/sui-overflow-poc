export {};

const backend = (process.env.DEMO_BACKEND_URL ?? 'http://127.0.0.1:13101').replace(/\/$/, '');
const frontend = (process.env.DEMO_FRONTEND_URL ?? '').replace(/\/$/, '');
const requireFeed = process.env.DEMO_REQUIRE_FEED !== 'false';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error ?? 'unknown error'}`);
  return body;
}

async function status() {
  return json<{
    config: { mode: string; package_id: string; predict_object_id: string };
    server_status: { active_oracles: number; fresh_oracles: number; freshest_update_age_ms: number };
    feed_status: {
      enabled: boolean;
      running: boolean;
      interval_ms: number;
      last_digest: string | null;
      last_error: string | null;
      consecutive_failures: number;
    };
  }>('/api/predict/status');
}

async function main() {
  console.log(`Pelagos demo readiness: ${backend}`);

  const health = await json<{
    status: string;
    services: Record<string, { status: string }>;
  }>('/api/health');
  assert(health.status === 'ok', `backend health is ${health.status}`);
  assert(health.services.sui?.status === 'ok', 'Sui health probe failed');
  assert(health.services.predict?.status === 'ok', 'Predict health probe failed');
  console.log('  PASS backend, Sui, and Predict health');

  const first = await status();
  assert(first.config.mode === 'managed', `Predict mode is ${first.config.mode}`);
  assert(first.server_status.active_oracles >= 4, 'fewer than four active oracles');
  assert(first.server_status.fresh_oracles === first.server_status.active_oracles, 'not all oracles are fresh');
  assert(first.server_status.freshest_update_age_ms < 25_000, 'freshest oracle is too old');
  if (requireFeed) {
    assert(first.feed_status.enabled && first.feed_status.running, 'oracle feed is not running');
    assert(first.feed_status.interval_ms <= 10_000, 'oracle feed cadence is too slow');
    assert(first.feed_status.last_error === null, `oracle feed error: ${first.feed_status.last_error}`);
    assert(first.feed_status.consecutive_failures === 0, 'oracle feed has consecutive failures');
    assert(first.feed_status.last_digest, 'oracle feed has no successful digest');
    console.log(`  PASS 4/4 fresh managed oracles (${first.feed_status.last_digest})`);
  } else {
    console.log('  PASS 4/4 fresh managed oracles (local feed-writer check skipped)');
  }

  const quote = await json<{ mint_cost: string; redeem_payout: string }>(
    '/api/predict/quote?asset=BTC&quantity=1000000&is_up=true',
  );
  assert(BigInt(quote.mint_cost) > 0n, 'binary mint quote is zero');
  assert(BigInt(quote.redeem_payout) > 0n, 'binary redeem quote is zero');
  console.log(`  PASS non-zero binary quote (${quote.mint_cost}/${quote.redeem_payout} raw)`);

  const strip = await json<{
    buckets: Array<{ tradeable: boolean }>;
    total_cost_raw: string;
    total_max_payout_raw: string;
  }>('/api/predict/strip/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asset: 'BTC', budget_usd: 10, n: 6 }),
  });
  assert(strip.buckets.length === 6, 'strip preview did not return six buckets');
  assert(strip.buckets.every((bucket) => bucket.tradeable), 'strip preview contains an untradeable bucket');
  assert(BigInt(strip.total_cost_raw) > 0n, 'strip cost is zero');
  console.log(`  PASS six-leg $10 strip (${strip.total_max_payout_raw} raw max payout)`);

  const yieldCatalogue = await json<{ strategies: Array<{ id: string }> }>('/api/deepbook/yield/strategies');
  assert(yieldCatalogue.strategies.length === 4, 'yield catalogue does not contain four strategies');
  const yieldQuote = await json<{
    capital_usd: number;
    allocation: { plp_usd: number; hedge_cost_usd: number; manager_buffer_usd: number };
    vault: { share_price: number; remaining_risk_capacity_usd: number };
    execution: { d_usdc: string; m_usdc: string };
  }>('/api/deepbook/yield/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ strategy_id: 'two-way-guard', capital_usd: 10 }),
  });
  const yieldCapital =
    yieldQuote.allocation.plp_usd +
    yieldQuote.allocation.hedge_cost_usd +
    yieldQuote.allocation.manager_buffer_usd;
  assert(
    Math.abs(yieldCapital - yieldQuote.capital_usd) <= 0.00001,
    'yield allocation does not reconcile to capital',
  );
  assert(yieldQuote.vault.share_price > 0, 'PLP share price is non-positive');
  assert(yieldQuote.vault.remaining_risk_capacity_usd >= 10, 'yield pool lacks $10 risk capacity');
  assert(yieldQuote.execution.d_usdc === 'deepbook-plp-plus-hedge', 'dUSDC yield execution is not PLP + hedge');
  assert(yieldQuote.execution.m_usdc === 'isolated-reference-payoff', 'mUSDC yield execution label is incorrect');
  console.log(`  PASS four yield strategies and reconciled $10 hedge allocation (PLP share ${yieldQuote.vault.share_price.toFixed(6)})`);

  const note = await json<{
    principal_usd: number;
    allocation: null | {
      plp_reserve_usd: number;
      strip_cost_usd: number;
      manager_buffer_usd: number;
    };
    strip: null | { cost_usd: number; buckets: Array<{ payout_usd: number }> };
    terminal_bands: Array<{ lower_usd: number; higher_usd: number; payout_usd: number }>;
    outcomes: { best_case_usd: number };
    risk_disclosure: string;
  }>('/api/notes/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal_usd: 10, preset_id: 'capital-guard', tenor_days: 40 }),
  });
  assert(note.allocation !== null && note.strip !== null, 'terminal note has no executable allocation');
  const noteCapital =
    note.allocation.plp_reserve_usd +
    note.allocation.strip_cost_usd +
    note.allocation.manager_buffer_usd;
  assert(Math.abs(noteCapital - note.principal_usd) <= 0.00001, 'note allocation does not reconcile to principal');
  assert(note.strip.cost_usd > 0 && note.strip.buckets.length > 0, 'note strip has no live premium or payout bands');
  assert(note.terminal_bands[0]?.lower_usd === 0, 'note terminal schedule does not start at zero');
  assert(note.terminal_bands.at(-1)?.higher_usd === 1_000_000_000, 'note terminal schedule is not exhaustive');
  assert(
    Math.abs(Math.max(...note.terminal_bands.map((band) => band.payout_usd)) - note.outcomes.best_case_usd) <= 0.00001,
    'note best case does not match its terminal schedule',
  );
  assert(/not cash or guaranteed principal/i.test(note.risk_disclosure), 'note omits the PLP principal-risk disclosure');
  console.log(`  PASS reconciled $10 funded note (${note.allocation.plp_reserve_usd.toFixed(2)} PLP + ${note.allocation.strip_cost_usd.toFixed(2)} strip + ${note.allocation.manager_buffer_usd.toFixed(2)} buffer)`);

  const autocall = await json<{
    autocall_terms: null | {
      observations: Array<{ observation_ms: number; call_barrier_usd: number; coupon_usd: number }>;
      knock_in_barrier_usd: number;
      coupon_budget_usd?: number;
      coupon_source?: string;
    };
    execution: { d_usdc: string; m_usdc: string };
  }>('/api/notes/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principal_usd: 10, preset_id: 'autocall-three', tenor_days: 12 }),
  });
  const observations = autocall.autocall_terms?.observations ?? [];
  assert(observations.length === 3, 'Autocall 3 does not have exactly three observations');
  assert(observations.every((item, index) => index === 0 || item.observation_ms > observations[index - 1].observation_ms), 'autocall observations are not ordered');
  assert(observations.every((item, index) => index === 0 || item.call_barrier_usd <= observations[index - 1].call_barrier_usd), 'autocall barriers do not step down');
  assert(observations.every((item, index) => index === 0 || item.coupon_usd > observations[index - 1].coupon_usd), 'autocall coupons do not accrue');
  assert((autocall.autocall_terms?.coupon_budget_usd ?? 0) > 0, 'autocall has no live coupon budget');
  assert(/DeepBook/i.test(autocall.autocall_terms?.coupon_source ?? ''), 'autocall coupon is not sourced from DeepBook');
  assert(autocall.execution.d_usdc === 'unsupported' && autocall.execution.m_usdc === 'canonical-autocall', 'autocall rail enforcement is incorrect');
  console.log('  PASS three-observation mUSDC autocall with step-down barriers and accrued coupons');

  const vault = await json<{ vault_value: number; available_liquidity: number; remaining_risk_capacity: number }>(
    '/api/predict/vault/summary',
  );
  assert(vault.vault_value >= 100_000_000, 'Predict vault value is below 100 dUSDC');
  assert(vault.available_liquidity > 0, 'Predict vault has no available liquidity');
  assert(vault.remaining_risk_capacity >= 10_000_000, 'Predict vault cannot accept the default $10 demo position');
  console.log(
    `  PASS Predict vault (${(vault.vault_value / 1e6).toFixed(2)} dUSDC, ${(vault.remaining_risk_capacity / 1e6).toFixed(2)} dUSDC capacity)`,
  );

  if (requireFeed) {
    await new Promise((resolve) => setTimeout(resolve, 13_000));
    const second = await status();
    assert(second.feed_status.last_digest !== first.feed_status.last_digest, 'feed digest did not advance');
    assert(second.feed_status.last_error === null, `oracle feed error: ${second.feed_status.last_error}`);
    console.log(`  PASS feed advanced (${second.feed_status.last_digest})`);
  }

  if (frontend) {
    const response = await fetch(`${frontend}/app/distribution`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    assert(response.ok, `frontend returned ${response.status}`);
    const html = await response.text();
    assert(html.includes('Distributed Options') || html.includes('Distribution'), 'frontend payload is unexpected');
    console.log(`  PASS frontend (${response.url})`);
  }

  console.log('GO: production-testnet demo preflight passed');
}

main().catch((error) => {
  console.error(`NO-GO: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
