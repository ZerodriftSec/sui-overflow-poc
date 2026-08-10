import type {
  MtxmAddChainRequest,
  MtxmAllocateSignerRequest,
  MtxmAllocatedSigner,
  MtxmChain,
  MtxmClientConfig,
  MtxmCreateSignerRequest,
  MtxmCreateWebhookRequest,
  MtxmDeliveryParams,
  MtxmFundSignerRequest,
  MtxmListTxParams,
  MtxmPaginatedTxResponse,
  MtxmResponse,
  MtxmSendTxRequest,
  MtxmSignTypedRequest,
  MtxmSignTypedResponse,
  MtxmSponsorSignRequest,
  MtxmSponsorSignResponse,
  MtxmExecuteSponsoredRequest,
  MtxmExecuteSponsoredResponse,
  MtxmSigner,
  MtxmSignerDetail,
  MtxmTransaction,
  MtxmUpdateChainRequest,
  MtxmUpdateWebhookRequest,
  MtxmWebhook,
} from './types.js';
import { MtxmApiError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Typed HTTP client for the MTXM REST API.
 *
 * Uses native `fetch` — no external HTTP dependencies.
 *
 * @example
 * ```ts
 * const mtxm = new MtxmClient({
 *   baseUrl: 'https://mtxm.internal',
 *   projectId: 'proj_abc123',
 *   apiKey: 'mtxm_sk_live_...',
 * });
 *
 * const tx = await mtxm.sendTransaction({ chainId: 'chain-1', to: '0x...', value: '1000' });
 * ```
 */
export class MtxmClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: MtxmClientConfig) {
    const { baseUrl, projectId, apiKey, timeoutMs } = config;
    // Strip trailing slash from baseUrl
    this.base = `${baseUrl.replace(/\/+$/, '')}/api/v1/projects/${projectId}`;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ──────────── Transactions ────────────

  async sendTransaction(req: MtxmSendTxRequest): Promise<MtxmTransaction> {
    return this.post<MtxmTransaction>('/transactions/send', req);
  }

  async signTypedData(req: MtxmSignTypedRequest): Promise<MtxmSignTypedResponse> {
    return this.post<MtxmSignTypedResponse>('/transactions/sign-typed', req);
  }

  /** Sui sponsored tx: MTXM adds gas payment + sponsor signature. */
  async sponsorSign(req: MtxmSponsorSignRequest): Promise<MtxmSponsorSignResponse> {
    return this.post<MtxmSponsorSignResponse>('/transactions/sponsor-sign', req);
  }

  /** Sui sponsored tx: submit user + sponsor signatures. */
  async executeSponsored(req: MtxmExecuteSponsoredRequest): Promise<MtxmExecuteSponsoredResponse> {
    return this.post<MtxmExecuteSponsoredResponse>('/transactions/execute-sponsored', req);
  }

  async getTransaction(txId: string): Promise<MtxmTransaction> {
    return this.get<MtxmTransaction>(`/transactions/${enc(txId)}`);
  }

  async listTransactions(params?: MtxmListTxParams): Promise<MtxmPaginatedTxResponse> {
    return this.get<MtxmPaginatedTxResponse>('/transactions', params as Record<string, unknown>);
  }

  async cancelTransaction(txId: string): Promise<MtxmTransaction> {
    return this.post<MtxmTransaction>(`/transactions/${enc(txId)}/cancel`);
  }

  // ──────────── Chains ────────────

  async addChain(req: MtxmAddChainRequest): Promise<MtxmChain> {
    return this.post<MtxmChain>('/chains', req);
  }

  async listChains(): Promise<MtxmChain[]> {
    return this.get<MtxmChain[]>('/chains');
  }

  async updateChain(chainId: string, req: MtxmUpdateChainRequest): Promise<MtxmChain> {
    return this.patch<MtxmChain>(`/chains/${enc(chainId)}`, req);
  }

  async deleteChain(chainId: string): Promise<void> {
    await this.del(`/chains/${enc(chainId)}`);
  }

  // ──────────── Signers ────────────

  async createSigner(req: MtxmCreateSignerRequest): Promise<MtxmSigner> {
    return this.post<MtxmSigner>('/signers', req);
  }

  async listSigners(): Promise<MtxmSigner[]> {
    return this.get<MtxmSigner[]>('/signers');
  }

  /**
   * Round-robin allocate an active non-master signer (e.g. SUI hot wallet).
   * Returns signerId, address, and Ed25519 public key for auth / PTB submission.
   */
  async allocateSigner(req: MtxmAllocateSignerRequest = {}): Promise<MtxmAllocatedSigner> {
    return this.post<MtxmAllocatedSigner>('/signers/allocate', req);
  }

  async getSignerDetail(signerId: string): Promise<MtxmSignerDetail> {
    return this.get<MtxmSignerDetail>(`/signers/${enc(signerId)}/detail`);
  }

  async setMasterSigner(signerId: string): Promise<MtxmSigner> {
    return this.post<MtxmSigner>(`/signers/${enc(signerId)}/master`);
  }

  async fundSigner(signerId: string, req: MtxmFundSignerRequest): Promise<MtxmTransaction> {
    return this.post<MtxmTransaction>(`/signers/${enc(signerId)}/fund`, req);
  }

  // ──────────── Webhooks ────────────

  async createWebhook(req: MtxmCreateWebhookRequest): Promise<MtxmWebhook> {
    return this.post<MtxmWebhook>('/webhooks', req);
  }

  async listWebhooks(): Promise<MtxmWebhook[]> {
    return this.get<MtxmWebhook[]>('/webhooks');
  }

  async updateWebhook(webhookId: string, req: MtxmUpdateWebhookRequest): Promise<MtxmWebhook> {
    return this.patch<MtxmWebhook>(`/webhooks/${enc(webhookId)}`, req);
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.del(`/webhooks/${enc(webhookId)}`);
  }

  async rotateWebhookSecret(webhookId: string): Promise<MtxmWebhook> {
    return this.post<MtxmWebhook>(`/webhooks/${enc(webhookId)}/rotate-secret`);
  }

  async testWebhook(webhookId: string): Promise<{ delivered: boolean }> {
    return this.post<{ delivered: boolean }>(`/webhooks/${enc(webhookId)}/test`);
  }

  async listWebhookDeliveries(
    webhookId: string,
    params?: MtxmDeliveryParams,
  ): Promise<unknown[]> {
    return this.get<unknown[]>(`/webhooks/${enc(webhookId)}/deliveries`, params as Record<string, unknown>);
  }

  // ──────────── Internal helpers ────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.base}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();

      if (!res.ok) {
        throw new MtxmApiError(res.status, text, `${method} ${path}`);
      }

      // DELETE may return 204 with empty body
      if (!text) return undefined as T;

      const json = JSON.parse(text) as MtxmResponse<T>;
      if (!json.success) {
        throw new MtxmApiError(res.status, (json as { message: string }).message, `${method} ${path}`);
      }
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private del(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }
}

/** URI-encode a path segment */
function enc(s: string): string {
  return encodeURIComponent(s);
}
