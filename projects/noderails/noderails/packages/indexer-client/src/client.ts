import type {
  IndexerAddContractRequest,
  IndexerAddFilterRequest,
  IndexerAddWatchedAddressRequest,
  IndexerBulkAddResult,
  IndexerBulkAddWatchedRequest,
  IndexerChain,
  IndexerClientConfig,
  IndexerContract,
  IndexerEvent,
  IndexerEventQueryParams,
  IndexerFilter,
  IndexerNativeTransfer,
  IndexerNativeTransferParams,
  IndexerResponse,
  IndexerUpdateFilterRequest,
  IndexerWatchedAddress,
} from './types.js';
import { IndexerApiError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Typed HTTP client for the Indexer Project API.
 *
 * Uses native `fetch` — no external HTTP dependencies.
 *
 * @example
 * ```ts
 * const indexer = new IndexerClient({
 *   baseUrl: 'https://indexer.internal',
 *   apiKey: 'idx_proj_abc123',
 * });
 *
 * const chains = await indexer.listChains();
 * ```
 */
export class IndexerClient {
  private readonly projectBase: string;
  private readonly rootBase: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: IndexerClientConfig) {
    const base = config.baseUrl.replace(/\/+$/, '');
    this.projectBase = `${base}/api/project`;
    this.rootBase = `${base}/api`;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ──────────── Chains (read-only) ────────────

  async listChains(): Promise<IndexerChain[]> {
    return this.get<IndexerChain[]>(`${this.projectBase}/chains`);
  }

  async getChain(id: string): Promise<IndexerChain> {
    return this.get<IndexerChain>(`${this.projectBase}/chains/${enc(id)}`);
  }

  // ──────────── Contracts ────────────

  async listContracts(): Promise<IndexerContract[]> {
    return this.get<IndexerContract[]>(`${this.projectBase}/contracts`);
  }

  async addContract(req: IndexerAddContractRequest): Promise<IndexerContract> {
    return this.post<IndexerContract>(`${this.projectBase}/contracts`, req);
  }

  async getContract(contractId: string): Promise<IndexerContract> {
    return this.get<IndexerContract>(`${this.projectBase}/contracts/${enc(contractId)}`);
  }

  async deleteContract(contractId: string): Promise<void> {
    await this.del(`${this.projectBase}/contracts/${enc(contractId)}`);
  }

  // ──────────── Event Filters ────────────

  async listFilters(contractId?: string): Promise<IndexerFilter[]> {
    const query: Record<string, unknown> = {};
    if (contractId) query.contractId = contractId;
    return this.get<IndexerFilter[]>(`${this.projectBase}/filters`, query);
  }

  async addFilter(req: IndexerAddFilterRequest): Promise<IndexerFilter> {
    return this.post<IndexerFilter>(`${this.projectBase}/filters`, req);
  }

  async updateFilter(
    contractId: string,
    eventName: string,
    req: IndexerUpdateFilterRequest,
  ): Promise<IndexerFilter> {
    return this.put<IndexerFilter>(
      `${this.projectBase}/filters`,
      req,
      { contractId, eventName },
    );
  }

  async clearFilter(contractId: string, eventName: string): Promise<void> {
    await this.del(`${this.projectBase}/filters`, { contractId, eventName });
  }

  // ──────────── Watched Addresses ────────────

  async listWatchedAddresses(chainId?: number | 'all'): Promise<IndexerWatchedAddress[]> {
    const query: Record<string, unknown> = {};
    if (chainId !== undefined) query.chainId = chainId;
    return this.get<IndexerWatchedAddress[]>(`${this.projectBase}/watched-addresses`, query);
  }

  async addWatchedAddress(req: IndexerAddWatchedAddressRequest): Promise<IndexerWatchedAddress> {
    return this.post<IndexerWatchedAddress>(`${this.projectBase}/watched-addresses`, req);
  }

  async bulkAddWatchedAddresses(req: IndexerBulkAddWatchedRequest): Promise<IndexerBulkAddResult> {
    return this.post<IndexerBulkAddResult>(`${this.projectBase}/watched-addresses/bulk`, req);
  }

  async deleteWatchedAddress(id: string): Promise<void> {
    await this.del(`${this.projectBase}/watched-addresses/${enc(id)}`);
  }

  // ──────────── Events Query ────────────

  async queryEvents(params?: IndexerEventQueryParams): Promise<{
    data: IndexerEvent[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.getPaginated<IndexerEvent>(`${this.rootBase}/events`, params as Record<string, unknown>);
  }

  // ──────────── Native Transfers Query ────────────

  async queryNativeTransfers(params?: IndexerNativeTransferParams): Promise<{
    data: IndexerNativeTransfer[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.getPaginated<IndexerNativeTransfer>(
      `${this.rootBase}/native-transfers`,
      params as Record<string, unknown>,
    );
  }

  // ──────────── Internal helpers ────────────

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const reqUrl = new URL(url);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          reqUrl.searchParams.set(k, String(v));
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(reqUrl.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        throw new IndexerApiError(res.status, text, `${method} ${reqUrl.pathname}`);
      }

      if (!text) return undefined as T;

      const json = JSON.parse(text) as IndexerResponse<T>;
      if (!json.success) {
        throw new IndexerApiError(
          res.status,
          (json as { error: string }).error,
          `${method} ${reqUrl.pathname}`,
        );
      }
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getPaginated<T>(
    url: string,
    query?: Record<string, unknown>,
  ): Promise<{ data: T[]; total: number; limit: number; offset: number }> {
    const reqUrl = new URL(url);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          reqUrl.searchParams.set(k, String(v));
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(reqUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        signal: controller.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        throw new IndexerApiError(res.status, text, `GET ${reqUrl.pathname}`);
      }

      const json = JSON.parse(text) as {
        success: boolean;
        data: T[];
        total: number;
        limit: number;
        offset: number;
      };

      if (!json.success) {
        throw new IndexerApiError(res.status, text, `GET ${reqUrl.pathname}`);
      }

      return { data: json.data, total: json.total, limit: json.limit, offset: json.offset };
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(url: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', url, undefined, query);
  }

  private post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', url, body);
  }

  private put<T>(url: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', url, body, query);
  }

  private del(url: string, query?: Record<string, unknown>): Promise<void> {
    return this.request<void>('DELETE', url, undefined, query);
  }
}

/** URI-encode a path segment */
function enc(s: string): string {
  return encodeURIComponent(s);
}
