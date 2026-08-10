import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isNativeToken,
  chainFamilyFromDb,
} from '@noderails/common';
import { computeTax } from '../tax-rates/tax-rate.service.js';
import { MERCHANT_BRANDING_SELECT, toPublicCheckoutApp } from '../../lib/checkout-app-branding.js';

// ── Types ──

interface ChainInfo {
  chainId: number;
  chainType: 'EVM' | 'SOLANA' | 'SUI';
  name: string;
  displayName: string;
  nativeCurrencySymbol: string;
  iconUrl: string | null;
  isTestnet: boolean;
  escrowAddress: string | null;
  rpcUrl?: string | null;
  settlementAddress?: string | null;
  escrowConfigObjectId?: string | null;
  paymentRegistryObjectId?: string | null;
  walletRegistryObjectId?: string | null;
}

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  tokenKey: string;
  contractAddress: string;
  chainId: number;
  iconUrl: string | null;
  isStablecoin: boolean;
  supportsPermit: boolean;
  permitVersion: string | null;
}

interface CheckoutLineItem {
  productPlanId?: string;
  productPlanPriceId?: string;
  name: string;
  description?: string;
  amount?: string;
  currency?: string;
  quantity?: number;
  isPriceOption?: boolean;
}

interface CreateCheckoutInput {
  appId: string;
  merchantId: string;
  customerAccountId?: string;
  mode?: string;
  successUrl: string;
  cancelUrl: string;
  expiresInMinutes?: number;
  items: CheckoutLineItem[];
  metadata?: Record<string, unknown>;
}

type CheckoutAmountItem = {
  amount?: unknown;
  quantity?: number | null;
  isPriceOption?: boolean | null;
  productPlanPrice?: { amount?: unknown } | null;
};

/** Line total in fiat; price-option rows are excluded (open-amount checkout). */
function lineItemFiatSubtotal(item: CheckoutAmountItem): number {
  if (item.isPriceOption) return 0;

  const qty = item.quantity != null && item.quantity > 0 ? item.quantity : 1;

  if (item.amount != null && item.amount !== '') {
    const unit = Number(item.amount);
    if (!Number.isNaN(unit) && unit > 0) return unit * qty;
  }

  if (item.productPlanPrice?.amount != null) {
    const unit = Number(item.productPlanPrice.amount);
    if (!Number.isNaN(unit) && unit > 0) return unit * qty;
  }

  return 0;
}

function sumLineItemsSubtotal(items: CheckoutAmountItem[]): number {
  return items.reduce((sum, item) => sum + lineItemFiatSubtotal(item), 0);
}

function assertPositiveSessionAmount(session: { amount?: unknown }): number {
  if (session.amount == null || session.amount === '') {
    throw new ValidationError('Checkout session is missing a valid amount');
  }
  const total = Number(session.amount);
  if (Number.isNaN(total) || total <= 0) {
    throw new ValidationError('Checkout session must have a positive amount');
  }
  return total;
}

// ── Create Checkout Session ──

export async function createCheckoutSession(input: CreateCheckoutInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  if (!input.items || input.items.length === 0) {
    throw new ValidationError('Checkout session must have at least one item');
  }

  // Validate customer if provided
  if (input.customerAccountId) {
    const customer = await db.customerAccount.findUnique({
      where: { id: input.customerAccountId },
    });
    if (!customer || customer.appId !== input.appId) {
      throw new NotFoundError('CustomerAccount', input.customerAccountId);
    }
  }

  // Validate product plan references
  for (const item of input.items) {
    if (item.productPlanId) {
      const plan = await db.productPlan.findUnique({ where: { id: item.productPlanId } });
      if (!plan || plan.appId !== input.appId) {
        throw new NotFoundError('ProductPlan', item.productPlanId);
      }
    }
    if (item.productPlanPriceId) {
      const price = await db.productPlanPrice.findUnique({ where: { id: item.productPlanPriceId } });
      if (!price || price.appId !== input.appId) {
        throw new NotFoundError('ProductPlanPrice', item.productPlanPriceId);
      }
    }
  }

  const expiresInMs = (input.expiresInMinutes ?? 30) * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiresInMs);

  const subtotal = sumLineItemsSubtotal(input.items);
  if (subtotal <= 0) {
    throw new ValidationError(
      'Checkout session must include at least one line item with a positive amount',
    );
  }
  const currency = input.items.find((item) => item.currency)?.currency ?? 'USD';

  return db.checkoutSession.create({
    data: {
      appId: input.appId,
      customerAccountId: input.customerAccountId,
      mode: (input.mode as any) ?? 'PAYMENT',
      sourceType: 'API',
      amount: subtotal,
      subtotal,
      currency,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt,
      metadata: (input.metadata ?? undefined) as any,
      items: {
        create: input.items.map((item) => ({
          productPlanId: item.productPlanId,
          productPlanPriceId: item.productPlanPriceId,
          name: item.name,
          description: item.description,
          amount: item.amount ? item.amount : null,
          currency: item.currency ?? 'USD',
          quantity: item.quantity ?? 1,
          isPriceOption: item.isPriceOption ?? false,
        })),
      },
    },
    include: { items: true },
  });
}

