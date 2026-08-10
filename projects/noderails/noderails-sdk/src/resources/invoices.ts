import type { HttpClient, PaginatedResult } from "../http";
import type {
  Invoice,
  InvoiceCreateParams,
  InvoiceListParams,
} from "../types/invoice";

export class Invoices {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  /**
   * Create a new invoice.
   * The `appId` is automatically set from your SDK config.
   *
   * @example
   * ```ts
   * const invoice = await noderails.invoices.create({
   *   customerAccountId: 'cust_...',
   *   items: [{ description: 'Consulting', amount: '500.00' }],
   * });
   * ```
   */
  async create(params: InvoiceCreateParams): Promise<Invoice> {
    return this.http.request<Invoice>({
      method: "POST",
      path: "/invoices",
      body: { appId: this.appId, ...params } as unknown as Record<string, unknown>,
    });
  }

  /**
   * Retrieve an invoice by ID.
   */
  async retrieve(id: string): Promise<Invoice> {
    return this.http.request<Invoice>({
      method: "GET",
      path: `/invoices/${id}`,
    });
  }

  /**
   * List invoices with pagination.
   */
  async list(params?: InvoiceListParams): Promise<PaginatedResult<Invoice>> {
    return this.http.requestPaginated<Invoice>({
      method: "GET",
      path: "/invoices",
      query: { appId: this.appId, ...params } as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Open a draft invoice (transition from DRAFT → OPEN).
   */
  async open(id: string): Promise<Invoice> {
    return this.http.request<Invoice>({
      method: "POST",
      path: `/invoices/${id}/open`,
    });
  }

  /**
   * Void an invoice.
   */
  async void(id: string): Promise<Invoice> {
    return this.http.request<Invoice>({
      method: "POST",
      path: `/invoices/${id}/void`,
    });
  }

  /**
   * Send an invoice to the customer via email.
   */
  async send(id: string): Promise<{ sent: boolean }> {
    return this.http.request<{ sent: boolean }>({
      method: "POST",
      path: `/invoices/${id}/send`,
    });
  }
}
