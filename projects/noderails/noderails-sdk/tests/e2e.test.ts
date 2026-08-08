/**
 * NodeRails SDK — End-to-End Tests
 *
 * These tests run against a REAL server using real API keys.
 *
 * Required environment variables:
 *   NODERAILS_API_KEY  - A secret key (nr_test_sk_...)
 *   NODERAILS_APP_ID   - Your test app UUID
 *   NODERAILS_BASE_URL - Server URL (default: http://localhost:3000)
 *
 * Run:
 *   NODERAILS_API_KEY=nr_test_sk_... NODERAILS_APP_ID=... npm run test:e2e
 */

import { describe, it, expect, beforeAll } from "vitest";
import { NodeRails } from "../src/index";
import type {
  PaymentLink,
  CheckoutSession,
  PaymentIntent,
  Customer,
  ProductPlan,
  Invoice,
  TaxRate,
  Subscription,
  WebhookEndpoint,
} from "../src/index";

// ── Config ───────────────────────────────────────────────────────────

const API_KEY = process.env.NODERAILS_API_KEY!;
const APP_ID = process.env.NODERAILS_APP_ID!;
const BASE_URL = process.env.NODERAILS_BASE_URL ?? "http://localhost:3000";

let sdk: NodeRails;

beforeAll(() => {
  if (!API_KEY || !APP_ID) {
    throw new Error(
      "Missing env vars. Set NODERAILS_API_KEY and NODERAILS_APP_ID before running e2e tests.",
    );
  }

  sdk = new NodeRails({
    appId: APP_ID,
    apiKey: API_KEY,
    baseUrl: BASE_URL,
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

const slug = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─────────────────────────────────────────────────────────────────────
// 1. PRICES (no auth needed on server, good smoke test)
// ─────────────────────────────────────────────────────────────────────

describe("Prices", () => {
  it("getPrice — fetches current ETH price", async () => {
    const result = await sdk.prices.getPrice("ETH");
    expect(result).toBeDefined();
    expect(result.symbol).toBe("ETH");
    expect(result.priceFiat).toBeGreaterThan(0);
    expect(result.priceUsd).toBeGreaterThan(0);
    expect(result.cachedAt).toBeDefined();
  });

  it("getPrice — with currency override", async () => {
    const result = await sdk.prices.getPrice("ETH", "EUR");
    expect(result.symbol).toBe("ETH");
    expect(result.currency).toBe("EUR");
    expect(result.priceFiat).toBeGreaterThan(0);
  });

  it("convert — fiat to token", async () => {
    const result = await sdk.prices.convert({ symbol: "ETH", amountFiat: 100 });
    expect(result.symbol).toBe("ETH");
    expect(result.amountFiat).toBeDefined();
    expect(result.tokenAmount).toBeDefined();
    expect(Number(result.tokenAmount)).toBeGreaterThan(0);
  });

  it("convert — token to fiat", async () => {
    const result = await sdk.prices.convert({ symbol: "ETH", tokenAmount: 1 });
    expect(result.symbol).toBe("ETH");
    expect(result.tokenAmount).toBeDefined();
    expect(result.amountFiat).toBeDefined();
    expect(Number(result.amountFiat)).toBeGreaterThan(0);
  });

  it("convert — with currency param", async () => {
    const result = await sdk.prices.convert({
      symbol: "ETH",
      amountFiat: 100,
      currency: "EUR",
    });
    expect(result.currency).toBe("EUR");
    expect(result.priceFiat).toBeGreaterThan(0);
  });

  it("convert — backward compat amountUsd param", async () => {
    const result = await sdk.prices.convert({ symbol: "ETH", amountUsd: 50 });
    expect(result.symbol).toBe("ETH");
    expect(result.tokenAmount).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. CUSTOMERS
// ─────────────────────────────────────────────────────────────────────

describe("Customers", () => {
  let customerId: string;

  it("create — new customer", async () => {
    const customer = await sdk.customers.create({
      email: `e2e-${Date.now()}@test.noderails.com`,
      name: "E2E Test Customer",
      metadata: { source: "sdk-e2e" },
    });
    expect(customer).toBeDefined();
    expect(customer.id).toBeDefined();
    expect(customer.name).toBe("E2E Test Customer");
    customerId = customer.id;
  });

  it("retrieve — get customer by id", async () => {
    const customer = await sdk.customers.retrieve(customerId);
    expect(customer.id).toBe(customerId);
    expect(customer.name).toBe("E2E Test Customer");
  });

  it("update — change name", async () => {
    const updated = await sdk.customers.update(customerId, {
      name: "E2E Updated Customer",
    });
    expect(updated.name).toBe("E2E Updated Customer");
  });

  it("list — paginated", async () => {
    const result = await sdk.customers.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.total).toBeGreaterThanOrEqual(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("addWallet + removeWallet", async () => {
    const wallet = await sdk.customers.addWallet(customerId, {
      chainId: 11155111,
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect(wallet).toBeDefined();
    expect(wallet.walletAddress).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );

    // Remove wallet
    await sdk.customers.removeWallet(customerId, wallet.id);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. TAX RATES
// ─────────────────────────────────────────────────────────────────────

describe("Tax Rates", () => {
  let taxRateId: string;

  it("create — new tax rate", async () => {
    const taxRate = await sdk.taxRates.create({
      displayName: `E2E Tax ${Date.now()}`,
      percentage: 8.5,
      jurisdiction: "US-CA",
      description: "California state tax (e2e)",
    });
    expect(taxRate).toBeDefined();
    expect(taxRate.id).toBeDefined();
    expect(taxRate.percentage).toBe("8.5");
    taxRateId = taxRate.id;
  });

  it("retrieve", async () => {
    const taxRate = await sdk.taxRates.retrieve(taxRateId);
    expect(taxRate.id).toBe(taxRateId);
  });

  it("update", async () => {
    const updated = await sdk.taxRates.update(taxRateId, {
      description: "Updated description",
    });
    expect(updated.description).toBe("Updated description");
  });

  it("list", async () => {
    const rates = await sdk.taxRates.list();
    expect(Array.isArray(rates)).toBe(true);
    expect(rates.length).toBeGreaterThanOrEqual(1);
  });

  it("delete", async () => {
    await sdk.taxRates.delete(taxRateId);
    // After deleting, listing with includeInactive should still find it
    const rates = await sdk.taxRates.list({ includeInactive: true });
    const found = rates.find((r) => r.id === taxRateId);
    expect(found).toBeDefined();
    expect(found!.isActive).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. PRODUCT PLANS
// ─────────────────────────────────────────────────────────────────────

describe("Product Plans", () => {
  let planId: string;
  let priceId: string;

  it("create — one-time plan with price", async () => {
    const plan = await sdk.productPlans.create({
      name: `E2E Plan ${Date.now()}`,
      description: "Test plan from SDK E2E",
      planType: "ONE_TIME",
      prices: [{ amount: "9.99", currency: "USD" }],
    });
    expect(plan).toBeDefined();
    expect(plan.id).toBeDefined();
    expect(plan.name).toContain("E2E Plan");
    expect(plan.prices).toBeDefined();
    expect(plan.prices!.length).toBe(1);
    planId = plan.id;
    priceId = plan.prices![0].id;
  });

  it("retrieve", async () => {
    const plan = await sdk.productPlans.retrieve(planId);
    expect(plan.id).toBe(planId);
  });

  it("update", async () => {
    const updated = await sdk.productPlans.update(planId, {
      description: "Updated from E2E",
    });
    expect(updated.description).toBe("Updated from E2E");
  });

  it("list — paginated", async () => {
    const result = await sdk.productPlans.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(result.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("createPrice — add second price", async () => {
    const price = await sdk.productPlans.createPrice(planId, {
      amount: "19.99",
      currency: "USD",
      nickname: "Annual",
    });
    expect(price).toBeDefined();
    expect(price.amount).toBe("19.99");
  });

  it("updatePrice", async () => {
    const updated = await sdk.productPlans.updatePrice(planId, priceId, {
      nickname: "Monthly Updated",
    });
    expect(updated.nickname).toBe("Monthly Updated");
  });

  it("deletePrice", async () => {
    await sdk.productPlans.deletePrice(planId, priceId);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. PAYMENT LINKS — Full CRUD
// ─────────────────────────────────────────────────────────────────────

describe("Payment Links", () => {
  let linkId: string;
  const testSlug = slug();

  it("create — payment link", async () => {
    const link = await sdk.paymentLinks.create({
      name: "E2E Test Link",
      slug: testSlug,
      amount: "25.00",
      currency: "USD",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      metadata: { e2e: true },
    });
    expect(link).toBeDefined();
    expect(link.id).toBeDefined();
    expect(link.slug).toBe(testSlug);
    expect(Number(link.amount)).toBe(25);
    expect(link.paymentUrl).toBeDefined();
    expect(link.paymentUrl).toContain(testSlug);
    linkId = link.id;
  });

  it("retrieve — get link by id", async () => {
    const link = await sdk.paymentLinks.retrieve(linkId);
    expect(link.id).toBe(linkId);
    expect(link.slug).toBe(testSlug);
  });

  it("update — change amount", async () => {
    const updated = await sdk.paymentLinks.update(linkId, {
      amount: "35.00",
      description: "Updated from E2E",
    });
    expect(Number(updated.amount)).toBe(35);
    expect(updated.description).toBe("Updated from E2E");
  });

  it("list — paginated", async () => {
    const result = await sdk.paymentLinks.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  it("delete — remove link", async () => {
    await sdk.paymentLinks.delete(linkId);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. CHECKOUT SESSIONS
// ─────────────────────────────────────────────────────────────────────

describe("Checkout Sessions", () => {
  let sessionId: string;

  it("create — one-time checkout session", async () => {
    const session = await sdk.checkoutSessions.create({
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      items: [
        {
          name: "E2E Test Item",
          amount: "15.00",
          currency: "USD",
          quantity: 1,
        },
      ],
      metadata: { e2e: true },
    });
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.status).toBe("OPEN");
    expect(session.items).toBeDefined();
    expect(session.items.length).toBe(1);
    sessionId = session.id;
  });

  it("retrieve — get session", async () => {
    const session = await sdk.checkoutSessions.retrieve(sessionId);
    expect(session.id).toBe(sessionId);
    expect(session.status).toBe("OPEN");
  });

  it("list — paginated", async () => {
    const result = await sdk.checkoutSessions.list({
      page: 1,
      pageSize: 5,
    });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  it("expire — expire session", async () => {
    const expired = await sdk.checkoutSessions.expire(sessionId);
    expect(expired.status).toBe("EXPIRED");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. PAYMENT INTENTS
// ─────────────────────────────────────────────────────────────────────

describe("Payment Intents", () => {
  let intentId: string;

  it("create — payment intent", async () => {
    const intent = await sdk.paymentIntents.create({
      amount: "10.00",
      currency: "USD",
      metadata: { e2e: true },
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });
    expect(intent).toBeDefined();
    expect(intent.id).toBeDefined();
    expect(Number(intent.amount)).toBe(10);
    expect(intent.status).toBe("CREATED");
    intentId = intent.id;
  });

  it("retrieve — get intent", async () => {
    const intent = await sdk.paymentIntents.retrieve(intentId);
    expect(intent.id).toBe(intentId);
    expect(Number(intent.amount)).toBe(10);
  });

  it("list — paginated", async () => {
    const result = await sdk.paymentIntents.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
    expect(result.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("cancel — cancel intent", async () => {
    const cancelled = await sdk.paymentIntents.cancel(intentId);
    expect(cancelled.status).toBe("CANCELLED");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. INVOICES
// ─────────────────────────────────────────────────────────────────────

describe("Invoices", () => {
  let invoiceId: string;
  let customerId: string;

  beforeAll(async () => {
    const customer = await sdk.customers.create({
      email: `invoice-e2e-${Date.now()}@test.noderails.com`,
      name: "Invoice E2E Customer",
    });
    customerId = customer.id;
  });

  it("create — new invoice", async () => {
    const invoice = await sdk.invoices.create({
      customerAccountId: customerId,
      currency: "USD",
      items: [
        {
          description: "E2E Service",
          amount: "50.00",
          quantity: 1,
        },
      ],
      metadata: { e2e: true },
    });
    expect(invoice).toBeDefined();
    expect(invoice.id).toBeDefined();
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.total).toBeDefined();
    invoiceId = invoice.id;
  });

  it("retrieve", async () => {
    const invoice = await sdk.invoices.retrieve(invoiceId);
    expect(invoice.id).toBe(invoiceId);
  });

  it("list — paginated", async () => {
    const result = await sdk.invoices.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  it("open — finalize invoice", async () => {
    const opened = await sdk.invoices.open(invoiceId);
    expect(opened.status).toBe("OPEN");
  });

  it("send — send invoice", async () => {
    const result = await sdk.invoices.send(invoiceId);
    expect(result).toBeDefined();
  });

  it("void — void invoice", async () => {
    const voided = await sdk.invoices.void(invoiceId);
    expect(voided.status).toBe("VOID");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────

describe("Subscriptions", () => {
  let subscriptionId: string;
  let customerId: string;
  let planId: string;
  let priceId: string;

  beforeAll(async () => {
    const customer = await sdk.customers.create({
      email: `sub-e2e-${Date.now()}@test.noderails.com`,
      name: "Sub E2E Customer",
    });
    customerId = customer.id;

    const plan = await sdk.productPlans.create({
      name: `Sub Plan ${Date.now()}`,
      planType: "SUBSCRIPTION",
      prices: [
        {
          amount: "9.99",
          billingInterval: "MONTH",
          billingIntervalCount: 1,
        },
      ],
    });
    planId = plan.id;
    priceId = plan.prices![0].id;
  });

  it("create — subscription", async () => {
    const sub = await sdk.subscriptions.create({
      customerAccountId: customerId,
      productPlanId: planId,
      productPlanPriceId: priceId,
    });
    expect(sub).toBeDefined();
    expect(sub.id).toBeDefined();
    expect(sub.status).toBe("CREATED");
    subscriptionId = sub.id;
  });

  it("retrieve", async () => {
    const sub = await sdk.subscriptions.retrieve(subscriptionId);
    expect(sub.id).toBe(subscriptionId);
  });

  it("list — paginated", async () => {
    const result = await sdk.subscriptions.list({ page: 1, pageSize: 5 });
    expect(result.data).toBeDefined();
    expect(result.pagination).toBeDefined();
  });

  it("cancel", async () => {
    const cancelled = await sdk.subscriptions.cancel(subscriptionId);
    expect(cancelled.status).toBe("CANCELLED");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. WEBHOOK ENDPOINTS
// ─────────────────────────────────────────────────────────────────────

describe("Webhook Endpoints", () => {
  let webhookId: string;

  it("create — webhook endpoint", async () => {
    const webhook = await sdk.webhookEndpoints.create({
      url: "https://example.com/webhook/e2e-test",
      events: ["payment.created", "payment.captured"],
    });
    expect(webhook).toBeDefined();
    expect(webhook.id).toBeDefined();
    expect(webhook.url).toBe("https://example.com/webhook/e2e-test");
    expect(webhook.events).toEqual(
      expect.arrayContaining(["payment.created", "payment.captured"]),
    );
    webhookId = webhook.id;
  });

  it("list", async () => {
    const webhooks = await sdk.webhookEndpoints.list();
    expect(Array.isArray(webhooks)).toBe(true);
    expect(webhooks.some((w) => w.id === webhookId)).toBe(true);
  });

  it("update", async () => {
    const updated = await sdk.webhookEndpoints.update(webhookId, {
      events: ["payment.created", "payment.captured", "payment.settled"],
    });
    expect(updated.events).toContain("payment.settled");
  });

  it("delete", async () => {
    await sdk.webhookEndpoints.delete(webhookId);
    // Verify it's gone
    const webhooks = await sdk.webhookEndpoints.list();
    expect(webhooks.some((w) => w.id === webhookId)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. E2E FLOW: Payment Link → Checkout Session
// ─────────────────────────────────────────────────────────────────────

describe("E2E Flow: Payment Link → Checkout", () => {
  let link: PaymentLink;
  let session: CheckoutSession;

  it("Step 1: Create a payment link", async () => {
    link = await sdk.paymentLinks.create({
      name: "E2E Flow Link",
      slug: slug(),
      amount: "49.99",
      currency: "USD",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });
    expect(link.id).toBeDefined();
    expect(link.paymentUrl).toBeDefined();
  });

  it("Step 2: Create checkout session for the link", async () => {
    session = await sdk.checkoutSessions.create({
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      items: [
        {
          name: link.name,
          amount: link.amount!,
          currency: link.currency,
          quantity: 1,
        },
      ],
    });
    expect(session.id).toBeDefined();
    expect(session.status).toBe("OPEN");
  });

  it("Step 3: Verify checkout session has correct data", async () => {
    const fetched = await sdk.checkoutSessions.retrieve(session.id);
    expect(fetched.items.length).toBe(1);
    expect(Number(fetched.items[0].amount)).toBeCloseTo(49.99);
  });

  it("Cleanup: expire session and delete link", async () => {
    await sdk.checkoutSessions.expire(session.id);
    await sdk.paymentLinks.delete(link.id);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 12. E2E FLOW: Customer → Invoice → Open
// ─────────────────────────────────────────────────────────────────────

describe("E2E Flow: Customer → Invoice", () => {
  let customer: Customer;
  let invoice: Invoice;

  it("Step 1: Create customer", async () => {
    customer = await sdk.customers.create({
      email: `flow-e2e-${Date.now()}@test.noderails.com`,
      name: "E2E Flow Customer",
    });
    expect(customer.id).toBeDefined();
  });

  it("Step 2: Create invoice for customer", async () => {
    invoice = await sdk.invoices.create({
      customerAccountId: customer.id,
      currency: "USD",
      items: [
        { description: "Consulting", amount: "200.00", quantity: 2 },
        { description: "Setup Fee", amount: "50.00", quantity: 1 },
      ],
    });
    expect(invoice.id).toBeDefined();
    expect(invoice.status).toBe("DRAFT");
  });

  it("Step 3: Open invoice", async () => {
    const opened = await sdk.invoices.open(invoice.id);
    expect(opened.status).toBe("OPEN");
  });

  it("Step 4: Void invoice", async () => {
    const voided = await sdk.invoices.void(invoice.id);
    expect(voided.status).toBe("VOID");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 13. ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────

describe("Error Handling", () => {
  it("NotFoundError — invalid resource id", async () => {
    await expect(
      sdk.paymentIntents.retrieve("00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();
  });

  it("ValidationError — missing required fields", async () => {
    await expect(
      // @ts-expect-error intentionally passing invalid params
      sdk.paymentIntents.create({}),
    ).rejects.toThrow();
  });

  it("AuthenticationError — bad API key", async () => {
    const badSdk = new NodeRails({
      appId: APP_ID,
      apiKey: "nr_test_sk_invalid_key_12345",
      baseUrl: BASE_URL,
    });
    await expect(
      badSdk.paymentIntents.create({ amount: "1.00" }),
    ).rejects.toThrow();
  });
});
