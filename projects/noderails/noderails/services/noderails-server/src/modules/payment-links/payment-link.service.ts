import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  chainFamilyFromDb,
} from '@noderails/common';
import { MERCHANT_BRANDING_SELECT, toPublicCheckoutApp } from '../../lib/checkout-app-branding.js';

// ── Types ──

interface CreatePaymentLinkInput {
  appId: string;
  merchantId: string;
  name: string;
  description?: string;
  slug: string;
  amount?: string;
  currency?: string;
  productPlanId?: string;
  productPlanPriceId?: string;
  allowedChains?: unknown;
  allowedTokens?: unknown;
  successUrl?: string;
  cancelUrl?: string;
  requireBillingDetails?: boolean;
  metadata?: Record<string, unknown>;
  taxRateId?: string;
}

interface UpdatePaymentLinkInput {
  name?: string;
  description?: string;
  amount?: string;
  currency?: string;
  productPlanId?: string | null;
  productPlanPriceId?: string | null;
  allowedChains?: unknown;
  allowedTokens?: unknown;
  successUrl?: string;
  cancelUrl?: string;
  isActive?: boolean;
  requireBillingDetails?: boolean;
  metadata?: Record<string, unknown>;
  taxRateId?: string | null;
}

interface ListPaymentLinksInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  isActive?: boolean;
}

// ── Create Payment Link ──

export async function createPaymentLink(input: CreatePaymentLinkInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  // Check slug uniqueness
  const existingSlug = await db.paymentLink.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    throw new ValidationError(`Payment link slug "${input.slug}" is already taken`);
  }

  // Validate product plan + price if provided
  let resolvedAmount = input.amount ? parseFloat(input.amount) : null;
  let resolvedCurrency = input.currency ?? 'USD';

  if (input.productPlanId) {
    const plan = await db.productPlan.findUnique({
      where: { id: input.productPlanId },
      include: { prices: { where: { isActive: true } } },
    });
    if (!plan || plan.appId !== input.appId) {
      throw new NotFoundError('ProductPlan', input.productPlanId);
    }
    if (!plan.isActive) {
      throw new ValidationError('Product plan is inactive');
    }

    // If a specific price is provided, validate it belongs to this plan
    if (input.productPlanPriceId) {
      const price = plan.prices.find((p) => p.id === input.productPlanPriceId);
      if (!price) {
        throw new NotFoundError('ProductPlanPrice', input.productPlanPriceId);
      }
      // Auto-fill amount/currency from the price unless explicitly overridden
      if (!input.amount) {
        resolvedAmount = Number(price.amount);
      }
      if (!input.currency) {
        resolvedCurrency = price.currency;
      }
    }
  } else if (input.productPlanPriceId) {
    throw new ValidationError('productPlanPriceId requires productPlanId');
  }

  // Validate allowedChains against app-enabled chains (which are already validated against admin-enabled chains)
  const resolvedChains = await validateAllowedChains(db, input.appId, input.allowedChains);

  // Validate allowedTokens against app-enabled tokens on accepted chains
  await validateAllowedTokens(db, input.appId, input.allowedTokens, resolvedChains);

  // Validate tax rate if provided
  if (input.taxRateId) {
    const taxRate = await db.taxRate.findUnique({ where: { id: input.taxRateId } });
    if (!taxRate) throw new NotFoundError('TaxRate', input.taxRateId);
    if (taxRate.merchantId !== input.merchantId) {
      throw new AuthorizationError('Tax rate does not belong to this merchant');
    }
    if (!taxRate.isActive) {
      throw new ValidationError('Tax rate is inactive');
    }
  }

  return db.paymentLink.create({
    data: {
      appId: input.appId,
      name: input.name,
      description: input.description,
      slug: input.slug,
      amount: resolvedAmount,
      currency: resolvedCurrency,
      productPlanId: input.productPlanId ?? null,
      productPlanPriceId: input.productPlanPriceId ?? null,
      allowedChains: input.allowedChains ?? 'ALL',
      allowedTokens: input.allowedTokens ?? 'ALL',
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      requireBillingDetails: input.requireBillingDetails ?? false,
      metadata: (input.metadata ?? {}) as any,
      taxRateId: input.taxRateId ?? null,
    },
    include: {
      app: { select: { name: true } },
      productPlan: { select: { id: true, name: true } },
      productPlanPrice: { select: { id: true, amount: true, currency: true, billingInterval: true, nickname: true } },
      taxRate: { select: { id: true, displayName: true, percentage: true, inclusive: true } },
    },
  });
}

// ── List Payment Links ──

