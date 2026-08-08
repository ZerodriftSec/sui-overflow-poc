import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  QUEUE_NAMES,
  SUBSCRIPTION_CONFIG,
  WEBHOOK_EVENTS,
  isNativeToken,
  getLeanRpcUrl,
  normalizeSuiAddress,
} from '@noderails/common';
import { PublicKey, Connection } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { escrowAuthorityPda, payerSplAta } from '@noderails/solana';
import { resolveMintTokenProgramId } from '../payments/solana-mint-token-program.js';
import { suiClientForChain, requireSuiEscrowObjects } from '../payments/sui-escrow-tx.js';
import {
  readWalletIdForOwner,
  readWalletSubscriptionState,
  SUI_NATIVE_COIN_TYPE,
  WALLET_RULE_ACTIVE,
} from '@noderails/sui';
import { queueRegistry } from '@noderails/queue';
import type { SubscriptionChargeJob, SubscriptionRetryJob, SubscriptionGracePeriodJob } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { enqueueAppWebhook } from '../webhooks/webhook.service.js';

// ── Helpers ──

export function computePeriodEnd(
  start: Date,
  interval: string,
  intervalCount: number,
): Date {
  const end = new Date(start);
  switch (interval) {
    case 'MINUTE':
      end.setTime(end.getTime() + intervalCount * 60 * 1000);
      break;
    case 'DAY':
      end.setDate(end.getDate() + intervalCount);
      break;
    case 'WEEK':
      end.setDate(end.getDate() + 7 * intervalCount);
      break;
    case 'MONTH':
      end.setMonth(end.getMonth() + intervalCount);
      break;
    case 'YEAR':
      end.setFullYear(end.getFullYear() + intervalCount);
      break;
  }
  return end;
}

// ── Delayed Job Scheduling ──

async function scheduleChargeJob(subscriptionId: string, periodEnd: Date, amountUsd: string, periodStart: Date): Promise<string> {
  const delayMs = Math.max(0, periodEnd.getTime() - Date.now());
  const queue = queueRegistry.getOrCreateQueue<SubscriptionChargeJob>(QUEUE_NAMES.SUBSCRIPTION_PROCESS_CHARGE);
  const jobId = `sub-charge-${subscriptionId}-${periodEnd.getTime()}`;
  await queue.add(jobId, {
    subscriptionId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    amountUsd,
  }, { jobId, delay: delayMs, removeOnComplete: true, removeOnFail: 50 });
  return jobId;
}

async function scheduleRetryJob(subscriptionId: string, attemptNumber: number): Promise<string> {
  const retryDelays = SUBSCRIPTION_CONFIG.RETRY_DELAYS_HOURS;
  const delayHours = retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)];
  const delayMs = delayHours * 60 * 60 * 1000;

  const queue = queueRegistry.getOrCreateQueue<SubscriptionRetryJob>(QUEUE_NAMES.SUBSCRIPTION_RETRY_CHARGE);
  const jobId = `sub-retry-${subscriptionId}-${attemptNumber}-${Date.now()}`;
  await queue.add(jobId, { subscriptionId, attemptNumber }, {
    jobId,
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: 50,
  });
  return jobId;
}

async function scheduleGracePeriodJob(subscriptionId: string): Promise<string> {
  const delayMs = SUBSCRIPTION_CONFIG.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const queue = queueRegistry.getOrCreateQueue<SubscriptionGracePeriodJob>(QUEUE_NAMES.SUBSCRIPTION_GRACE_PERIOD);
  const jobId = `sub-grace-${subscriptionId}-${Date.now()}`;
  await queue.add(jobId, { subscriptionId }, {
    jobId,
    delay: delayMs,
    removeOnComplete: true,
    removeOnFail: 50,
  });
  return jobId;
}

async function removePendingJob(pendingJobId: string | null | undefined) {
  if (!pendingJobId) return;
  // Try removing from all three subscription queues
  const queueNames = [
    QUEUE_NAMES.SUBSCRIPTION_PROCESS_CHARGE,
    QUEUE_NAMES.SUBSCRIPTION_RETRY_CHARGE,
    QUEUE_NAMES.SUBSCRIPTION_GRACE_PERIOD,
  ];
  for (const name of queueNames) {
    try {
      const queue = queueRegistry.getOrCreateQueue(name);
      await queue.removeJob(pendingJobId);
      return;
    } catch {
      // Job not in this queue, try next
    }
  }
}