// ── Get Checkout Session ──

export async function getCheckoutSession(merchantId: string, sessionId: string) {
  const db = getDatabaseClient();

  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: {
      app: true,
      items: {
        include: {
          productPlan: true,
          productPlanPrice: true,
        },
      },
      paymentIntent: true,
    },
  });

  if (!session) throw new NotFoundError('CheckoutSession', sessionId);
  if (session.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return session;
}

// ── Get Checkout Session (public — for checkout UI) ──

export async function getCheckoutSessionPublic(sessionId: string) {
  const db = getDatabaseClient();

  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      mode: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      selectedPriceId: true,
      subtotal: true,
      taxAmount: true,
      taxDescription: true,
      items: {
        select: {
          id: true,
          name: true,
          description: true,
          amount: true,
          currency: true,
          quantity: true,
          isPriceOption: true,
          productPlan: { select: { id: true, name: true, description: true, imageUrl: true } },
          productPlanPrice: {
            select: {
              id: true,
              amount: true,
              currency: true,
              billingInterval: true,
              billingIntervalCount: true,
              nickname: true,
              sortOrder: true,
              isDefault: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      app: { select: { name: true, environment: true } },
    },
  });

  if (!session) throw new NotFoundError('CheckoutSession', sessionId);

  // Check expiry
  if (session.status === 'OPEN' && session.expiresAt < new Date()) {
    const db2 = getDatabaseClient();
    await db2.checkoutSession.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });
    return { ...session, status: 'EXPIRED' as const };
  }

  return session;
}

// ── List Checkout Sessions ──

interface ListCheckoutSessionsInput {
  merchantId: string;
  appId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listCheckoutSessions(input: ListCheckoutSessionsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const apps = await db.app.findMany({
    where: { merchantId: input.merchantId },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  const where: Record<string, unknown> = { appId: { in: appIds } };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [sessions, total] = await Promise.all([
    db.checkoutSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { items: true },
    }),
    db.checkoutSession.count({ where }),
  ]);

  return { sessions, total, page, pageSize };
}

// ── Expire Session (manual) ──

export async function expireCheckoutSession(merchantId: string, sessionId: string) {
  const session = await getCheckoutSession(merchantId, sessionId);

  if (session.status !== 'OPEN') {
    throw new ValidationError(`Cannot expire session in ${session.status} status`);
  }

  const db = getDatabaseClient();
  return db.checkoutSession.update({
    where: { id: sessionId },
    data: { status: 'EXPIRED' },
    include: { items: true },
  });
}

// ── Create Checkout Session from Payment Link ──
// This is the main entry point for the payment-ui. When a customer visits a
// payment link URL, the frontend creates a checkout session from the link
// and uses the session for the entire checkout flow.

export async function createCheckoutSessionFromLink(slug: string) {
  const db = getDatabaseClient();

  // Load payment link with full app chain/token config + plan data + tax rate
  const link = await db.paymentLink.findUnique({
    where: { slug },
    include: {
      app: {
        include: {
          merchant: { select: MERCHANT_BRANDING_SELECT },
          appChains: {
            where: { isEnabled: true, chain: { isEnabled: true } },
            include: { chain: { include: { tokens: { where: { isEnabled: true } } } } },
          },
          appTokens: {
            where: { isEnabled: true, supportedToken: { isEnabled: true, chain: { isEnabled: true } } },
            include: { supportedToken: true },
          },
        },
      },
      productPlan: {
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          planType: true,
          taxRate: {
            select: { id: true, displayName: true, percentage: true, inclusive: true },
          },
        },
      },
      productPlanPrice: {
        select: {
          id: true,
          amount: true,
          currency: true,
          billingInterval: true,
          billingIntervalCount: true,
          nickname: true,
        },
      },
      taxRate: {
        select: { id: true, displayName: true, percentage: true, inclusive: true },
      },
    },
  });

