import { NodeRailsError } from "./errors";
import { HttpClient } from "./http";
import {
  CheckoutSessions,
  Customers,
  Invoices,
  PaymentIntents,
  PaymentLinks,
  Prices,
  ProductPlans,
  Subscriptions,
  TaxRates,
  WebhookEndpoints,
} from "./resources";
import { Webhooks } from "./webhooks";

const DEFAULT_BASE_URL = "https://api.noderails.com";
const DEFAULT_TIMEOUT = 30_000;

export interface NodeRailsConfig {
  /** Your app ID (UUID). */
  appId: string;
  /** Your secret API key (e.g. `nr_live_sk_...`). */
  apiKey: string;
  /** Override the base URL (defaults to `https://api.noderails.com`). */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Pin requests to a specific API version (e.g. `"2026-03-07"`). */
  apiVersion?: string;
}

/**
 * NodeRails SDK client.
 *
 * @example
 * ```ts
 * import { NodeRails } from '@noderails/sdk';
 *
 * const noderails = new NodeRails({
 *   appId: 'your-app-id',
 *   apiKey: 'nr_live_sk_...',
 * });
 *
 * // Create a checkout session
 * const session = await noderails.checkoutSessions.create({
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 *   items: [{ name: 'Pro Plan', amount: '29.99', quantity: 1 }],
 * });
 *
 * // Verify a webhook
 * const event = NodeRails.webhooks.constructEvent(
 *   rawBody, signatureHeader, timestampHeader, secret,
 * );
 * ```
 */
export class NodeRails {
  /** The app ID this client targets. */
  readonly appId: string;

  // ── Resource namespaces ──
  readonly checkoutSessions: CheckoutSessions;
  readonly paymentIntents: PaymentIntents;
  readonly customers: Customers;
  readonly invoices: Invoices;
  readonly paymentLinks: PaymentLinks;
  readonly subscriptions: Subscriptions;
  readonly productPlans: ProductPlans;
  readonly taxRates: TaxRates;
  readonly webhookEndpoints: WebhookEndpoints;
  readonly prices: Prices;

  /** Static webhook verification utilities. */
  static readonly webhooks = new Webhooks();

  constructor(config: NodeRailsConfig) {
    this.validateConfig(config);

    this.appId = config.appId;

    const http = new HttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config.apiKey,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      apiVersion: config.apiVersion,
    });

    this.checkoutSessions = new CheckoutSessions(http, config.appId);
    this.paymentIntents = new PaymentIntents(http, config.appId);
    this.customers = new Customers(http, config.appId);
    this.invoices = new Invoices(http, config.appId);
    this.paymentLinks = new PaymentLinks(http, config.appId);
    this.subscriptions = new Subscriptions(http, config.appId);
    this.productPlans = new ProductPlans(http, config.appId);
    this.taxRates = new TaxRates(http);
    this.webhookEndpoints = new WebhookEndpoints(http, config.appId);
    this.prices = new Prices(http);
  }

  private validateConfig(config: NodeRailsConfig): void {
    if (!config.appId || typeof config.appId !== "string") {
      throw new NodeRailsError("appId is required and must be a non-empty string.");
    }

    if (!config.apiKey || typeof config.apiKey !== "string") {
      throw new NodeRailsError("apiKey is required and must be a non-empty string.");
    }

    // Validate key format: nr_<env>_<type>_<random>
    const keyParts = config.apiKey.split("_");
    if (keyParts.length < 4 || keyParts[0] !== "nr") {
      throw new NodeRailsError(
        `Invalid API key format. Expected format: nr_<env>_<type>_<random> ` +
          `(e.g. nr_live_sk_abc123...)`,
      );
    }

    const env = keyParts[1];
    const type = keyParts[2];

    if (env !== "test" && env !== "live") {
      throw new NodeRailsError(
        `Invalid API key environment "${env}". Expected "test" or "live".`,
      );
    }

    if (type !== "sk" && type !== "pk") {
      throw new NodeRailsError(
        `Invalid API key type "${type}". Expected "sk" (secret) or "pk" (public).`,
      );
    }

    if (type === "pk") {
      throw new NodeRailsError(
        "Public keys (pk) cannot be used with the SDK. Use a secret key (sk) instead.",
      );
    }

    if (config.timeout !== undefined && (typeof config.timeout !== "number" || config.timeout <= 0)) {
      throw new NodeRailsError("timeout must be a positive number.");
    }
  }
}
