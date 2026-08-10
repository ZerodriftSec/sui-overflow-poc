/** Live API reconciliation for every DeepBook yield and structured-note preset. */
export {};

const BASE = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:13101';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

async function request(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const response = await fetch(`${BASE}${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

function close(actual: number, expected: number, epsilon = 0.00001): boolean {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon;
}

function exhaustive(bands: Array<{ lower_usd: number; higher_usd: number }>): boolean {
  return bands.length > 0 &&
    bands[0].lower_usd === 0 &&
    bands[bands.length - 1].higher_usd === 1_000_000_000 &&
    bands.every((band, index) => band.lower_usd < band.higher_usd && (index === 0 || band.lower_usd === bands[index - 1].higher_usd));
}

async function main(): Promise<void> {
  console.log(`\nYield and note API reconciliation (${BASE})\n`);

  const yieldList = await request('/api/deepbook/yield/strategies');
  const yieldStrategies = Array.isArray(yieldList.json?.strategies) ? yieldList.json.strategies : [];
  const yieldQuoteIds = new Map<string, string>();
  check('yield catalogue has four strategies', yieldList.status === 200 && yieldStrategies.length === 4);

  for (const strategy of yieldStrategies) {
    const response = await request('/api/deepbook/yield/quote', { strategy_id: strategy.id, capital_usd: 10 });
    const quote = response.json;
    check(`${strategy.id} quote is live`, response.status === 200 && typeof quote.quote_id === 'string', `status=${response.status}`);
    if (response.status !== 200) continue;
    yieldQuoteIds.set(strategy.id, quote.quote_id);
    const stack = quote.allocation.plp_usd + quote.allocation.hedge_cost_usd + quote.allocation.manager_buffer_usd;
    check(`${strategy.id} capital stack sums`, close(stack, quote.capital_usd), `${stack} vs ${quote.capital_usd}`);
    check(`${strategy.id} funding reconciles`, close(quote.allocation.hedge_funding_usd, quote.allocation.hedge_cost_usd + quote.allocation.manager_buffer_usd));
    check(`${strategy.id} mUSDC schedule is exhaustive`, exhaustive(quote.musdc_model.terminal_bands));
    const payouts = quote.musdc_model.terminal_bands.map((band: { payout_usd: number }) => band.payout_usd);
    check(`${strategy.id} model min is exact`, close(Math.min(...payouts), quote.musdc_model.minimum_terminal_usd));
    check(`${strategy.id} model max is exact`, close(Math.max(...payouts), quote.musdc_model.maximum_terminal_usd));
    check(`${strategy.id} PLP mark equals allocation`, close(quote.plp_stress.mark_value_usd, quote.allocation.plp_usd));
  }
  for (const strategy of yieldStrategies) {
    let boundariesExact = true;
    for (const capital of [5, 250]) {
      const response = await request('/api/deepbook/yield/quote', { strategy_id: strategy.id, capital_usd: capital });
      if (response.status !== 200) { boundariesExact = false; continue; }
      const quote = response.json;
      const rawStack = BigInt(quote.allocation.plp_raw) + BigInt(quote.allocation.hedge_cost_raw) + BigInt(quote.allocation.manager_buffer_raw);
      boundariesExact &&= rawStack === BigInt(quote.capital_raw);
    }
    check(`${strategy.id} $5/$250 raw funding is exact`, boundariesExact);
  }

  const noteList = await request('/api/notes/strategies');
  const expiryList = await request('/api/deepbook/expiries');
  const liveExpiries = Array.isArray(expiryList.json?.expiries) ? expiryList.json.expiries : [];
  const presets = Array.isArray(noteList.json?.presets) ? noteList.json.presets : [];
  let terminalNoteQuoteId = '';
  let autocallQuoteId = '';
  check('note catalogue includes barriers and autocall', noteList.status === 200 && presets.length === 6 && presets.some((preset: any) => preset.kind === 'autocall'));

  for (const preset of presets) {
    const response = await request('/api/notes/quote', { preset_id: preset.id, principal_usd: 10, tenor_days: preset.default_tenor_days });
    const quote = response.json;
    check(`${preset.id} quote is live`, response.status === 200 && typeof quote.quote_id === 'string', `status=${response.status}`);
    if (response.status !== 200) continue;
    if (preset.id === 'capital-guard') terminalNoteQuoteId = quote.quote_id;
    if (preset.kind === 'autocall') autocallQuoteId = quote.quote_id;
    if (preset.kind === 'autocall') {
      const observations = quote.autocall_terms?.observations ?? [];
      check('autocall is mUSDC-only', quote.execution.d_usdc === 'unsupported' && quote.preset.supported_currencies.length === 1);
      check('autocall has exactly three ordered observations', observations.length === 3 && observations.every((item: any, index: number) => index === 0 || item.observation_ms > observations[index - 1].observation_ms));
      check('autocall barriers step down', observations.every((item: any, index: number) => index === 0 || item.call_barrier_usd <= observations[index - 1].call_barrier_usd));
      check('autocall coupons accrue', observations.every((item: any, index: number) => index === 0 || item.coupon_usd > observations[index - 1].coupon_usd));
      check('autocall coupon budget is a live DeepBook premium', quote.autocall_terms.coupon_budget_usd > 0 && close(observations.at(-1).coupon_usd, quote.autocall_terms.coupon_budget_usd) && /DeepBook/i.test(quote.autocall_terms.coupon_source));
      continue;
    }
    const requestedExpiry = Date.now() + preset.default_tenor_days * 86_400_000;
    const nearestExpiry = liveExpiries.reduce((nearest: any, candidate: any) => {
      if (!nearest) return candidate;
      return Math.abs(Number(candidate.expiry) - requestedExpiry) < Math.abs(Number(nearest.expiry) - requestedExpiry)
        ? candidate
        : nearest;
    }, null);
    check(`${preset.id} selects the nearest live tenor`, quote.oracle?.oracle_id === nearestExpiry?.oracle_id);
    const stack = quote.allocation.plp_reserve_usd + quote.allocation.strip_cost_usd + quote.allocation.manager_buffer_usd;
    check(`${preset.id} principal reconciles`, close(stack, quote.principal_usd), `${stack} vs ${quote.principal_usd}`);
    check(`${preset.id} terminal schedule is exhaustive`, exhaustive(quote.terminal_bands));
    const payouts = quote.terminal_bands.map((band: { payout_usd: number }) => band.payout_usd);
    check(`${preset.id} best case is schedule max`, close(Math.max(...payouts), quote.outcomes.best_case_usd));
    check(`${preset.id} dUSDC theoretical minimum is zero`, quote.outcomes.theoretical_minimum_usd === 0);
    check(`${preset.id} mUSDC minimum is schedule min`, close(Math.min(...payouts), quote.outcomes.musdc_minimum_usd));
  }
  for (const preset of presets.filter((item: any) => item.kind !== 'autocall')) {
    let boundariesExact = true;
    for (const principal of [5, 250]) {
      const response = await request('/api/notes/quote', { preset_id: preset.id, principal_usd: principal, tenor_days: preset.default_tenor_days });
      if (response.status !== 200) { boundariesExact = false; continue; }
      const allocation = response.json.allocation;
      const rawStack = BigInt(allocation.plp_reserve_raw) + BigInt(allocation.strip_cost_raw) + BigInt(allocation.manager_buffer_raw);
      boundariesExact &&= rawStack === BigInt(Math.round(principal * 1_000_000));
    }
    check(`${preset.id} $5/$250 raw funding is exact`, boundariesExact);
  }

  check('yield rejects capital below pool minimum', (await request('/api/deepbook/yield/quote', { strategy_id: 'core-market-maker', capital_usd: 4.99 })).status === 400);
  check('notes reject principal above pool maximum', (await request('/api/notes/quote', { preset_id: 'capital-guard', principal_usd: 251 })).status === 400);
  check('yield account rejects malformed owner', (await request('/api/deepbook/yield/account/0x123')).status === 400);
  check('canonical yield open rejects unknown quote', (await request('/api/deepbook/yield/open/prepare', { quote_id: 'missing', owner: `0x${'1'.repeat(64)}`, currency: 'mUSDC' })).status === 400);
  check('public sim open rejects canonical yield labels', (await request('/api/sim/open/prepare', {
    owner: `0x${'1'.repeat(64)}`,
    product: 'yield',
    premium_usd: 5,
    max_payout_usd: 5,
    forward_usd: 65_000,
  })).status === 400);
  check('public sim open rejects canonical note labels', (await request('/api/sim/open/prepare', {
    owner: `0x${'1'.repeat(64)}`,
    product: 'note',
    premium_usd: 5,
    max_payout_usd: 5,
    forward_usd: 65_000,
  })).status === 400);
  check('sim open rejects overlapping terminal bands', (await request('/api/sim/open/prepare', {
    owner: `0x${'1'.repeat(64)}`,
    product: 'strip',
    premium_usd: 5,
    max_payout_usd: 5,
    forward_usd: 65_000,
    expiry_ms: Date.now() + 86_400_000,
    bands: [
      { lower_usd: 60_000, higher_usd: 66_000, payout_usd: 4 },
      { lower_usd: 65_000, higher_usd: 70_000, payout_usd: 5 },
    ],
  })).status === 400);
  if (autocallQuoteId) {
    check('autocall rejects the dUSDC rail', (await request('/api/notes/open/prepare', {
      quote_id: autocallQuoteId,
      owner: `0x${'1'.repeat(64)}`,
      currency: 'dUSDC',
    })).status === 400);
  }
  const managers = await request('/api/predict/managers');
  check('managed manager catalogue is readable', managers.status === 200 && Array.isArray(managers.json));
  const firstManager = Array.isArray(managers.json) ? managers.json[0] : null;
  if (firstManager?.manager_id && firstManager?.owner) {
    const managerPositions = await request(`/api/predict/managers/${firstManager.manager_id}/positions`);
    check('manager range dynamic fields decode', managerPositions.status === 200 && Array.isArray(managerPositions.json.ranges));
    const positiveRanges = (managerPositions.json.ranges ?? []).filter((range: any) => BigInt(range.quantity) > 0n);
    const exitPrepare = await request('/api/deepbook/yield/ranges/exit/prepare', {
      owner: firstManager.owner,
      manager_id: firstManager.manager_id,
    });
    check(
      'authoritative range exit matches the manager position set',
      positiveRanges.length > 0
        ? exitPrepare.status === 200 && exitPrepare.json.bucket_count === Math.min(12, positiveRanges.length)
        : exitPrepare.status === 400,
    );
    const account = await request(`/api/deepbook/yield/account/${firstManager.owner}`);
    const accountTotal = Number(account.json.value_usd) + Number(account.json.manager_idle_usd) + Number(account.json.range_bid_value_usd);
    check('dUSDC account includes PLP, range bids, and idle collateral', account.status === 200 && close(accountTotal, Number(account.json.total_value_usd)));
    const foreignOwner = `0x${'1'.repeat(64)}`;
    const hedgedYieldQuoteId = yieldQuoteIds.get('two-way-guard');
    if (hedgedYieldQuoteId) {
      check('hedged yield rejects a foreign manager', (await request('/api/deepbook/yield/open/prepare', {
        quote_id: hedgedYieldQuoteId,
        owner: foreignOwner,
        currency: 'dUSDC',
        manager_id: firstManager.manager_id,
      })).status === 400);
    }
    if (terminalNoteQuoteId) {
      check('dUSDC note rejects a foreign manager', (await request('/api/notes/open/prepare', {
        quote_id: terminalNoteQuoteId,
        owner: foreignOwner,
        currency: 'dUSDC',
        manager_id: firstManager.manager_id,
      })).status === 400);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
