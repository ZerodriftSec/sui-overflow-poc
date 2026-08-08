/**
 * Operator-signed testnet audit for the canonical Earn Yield and Protected Notes
 * open flows. This intentionally performs live Sui writes and therefore requires
 * LIVE_YIELD_NOTES_E2E=1.
 */
import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { getSigner, getSuiClient } from '../services/predict/sui';

const BASE = (process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:13101').replace(/\/$/, '');
const CAPITAL_USD = 5;
const signer = getSigner();
const client = getSuiClient();
const owner = signer.getPublicKey().toSuiAddress();

interface Prepared {
  tx_bytes: string;
  sim_id?: string;
}

interface YieldAccount {
  shares: number;
  total_value_usd: number;
  range_position_count: number;
}

interface SimPosition {
  sim_id: string;
  status: string;
  product: string;
}

let passed = 0;

function pass(name: string, detail = ''): void {
  passed += 1;
  console.log(`  PASS ${name}${detail ? ` · ${detail}` : ''}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T & { error?: string } }> {
  const response = await fetch(`${BASE}${path}`, {
    signal: AbortSignal.timeout(30_000),
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as T & { error?: string };
  return { status: response.status, body };
}

async function get<T>(path: string): Promise<T> {
  const response = await request<T>(path);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GET ${path} returned ${response.status}: ${response.body.error ?? 'unknown error'}`);
  }
  return response.body;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`POST ${path} returned ${response.status}: ${response.body.error ?? 'unknown error'}`);
  }
  return response.body;
}

async function sign(txBytes: string): Promise<string> {
  const result = await client.signAndExecuteTransaction({
    transaction: Transaction.from(txBytes),
    signer,
    options: { showEffects: true },
  });
  assert(result.effects?.status.status === 'success', result.effects?.status.error ?? 'transaction failed');
  await client.waitForTransaction({ digest: result.digest, timeout: 30_000 });
  return result.digest;
}

async function confirmPredict(digest: string): Promise<void> {
  const confirmed = await post<{ ok: boolean; status: string }>('/api/predict/confirm', { digest });
  assert(confirmed.ok && confirmed.status === 'success', `Predict confirmation failed: ${confirmed.status}`);
}

async function confirmSim(prepared: Prepared, digest: string): Promise<string> {
  assert(prepared.sim_id, 'simulation prepare did not return sim_id');
  const confirmed = await post<{ status: string; sim_id: string }>('/api/sim/confirm', {
    sim_id: prepared.sim_id,
    digest,
  });
  assert(confirmed.status === 'open', `simulation confirmation returned ${confirmed.status}`);
  return prepared.sim_id;
}

async function managerId(): Promise<string> {
  const managers = await get<Array<{ manager_id: string }>>(`/api/predict/managers?owner=${owner}`);
  if (managers[0]?.manager_id) return managers[0].manager_id;
  const prepared = await post<Prepared>('/api/predict/manager/prepare', { owner });
  const digest = await sign(prepared.tx_bytes);
  const confirmed = await post<{ ok: boolean; created_manager_id?: string | null }>('/api/predict/confirm', { digest });
  assert(confirmed.ok && confirmed.created_manager_id, 'manager creation did not return a manager id');
  return confirmed.created_manager_id;
}

async function openYield(strategyId: string, currency: 'dUSDC' | 'mUSDC', manager?: string): Promise<{ digest: string; simId?: string }> {
  const quote = await post<{ quote_id: string }>('/api/deepbook/yield/quote', {
    strategy_id: strategyId,
    capital_usd: CAPITAL_USD,
    sender: owner,
  });
  const prepared = await post<Prepared>('/api/deepbook/yield/open/prepare', {
    quote_id: quote.quote_id,
    owner,
    currency,
    ...(manager ? { manager_id: manager } : {}),
  });
  const digest = await sign(prepared.tx_bytes);
  if (currency === 'mUSDC') return { digest, simId: await confirmSim(prepared, digest) };
  await confirmPredict(digest);
  return { digest };
}

