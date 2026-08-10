import type { HttpClient, PaginatedResult } from "../http";
import type {
  PriceCreateParams,
  PriceUpdateParams,
  ProductPlan,
  ProductPlanCreateParams,
  ProductPlanListParams,
  ProductPlanPrice,
  ProductPlanUpdateParams,
} from "../types/product-plan";

export class ProductPlans {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new product plan with prices.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const plan = await noderails.productPlans.create({
   *   name: 'Pro Plan',
   *   planType: 'SUBSCRIPTION',
   *   prices: [{ amount: '29.99', billingInterval: 'MONTH' }],
   * });
   * ```
   */
  async create(params: ProductPlanCreateParams): Promise<ProductPlan> {
    return this.http.request<ProductPlan>({
      method: "POST",
      path: "/product-plans",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a product plan by ID.
   */
  async retrieve(id: string): Promise<ProductPlan> {
    return this.http.request<ProductPlan>({
      method: "GET",
      path: `/product-plans/${id}`,
    });
  }

  /**
   * Update a product plan.
   */
  async update(id: string, params: ProductPlanUpdateParams): Promise<ProductPlan> {
    return this.http.request<ProductPlan>({
      method: "PUT",
      path: `/product-plans/${id}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * List product plans with pagination.
   */
  async list(params?: ProductPlanListParams): Promise<PaginatedResult<ProductPlan>> {
    return this.http.requestPaginated<ProductPlan>({
      method: "GET",
      path: "/product-plans",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Add a price to an existing product plan.
   */
  async createPrice(planId: string, params: PriceCreateParams): Promise<ProductPlanPrice> {
    return this.http.request<ProductPlanPrice>({
      method: "POST",
      path: `/product-plans/${planId}/prices`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Update a price on a product plan.
   */
  async updatePrice(
    planId: string,
    priceId: string,
    params: PriceUpdateParams,
  ): Promise<ProductPlanPrice> {
    return this.http.request<ProductPlanPrice>({
      method: "PUT",
      path: `/product-plans/${planId}/prices/${priceId}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Deactivate a price on a product plan.
   */
  async deletePrice(planId: string, priceId: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/product-plans/${planId}/prices/${priceId}`,
    });
  }
}
