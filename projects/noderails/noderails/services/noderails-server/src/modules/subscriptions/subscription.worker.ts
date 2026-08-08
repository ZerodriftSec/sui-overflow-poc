import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeCaptureERC20,
  buildCaptureERC20TypedData,
  packTimelocks,
  type PermitData,
} from '@noderails/web3';
import {
  QUEUE_NAMES,
  WORKER_CONFIG,
  PAYMENT_CONFIG,
  WEBHOOK_EVENTS,
  isNativeToken,
} from '@noderails/common';
import { createWorker, configureQueue } from '@noderails/queue';
import type {
  SubscriptionChargeJob,
  SubscriptionRetryJob,
  SubscriptionGracePeriodJob,
} from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { keccak256, encodePacked, parseUnits, type Hex, type Address } from 'viem';
import { env } from '../../config.js';
import * as priceService from '../prices/price.service.js';
import * as invoiceService from '../invoices/invoice.service.js';
import * as webhookService from '../webhooks/webhook.service.js';
import {
  checkAllowanceAndBalance,
  checkSolanaSplDelegateAndBalance,
  checkSuiSubscriptionPoolAndBalance,
  handleChargeFailure,
  handleGracePeriodExpiry,
  advanceSubscriptionPeriod,
} from './subscription.service.js';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import { getEffectiveTimelockConfig } from '../payments/timelock-config.service.js';
import { getEffectiveFeeBps } from '../payments/fee-config.service.js';
import { solanaRpcForChain } from '../payments/solana-escrow-tx.js';
import { submitSolanaSplCaptureMtxm } from '../payments/solana-spl-capture.js';
import { submitSuiSubscriptionCaptureMtxm } from '../payments/sui-subscription-capture.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

// ── Charge Processor ──
// Shared by both the initial charge and retry workers.

