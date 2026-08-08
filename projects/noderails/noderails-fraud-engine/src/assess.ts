import { loadConfig } from './config.js';
import { GoldRushClient } from './goldrush/client.js';
import { assessWalletRisk } from './engine/risk-engine.js';
import { buildComplianceReport, reportToJson, type ComplianceReport } from './report/build-report.js';
import { parseGoldRushJson } from './goldrush/unwrap.js';
import type { TransactionsResponseBody, TxItem } from './goldrush/types.js';

export interface AssessWalletOptions {
  walletAddress: string;
}

/**
 * Full assessment as structured report (use from HTTP API or programmatic integrations).
 */
export async function assessWalletReport(options: AssessWalletOptions): Promise<ComplianceReport> {
  const config = loadConfig();
  const client = new GoldRushClient({
    goldrushApiKey: config.goldrushApiKey,
    quoteCurrency: config.quoteCurrency,
  });

  const address = options.walletAddress.trim();
  if (!address) {
    throw new Error('walletAddress is required');
  }

  const [balances, recentTxFirst, summaryBody] = await Promise.all([
    client.getTokenBalances(config.chainName, address),
    client.getRecentTransactions(config.chainName, address, { noLogs: true }),
    client.getTransactionSummary(config.chainName, address),
  ]);

  const recentItems = await mergeRecentTransactionPages({
    apiKey: config.goldrushApiKey,
    initial: recentTxFirst,
    maxExtraPages: 2,
  });

  const summaryItem = summaryBody.items?.[0];
  const fetchedAt =
    balances.updated_at ?? recentTxFirst.updated_at ?? summaryBody.updated_at ?? new Date().toISOString();

  const assessment = assessWalletRisk({
    walletAddress: address,
    chainName: config.chainName,
    balances: balances.items ?? [],
    recentTransactions: recentItems,
    summary: summaryItem,
    dataFetchedAt: fetchedAt,
  });

  return buildComplianceReport(assessment);
}

async function mergeRecentTransactionPages(opts: {
  apiKey: string;
  initial: TransactionsResponseBody;
  maxExtraPages: number;
}): Promise<TxItem[]> {
  const items = [...(opts.initial.items ?? [])];
  let next = opts.initial.links?.next;
  let pages = 0;
  while (next && typeof next === 'string' && pages < opts.maxExtraPages) {
    const url = new URL(next);
    if (!url.hostname.endsWith('covalenthq.com')) {
      break;
    }
    const res = await fetch(next, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      break;
    }
    if (!res.ok) break;
    const body = parseGoldRushJson<TransactionsResponseBody>(json);
    items.push(...(body.items ?? []));
    next = body.links?.next ?? null;
    pages += 1;
  }
  return items;
}

/**
 * Same pipeline as assessWalletReport; returns JSON string for CLI and logging.
 */
export async function assessWallet(options: AssessWalletOptions): Promise<string> {
  const report = await assessWalletReport(options);
  return reportToJson(report);
}
