import type { HttpClient, PaginatedResult } from "../http";
import type { CheckoutSession } from "../types/checkout-session";
import type {
  Subscription,
  SubscriptionCancelParams,
  SubscriptionCreateParams,
  SubscriptionListParams,
} from "../types/subscription";

export class Subscriptions {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new subscription.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const sub = await noderails.subscriptions.create({
   *   customerAccountId: 'cust_...',
   *   productPlanId: 'plan_...',
   *   productPlanPriceId: 'price_...',
   * });
   * ```
   */
  async create(params: SubscriptionCreateParams): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: "POST",
      path: "/subscriptions",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a subscription by ID. Includes associated invoices.
   */
  async retrieve(id: string): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: "GET",
      path: `/subscriptions/${id}`,
    });
  }

  /**
   * List subscriptions with pagination.
   */
  async list(params?: SubscriptionListParams): Promise<PaginatedResult<Subscription>> {
    return this.http.requestPaginated<Subscription>({
      method: "GET",
      path: "/subscriptions",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Pause a subscription.
   */
  async pause(id: string): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: "POST",
      path: `/subscriptions/${id}/pause`,
    });
  }

  /**
   * Resume a paused subscription.
   */
  async resume(id: string): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: "POST",
      path: `/subscriptions/${id}/resume`,
    });
  }

  /**
   * Cancel a subscription.
   *
   * @param cancelAtPeriodEnd - If true, the subscription will remain active
   *   until the end of the current billing period.
   */
  async cancel(id: string, params?: SubscriptionCancelParams): Promise<Subscription> {
    return this.http.request<Subscription>({
      method: "POST",
      path: `/subscriptions/${id}/cancel`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Create a checkout session for the initial subscription payment.
   */
  async createCheckout(id: string): Promise<CheckoutSession> {
    return this.http.request<CheckoutSession>({
      method: "POST",
      path: `/subscriptions/${id}/checkout`,
    });
  }
}
