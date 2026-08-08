import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@noderails/common';
import { env } from '../../config.js';

// ── Types ──

interface CreateProductPlanInput {
  appId: string;
  merchantId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  planType?: string;
  taxRateId?: string;
  metadata?: Record<string, unknown>;
  prices: CreatePriceInput[];
}

interface CreatePriceInput {
  amount: string;
  currency?: string;
  billingInterval?: string;
  billingIntervalCount?: number;
  trialPeriodDays?: number;
  nickname?: string;
  sortOrder?: number;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

// ── Create Product Plan ──

export async function createProductPlan(input: CreateProductPlanInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  if (!input.prices || input.prices.length === 0) {
    throw new ValidationError('Product plan must have at least one price');
  }

  const planType = input.planType ?? 'ONE_TIME';

  // Validate tax rate ownership if provided
  if (input.taxRateId) {
    const taxRate = await db.taxRate.findUnique({ where: { id: input.taxRateId } });
    if (!taxRate) throw new NotFoundError('TaxRate', input.taxRateId);
    if (taxRate.merchantId !== input.merchantId) throw new AuthorizationError('Tax rate does not belong to this merchant');
    if (!taxRate.isActive) throw new ValidationError('Tax rate is archived');
  }

  // Validate subscription plans have billing interval
  if (planType === 'SUBSCRIPTION') {
    for (const price of input.prices) {
      if (!price.billingInterval) {
        throw new ValidationError('Subscription plans require billingInterval on all prices');
      }
      if (price.billingInterval === 'MINUTE' && !env.ENABLE_TEST_INTERVALS) {
        throw new ValidationError('MINUTE interval requires ENABLE_TEST_INTERVALS=true');
      }
    }
  }

  return db.productPlan.create({
    data: {
      appId: input.appId,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      planType: planType as any,
      taxRateId: input.taxRateId ?? null,
      metadata: (input.metadata ?? undefined) as any,
      prices: {
        create: input.prices.map((price) => ({
          appId: input.appId,
          amount: price.amount,
          currency: price.currency ?? 'USD',
          billingInterval: (price.billingInterval as any) ?? null,
          billingIntervalCount: price.billingIntervalCount ?? 1,
          trialPeriodDays: price.trialPeriodDays ?? 0,
          nickname: price.nickname,
          sortOrder: price.sortOrder ?? 0,
          isDefault: price.isDefault ?? false,
          metadata: (price.metadata ?? undefined) as any,
        })),
      },
    },
    include: { prices: { orderBy: { sortOrder: 'asc' } }, taxRate: true },
  });
}

// ── Get Product Plan ──

export async function getProductPlan(merchantId: string, planId: string) {
  const db = getDatabaseClient();

  const plan = await db.productPlan.findUnique({
    where: { id: planId },
    include: {
      app: true,
      prices: { orderBy: { sortOrder: 'asc' } },
      taxRate: true,
    },
  });

  if (!plan) throw new NotFoundError('ProductPlan', planId);
  if (plan.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return plan;
}

// ── List Product Plans ──

interface ListProductPlansInput {
  merchantId: string;
  appId?: string;
  planType?: string;
  page?: number;
  pageSize?: number;
}

export async function listProductPlans(input: ListProductPlansInput) {
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
  if (input.planType) where.planType = input.planType;

  const [plans, total] = await Promise.all([
    db.productPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { prices: { orderBy: { sortOrder: 'asc' } }, taxRate: true },
    }),
    db.productPlan.count({ where }),
  ]);

  return { plans, total, page, pageSize };
}

// ── Update Product Plan ──

interface UpdateProductPlanInput {
  name?: string;
  description?: string;
  imageUrl?: string;
  taxRateId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export async function updateProductPlan(merchantId: string, planId: string, input: UpdateProductPlanInput) {
  await getProductPlan(merchantId, planId);
  const db = getDatabaseClient();

  // Validate tax rate ownership if setting a new one
  if (input.taxRateId) {
    const taxRate = await db.taxRate.findUnique({ where: { id: input.taxRateId } });
    if (!taxRate) throw new NotFoundError('TaxRate', input.taxRateId);
    if (taxRate.merchantId !== merchantId) throw new AuthorizationError('Tax rate does not belong to this merchant');
    if (!taxRate.isActive) throw new ValidationError('Tax rate is archived');
  }

  return db.productPlan.update({
    where: { id: planId },
    data: input as any,
    include: { prices: { orderBy: { sortOrder: 'asc' } }, taxRate: true },
  });
}

// ── Add Price to Plan ──

export async function addPrice(merchantId: string, planId: string, input: CreatePriceInput) {
  const plan = await getProductPlan(merchantId, planId);

  if (plan.planType === 'SUBSCRIPTION' && !input.billingInterval) {
    throw new ValidationError('Subscription plans require billingInterval');
  }
  if (input.billingInterval === 'MINUTE' && !env.ENABLE_TEST_INTERVALS) {
    throw new ValidationError('MINUTE interval requires ENABLE_TEST_INTERVALS=true');
  }

  const db = getDatabaseClient();
  return db.productPlanPrice.create({
    data: {
      productPlanId: planId,
      appId: plan.appId,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      billingInterval: (input.billingInterval as any) ?? null,
      billingIntervalCount: input.billingIntervalCount ?? 1,
      trialPeriodDays: input.trialPeriodDays ?? 0,
      nickname: input.nickname,
      sortOrder: input.sortOrder ?? 0,
      isDefault: input.isDefault ?? false,
      metadata: (input.metadata ?? undefined) as any,
    },
  });
}

// ── Update Price ──

interface UpdatePriceInput {
  amount?: string;
  nickname?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isActive?: boolean;
  trialPeriodDays?: number;
}

export async function updatePrice(merchantId: string, planId: string, priceId: string, input: UpdatePriceInput) {
  const plan = await getProductPlan(merchantId, planId);
  const price = plan.prices.find((p) => p.id === priceId);
  if (!price) throw new NotFoundError('ProductPlanPrice', priceId);

  const db = getDatabaseClient();
  return db.productPlanPrice.update({
    where: { id: priceId },
    data: input as any,
  });
}

// ── Delete Price (soft: deactivate) ──

export async function deactivatePrice(merchantId: string, planId: string, priceId: string) {
  const plan = await getProductPlan(merchantId, planId);
  const price = plan.prices.find((p) => p.id === priceId);
  if (!price) throw new NotFoundError('ProductPlanPrice', priceId);

  const db = getDatabaseClient();
  return db.productPlanPrice.update({
    where: { id: priceId },
    data: { isActive: false },
  });
}