async function openNote(presetId: string, currency: 'dUSDC' | 'mUSDC', manager?: string): Promise<{ digest: string; simId?: string }> {
  const quote = await post<{ quote_id: string }>('/api/notes/quote', {
    preset_id: presetId,
    principal_usd: CAPITAL_USD,
    tenor_days: presetId === 'autocall-three' ? 12 : 40,
    sender: owner,
  });
  const prepared = await post<Prepared>('/api/notes/open/prepare', {
    quote_id: quote.quote_id,
    owner,
    currency,
    ...(manager ? { manager_id: manager } : {}),
  });
  const digest = await sign(prepared.tx_bytes);
  if (currency === 'mUSDC') return { digest, simId: await confirmSim(prepared, digest) };
  await confirmPredict(digest);
  return { digest };
}

async function assertEarlySettlementBlocked(simId: string): Promise<void> {
  const response = await request<{ error?: string }>('/api/sim/settle', {
    method: 'POST',
    body: JSON.stringify({ sim_id: simId }),
  });
  assert(response.status === 400, `early settle returned ${response.status}, expected 400`);
  assert(/expiry|observation/i.test(response.body.error ?? ''), `unexpected early-settle error: ${response.body.error ?? 'none'}`);
}

async function main(): Promise<void> {
  if (process.env.LIVE_YIELD_NOTES_E2E !== '1') {
    throw new Error('Refusing live writes. Set LIVE_YIELD_NOTES_E2E=1 to run this testnet audit.');
  }

  console.log(`\nCanonical yield + notes testnet E2E`);
  console.log(`  backend: ${BASE}`);
  console.log(`  signer:  ${owner}\n`);

  const manager = await managerId();
  const before = await get<YieldAccount>(`/api/deepbook/yield/account/${owner}`);

  const musdcYield = await openYield('two-way-guard', 'mUSDC');
  assert(musdcYield.simId, 'mUSDC yield sim id missing');
  pass('mUSDC Two-Way Guard opened and confirmed', musdcYield.digest);

  const dusdcYield = await openYield('core-market-maker', 'dUSDC');
  pass('dUSDC Core Market Maker supplied PLP', dusdcYield.digest);

  const musdcNote = await openNote('capital-guard', 'mUSDC');
  assert(musdcNote.simId, 'mUSDC terminal note sim id missing');
  await assertEarlySettlementBlocked(musdcNote.simId);
  pass('mUSDC Capital Guard opened; early settlement blocked', musdcNote.digest);

  const dusdcNote = await openNote('capital-guard', 'dUSDC', manager);
  pass('dUSDC Capital Guard opened PLP + live ranges', dusdcNote.digest);

  const autocall = await openNote('autocall-three', 'mUSDC');
  assert(autocall.simId, 'mUSDC autocall sim id missing');
  await assertEarlySettlementBlocked(autocall.simId);
  pass('mUSDC Autocall 3 opened; first observation lock enforced', autocall.digest);

  const after = await get<YieldAccount>(`/api/deepbook/yield/account/${owner}`);
  assert(after.shares > before.shares, `PLP shares did not increase (${before.shares} -> ${after.shares})`);
  assert(after.range_position_count > before.range_position_count, `range positions did not increase (${before.range_position_count} -> ${after.range_position_count})`);
  assert(after.total_value_usd > 0, 'dUSDC account value is zero');
  pass('dUSDC account reconciles new PLP and range positions', `$${after.total_value_usd.toFixed(2)}`);

  const positions = await get<{ positions: SimPosition[] }>(`/api/sim/positions/${owner}`);
  for (const simId of [musdcYield.simId, musdcNote.simId, autocall.simId]) {
    const position = positions.positions.find((item) => item.sim_id === simId);
    assert(position?.status === 'open', `simulation position ${simId} is not open`);
  }
  pass('mUSDC Portfolio source contains all three canonical receipts');

  console.log(`\n${passed} passed, 0 failed\n`);
}

main().catch((error) => {
  console.error(`\nFAIL: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