  if (!link || !link.isActive) throw new NotFoundError('PaymentLink', slug);

  const fiatAmount = link.amount ? Number(link.amount) : null;
  if (!fiatAmount || fiatAmount <= 0) {
    throw new ValidationError('Payment link must have a fixed amount');
  }

  // Determine if this is a subscription payment link
  const isSubscriptionLink =
    link.productPlan?.planType === 'SUBSCRIPTION' &&
    !!link.productPlanPrice?.billingInterval;

  // Resolve accepted chains and tokens (intersects App ∩ Link ∩ Plan)
  const acceptedChains = resolveAcceptedChains(link);
  let acceptedTokens = resolveAcceptedTokens(link);

  // Subscriptions use ERC20 transferFrom for recurring charges — native tokens cannot be auto-pulled
  if (isSubscriptionLink) {
    acceptedTokens = acceptedTokens.filter((t) => !isNativeToken(t.contractAddress));
  }

  if (acceptedChains.length === 0) {
    throw new ValidationError('No chains are available for this payment link');
  }
  if (acceptedTokens.length === 0) {
    throw new ValidationError(
      isSubscriptionLink
        ? 'No ERC20 tokens are available for this subscription payment link (native tokens are not supported for subscriptions)'
        : 'No tokens are available for this payment link',
    );
  }

  // Increment usage count on the link
  await db.paymentLink.update({
    where: { id: link.id },
    data: { usageCount: { increment: 1 } },
  });

  // Compute tax — prefer the payment link's own tax rate, fall back to the product plan's tax rate
  let taxResult = { subtotal: fiatAmount, taxAmount: 0, total: fiatAmount };
  let taxDescription: string | null = null;

  const effectiveTaxRate = link.taxRate ?? link.productPlan?.taxRate ?? null;
  if (effectiveTaxRate) {
    taxResult = computeTax(fiatAmount, Number(effectiveTaxRate.percentage), effectiveTaxRate.inclusive);
    taxDescription = `${effectiveTaxRate.displayName} ${Number(effectiveTaxRate.percentage)}%`;
  }