// ── On-Chain Pre-flight Checks ──

export interface PreflightResult {
  ok: boolean;
  reason?: 'INSUFFICIENT_ALLOWANCE' | 'INSUFFICIENT_BALANCE';
  allowance?: bigint;
  balance?: bigint;
  requiredAmount?: bigint;
}

export async function checkAllowanceAndBalance(
  chainId: number,
  tokenAddress: string,
  walletAddress: string,
  spender: string,
  requiredAmount: bigint,
): Promise<PreflightResult> {
  const rpcUrl = getLeanRpcUrl(chainId);
  const client = createPublicClient({ transport: http(rpcUrl) });

  const [allowance, balance] = await Promise.all([
    client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletAddress as Address, spender as Address],
    }),
    client.readContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    }),
  ]);

  if (allowance < requiredAmount) {
    return { ok: false, reason: 'INSUFFICIENT_ALLOWANCE', allowance, balance, requiredAmount };
  }
  if (balance < requiredAmount) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE', allowance, balance, requiredAmount };
  }

  return { ok: true, allowance, balance, requiredAmount };
}

/** SPL on Solana: delegate must be escrow `escrow_auth` PDA with enough delegated amount. */
export async function checkSolanaSplDelegateAndBalance(
  rpcUrl: string,
  escrowProgramId: string,
  mintAddress: string,
  walletAddress: string,
  requiredAmount: bigint,
): Promise<PreflightResult> {
  const programId = new PublicKey(escrowProgramId);
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(walletAddress);
  const expectedDelegate = escrowAuthorityPda(programId);
  const conn = new Connection(rpcUrl, 'confirmed');
  const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
  if (!splTokenProgramId) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE', allowance: 0n, balance: 0n, requiredAmount };
  }
  const ata = payerSplAta(mint, owner, splTokenProgramId);
  try {
    const acc = await getAccount(conn, ata, 'confirmed', splTokenProgramId);
    if (!acc.delegate?.equals(expectedDelegate)) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_ALLOWANCE',
        allowance: 0n,
        balance: acc.amount,
        requiredAmount,
      };
    }
    if (acc.delegatedAmount < requiredAmount) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_ALLOWANCE',
        allowance: acc.delegatedAmount,
        balance: acc.amount,
        requiredAmount,
      };
    }
    if (acc.amount < requiredAmount) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_BALANCE',
        allowance: acc.delegatedAmount,
        balance: acc.amount,
        requiredAmount,
      };
    }
    return { ok: true, allowance: acc.delegatedAmount, balance: acc.amount, requiredAmount };
  } catch {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE', allowance: 0n, balance: 0n, requiredAmount };
  }
}

/** Sui coin subscriptions: recurring pulls from NodeRailsWallet via capture_from_wallet. */
export async function checkSuiSubscriptionPoolAndBalance(
  chain: {
    rpcUrl: string | null;
    chainId: number;
    escrowAddress: string;
    escrowConfigObjectId: string | null;
    paymentRegistryObjectId: string | null;
    walletRegistryObjectId?: string | null;
  },
  tokenContractAddress: string,
  walletAddress: string,
  merchantAddress: string,
  requiredAmount: bigint,
): Promise<PreflightResult> {
  try {
    const objects = requireSuiEscrowObjects({
      escrowAddress: chain.escrowAddress,
      escrowConfigObjectId: chain.escrowConfigObjectId,
      paymentRegistryObjectId: chain.paymentRegistryObjectId,
      walletRegistryObjectId: chain.walletRegistryObjectId,
    });
    const client = suiClientForChain(chain);
    const coinType = isNativeToken(tokenContractAddress)
      ? SUI_NATIVE_COIN_TYPE
      : tokenContractAddress.trim();
    const payer = normalizeSuiAddress(walletAddress);
    const merchant = normalizeSuiAddress(merchantAddress);
    const walletId = await readWalletIdForOwner(client, {
      packageId: objects.packageId,
      walletRegistryObjectId: objects.walletRegistryObjectId,
      owner: payer,
    });
    if (!walletId) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_ALLOWANCE',
        allowance: 0n,
        balance: 0n,
        requiredAmount,
      };
    }
    const state = await readWalletSubscriptionState(client, {
      packageId: objects.packageId,
      walletObjectId: walletId,
      coinType,
      merchant,
      sender: payer,
    });
    if (state.ruleStatus !== WALLET_RULE_ACTIVE || state.remainingBudget < requiredAmount) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_ALLOWANCE',
        allowance: state.remainingBudget,
        balance: state.balance,
        requiredAmount,
      };
    }
    if (state.balance < requiredAmount) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_BALANCE',
        allowance: state.remainingBudget,
        balance: state.balance,
        requiredAmount,
      };
    }
    return {
      ok: true,
      allowance: state.remainingBudget,
      balance: state.balance,
      requiredAmount,
    };
  } catch {
    return {
      ok: false,
      reason: 'INSUFFICIENT_ALLOWANCE',
      allowance: 0n,
      balance: 0n,
      requiredAmount,
    };
  }
}

