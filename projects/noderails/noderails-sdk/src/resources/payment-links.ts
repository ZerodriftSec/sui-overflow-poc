import type { HttpClient, PaginatedResult } from "../http";
import type {
  PaymentLink,
  PaymentLinkCreateParams,
  PaymentLinkListParams,
  PaymentLinkUpdateParams,
} from "../types/payment-link";

export class PaymentLinks {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new payment link.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const link = await noderails.paymentLinks.create({
   *   name: 'Pro Plan',
   *   slug: 'pro-plan',
   *   amount: '29.99',
   * });
   * ```
   */
  async create(params: PaymentLinkCreateParams): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: "POST",
      path: "/payment-links",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a payment link by ID.
   */
  async retrieve(id: string): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: "GET",
      path: `/payment-links/${id}`,
    });
  }

  /**
   * Update a payment link.
   */
  async update(id: string, params: PaymentLinkUpdateParams): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: "PUT",
      path: `/payment-links/${id}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * List payment links with pagination.
   */
  async list(params?: PaymentLinkListParams): Promise<PaginatedResult<PaymentLink>> {
    return this.http.requestPaginated<PaymentLink>({
      method: "GET",
      path: "/payment-links",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Delete a payment link.
   */
  async delete(id: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/payment-links/${id}`,
    });
  }
}
