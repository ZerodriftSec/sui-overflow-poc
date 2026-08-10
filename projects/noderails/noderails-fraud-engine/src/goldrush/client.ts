import type { AppConfig } from '../config.js';
import { parseGoldRushJson } from './unwrap.js';
import type {
  BalancesResponseBody,
  TransactionSummaryResponseBody,
  TransactionsResponseBody,
} from './types.js';

const BASE = 'https://api.covalenthq.com';

/**
 * Thin HTTP client for GoldRush Foundational REST API (Bearer API key).
 * Swappable implementation boundary for tests or alternate transports.
 */
export class GoldRushClient {
  constructor(
    private readonly config: Pick<AppConfig, 'goldrushApiKey' | 'quoteCurrency'>,
  ) {}

  private async get<T>(path: string, query: Record<string, string | boolean | undefined>): Promise<T> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.config.goldrushApiKey}`,
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`GoldRush non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const err = typeof json === 'object' && json && 'error_message' in json
        ? String((json as { error_message?: string }).error_message)
        : text.slice(0, 300);
      throw new Error(`GoldRush HTTP ${res.status}: ${err}`);
    }
    return parseGoldRushJson<T>(json);
  }

  getTokenBalances(chainName: string, walletAddress: string): Promise<BalancesResponseBody> {
    const path = `/v1/${encodeURIComponent(chainName)}/address/${encodeURIComponent(walletAddress)}/balances_v2/`;
    return this.get<BalancesResponseBody>(path, {
      'quote-currency': this.config.quoteCurrency,
    });
  }

  /**
   * Recent transactions (newest first by default). Use no-logs to reduce credit cost.
   */
  getRecentTransactions(
    chainName: string,
    walletAddress: string,
    options?: { noLogs?: boolean },
  ): Promise<TransactionsResponseBody> {
    const path = `/v1/${encodeURIComponent(chainName)}/address/${encodeURIComponent(walletAddress)}/transactions_v3/`;
    return this.get<TransactionsResponseBody>(path, {
      'quote-currency': this.config.quoteCurrency,
      'no-logs': options?.noLogs ?? true,
    });
  }

  getTransactionSummary(chainName: string, walletAddress: string): Promise<TransactionSummaryResponseBody> {
    const path = `/v1/${encodeURIComponent(chainName)}/address/${encodeURIComponent(walletAddress)}/transactions_summary/`;
    return this.get<TransactionSummaryResponseBody>(path, {
      'quote-currency': this.config.quoteCurrency,
    });
  }
}