// ── Create Subscription ──

interface CreateSubscriptionInput {
  appId: string;
  merchantId: string;
  customerAccountId: string;
  productPlanId: string;
  productPlanPriceId: string;
  allowedChains?: unknown;
  allowedTokens?: unknown;
  metadata?: Record<string, unknown>;
}

export async function createSubscription(input: CreateSubscriptionInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  // Validate product plan exists, is active, and is SUBSCRIPTION type
  const productPlan = await db.productPlan.findUnique({
    where: { id: input.productPlanId },
    include: { prices: true },
  });
  if (!productPlan || productPlan.appId !== input.appId) {
    throw new NotFoundError('ProductPlan', input.productPlanId);
  }
  if (productPlan.planType !== 'SUBSCRIPTION') {
    throw new ValidationError('Product plan must be of type SUBSCRIPTION');
  }
  if (!productPlan.isActive) {
    throw new ValidationError('Product plan is inactive');
  }

  // Validate price belongs to this plan and is active
  const price = productPlan.prices.find((p) => p.id === input.productPlanPriceId);
  if (!price) {
    throw new NotFoundError('ProductPlanPrice', input.productPlanPriceId);
  }
  if (!price.isActive) {
    throw new ValidationError('Selected price is inactive');
  }
  if (!price.billingInterval) {
    throw new ValidationError('Selected price has no billing interval configured');
  }

  // Validate customer account
  const customer = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId },
  });
  if (!customer || customer.appId !== input.appId) {
    throw new NotFoundError('CustomerAccount', input.customerAccountId);
  }

  const now = new Date();
  const trialDays = price.trialPeriodDays ?? 0;
  const trialEnd = trialDays > 0 ? new Date(now.getTime() + trialDays * 86400000) : null;
  const periodStart = trialEnd ?? now;
  const periodEnd = computePeriodEnd(periodStart, price.billingInterval!, price.billingIntervalCount);

  return db.subscription.create({
    data: {
      appId: input.appId,
      customerAccountId: input.customerAccountId,
      productPlanId: input.productPlanId,
      productPlanPriceId: input.productPlanPriceId,
      status: trialDays > 0 ? 'TRIALING' : 'CREATED',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      billingCycleAnchor: periodStart,
      trialStart: trialDays > 0 ? now : null,
      trialEnd: trialEnd,
      allowedChains: (input.allowedChains ?? undefined) as any,
      allowedTokens: (input.allowedTokens ?? undefined) as any,
      metadata: (input.metadata ?? undefined) as any,
    },
    include: { productPlan: true, productPlanPrice: true },
  }).then(async (sub) => {
    await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_CREATED, {
      subscriptionId: sub.id,
      appId: sub.appId,
      status: sub.status,
      productPlanId: sub.productPlanId,
      customerAccountId: sub.customerAccountId,
      metadata: sub.metadata ?? {},
    });
    return sub;
  });
}

// ── Activate Subscription (called when first invoice is paid) ──

interface ActivateSubscriptionInput {
  subscriptionId: string;
  customerWalletId: string;
  authorizationMethod: string;
  authorizationChainId: number;
  authorizationTokenKey: string;
  approvalTxHash?: string;
  logger: Logger;
}

