import type { HttpClient, PaginatedResult } from "../http";
import type {
  PaymentIntent,
  PaymentIntentCreateParams,
  PaymentIntentListParams,
  PaymentIntentRefundParams,
} from "../types/payment-intent";

export class PaymentIntents {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new payment intent.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const intent = await noderails.paymentIntents.create({
   *   amount: '100.00',
   *   currency: 'USD',
   * });
   * ```
   */
  async create(params: PaymentIntentCreateParams): Promise<PaymentIntent> {
    return this.http.request<PaymentIntent>({
      method: "POST",
      path: "/payments/intents",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a payment intent by ID.
   */
  async retrieve(id: string): Promise<PaymentIntent> {
    return this.http.request<PaymentIntent>({
      method: "GET",
      path: `/payments/intents/${id}`,
    });
  }

  /**
   * List payment intents with pagination.
   */
  async list(params?: PaymentIntentListParams): Promise<PaginatedResult<PaymentIntent>> {
    return this.http.requestPaginated<PaymentIntent>({
      method: "GET",
      path: "/payments/intents",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Cancel a payment intent.
   */
  async cancel(id: string): Promise<PaymentIntent> {
    return this.http.request<PaymentIntent>({
      method: "POST",
      path: `/payments/intents/${id}/cancel`,
    });
  }

  /**
   * Initiate a refund for a payment intent.
   */
  async refund(id: string, params: PaymentIntentRefundParams): Promise<PaymentIntent> {
    return this.http.request<PaymentIntent>({
      method: "POST",
      path: `/payments/intents/${id}/refund`,
      body: params as unknown as Record<string, unknown>,
    });
  }
}
