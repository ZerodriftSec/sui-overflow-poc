import type { HttpClient, PaginatedResult } from "../http";
import type {
  Customer,
  CustomerAddWalletParams,
  CustomerCreateParams,
  CustomerListParams,
  CustomerUpdateParams,
  CustomerWallet,
} from "../types/customer";

export class Customers {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new customer.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const customer = await noderails.customers.create({
   *   email: 'john@example.com',
   *   name: 'John Doe',
   * });
   * ```
   */
  async create(params: CustomerCreateParams): Promise<Customer> {
    return this.http.request<Customer>({
      method: "POST",
      path: "/customers",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve a customer by ID. Includes wallets and payment history.
   */
  async retrieve(id: string): Promise<Customer> {
    return this.http.request<Customer>({
      method: "GET",
      path: `/customers/${id}`,
    });
  }

  /**
   * Update a customer.
   */
  async update(id: string, params: CustomerUpdateParams): Promise<Customer> {
    return this.http.request<Customer>({
      method: "PUT",
      path: `/customers/${id}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * List customers with pagination.
   */
  async list(params?: CustomerListParams): Promise<PaginatedResult<Customer>> {
    return this.http.requestPaginated<Customer>({
      method: "GET",
      path: "/customers",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Add a wallet to a customer.
   */
  async addWallet(customerId: string, params: CustomerAddWalletParams): Promise<CustomerWallet> {
    return this.http.request<CustomerWallet>({
      method: "POST",
      path: `/customers/${customerId}/wallets`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Remove a wallet from a customer.
   */
  async removeWallet(customerId: string, walletId: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/customers/${customerId}/wallets/${walletId}`,
    });
  }
}