export async function activateSubscription(input: ActivateSubscriptionInput) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: {
      app: { select: { merchantId: true } },
      productPlan: true,
      productPlanPrice: true,
    },
  });
  if (!sub) throw new NotFoundError('Subscription', input.subscriptionId);

  // Only activate from CREATED or TRIALING
  if (sub.status !== 'CREATED' && sub.status !== 'TRIALING') {
    input.logger.warn('Cannot activate subscription in current status', {
      subscriptionId: input.subscriptionId,
      status: sub.status,
    });
    return sub;
  }

  const now = new Date();
  const price = sub.productPlanPrice;
  const periodStart = now;
  const periodEnd = computePeriodEnd(periodStart, price.billingInterval!, price.billingIntervalCount);

  // Schedule delayed charge job at periodEnd
  const amountUsd = String(price.amount);
  const jobId = await scheduleChargeJob(input.subscriptionId, periodEnd, amountUsd, periodStart);

  const updated = await db.subscription.update({
    where: { id: input.subscriptionId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      billingCycleAnchor: periodStart,
      customerWalletId: input.customerWalletId,
      authorizationMethod: input.authorizationMethod as any,
      authorizationChainId: input.authorizationChainId,
      authorizationTokenKey: input.authorizationTokenKey,
      captureRetryCount: 0,
      pendingJobId: jobId,
    },
    include: { app: { select: { merchantId: true } }, productPlan: true, productPlanPrice: true },
  });

  input.logger.info('Subscription activated', {
    subscriptionId: input.subscriptionId,
    periodEnd: periodEnd.toISOString(),
    jobId,
  });

  await enqueueAppWebhook(updated.appId, WEBHOOK_EVENTS.SUBSCRIPTION_ACTIVATED, {
    subscriptionId: updated.id,
    appId: updated.appId,
    status: updated.status,
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    metadata: updated.metadata ?? {},
  });

  return updated;
}

// ── Advance Subscription Period (called when renewal invoice is paid) ──

export async function advanceSubscriptionPeriod(subscriptionId: string, logger: Logger) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { productPlanPrice: true },
  });
  if (!sub) return;

  // Check cancelAtPeriodEnd flag — if set, cancel now instead of renewing
  if (sub.cancelAtPeriodEnd) {
    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
        pendingJobId: null,
      },
    });
    logger.info('Subscription cancelled at period end', { subscriptionId });

    await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED, {
      subscriptionId,
      appId: sub.appId,
      reason: 'cancel_at_period_end',
      metadata: sub.metadata ?? {},
    });
    return;
  }

  const price = sub.productPlanPrice;
  const newPeriodStart = sub.currentPeriodEnd ?? new Date();
  const newPeriodEnd = computePeriodEnd(newPeriodStart, price.billingInterval!, price.billingIntervalCount);

  // Remove old pending job if any
  await removePendingJob(sub.pendingJobId);

  // Schedule next charge
  const amountUsd = String(price.amount);
  const jobId = await scheduleChargeJob(subscriptionId, newPeriodEnd, amountUsd, newPeriodStart);

  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      captureRetryCount: 0,
      pastDueSince: null,
      pendingJobId: jobId,
    },
  });

  logger.info('Subscription period advanced', {
    subscriptionId,
    newPeriodStart: newPeriodStart.toISOString(),
    newPeriodEnd: newPeriodEnd.toISOString(),
    jobId,
  });

  await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_RENEWED, {
    subscriptionId,
    appId: sub.appId,
    status: 'ACTIVE',
    currentPeriodStart: newPeriodStart.toISOString(),
    currentPeriodEnd: newPeriodEnd.toISOString(),
    metadata: sub.metadata ?? {},
  });
}

// ── Handle Charge Failure ──