async function processCharge(subscriptionId: string, logger: Logger) {
  const db = getDatabaseClient();

  // ── 1. Load subscription with all required relations ──
  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      app: {
        include: {
          appChains: true,
        },
      },
      productPlan: true,
      productPlanPrice: true,
      customerAccount: true,
      customerWallet: true,
    },
  });

  if (!sub) {
    logger.warn('Subscription not found for charge', { subscriptionId });
    return;
  }

  // Only process ACTIVE or PAST_DUE subscriptions
  if (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE') {
    logger.info('Skipping charge for subscription not in chargeable status', {
      subscriptionId,
      status: sub.status,
    });
    return;
  }

  // Must have authorization details
  if (!sub.authorizationChainId || !sub.authorizationTokenKey || !sub.customerWallet) {
    await handleChargeFailure(subscriptionId, 'Missing authorization details', logger);
    return;
  }

  const chainId = sub.authorizationChainId;
  const tokenKey = sub.authorizationTokenKey;

  // ── 2. Load token details ──
  const token = await db.supportedToken.findFirst({
    where: { tokenKey, chainId, isEnabled: true },
  });

  if (!token) {
    await handleChargeFailure(subscriptionId, `Token ${tokenKey} not found or disabled`, logger);
    return;
  }

  // ── 3. Get current price and compute token amount ──
  const price = sub.productPlanPrice;
  const fiatAmount = Number(price.amount);
  const fiatCurrency = price.currency || 'USD';

  let currentPrice: Awaited<ReturnType<typeof priceService.getPrice>>;
  try {
    currentPrice = await priceService.getPrice(token.symbol, logger, fiatCurrency);
  } catch (err) {
    await handleChargeFailure(subscriptionId, `Price fetch failed: ${String(err)}`, logger);
    return;
  }

  const tokenAmountStr = priceService.convertFiatToToken(fiatAmount, currentPrice.priceFiat);
  const tokenAmountRaw = parseUnits(tokenAmountStr, token.decimals);

  // ── 4. Pre-flight: check allowance & balance on-chain ──
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    await handleChargeFailure(subscriptionId, `No escrow on chain ${chainId}`, logger);
    return;
  }

  const walletAddress = sub.customerWallet.walletAddress;

  if (chain.chainType === ChainType.SOLANA && isNativeToken(token.contractAddress)) {
    await handleChargeFailure(
      subscriptionId,
      'Automated subscription renewals are not available for native SOL. Subscribe with an SPL token, or pay one-time checkouts with native SOL.',
      logger,
    );
    return;
  }

  if (chain.chainType === ChainType.SUI && isNativeToken(token.contractAddress)) {
    await handleChargeFailure(
      subscriptionId,
      'Automated subscription renewals are not available for native SUI. Subscribe with a Sui coin token.',
      logger,
    );
    return;
  }

  const isSuiCoin = chain.chainType === ChainType.SUI;
  const isSolanaSpl = chain.chainType === ChainType.SOLANA && !isNativeToken(token.contractAddress);

  if (isSuiCoin) {
    const merchantAddress = resolveSettlementAddress(sub);
    let suiPreflight: Awaited<ReturnType<typeof checkSuiSubscriptionPoolAndBalance>>;
    try {
      suiPreflight = await checkSuiSubscriptionPoolAndBalance(
        {
          rpcUrl: chain.rpcUrl,
          chainId,
          escrowAddress: chain.escrowAddress,
          escrowConfigObjectId: chain.escrowConfigObjectId,
          paymentRegistryObjectId: chain.paymentRegistryObjectId,
          walletRegistryObjectId: chain.walletRegistryObjectId,
        },
        token.contractAddress,
        walletAddress,
        merchantAddress,
        tokenAmountRaw,
      );
    } catch (err) {
      await handleChargeFailure(subscriptionId, `Pre-flight RPC error: ${String(err)}`, logger);
      return;
    }
    if (!suiPreflight.ok) {
      logger.warn('Pre-flight check failed (Sui NodeRailsWallet)', {
        subscriptionId,
        reason: suiPreflight.reason,
        allowance: suiPreflight.allowance?.toString(),
        required: suiPreflight.requiredAmount?.toString(),
      });
      await handleChargeFailure(subscriptionId, `Pre-flight: ${suiPreflight.reason}`, logger);
      return;
    }
  } else if (!isSolanaSpl) {
    let evmPreflight: Awaited<ReturnType<typeof checkAllowanceAndBalance>>;
    try {
      evmPreflight = await checkAllowanceAndBalance(
        chainId,
        token.contractAddress,
        walletAddress,
        chain.escrowAddress,
        tokenAmountRaw,
      );
    } catch (err) {
      await handleChargeFailure(
        subscriptionId,
        `Pre-flight RPC error: ${String(err)}`,
        logger,
      );
      return;
    }

    if (!evmPreflight.ok) {
      logger.warn('Pre-flight check failed', {
        subscriptionId,
        reason: evmPreflight.reason,
        allowance: evmPreflight.allowance?.toString(),
        balance: evmPreflight.balance?.toString(),
        required: evmPreflight.requiredAmount?.toString(),
      });
      await handleChargeFailure(subscriptionId, `Pre-flight: ${evmPreflight.reason}`, logger);
      return;
    }
  }

  // ── 5. Create invoice for this billing cycle ──
  const periodStart = sub.currentPeriodStart ?? new Date();
  const periodEnd = sub.currentPeriodEnd ?? new Date();

  let invoice: Awaited<ReturnType<typeof invoiceService.createInvoice>>;
  try {
    invoice = await invoiceService.createInvoice({
      appId: sub.appId,
      merchantId: sub.app.merchantId,
      customerAccountId: sub.customerAccountId,
      subscriptionId: sub.id,
      currency: price.currency,
      periodStart,
      periodEnd,
      taxRateId: sub.productPlan.taxRateId ?? undefined,
      items: [
        {
          description: `${sub.productPlan.name} - ${price.nickname ?? price.billingInterval}`,
          amount: String(fiatAmount),
          currency: price.currency,
          quantity: 1,
          productPlanId: sub.productPlanId,
          productPlanPriceId: sub.productPlanPriceId,
        },
      ],
    });
  } catch (err) {
    await handleChargeFailure(subscriptionId, `Invoice creation failed: ${String(err)}`, logger);
    return;
  }

  // Mark invoice as OPEN
  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: 'OPEN' },
  });

  // Use invoice total (includes tax if applicable) for the actual charge amount
  const chargeAmount = Number(invoice.total);

  // If tax changed the total, recompute the crypto amount
  let effectiveTokenAmountRaw = tokenAmountRaw;
  if (chargeAmount !== fiatAmount) {
    const chargeTokenStr = priceService.convertFiatToToken(chargeAmount, currentPrice.priceFiat);
    effectiveTokenAmountRaw = parseUnits(chargeTokenStr, token.decimals);
  }

  if (isSolanaSpl) {
    let splPreflight: Awaited<ReturnType<typeof checkSolanaSplDelegateAndBalance>>;
    try {
      splPreflight = await checkSolanaSplDelegateAndBalance(
        solanaRpcForChain(chain),
        chain.escrowAddress,
        token.contractAddress,
        walletAddress,
        effectiveTokenAmountRaw,
      );
    } catch (err) {
      await handleChargeFailure(subscriptionId, `Pre-flight RPC error: ${String(err)}`, logger);
      return;
    }
    if (!splPreflight.ok) {
      logger.warn('Pre-flight check failed (Solana SPL)', {
        subscriptionId,
        reason: splPreflight.reason,
        allowance: splPreflight.allowance?.toString(),
        balance: splPreflight.balance?.toString(),
        required: splPreflight.requiredAmount?.toString(),
      });
      await handleChargeFailure(subscriptionId, `Pre-flight: ${splPreflight.reason}`, logger);
      return;
    }
  }

  // ── 6. Create PaymentIntent for the capture ──
  const timelockConfig = await getEffectiveTimelockConfig(sub.app.merchantId);
  const feeBps = await getEffectiveFeeBps(sub.app.merchantId);
  const expiresAt = new Date(Date.now() + PAYMENT_CONFIG.INTENT_EXPIRY_SEC * 1000);

  const intent = await db.paymentIntent.create({
    data: {
      appId: sub.appId,
      customerAccountId: sub.customerAccountId,
      amount: chargeAmount,
      currency: price.currency,
      allowedChains: [chainId],
      allowedTokens: [tokenKey],
      captureMode: 'AUTOMATIC',
      timelockDuration: timelockConfig.settlementSeconds,
      disputeStartDuration: timelockConfig.disputeStartSeconds,
      sourceType: 'SUBSCRIPTION',
      sourceId: sub.id,
      expiresAt,
      authorizationMethod: sub.authorizationMethod ?? 'NATIVE',
      authorizationChainId: chainId,
      authorizationTokenKey: tokenKey,
      authorizationWalletAddress: walletAddress,
      authorizedAt: new Date(),
      cryptoAmount: effectiveTokenAmountRaw.toString(),
      cryptoTokenKey: tokenKey,
      cryptoTokenDecimals: token.decimals,
      exchangeRate: String(currentPrice.priceUsd),
      platformFeeBps: feeBps,
      status: 'AUTHORIZED',
    },
  });

  // Link invoice directly to this payment intent
  await db.invoice.update({
    where: { id: invoice.id },
    data: { paymentIntentId: intent.id },
  });

  // Single checkout session — invoice is the billing entity, subscription is just the origin
  const session = await db.checkoutSession.create({
    data: {
      appId: sub.appId,
      customerAccountId: sub.customerAccountId,
      mode: 'SUBSCRIPTION',
      sourceType: 'INVOICE',
      sourceId: invoice.id,
      amount: chargeAmount,
      currency: price.currency,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      taxDescription: invoice.taxRate ? `${invoice.taxRate.displayName} (${Number(invoice.taxRate.percentage)}%)` : null,
      allowedChains: [chainId] as any,
      allowedTokens: [tokenKey] as any,
      successUrl: '',
      cancelUrl: '',
      expiresAt,
      status: 'COMPLETE',
      paymentIntentId: intent.id,
      completedAt: new Date(),
    },
  });

  logger.info('Created invoice and payment intent for subscription charge', {
    subscriptionId,
    invoiceId: invoice.id,
    intentId: intent.id,
    tokenAmount: effectiveTokenAmountRaw.toString(),
    fiatAmount: chargeAmount,
    taxAmount: Number(invoice.taxAmount),
    token: token.symbol,
  });

  // ── 7. Submit capture via MTXM ──
  try {
    const merchantAddress = resolveSettlementAddress(sub);
    const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);

    if (chain.chainType === ChainType.SUI) {
      const txResult = await submitSuiSubscriptionCaptureMtxm(mtxm, {
        intentId: intent.id,
        chain: {
          rpcUrl: chain.rpcUrl,
          chainId,
          escrowAddress: chain.escrowAddress,
          escrowConfigObjectId: chain.escrowConfigObjectId,
          paymentRegistryObjectId: chain.paymentRegistryObjectId,
          walletRegistryObjectId: chain.walletRegistryObjectId,
          mtxmChainDbId: mtxmChainId,
        },
        payerWallet: walletAddress,
        merchantWallet: merchantAddress,
        tokenContractAddress: token.contractAddress,
        amountRaw: effectiveTokenAmountRaw,
        feeBps,
        disputeStartSeconds: timelockConfig.disputeStartSeconds,
        settlementSeconds: timelockConfig.settlementSeconds,
        logger,
      });

      await db.transaction.create({
        data: {
          paymentIntentId: intent.id,
          mtxmTxId: txResult.id,
          txHash: txResult.txHash ?? null,
          chain: String(chainId),
          type: 'CAPTURE',
          status: 'PENDING',
        },
      });

      await db.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'CAPTURING',
          capturedAt: new Date(),
          captureTxHash: txResult.txHash ?? null,
        },
      });

      logger.info('Subscription charge capture submitted (Sui wallet)', {
        subscriptionId,
        intentId: intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash,
      });
      return;
    }

    if (chain.chainType === ChainType.SOLANA) {
      const txResult = await submitSolanaSplCaptureMtxm(mtxm, {
        intentId: intent.id,
        escrowProgramId: chain.escrowAddress,
        payerWallet: walletAddress,
        merchantWallet: merchantAddress,
        mint: token.contractAddress,
        amountRaw: effectiveTokenAmountRaw,
        feeBps,
        disputeStartSeconds: timelockConfig.disputeStartSeconds,
        settlementSeconds: timelockConfig.settlementSeconds,
        mtxmChainId,
        solanaChainId: chainId,
        rpcUrl: solanaRpcForChain(chain),
        logger,
      });

      await db.transaction.create({
        data: {
          paymentIntentId: intent.id,
          mtxmTxId: txResult.id,
          txHash: txResult.txHash ?? null,
          chain: String(chainId),
          type: 'CAPTURE',
          status: 'PENDING',
        },
      });

      await db.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'CAPTURING',
          capturedAt: new Date(),
          captureTxHash: txResult.txHash ?? null,
        },
      });

      logger.info('Subscription charge capture submitted (Solana SPL)', {
        subscriptionId,
        intentId: intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash,
      });
      return;
    }

    const paymentIntentId = uuidToBytes32(intent.id);
    const escrow = chain.escrowAddress as Address;
    const merchant = merchantAddress as Address;
    const payer = walletAddress as Address;
    const tokenAddr = token.contractAddress as Address;
    const amount = effectiveTokenAmountRaw;

    const capturedAt = Math.floor(Date.now() / 1000);
    const timelocks = packTimelocks(capturedAt, timelockConfig.disputeStartSeconds, timelockConfig.settlementSeconds);
    const nonce = keccak256(encodePacked(['bytes32', 'string'], [paymentIntentId, 'erc20']));

    // Use zero permit (we rely on prior ERC20 approve / allowance)
    const permitData: PermitData = {
      amount: 0n,
      deadline: 0n,
      v: 0,
      r: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      s: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    };

    // Build EIP-712 typed data for the NodeRails backend signature
    const typedData = buildCaptureERC20TypedData(
      { paymentIntentId, merchant, token: tokenAddr, amount, payer, feeBps, timelocks, nonce },
      chainId,
      escrow,
    );

    const sigResult = await mtxm.signTypedData({
      chainId: String(chainId),
      domain: typedData.domain,
      types: typedData.types,
      value: serializeBigInts(typedData.message),
    });

    const calldata = encodeCaptureERC20({
      paymentIntentId,
      merchant,
      token: tokenAddr,
      amount,
      payer,
      feeBps,
      timelocks,
      permitData,
      noderailsSignature: sigResult.signature as Hex,
    });

    const txResult = await mtxm.sendTransaction({
      chainId: String(chainId),
      to: chain.escrowAddress,
      data: calldata,
    });

    // Record the capture transaction
    await db.transaction.create({
      data: {
        paymentIntentId: intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash ?? null,
        chain: String(chainId),
        type: 'CAPTURE',
        status: 'PENDING',
      },
    });

    await db.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'CAPTURING',
        capturedAt: new Date(),
        captureTxHash: txResult.txHash ?? null,
      },
    });

    logger.info('Subscription charge capture submitted', {
      subscriptionId,
      intentId: intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash,
    });

    // Note: The actual period advancement happens when the indexer confirms
    // the PaymentCaptured event → markInvoicePaidIfApplicable → hooks
    // subscription activation/renewal logic (ingest.service.ts).
  } catch (err) {
    // Capture submission failed — mark intent as CAPTURE_FAILED
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'CAPTURE_FAILED' },
    });

    await handleChargeFailure(
      subscriptionId,
      `Capture submission failed: ${String(err)}`,
      logger,
    );
  }
}

