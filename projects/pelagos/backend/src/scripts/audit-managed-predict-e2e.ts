/** Full Pelagos API-boundary Predict proof using the configured operator signer. */
import { Transaction } from '@mysten/sui/transactions';
import { getSigner, getSuiClient, signerAddress } from '../services/predict/sui';
import { PREDICT } from '../services/predict/config';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:13101';

interface Bucket {
  lower: string;
  higher: string;
  quantity: string;
  tradeable: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error ?? 'unknown'}`);
  return body;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

async function signAndConfirm(txBytes: string) {
  const client = getSuiClient();
  const result = await client.signAndExecuteTransaction({
    transaction: Transaction.from(txBytes),
    signer: getSigner(),
  });
  if (result.effects.status.status !== 'success') {
    throw new Error(result.effects.status.error ?? 'wallet transaction failed');
  }
  await client.waitForTransaction({ digest: result.digest, timeout: 20_000 });
  const confirmation = await post<{ ok: boolean; status: string }>('/api/predict/confirm', {
    digest: result.digest,
  });
  if (!confirmation.ok || confirmation.status !== 'success') {
    throw new Error(`confirmation failed for ${result.digest}: ${confirmation.status}`);
  }
  return result.digest;
}

function decodeU64(bytes: number[]): bigint {
  let value = 0n;
  for (let index = Math.min(7, bytes.length - 1); index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  return value;
}

async function rangeQuantity(
  owner: string,
  managerId: string,
  oracleId: string,
  expiry: string,
  bucket: Pick<Bucket, 'lower' | 'higher'>,
): Promise<bigint> {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT.packageId}::range_key::new`,
    arguments: [
      tx.pure.id(oracleId),
      tx.pure.u64(expiry),
      tx.pure.u64(bucket.lower),
      tx.pure.u64(bucket.higher),
    ],
  });
  tx.moveCall({
    target: `${PREDICT.packageId}::predict_manager::range_position`,
    arguments: [tx.object(managerId), key],
  });
  const inspected = await getSuiClient().devInspectTransactionBlock({ sender: owner, transactionBlock: tx });
  const bytes = inspected.results?.[1]?.returnValues?.[0]?.[0];
  if (!bytes) throw new Error(`Could not read range quantity for ${bucket.lower}-${bucket.higher}`);
  return decodeU64(bytes);
}

async function main(): Promise<void> {
  const owner = signerAddress();
  if (!owner) throw new Error('Predict signer is not configured');
  const managers = await api<Array<{ manager_id: string }>>(`/api/predict/managers?owner=${owner}`);
  if (managers.length === 0) throw new Error('Operator PredictManager is missing');
  const managerId = managers[0].manager_id;

  const quote = await post<{
    oracle_id: string;
    expiry: string;
    total_cost_raw: string;
    buckets: Bucket[];
  }>('/api/predict/strip/preview', {
    asset: 'BTC',
    n: 4,
    budget_usd: 2,
    span_sigma: 1.5,
    sender: owner,
  });
  const buckets = quote.buckets
    .filter((bucket) => bucket.tradeable && BigInt(bucket.quantity) > 0n)
    .map(({ lower, higher, quantity }) => ({ lower, higher, quantity }));
  if (buckets.length === 0) throw new Error('Strip quote returned no tradeable buckets');
  const deposit = (BigInt(quote.total_cost_raw) * 125n) / 100n + 1n;

  const prepared = await post<{ tx_bytes: string; dry_run: { ok: boolean | null }; bucket_count: number }>(
    '/api/predict/strip/open/prepare',
    {
      owner,
      manager_id: managerId,
      oracle_id: quote.oracle_id,
      expiry: quote.expiry,
      buckets,
      deposit_amount_raw: deposit.toString(),
    },
  );
  if (prepared.dry_run.ok === false || prepared.bucket_count !== buckets.length) {
    throw new Error(`Open preparation failed dry-run: ${JSON.stringify(prepared.dry_run)}`);
  }
  const openDigest = await signAndConfirm(prepared.tx_bytes);
  const openQuantities = await Promise.all(
    buckets.map((bucket) =>
      rangeQuantity(owner, managerId, quote.oracle_id, quote.expiry, bucket),
    ),
  );
  if (openQuantities.some((quantity, index) => quantity !== BigInt(buckets[index].quantity))) {
    throw new Error(`Open range quantities mismatch: ${openQuantities.join(',')}`);
  }

  const redemption = await post<{ tx_bytes: string; dry_run: { ok: boolean | null }; bucket_count: number }>(
    '/api/predict/strip/redeem/prepare',
    {
      owner,
      manager_id: managerId,
      oracle_id: quote.oracle_id,
      expiry: quote.expiry,
      buckets,
    },
  );
  if (redemption.dry_run.ok === false) {
    throw new Error(`Redemption preparation failed dry-run: ${JSON.stringify(redemption.dry_run)}`);
  }
  const redeemDigest = await signAndConfirm(redemption.tx_bytes);
  const closedSummary = await api<{ range_position_count: number }>(
    `/api/predict/managers/${managerId}/summary`,
  );
  const closedQuantities = await Promise.all(
    buckets.map((bucket) =>
      rangeQuantity(owner, managerId, quote.oracle_id, quote.expiry, bucket),
    ),
  );
  if (closedQuantities.some((quantity) => quantity !== 0n)) {
    throw new Error(`Expected all test ranges closed, found quantities ${closedQuantities.join(',')}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        owner,
        manager_id: managerId,
        oracle_id: quote.oracle_id,
        bucket_count: buckets.length,
        quoted_cost_raw: quote.total_cost_raw,
        deposit_cap_raw: deposit.toString(),
        open_digest: openDigest,
        redeem_digest: redeemDigest,
        open_quantities_raw: openQuantities.map(String),
        final_quantities_raw: closedQuantities.map(String),
        retained_range_keys: closedSummary.range_position_count,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