export async function handleChargeFailure(
  subscriptionId: string,
  reason: string,
  logger: Logger,
) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;

  const newRetryCount = sub.captureRetryCount + 1;
  const maxRetries = sub.maxCaptureRetries ?? SUBSCRIPTION_CONFIG.MAX_CAPTURE_RETRIES;

  // Remove old pending job if any
  await removePendingJob(sub.pendingJobId);

  if (newRetryCount < maxRetries) {
    // Schedule retry
    const jobId = await scheduleRetryJob(subscriptionId, newRetryCount);

    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        captureRetryCount: newRetryCount,
        pendingJobId: jobId,
      },
    });

    logger.warn('Subscription charge failed, scheduling retry', {
      subscriptionId,
      reason,
      retryCount: newRetryCount,
      maxRetries,
    });

    await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_PAYMENT_FAILED, {
      subscriptionId,
      appId: sub.appId,
      reason,
      retryCount: newRetryCount,
      maxRetries,
      metadata: sub.metadata ?? {},
    });
  } else {
    // Max retries reached — move to PAST_DUE
    const jobId = await scheduleGracePeriodJob(subscriptionId);

    await db.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'PAST_DUE',
        pastDueSince: new Date(),
        captureRetryCount: newRetryCount,
        pendingJobId: jobId,
      },
    });

    logger.warn('Subscription moved to PAST_DUE after max retries', {
      subscriptionId,
      reason,
      retryCount: newRetryCount,
    });

    await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_PAST_DUE, {
      subscriptionId,
      appId: sub.appId,
      reason,
      retryCount: newRetryCount,
      metadata: sub.metadata ?? {},
    });
  }
}

// ── Handle Grace Period Expiry ──

export async function handleGracePeriodExpiry(subscriptionId: string, logger: Logger) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return;

  if (sub.status !== 'PAST_DUE') {
    logger.info('Subscription no longer PAST_DUE when grace period expired, skipping', {
      subscriptionId,
      status: sub.status,
    });
    return;
  }

  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      pendingJobId: null,
    },
  });

  logger.info('Subscription cancelled after grace period expiry', { subscriptionId });

  await enqueueAppWebhook(sub.appId, WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED, {
    subscriptionId,
    appId: sub.appId,
    reason: 'grace_period_expired',
    metadata: sub.metadata ?? {},
  });
}

// ── Get Subscription ──

export async function getSubscription(merchantId: string, subscriptionId: string) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      app: true,
      productPlan: { include: { taxRate: true } },
      productPlanPrice: true,
      customerAccount: true,
      customerWallet: true,
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          taxRate: true,
          items: { include: { taxRate: true } },
          paymentIntent: true,
        },
      },
    },
  });

  if (!sub) throw new NotFoundError('Subscription', subscriptionId);
  if (sub.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return sub;
}

// ── List Subscriptions ──

interface ListSubscriptionsInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listSubscriptions(input: ListSubscriptionsInput) {
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

  const [subs, total] = await Promise.all([
    db.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { productPlan: { include: { taxRate: true } }, productPlanPrice: true, customerAccount: true },
    }),
    db.subscription.count({ where }),
  ]);

  return { subscriptions: subs, total, page, pageSize };
}

// ── Pause Subscription ──

export async function pauseSubscription(merchantId: string, subscriptionId: string) {
  const sub = await getSubscription(merchantId, subscriptionId);

  if (sub.status !== 'ACTIVE') {
    throw new ValidationError(`Cannot pause subscription in ${sub.status} status`);
  }

  // Remove pending job
  await removePendingJob(sub.pendingJobId);

  const db = getDatabaseClient();
  const paused = await db.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'PAUSED', pendingJobId: null, pausedAt: new Date() },
  });

  await enqueueAppWebhook(paused.appId, WEBHOOK_EVENTS.SUBSCRIPTION_PAUSED, {
    subscriptionId,
    appId: paused.appId,
    metadata: paused.metadata ?? {},
  });

  return paused;
}

// ── Resume Subscription ──

export async function resumeSubscription(merchantId: string, subscriptionId: string) {
  const sub = await getSubscription(merchantId, subscriptionId);

  if (sub.status !== 'PAUSED') {
    throw new ValidationError(`Cannot resume subscription in ${sub.status} status`);
  }

  const db = getDatabaseClient();
  const now = new Date();
  const price = sub.productPlanPrice;

  // Calculate remaining period time from when subscription was paused
  let periodEnd: Date;
  if (sub.pausedAt && sub.currentPeriodEnd) {
    const remainingMs = sub.currentPeriodEnd.getTime() - sub.pausedAt.getTime();
    periodEnd = new Date(now.getTime() + Math.max(0, remainingMs));
  } else {
    // Fallback: start a fresh period
    periodEnd = computePeriodEnd(now, price.billingInterval!, price.billingIntervalCount);
  }

  // Schedule delayed charge job
  const amountUsd = String(price.amount);
  const jobId = await scheduleChargeJob(subscriptionId, periodEnd, amountUsd, now);

  const resumed = await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      pendingJobId: jobId,
      pausedAt: null,
    },
  });

  await enqueueAppWebhook(resumed.appId, WEBHOOK_EVENTS.SUBSCRIPTION_RESUMED, {
    subscriptionId,
    appId: resumed.appId,
    currentPeriodEnd: periodEnd.toISOString(),
    metadata: resumed.metadata ?? {},
  });

  return resumed;
}

