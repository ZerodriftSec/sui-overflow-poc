import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  ValidationError,
  PaymentError,
  PAYMENT_CONFIG,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  chainFamilyFromDb,
} from '@noderails/common';
import { getEffectiveTimelockConfig } from './timelock-config.service.js';

// ── Create Payment Intent ──

interface CreateIntentInput {
  appId: string;
  customerAccountId?: string;
  externalId?: string;
  amount: string;
  currency?: string;
  allowedChains?: unknown; // "ALL" or number[]
  allowedTokens?: unknown; // "ALL" or string[]
  captureMode?: 'AUTOMATIC' | 'MANUAL';
  metadata?: Record<string, unknown>;
  successUrl?: string;
  cancelUrl?: string;
  sourceType?: 'CHECKOUT_SESSION' | 'INVOICE' | 'SUBSCRIPTION' | 'API';
  sourceId?: string;
  idempotencyKey?: string;
  expiresAt?: Date;
}

export async function createIntent(input: CreateIntentInput) {
  const db = getDatabaseClient();

  // Resolve timelock config for this merchant (server-controlled, not merchant-settable)
  const app = await db.app.findUnique({
    where: { id: input.appId },
    select: { merchantId: true },
  });
  const timelockConfig = app
    ? await getEffectiveTimelockConfig(app.merchantId)
    : { disputeStartSeconds: PAYMENT_CONFIG.DEFAULT_TIMELOCK_SEC, settlementSeconds: PAYMENT_CONFIG.DEFAULT_TIMELOCK_SEC };

  return db.paymentIntent.create({
    data: {
      appId: input.appId,
      customerAccountId: input.customerAccountId,
      externalId: input.externalId,
      amount: input.amount,
      currency: input.currency ?? 'USD',
      allowedChains: input.allowedChains ?? 'ALL',
      allowedTokens: input.allowedTokens ?? 'ALL',
      captureMode: input.captureMode ?? 'AUTOMATIC',
      timelockDuration: timelockConfig.settlementSeconds,
      disputeStartDuration: timelockConfig.disputeStartSeconds,
      metadata: (input.metadata ?? undefined) as any,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      sourceType: input.sourceType as any,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      expiresAt: input.expiresAt,
    },
  });
}

// ── Get Payment Intent ──

export async function getIntent(appId: string, intentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: intentId },
    include: { transactions: true, dispute: true, customerAccount: true },
  });

  if (!intent || intent.appId !== appId) {
    throw new NotFoundError('PaymentIntent', intentId);
  }

  return intent;
}

// ── Get Payment Intent (public — for checkout UI) ──

export async function getIntentPublic(intentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: intentId },
    select: {
      id: true,
      amount: true,
      currency: true,
      allowedChains: true,
      allowedTokens: true,
      status: true,
      expiresAt: true,
      successUrl: true,
      cancelUrl: true,
      createdAt: true,
      app: {
        select: {
          name: true,
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
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', intentId);
  }

  // Resolve chains & tokens (same logic as payment links)
  const acceptedChains = resolveIntentChains(intent);
  const acceptedTokens = resolveIntentTokens(intent);

  const { app, allowedChains: _ac, allowedTokens: _at, ...intentData } = intent;

  return {
    ...intentData,
    app: { name: app.name },
    acceptedChains,
    acceptedTokens,
  };
}

function resolveIntentChains(intent: any) {
  const appChains = (intent.app.appChains ?? []).map((ac: any) => ac.chain);
  const formatChain = (c: any) => ({
    chainId: c.chainId,
    chainType: chainFamilyFromDb(c.chainType),
    name: c.name,
    displayName: c.displayName,
    nativeCurrencySymbol: c.nativeCurrencySymbol,
    iconUrl: c.iconUrl,
    isTestnet: c.isTestnet,
    escrowAddress: c.escrowAddress,
    rpcUrl: c.rpcUrl ?? null,
  });

  if (intent.allowedChains === 'ALL') {
    return appChains.map(formatChain);
  }
  const allowedIds = intent.allowedChains as number[];
  return appChains.filter((c: any) => allowedIds.includes(c.chainId)).map(formatChain);
}

function resolveIntentTokens(intent: any) {
  const appChainIds = (intent.app.appChains ?? []).map((ac: any) => ac.chain.chainId);
  const acceptedChainIds =
    intent.allowedChains === 'ALL'
      ? appChainIds
      : (intent.allowedChains as number[]).filter((id: number) => appChainIds.includes(id));

  const appTokens = (intent.app.appTokens ?? [])
    .map((at: any) => at.supportedToken)
    .filter((t: any) => acceptedChainIds.includes(t.chainId));

  const formatToken = (t: any) => ({
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
  });

  if (intent.allowedTokens === 'ALL') {
    return appTokens.map(formatToken);
  }
  const allowedKeys = intent.allowedTokens as string[];
  return appTokens.filter((t: any) => allowedKeys.includes(t.tokenKey)).map(formatToken);
}

// ── List Payment Intents ──

interface ListIntentsInput {
  appId: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listIntents(input: ListIntentsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { appId: input.appId };
  if (input.status) where.status = input.status;

  const [intents, total] = await Promise.all([
    db.paymentIntent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { transactions: true },
    }),
    db.paymentIntent.count({ where }),
  ]);

  return { intents, total, page, pageSize };
}

// ── Update Status (internal) ──

export async function updateIntentStatus(
  intentId: string,
  status: string,
  extra?: Record<string, unknown>,
) {
  const db = getDatabaseClient();
  return db.paymentIntent.update({
    where: { id: intentId },
    data: { status: status as any, ...extra },
  });
}

// ── List Payment Intents by Merchant ──

interface ListIntentsByMerchantInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listIntentsByMerchant(input: ListIntentsByMerchantInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    app: { merchantId: input.merchantId },
  };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [intents, total] = await Promise.all([
    db.paymentIntent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        transactions: true,
        customerAccount: { select: { id: true, email: true, name: true } },
        checkoutSessions: { select: { sourceType: true, sourceId: true }, take: 1 },
      },
    }),
    db.paymentIntent.count({ where }),
  ]);

  return { intents, total, page, pageSize };
}

// ── Get Payment Intent by Merchant ──

export async function getIntentByMerchant(merchantId: string, intentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: intentId },
    include: {
      transactions: true,
      dispute: true,
      app: true,
      customerAccount: true,
      checkoutSessions: {
        select: {
          sourceType: true,
          sourceId: true,
          subtotal: true,
          taxAmount: true,
          taxDescription: true,
        },
        take: 1,
      },
    },
  });

  if (!intent || intent.app.merchantId !== merchantId) {
    throw new NotFoundError('PaymentIntent', intentId);
  }

  return intent;
}

// ── Cancel Payment Intent ──

export async function cancelIntent(appId: string, intentId: string) {
  const intent = await getIntent(appId, intentId);

  if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZED') {
    throw new PaymentError(`Cannot cancel payment in ${intent.status} status`, intentId);
  }

  return updateIntentStatus(intentId, 'CANCELLED');
}