  // Create the checkout session
  // Store the effective (intersected) chain/token config so reloads show the same options
  const effectiveChainIds = acceptedChains.map((c) => c.chainId);
  const effectiveTokenKeys = acceptedTokens.map((t) => t.tokenKey);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const session = await db.checkoutSession.create({
    data: {
      appId: link.appId,
      mode: isSubscriptionLink ? 'SUBSCRIPTION' : 'PAYMENT',
      sourceType: 'PAYMENT_LINK',
      sourceId: link.id,
      amount: taxResult.total,
      currency: link.currency,
      subtotal: taxResult.subtotal,
      taxAmount: taxResult.taxAmount,
      taxDescription,
      allowedChains: effectiveChainIds as any,
      allowedTokens: effectiveTokenKeys as any,
      successUrl: link.successUrl ?? '',
      cancelUrl: link.cancelUrl ?? '',
      requireBillingDetails: link.requireBillingDetails,
      expiresAt,
      items: {
        create: [
          {
            productPlanId: link.productPlanId ?? undefined,
            productPlanPriceId: link.productPlanPriceId ?? undefined,
            name: link.productPlan?.name ?? link.name,
            description: link.productPlan?.description ?? link.description ?? undefined,
            amount: fiatAmount,
            currency: link.currency,
            quantity: 1,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Return the session + display data for the payment-ui
  return {
    checkoutSessionId: session.id,
    status: session.status,
    expiresAt: session.expiresAt,
    // Payment link display data
    id: link.id,
    name: link.name,
    description: link.description,
    slug: link.slug,
    amount: taxResult.total,
    subtotal: taxResult.subtotal,
    taxAmount: taxResult.taxAmount,
    taxDescription,
    currency: link.currency,
    isActive: link.isActive,
    successUrl: link.successUrl,
    cancelUrl: link.cancelUrl,
    app: toPublicCheckoutApp(link.app),
    productPlan: link.productPlan,
    productPlanPrice: link.productPlanPrice,
    requireBillingDetails: link.requireBillingDetails,
    // Resolved chain/token config
    acceptedChains,
    acceptedTokens,
  };
}

// ── Create Checkout Session from Invoice ──
// Called by payment-ui when a customer visits an invoice payment URL.
// Mirrors createCheckoutSessionFromLink — resolves accepted chains/tokens
// from the App ∩ Invoice intersection, creates a session, and returns
// display data for the checkout UI.

export async function createCheckoutSessionFromInvoice(invoiceId: string) {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      app: {
        include: {
          merchant: { select: MERCHANT_BRANDING_SELECT },
          appChains: {
            where: { isEnabled: true, chain: { isEnabled: true } },
            include: { chain: { include: { tokens: { where: { isEnabled: true } } } } },
          },
          appTokens: {
            where: { isEnabled: true, supportedToken: { isEnabled: true, chain: { isEnabled: true } } },
            include: { supportedToken: true },
          },
        },
      },
      items: true,
      taxRate: { select: { id: true, displayName: true, percentage: true, inclusive: true } },
      customerAccount: { select: { id: true, email: true, name: true, externalId: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);

  // Only OPEN invoices can be paid
  if (invoice.status !== 'OPEN') {
    throw new ValidationError(`Invoice is ${invoice.status} and cannot be paid`);
  }

  const fiatAmount = invoice.total ? Number(invoice.total) : 0;
  if (fiatAmount <= 0) {
    throw new ValidationError('Invoice must have a positive total');
  }

  // Resolve accepted chains and tokens (App ∩ Invoice)
  const acceptedChains = resolveAcceptedChains(invoice);
  const acceptedTokens = resolveAcceptedTokens(invoice);

  if (acceptedChains.length === 0) {
    throw new ValidationError('No chains are available for this invoice');
  }
  if (acceptedTokens.length === 0) {
    throw new ValidationError('No tokens are available for this invoice');
  }

  const effectiveChainIds = acceptedChains.map((c) => c.chainId);
  const effectiveTokenKeys = acceptedTokens.map((t) => t.tokenKey);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour for invoices

  // Build tax description from invoice tax rate
  const invoiceTaxAmount = invoice.taxAmount ? Number(invoice.taxAmount) : 0;
  const invoiceSubtotal = invoice.subtotal ? Number(invoice.subtotal) : fiatAmount;
  let taxDescription: string | null = null;
  if (invoice.taxRate && invoiceTaxAmount > 0) {
    taxDescription = `${invoice.taxRate.displayName} ${Number(invoice.taxRate.percentage)}%`;
  }

  const session = await db.checkoutSession.create({
    data: {
      appId: invoice.appId,
      customerAccountId: invoice.customerAccountId,
      mode: 'PAYMENT',
      sourceType: 'INVOICE',
      sourceId: invoice.id,
      amount: fiatAmount,
      currency: invoice.currency,
      subtotal: invoiceSubtotal,
      taxAmount: invoiceTaxAmount,
      taxDescription,
      allowedChains: effectiveChainIds as any,
      allowedTokens: effectiveTokenKeys as any,
      requireBillingDetails: true,
      successUrl: '',
      cancelUrl: '',
      expiresAt,
      items: {
        create: invoice.items.map((item) => ({
          productPlanId: item.productPlanId ?? undefined,
          productPlanPriceId: item.productPlanPriceId ?? undefined,
          name: item.description,
          description: undefined,
          amount: Number(item.amount),
          currency: item.currency,
          quantity: item.quantity,
        })),
      },
    },
    include: { items: true },
  });

  return {
    checkoutSessionId: session.id,
    status: session.status,
    expiresAt: session.expiresAt,
    requireBillingDetails: true,
    // Invoice display data
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: fiatAmount,
    subtotal: invoiceSubtotal,
    taxAmount: invoiceTaxAmount,
    taxDescription,
    currency: invoice.currency,
    memo: invoice.memo,
    dueDate: invoice.dueDate,
    customer: invoice.customerAccount,
    app: toPublicCheckoutApp(invoice.app),
    items: invoice.items.map((item) => ({
      description: item.description,
      amount: Number(item.amount),
      currency: item.currency,
      quantity: item.quantity,
    })),
    // Resolved chain/token config
    acceptedChains,
    acceptedTokens,
  };
}

// ── Create Checkout Session from Subscription ──
// Creates a checkout session for the initial subscription payment.
// Filters out native tokens since subscriptions require ERC20 transferFrom.

export async function createCheckoutSessionFromSubscription(subscriptionId: string) {
  const db = getDatabaseClient();

  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      app: {
        include: {
          merchant: { select: MERCHANT_BRANDING_SELECT },
          appChains: {
            where: { isEnabled: true, chain: { isEnabled: true } },
            include: { chain: { include: { tokens: { where: { isEnabled: true } } } } },
          },
          appTokens: {
            where: { isEnabled: true, supportedToken: { isEnabled: true, chain: { isEnabled: true } } },
            include: { supportedToken: true },
          },
        },
      },
      productPlan: {
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          taxRate: {
            select: { id: true, displayName: true, percentage: true, inclusive: true },
          },
        },
      },
      productPlanPrice: {
        select: {
          id: true,
          amount: true,
          currency: true,
          billingInterval: true,
          billingIntervalCount: true,
          nickname: true,
        },
      },
      customerAccount: { select: { id: true, email: true, name: true, externalId: true } },
    },
  });

  if (!subscription) throw new NotFoundError('Subscription', subscriptionId);

  // Only CREATED subscriptions can start checkout
  if (subscription.status !== 'CREATED') {
    throw new ValidationError(
      `Subscription is in ${subscription.status} status, cannot create checkout session`,
    );
  }

  const fiatAmount = subscription.productPlanPrice.amount
    ? Number(subscription.productPlanPrice.amount)
    : 0;
  if (fiatAmount <= 0) {
    throw new ValidationError('Subscription price must be a positive amount');
  }

  // Compute tax from product plan's tax rate
  let taxResult = { subtotal: fiatAmount, taxAmount: 0, total: fiatAmount };
  let taxDescription: string | null = null;

  const planTaxRate = subscription.productPlan.taxRate ?? null;
  if (planTaxRate) {
    taxResult = computeTax(fiatAmount, Number(planTaxRate.percentage), planTaxRate.inclusive);
    taxDescription = `${planTaxRate.displayName} ${Number(planTaxRate.percentage)}%`;
  }

  // Resolve chains and tokens — filter out native tokens for subscriptions
  const acceptedChains = resolveAcceptedChains(subscription);
  let acceptedTokens = resolveAcceptedTokens(subscription);

  // Subscriptions use ERC20 transferFrom — native tokens (ETH, MATIC) cannot be auto-pulled
  acceptedTokens = acceptedTokens.filter((t) => !isNativeToken(t.contractAddress));

  if (acceptedChains.length === 0) {
    throw new ValidationError('No chains are available for this subscription');
  }
  if (acceptedTokens.length === 0) {
    throw new ValidationError(
      'No ERC20 tokens are available for this subscription (native tokens are not supported)',
    );
  }

  const effectiveChainIds = acceptedChains.map((c) => c.chainId);
  const effectiveTokenKeys = acceptedTokens.map((t) => t.tokenKey);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const session = await db.checkoutSession.create({
    data: {
      appId: subscription.appId,
      customerAccountId: subscription.customerAccountId,
      mode: 'SUBSCRIPTION',
      sourceType: 'SUBSCRIPTION',
      sourceId: subscription.id,
      amount: taxResult.total,
      currency: subscription.productPlanPrice.currency,
      subtotal: taxResult.subtotal,
      taxAmount: taxResult.taxAmount,
      taxDescription,
      allowedChains: effectiveChainIds as any,
      allowedTokens: effectiveTokenKeys as any,
      requireBillingDetails: true,
      successUrl: '',
      cancelUrl: '',
      expiresAt,
      items: {
        create: [
          {
            productPlanId: subscription.productPlanId,
            productPlanPriceId: subscription.productPlanPriceId,
            name: subscription.productPlan.name,
            description: subscription.productPlan.description ?? undefined,
            amount: fiatAmount,
            currency: subscription.productPlanPrice.currency,
            quantity: 1,
          },
        ],
      },
    },
    include: { items: true },
  });

  return {
    id: session.id,
    checkoutSessionId: session.id,
    status: session.status,
    expiresAt: session.expiresAt,
    requireBillingDetails: true,
    // Subscription display data
    subscriptionId: subscription.id,
    amount: taxResult.total,
    subtotal: taxResult.subtotal,
    taxAmount: taxResult.taxAmount,
    taxDescription,
    currency: subscription.productPlanPrice.currency,
    customer: subscription.customerAccount,
    app: toPublicCheckoutApp(subscription.app),
    productPlan: subscription.productPlan,
    productPlanPrice: subscription.productPlanPrice,
    // Resolved chain/token config (native tokens excluded)
    acceptedChains,
    acceptedTokens,
  };
}

// ── Get Checkout Session for Payment (public — enhanced with chain/token data) ──
// Used by the payment-ui when loading a checkout session directly (e.g. /checkout/[sessionId])

export async function getCheckoutSessionForPayment(sessionId: string) {
  const db = getDatabaseClient();

  const session = await db.checkoutSession.findUnique({
    where: { id: sessionId },
    include: {
      app: {
        include: {
          merchant: { select: MERCHANT_BRANDING_SELECT },
          appChains: {
            where: { isEnabled: true, chain: { isEnabled: true } },
            include: { chain: { include: { tokens: { where: { isEnabled: true } } } } },
          },
          appTokens: {
            where: { isEnabled: true, supportedToken: { isEnabled: true, chain: { isEnabled: true } } },
            include: { supportedToken: true },
          },
        },
      },
      items: {
        include: {
          productPlan: true,
          productPlanPrice: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      paymentIntent: { select: { id: true, status: true } },
    },
  });

  if (!session) throw new NotFoundError('CheckoutSession', sessionId);

  // Auto-expire if past expiresAt
  if (session.status === 'OPEN' && session.expiresAt < new Date()) {
    await db.checkoutSession.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });

    return {
      id: session.id,
      status: 'EXPIRED' as const,
      amount: session.amount ? Number(session.amount) : null,
      currency: session.currency,
      subtotal: session.subtotal ? Number(session.subtotal) : null,
      taxAmount: session.taxAmount ? Number(session.taxAmount) : null,
      taxDescription: session.taxDescription,
      mode: session.mode,
      sourceType: session.sourceType,
      requireBillingDetails: session.requireBillingDetails,
      expiresAt: session.expiresAt,
      successUrl: session.successUrl,
      cancelUrl: session.cancelUrl,
      app: toPublicCheckoutApp(session.app),
      items: session.items,
      paymentIntent: session.paymentIntent,
      acceptedChains: [] as ChainInfo[],
      acceptedTokens: [] as TokenInfo[],
    };
  }

  // Resolve chains/tokens from session config
  const sessionForResolve = {
    allowedChains: session.allowedChains,
    allowedTokens: session.allowedTokens,
    app: session.app,
  };
  const acceptedChains = resolveAcceptedChains(sessionForResolve);
  let acceptedTokens = resolveAcceptedTokens(sessionForResolve);

  // Subscriptions use ERC20 transferFrom — native tokens cannot be auto-pulled
  if (session.mode === 'SUBSCRIPTION') {
    acceptedTokens = acceptedTokens.filter((t) => !isNativeToken(t.contractAddress));
  }

  const amount = assertPositiveSessionAmount(session);

  return {
    id: session.id,
    status: session.status,
    amount,
    currency: session.currency,
    subtotal: session.subtotal ? Number(session.subtotal) : null,
    taxAmount: session.taxAmount ? Number(session.taxAmount) : null,
    taxDescription: session.taxDescription,
    mode: session.mode,
    sourceType: session.sourceType,
    requireBillingDetails: session.requireBillingDetails,
    expiresAt: session.expiresAt,
    successUrl: session.successUrl,
    cancelUrl: session.cancelUrl,
    app: toPublicCheckoutApp(session.app),
    items: session.items,
    paymentIntent: session.paymentIntent,
    acceptedChains,
    acceptedTokens,
  };
}

// ── Complete Checkout Session ──
// Called by authorize service when payment is successfully authorized

export async function completeCheckoutSession(sessionId: string, paymentIntentId: string) {
  const db = getDatabaseClient();

  return db.checkoutSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETE',
      paymentIntentId,
      completedAt: new Date(),
    },
  });
}

