import type { HttpClient } from "../http";
import type {
  TaxRate,
  TaxRateCreateParams,
  TaxRateListParams,
  TaxRateUpdateParams,
} from "../types/tax-rate";

export class TaxRates {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a new tax rate.
   *
   * @example
   * ```ts
   * const taxRate = await noderails.taxRates.create({
   *   displayName: 'VAT',
   *   percentage: 20,
   * });
   * ```
   */
  async create(params: TaxRateCreateParams): Promise<TaxRate> {
    return this.http.request<TaxRate>({
      method: "POST",
      path: "/tax-rates",
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a tax rate by ID.
   */
  async retrieve(id: string): Promise<TaxRate> {
    return this.http.request<TaxRate>({
      method: "GET",
      path: `/tax-rates/${id}`,
    });
  }

  /**
   * Update a tax rate.
   */
  async update(id: string, params: TaxRateUpdateParams): Promise<TaxRate> {
    return this.http.request<TaxRate>({
      method: "PUT",
      path: `/tax-rates/${id}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * List all tax rates.
   *
   * @note Returns all tax rates (not paginated). Pass `includeInactive: true`
   *       to include archived tax rates.
   */
  async list(params?: TaxRateListParams): Promise<TaxRate[]> {
    return this.http.requestList<TaxRate>({
      method: "GET",
      path: "/tax-rates",
      query: params?.includeInactive
        ? { includeInactive: "true" }
        : undefined,
    });
  }

  /**
   * Archive (soft-delete) a tax rate.
   */
  async delete(id: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/tax-rates/${id}`,
    });
  }
}