// ── Worker Startup ──

export function startSubscriptionWorkers(logger: Logger) {
  configureQueue({ redisUrl: env.REDIS_URL });

  // ── Charge Worker ──
  // Fires at the end of each billing period
  const chargeWorker = createWorker<SubscriptionChargeJob>(
    QUEUE_NAMES.SUBSCRIPTION_PROCESS_CHARGE,
    async (job) => {
      logger.info('Processing subscription charge', {
        jobId: job.id,
        subscriptionId: job.data.subscriptionId,
        periodEnd: job.data.periodEnd,
      });
      await processCharge(job.data.subscriptionId, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  // ── Retry Worker ──
  // Fires after a configurable delay when a charge fails
  const retryWorker = createWorker<SubscriptionRetryJob>(
    QUEUE_NAMES.SUBSCRIPTION_RETRY_CHARGE,
    async (job) => {
      logger.info('Processing subscription retry charge', {
        jobId: job.id,
        subscriptionId: job.data.subscriptionId,
        attemptNumber: job.data.attemptNumber,
      });
      await processCharge(job.data.subscriptionId, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  // ── Grace Period Worker ──
  // Fires after grace period expires to cancel the subscription
  const gracePeriodWorker = createWorker<SubscriptionGracePeriodJob>(
    QUEUE_NAMES.SUBSCRIPTION_GRACE_PERIOD,
    async (job) => {
      logger.info('Processing subscription grace period expiry', {
        jobId: job.id,
        subscriptionId: job.data.subscriptionId,
      });
      await handleGracePeriodExpiry(job.data.subscriptionId, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  logger.info('Subscription workers started', {
    queues: [
      QUEUE_NAMES.SUBSCRIPTION_PROCESS_CHARGE,
      QUEUE_NAMES.SUBSCRIPTION_RETRY_CHARGE,
      QUEUE_NAMES.SUBSCRIPTION_GRACE_PERIOD,
    ],
    concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY,
  });

  return { chargeWorker, retryWorker, gracePeriodWorker };
}

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveSettlementAddress(sub: any): string {
  // Use chain-specific settlement address, fallback to app receiving wallet
  const appChain = sub.app.appChains?.find(
    (ac: any) => ac.chainId === sub.authorizationChainId,
  );
  const address = appChain?.settlementAddress ?? sub.app.receivingWallet;
  if (!address) {
    throw new Error(`No settlement address for app ${sub.appId} on chain ${sub.authorizationChainId}`);
  }
  return address;
}

function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}