// ── Chain/Token Resolution Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAcceptedChains(source: any): ChainInfo[] {
  const appChains = source.app.appChains ?? [];
  const receivingWallet = source.app.receivingWallet ?? null;

  if (source.allowedChains === 'ALL') {
    return appChains.map((ac: any) => formatAppChain(ac, receivingWallet));
  }

  const allowedIds = source.allowedChains as number[];
  return appChains
    .filter((ac: any) => allowedIds.includes(ac.chain.chainId))
    .map((ac: any) => formatAppChain(ac, receivingWallet));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAcceptedTokens(source: any): TokenInfo[] {
  const appChainIds = (source.app.appChains ?? []).map((ac: any) => ac.chain.chainId);
  const acceptedChainIds =
    source.allowedChains === 'ALL'
      ? appChainIds
      : (source.allowedChains as number[]).filter((id: number) => appChainIds.includes(id));

  const appTokens = (source.app.appTokens ?? [])
    .map((at: any) => at.supportedToken)
    .filter((t: any) => acceptedChainIds.includes(t.chainId));

  if (source.allowedTokens === 'ALL') {
    return appTokens.map(formatToken);
  }

  const allowedKeys = source.allowedTokens as string[];
  return appTokens.filter((t: any) => allowedKeys.includes(t.tokenKey)).map(formatToken);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAppChain(ac: any, receivingWallet: string | null): ChainInfo {
  const c = ac.chain;
  return {
    chainId: c.chainId,
    chainType: chainFamilyFromDb(c.chainType),
    name: c.name,
    displayName: c.displayName,
    nativeCurrencySymbol: c.nativeCurrencySymbol,
    iconUrl: c.iconUrl,
    isTestnet: c.isTestnet,
    escrowAddress: c.escrowAddress,
    rpcUrl: c.rpcUrl ?? null,
    settlementAddress: ac.settlementAddress?.trim() || receivingWallet?.trim() || null,
    escrowConfigObjectId: c.escrowConfigObjectId ?? null,
    paymentRegistryObjectId: c.paymentRegistryObjectId ?? null,
    walletRegistryObjectId: c.walletRegistryObjectId ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatChain(c: any): ChainInfo {
  return {
    chainId: c.chainId,
    chainType: chainFamilyFromDb(c.chainType),
    name: c.name,
    displayName: c.displayName,
    nativeCurrencySymbol: c.nativeCurrencySymbol,
    iconUrl: c.iconUrl,
    isTestnet: c.isTestnet,
    escrowAddress: c.escrowAddress,
    rpcUrl: c.rpcUrl ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatToken(t: any): TokenInfo {
  return {
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    tokenKey: t.tokenKey,
    contractAddress: t.contractAddress,
    chainId: t.chainId,
    iconUrl: t.iconUrl,
    isStablecoin: t.isStablecoin,
    supportsPermit: t.supportsPermit ?? false,
    permitVersion: t.permitVersion ?? null,
  };
}