// ── Cancel Subscription ──

export async function cancelSubscription(
  merchantId: string,
  subscriptionId: string,
  cancelAtPeriodEnd?: boolean,
) {
  const sub = await getSubscription(merchantId, subscriptionId);

  if (sub.status === 'CANCELLED') {
    throw new ValidationError('Subscription already cancelled');
  }

  const db = getDatabaseClient();

  if (cancelAtPeriodEnd) {
    const updated = await db.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: true, cancelAt: sub.currentPeriodEnd },
    });
    return updated;
  }

  // Immediate cancel — remove pending job
  await removePendingJob(sub.pendingJobId);

  const updated = await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      pendingJobId: null,
    },
  });

  await enqueueAppWebhook(updated.appId, WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED, {
    subscriptionId,
    appId: updated.appId,
    reason: 'immediate',
    metadata: updated.metadata ?? {},
  });

  return updated;
}

// ── Startup Reconciliation ──

export async function reconcileSubscriptions(logger: Logger) {
  const db = getDatabaseClient();
  const now = new Date();

  let reconciledCount = 0;

  // ── Case 1: ACTIVE subscriptions past their period end with no pending job ──
  const missedSubs = await db.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: { lte: now },
      pendingJobId: null,
    },
    include: { productPlanPrice: true },
  });

  for (const sub of missedSubs) {
    const amountUsd = String(sub.productPlanPrice.amount);
    const jobId = await scheduleChargeJob(
      sub.id,
      sub.currentPeriodEnd!,
      amountUsd,
      sub.currentPeriodStart!,
    );

    await db.subscription.update({
      where: { id: sub.id },
      data: { pendingJobId: jobId },
    });

    logger.info('Reconciled missed subscription charge', {
      subscriptionId: sub.id,
      periodEnd: sub.currentPeriodEnd!.toISOString(),
    });
    reconciledCount++;
  }

  // ── Case 2: Subscriptions with a pendingJobId that no longer exists in BullMQ ──
  const withPendingJob = await db.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      pendingJobId: { not: null },
    },
    include: { productPlanPrice: true },
  });

  const allQueueNames = [
    QUEUE_NAMES.SUBSCRIPTION_PROCESS_CHARGE,
    QUEUE_NAMES.SUBSCRIPTION_RETRY_CHARGE,
    QUEUE_NAMES.SUBSCRIPTION_GRACE_PERIOD,
  ];

  for (const sub of withPendingJob) {
    let jobExists = false;

    for (const qName of allQueueNames) {
      try {
        const queue = queueRegistry.getOrCreateQueue(qName);
        const job = await queue.getJob(sub.pendingJobId!);
        if (job) {
          jobExists = true;
          break;
        }
      } catch {
        // Ignore queue access errors
      }
    }

    if (!jobExists) {
      // Job is gone — re-schedule based on current status
      if (sub.status === 'ACTIVE' && sub.currentPeriodEnd) {
        const amountUsd = String(sub.productPlanPrice.amount);
        const jobId = await scheduleChargeJob(
          sub.id,
          sub.currentPeriodEnd,
          amountUsd,
          sub.currentPeriodStart!,
        );
        await db.subscription.update({
          where: { id: sub.id },
          data: { pendingJobId: jobId },
        });
        logger.info('Reconciled orphaned pendingJobId (re-scheduled charge)', {
          subscriptionId: sub.id,
          oldJobId: sub.pendingJobId,
        });
      } else if (sub.status === 'PAST_DUE') {
        const jobId = await scheduleGracePeriodJob(sub.id);
        await db.subscription.update({
          where: { id: sub.id },
          data: { pendingJobId: jobId },
        });
        logger.info('Reconciled orphaned pendingJobId (re-scheduled grace period)', {
          subscriptionId: sub.id,
          oldJobId: sub.pendingJobId,
        });
      }
      reconciledCount++;
    }
  }

  if (reconciledCount > 0) {
    logger.info(`Reconciled ${reconciledCount} subscription(s)`);
  }
}
