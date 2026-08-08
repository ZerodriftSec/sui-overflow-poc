/**
 * Pelagos API Test Runner
 * Usage: tsx src/scripts/test-api.ts [base_url]
 * Default base URL: http://localhost:13101
 */

const BASE_URL = process.argv[2] || 'http://localhost:13101';
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.json() as any;
  return { status: res.status, body };
}

async function post(path: string, data: any): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json() as any;
  return { status: res.status, body };
}

async function run() {
  console.log(`\nPelagos API Test Suite`);
  console.log(`Target: ${BASE_URL}\n`);

  // Health
  console.log('Health:');
  await test('GET /api/health returns ok or degraded', async () => {
    const { status, body } = await get('/api/health');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.status === 'ok' || body.status === 'degraded', `Bad status: ${body.status}`);
    assert(typeof body.uptime_seconds === 'number', 'Missing uptime_seconds');
    assert(typeof body.services === 'object', 'Missing services');
    assert(typeof body.services.sui === 'object', 'Missing Sui health probe');
    assert(typeof body.services.predict === 'object', 'Missing Predict health probe');
  });

  // Docs
  console.log('\nDocs:');
  await test('GET /api/docs returns API documentation', async () => {
    const { status, body } = await get('/api/docs');
    assert(status === 200, `Expected 200, got ${status}`);
    const apiName = String(body?.name ?? '');
    assert(apiName === 'Pelagos API', `Bad name: ${apiName}`);
    assert(Array.isArray(body.endpoints), 'Missing endpoints array');
    assert(body.endpoints.length > 10, `Only ${body.endpoints.length} endpoints documented`);
  });

  // Bundles
  console.log('\nBundles:');
  await test('GET /api/bundles returns array', async () => {
    const { status, body } = await get('/api/bundles');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body), 'Expected array');
  });

  await test('GET /api/bundles?risk_tier=90 filters correctly', async () => {
    const { status, body } = await get('/api/bundles?risk_tier=90');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body), 'Expected array');
    // If any results, all should be tier 90
    body.forEach((b: any) => assert(b.risk_tier === 90, `Expected tier 90, got ${b.risk_tier}`));
  });

  await test('GET /api/bundles/:id returns 404 for bad UUID', async () => {
    const { status } = await get('/api/bundles/00000000-0000-0000-0000-000000000000');
    assert(status === 404, `Expected 404, got ${status}`);
  });

  await test('POST /api/bundles validates input', async () => {
    const { status, body } = await post('/api/bundles', {});
    assert(status === 400, `Expected 400, got ${status}`);
    assert(body.error === 'Validation failed', `Expected validation error, got: ${body.error}`);
  });

  // Markets
  console.log('\nMarkets:');
  await test('GET /api/markets returns markets', async () => {
    const { status, body } = await get('/api/markets');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.markets), 'Expected markets array');
    assert(typeof body.count === 'number', 'Missing count');
  });

  await test('GET /api/markets/search/bitcoin returns results', async () => {
    const { status, body } = await get('/api/markets/search/bitcoin');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.markets), 'Expected markets array');
  });

  // Deposit validation
  console.log('\nDeposit:');
  await test('POST /api/deposit validates input', async () => {
    const { status, body } = await post('/api/deposit', {});
    assert(status === 400, `Expected 400, got ${status}`);
    assert(body.error === 'Validation failed', `Expected validation error`);
  });

  await test('POST /api/deposit rejects negative amount', async () => {
    const { status } = await post('/api/deposit', {
      bundle_id: '00000000-0000-0000-0000-000000000000',
      wallet_address: 'A'.repeat(44),
      amount_usdc: -100,
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await test('GET /api/deposit/portfolio/:wallet returns empty for unknown wallet', async () => {
    const emptyWallet = `0x${'0'.repeat(64)}`;
    const { status, body } = await get(`/api/deposit/portfolio/${emptyWallet}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.positions), 'Expected positions array');
    assert(body.positions.length === 0, 'Expected empty positions');
  });

  // NAV
  console.log('\nNAV:');
  await test('GET /api/nav/:id returns 404 for bad bundle', async () => {
    const { status } = await get('/api/nav/00000000-0000-0000-0000-000000000000');
    assert(status === 404, `Expected 404, got ${status}`);
  });

  // Current platform routes
  console.log('\nPlatform:');
  await test('GET /api/predict/config returns the active deployment', async () => {
    const { status, body } = await get('/api/predict/config');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.network === 'testnet', `Unexpected network: ${body.network}`);
    assert(typeof body.package_id === 'string', 'Missing package_id');
  });

  await test('GET /api/deepbook/strategies returns strategies', async () => {
    const { status, body } = await get('/api/deepbook/strategies');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.strategies), 'Expected strategies array');
    assert(body.strategies.length > 0, 'Expected at least one strategy');
  });

  await test('GET /api/lending returns a live rate snapshot', async () => {
    const { status, body } = await get('/api/lending');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(typeof body.market_supply_apy === 'number', 'Missing market_supply_apy');
    assert(typeof body.rate_source === 'string', 'Missing rate_source');
  });

  await test('GET /api/sim/positions/:owner returns a position list', async () => {
    const emptyWallet = `0x${'0'.repeat(64)}`;
    const { status, body } = await get(`/api/sim/positions/${emptyWallet}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(body.positions), 'Expected positions array');
  });

  // Redemption validation
  console.log('\nRedemption:');
  await test('POST /api/deposit/redeem validates input', async () => {
    const { status, body } = await post('/api/deposit/redeem', {});
    assert(status === 400, `Expected 400, got ${status}`);
  });

  // PPN / tranche sell validation
  console.log('\nPPN / Tranche Sell:');
  await test('POST /api/ppn/tranche/sell/rfq is quote-only', async () => {
    const { status, body } = await post('/api/ppn/tranche/sell/rfq', {
      vault_ids: ['00000000-0000-0000-0000-000000000000'],
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.kind === 'rfq', `Expected rfq response, got ${body.kind}`);
    assert(Array.isArray(body.quotes), 'Expected quotes array');
  });

  await test('POST /api/ppn/onchain/redeem/prepare validates lookup params', async () => {
    const { status } = await post('/api/ppn/onchain/redeem/prepare', {});
    assert(status === 404 || status === 400, `Expected 404/400, got ${status}`);
  });

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
