import type { HttpClient, PaginatedResult } from "../http";
import type {
  CheckoutSession,
  CheckoutSessionCreateParams,
  CheckoutSessionListParams,
} from "../types/checkout-session";

export class CheckoutSessions {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new checkout session.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const session = await noderails.checkoutSessions.create({
   *   successUrl: 'https://example.com/success',
   *   cancelUrl: 'https://example.com/cancel',
   *   items: [{ name: 'Pro Plan', amount: '29.99', quantity: 1 }],
   * });
   * ```
   */
  async create(params: CheckoutSessionCreateParams): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: "POST",
      path: "/checkout-sessions",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a checkout session by ID.
   */
  async retrieve(id: string): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: "GET",
      path: `/checkout-sessions/${id}`,
    });
  }

  /**
   * List checkout sessions with pagination.
   */
  async list(params?: CheckoutSessionListParams): Promise<PaginatedResult<CheckoutSession>> {
    return this.http.requestPaginated<CheckoutSession>({
      method: "GET",
      path: "/checkout-sessions",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Expire an open checkout session.
   */
  async expire(id: string): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: "POST",
      path: `/checkout-sessions/${id}/expire`,
    });
  }
}