export async function listPaymentLinks(input: ListPaymentLinksInput) {
  const db = getDatabaseClient();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  // Find all app IDs for this merchant (filter by appId if provided)
  const appFilter: Record<string, unknown> = { merchantId: input.merchantId };
  if (input.appId) appFilter.id = input.appId;

  const apps = await db.app.findMany({ where: appFilter, select: { id: true } });
  const appIds = apps.map((a) => a.id);

  const where: Record<string, unknown> = { appId: { in: appIds } };
  if (input.isActive !== undefined) where.isActive = input.isActive;

  const [links, total] = await Promise.all([
    db.paymentLink.findMany({
      where,
      include: {
        app: { select: { name: true } },
        productPlan: { select: { id: true, name: true } },
        productPlanPrice: { select: { id: true, amount: true, currency: true, billingInterval: true, nickname: true } },
        taxRate: { select: { id: true, displayName: true, percentage: true, inclusive: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.paymentLink.count({ where }),
  ]);

  return { links, total, page, pageSize };
}

// ── Get Payment Link ──

export async function getPaymentLink(merchantId: string, id: string) {
  const db = getDatabaseClient();

  const link = await db.paymentLink.findUnique({
    where: { id },
    include: {
      app: { select: { name: true, merchantId: true } },
      productPlan: { select: { id: true, name: true, description: true, imageUrl: true } },
      productPlanPrice: { select: { id: true, amount: true, currency: true, billingInterval: true, billingIntervalCount: true, nickname: true } },
      taxRate: { select: { id: true, displayName: true, percentage: true, inclusive: true } },
    },
  });
  if (!link) throw new NotFoundError('PaymentLink', id);
  if (link.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return link;
}

// ── Get Payment Link by slug (public) ──

export async function getPaymentLinkBySlug(slug: string) {
  const db = getDatabaseClient();

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
          name: true,
          description: true,
          imageUrl: true,
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

  // Increment usage count
  await db.paymentLink.update({ where: { id: link.id }, data: { usageCount: { increment: 1 } } });

  // Resolve accepted chains & tokens based on link config + app config
  const acceptedChains = resolveAcceptedChains(link);
  const acceptedTokens = resolveAcceptedTokens(link);

  // Strip internal app data, return only public-safe fields
  const { app, ...linkData } = link;

  return {
    ...linkData,
    app: toPublicCheckoutApp(app),
    acceptedChains,
    acceptedTokens,
  };
}

/**
 * Resolve which chains the payment link accepts.
 * Computes the intersection of: App chains ∩ Link chains.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAcceptedChains(link: any) {
  const appChains = (link.app.appChains ?? []).map((ac: any) => ac.chain);

  // Start with app chains filtered by link config
  let chains = appChains;
  if (link.allowedChains !== 'ALL') {
    const linkChainIds = link.allowedChains as number[];
    chains = chains.filter((c: any) => linkChainIds.includes(c.chainId));
  }

  return chains.map(formatChain);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatChain(c: any) {
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

/**
 * Computes the intersection of: App tokens ∩ Link tokens ∩ Plan tokens (if linked to a plan),
 * filtered to only tokens on accepted chains.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAcceptedTokens(link: any) {
  // Get chainIds this link accepts
  const appChainIds = (link.app.appChains ?? []).map((ac: any) => ac.chain.chainId);
  const acceptedChainIds =
    link.allowedChains === 'ALL'
      ? appChainIds
      : (link.allowedChains as number[]).filter((id: number) => appChainIds.includes(id));

  // Get app-enabled tokens on accepted chains
  let tokens = (link.app.appTokens ?? [])
    .map((at: any) => at.supportedToken)
    .filter((t: any) => acceptedChainIds.includes(t.chainId));

  // Filter by link's token config
  if (link.allowedTokens !== 'ALL') {
    const linkTokenKeys = link.allowedTokens as string[];
    tokens = tokens.filter((t: any) => linkTokenKeys.includes(t.tokenKey));
  }

  return tokens.map(formatToken);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatToken(t: any) {
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

// ── Update Payment Link ──

export async function updatePaymentLink(merchantId: string, id: string, data: UpdatePaymentLinkInput) {
  const db = getDatabaseClient();

  const link = await db.paymentLink.findUnique({
    where: { id },
    include: { app: { select: { merchantId: true, id: true } } },
  });
  if (!link) throw new NotFoundError('PaymentLink', id);
  if (link.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  // Validate allowedChains/allowedTokens if being updated
  if (data.allowedChains !== undefined || data.allowedTokens !== undefined) {
    const chainsToValidate = data.allowedChains ?? link.allowedChains;
    const tokensToValidate = data.allowedTokens ?? link.allowedTokens;
    const resolvedChains = await validateAllowedChains(db, link.app.id, chainsToValidate);
    await validateAllowedTokens(db, link.app.id, tokensToValidate, resolvedChains);
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined) updateData.amount = data.amount ? parseFloat(data.amount) : null;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.productPlanId !== undefined) updateData.productPlanId = data.productPlanId;
  if (data.productPlanPriceId !== undefined) updateData.productPlanPriceId = data.productPlanPriceId;
  if (data.allowedChains !== undefined) updateData.allowedChains = data.allowedChains;
  if (data.allowedTokens !== undefined) updateData.allowedTokens = data.allowedTokens;
  if (data.successUrl !== undefined) updateData.successUrl = data.successUrl;
  if (data.cancelUrl !== undefined) updateData.cancelUrl = data.cancelUrl;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.requireBillingDetails !== undefined) updateData.requireBillingDetails = data.requireBillingDetails;
  if (data.metadata !== undefined) updateData.metadata = data.metadata;
  if (data.taxRateId !== undefined) updateData.taxRateId = data.taxRateId;

  // Validate productPlanPriceId belongs to productPlanId if both are present after update
  const finalPlanId = (updateData.productPlanId !== undefined ? updateData.productPlanId : link.productPlanId) as string | null;
  const finalPriceId = (updateData.productPlanPriceId !== undefined ? updateData.productPlanPriceId : link.productPlanPriceId) as string | null;

  if (finalPriceId && !finalPlanId) {
    throw new ValidationError('productPlanPriceId requires productPlanId');
  }

  if (finalPriceId && finalPlanId) {
    const price = await db.productPlanPrice.findUnique({ where: { id: finalPriceId } });
    if (!price || price.productPlanId !== finalPlanId) {
      throw new ValidationError('Price does not belong to the specified product plan');
    }
  }

  // If plan is cleared, also clear price
  if (updateData.productPlanId === null) {
    updateData.productPlanPriceId = null;
  }

  return db.paymentLink.update({
    where: { id },
    data: updateData,
    include: {
      app: { select: { name: true } },
      productPlan: { select: { id: true, name: true } },
      productPlanPrice: { select: { id: true, amount: true, currency: true, billingInterval: true, nickname: true } },
      taxRate: { select: { id: true, displayName: true, percentage: true, inclusive: true } },
    },
  });
}

// ── Delete Payment Link ──

export async function deletePaymentLink(merchantId: string, id: string) {
  const db = getDatabaseClient();

  const link = await db.paymentLink.findUnique({
    where: { id },
    include: { app: { select: { merchantId: true } } },
  });
  if (!link) throw new NotFoundError('PaymentLink', id);
  if (link.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  await db.paymentLink.delete({ where: { id } });
}

// ── Validation Helpers ──

/**
 * Validate that allowedChains only references chains that are:
 *  1. Enabled at admin level (SupportedChain.isEnabled)
 *  2. Enabled at app level (AppChain.isEnabled)
 * Returns the resolved set of chain IDs (for token validation).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateAllowedChains(db: any, appId: string, allowedChains: unknown): Promise<number[]> {
  // Fetch all app-enabled chains (the appChain query already only includes isEnabled AppChains;
  // but we also need the underlying SupportedChain.isEnabled to be true)
  const enabledAppChains = await db.appChain.findMany({
    where: {
      appId,
      isEnabled: true,
      chain: { isEnabled: true },
    },
    include: { chain: { select: { chainId: true, displayName: true } } },
  });

  const enabledChainIds = enabledAppChains.map((ac: any) => ac.chain.chainId as number);

  if (allowedChains === 'ALL' || allowedChains === undefined) {
    return enabledChainIds;
  }

  const requested = allowedChains as number[];
  if (requested.length === 0) {
    throw new ValidationError('At least one chain must be selected');
  }

  const invalid = requested.filter((id) => !enabledChainIds.includes(id));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Chain(s) ${invalid.join(', ')} are not enabled for this app. Enable them in app settings first.`,
    );
  }

  return requested;
}

/**
 * Validate that allowedTokens only references tokens that are:
 *  1. Enabled at admin level (SupportedToken.isEnabled)
 *  2. Enabled at app level (AppToken.isEnabled)
 *  3. On one of the accepted chains
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateAllowedTokens(db: any, appId: string, allowedTokens: unknown, acceptedChainIds: number[]) {
  if (allowedTokens === 'ALL' || allowedTokens === undefined) {
    return;
  }

  const requested = allowedTokens as string[];
  if (requested.length === 0) {
    throw new ValidationError('At least one token must be selected');
  }

  // Fetch all app-enabled tokens on accepted chains
  const enabledAppTokens = await db.appToken.findMany({
    where: {
      appId,
      isEnabled: true,
      supportedToken: {
        isEnabled: true,
        chainId: { in: acceptedChainIds },
      },
    },
    include: { supportedToken: { select: { tokenKey: true } } },
  });

  const enabledTokenKeys = enabledAppTokens.map((at: any) => at.supportedToken.tokenKey as string);

  const invalid = requested.filter((key) => !enabledTokenKeys.includes(key));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Token(s) ${invalid.join(', ')} are not enabled for this app on the selected chains. Enable them in app settings first.`,
    );
  }
}
