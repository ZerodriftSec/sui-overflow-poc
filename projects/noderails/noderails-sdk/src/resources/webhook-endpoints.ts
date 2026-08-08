import type { HttpClient } from "../http";
import type {
  WebhookDelivery,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointUpdateParams,
} from "../types/webhook";

export class WebhookEndpoints {
  private readonly appId: string;

  constructor(
    private readonly http: HttpClient,
    appId: string,
  ) {
    this.appId = appId;
  }

  /**
   * Create a new webhook endpoint.
   *
   * @example
   * ```ts
   * const webhook = await noderails.webhookEndpoints.create({
   *   url: 'https://example.com/webhooks',
   *   events: ['payment.captured', 'payment.settled'],
   * });
   * // webhook.secret is only returned on create and rotate
   * ```
   */
  async create(params: WebhookEndpointCreateParams): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: "POST",
      path: `/apps/${this.appId}/webhooks`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * List all webhook endpoints.
   */
  async list(): Promise<WebhookEndpoint[]> {
    return this.http.requestList<WebhookEndpoint>({
      method: "GET",
      path: `/apps/${this.appId}/webhooks`,
    });
  }

  /**
   * Update a webhook endpoint.
   */
  async update(webhookId: string, params: WebhookEndpointUpdateParams): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: "PUT",
      path: `/apps/${this.appId}/webhooks/${webhookId}`,
      body: params as unknown as Record<string, unknown>,
    });
  }

  /**
   * Delete a webhook endpoint.
   */
  async delete(webhookId: string): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/apps/${this.appId}/webhooks/${webhookId}`,
    });
  }

  /**
   * Rotate the webhook secret. Returns the new secret.
   */
  async rotateSecret(webhookId: string): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: "POST",
      path: `/apps/${this.appId}/webhooks/${webhookId}/rotate-secret`,
    });
  }

  /**
   * Send a test ping to a webhook endpoint.
   */
  async testPing(webhookId: string): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/apps/${this.appId}/webhooks/${webhookId}/test-ping`,
    });
  }

  /**
   * List webhook deliveries.
   */
  async listDeliveries(
    webhookId: string,
    params?: WebhookDeliveryListParams,
  ): Promise<{ items: WebhookDelivery[]; nextCursor: string | null }> {
    return this.http.request<{ items: WebhookDelivery[]; nextCursor: string | null }>({
      method: "GET",
      path: `/apps/${this.appId}/webhooks/${webhookId}/deliveries`,
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }
}
