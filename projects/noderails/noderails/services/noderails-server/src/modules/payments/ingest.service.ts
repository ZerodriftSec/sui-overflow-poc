import { getDatabaseClient } from '@noderails/database';
import { verifyMtxmWebhook, type MtxmWebhookPayload } from '@noderails/mtxm-client';
import { verifyIndexerWebhook, type IndexerWebhookPayload, type IndexerEventWebhookPayload } from '@noderails/indexer-client';
import { QUEUE_NAMES, WEBHOOK_EVENTS } from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';
import { paymentIntentUuidFromIndexerArgs } from './crypto-utils.js';
import { createInvoice, markInvoicePaid } from '../invoices/invoice.service.js';
import { enqueueSettlementJob } from './settlement.worker.js';
import { enqueueReceiptEmail } from '../email/email.service.js';
import { getWebhookDeliveryConfig } from '../webhooks/webhook-config.service.js';
import { enqueueAppWebhook } from '../webhooks/webhook.service.js';
import {
  activateSubscription,
  advanceSubscriptionPeriod,
  createSubscription as createSubscriptionFromPaymentLink,
} from '../subscriptions/subscription.service.js';

// ── Process MTXM webhook ──

export async function processMtxmWebhook(rawBody: string, signature: string, logger: Logger) {
  const valid = verifyMtxmWebhook(rawBody, signature, env.MTXM_WEBHOOK_SECRET);
  if (!valid) {
    logger.warn('Invalid MTXM webhook signature');
    return false;
  }

  const payload: MtxmWebhookPayload = JSON.parse(rawBody);
  const db = getDatabaseClient();

  // MTXM webhook uses `data.hash` for on-chain hash (may be absent before broadcast)
  // and `data.transactionId` for MTXM's internal ID (always present).
  const txHash = payload.data?.hash;
  const mtxmTxId = payload.data?.transactionId;

  // Look up our transaction record: try by on-chain hash first, fall back to MTXM ID
  let transaction = txHash
    ? await db.transaction.findUnique({
        where: { txHash },
        include: { paymentIntent: true },
      })
    : null;

  if (!transaction && mtxmTxId) {
    transaction = await db.transaction.findUnique({
      where: { mtxmTxId },
      include: { paymentIntent: true },
    });
  }

  // Sui execute-sponsored sends intentId in metadata; fall back when mtxmTxId wasn't stored yet.
  if (!transaction) {
    const intentId = payload.data?.metadata?.intentId;
    if (typeof intentId === 'string' && intentId.length > 0) {
      transaction = await db.transaction.findFirst({
        where: {
          paymentIntentId: intentId,
          type: 'CAPTURE',
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { paymentIntent: true },
      });
      if (transaction && mtxmTxId && !transaction.mtxmTxId) {
        await db.transaction.update({
          where: { id: transaction.id },
          data: { mtxmTxId },
        });
        transaction = { ...transaction, mtxmTxId };
      }
    }
  }

  if (!transaction) {
    logger.warn('Transaction not found for MTXM webhook', { txHash, mtxmTxId, event: payload.event });
    return true;
  }

  // Reconcile on-chain hash from MTXM (may differ from execute-sponsored digest format).
  if (txHash && transaction.txHash !== txHash) {
    await db.transaction.update({
      where: { id: transaction.id },
      data: { txHash },
    });
    if (transaction.paymentIntentId) {
      await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: { captureTxHash: txHash },
      });
    }
  }

  const event = payload.event;
  let newStatus: string | undefined;

  if (event === 'tx.confirmed') {
    newStatus = 'CONFIRMED';
  } else if (event === 'tx.failed' || event === 'tx.cancelled') {
    newStatus = 'FAILED';
  }

  if (newStatus) {
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus as any,
        confirmedAt: newStatus === 'CONFIRMED' ? new Date() : undefined,
        error: event === 'tx.failed' ? 'Transaction failed on-chain' : undefined,
      },
    });

    if (transaction.type === 'SETTLE' && newStatus === 'CONFIRMED' && transaction.paymentIntentId) {
      await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: { status: 'SETTLED', settledAt: new Date() },
      });
      await enqueueMerchantWebhook(transaction.paymentIntentId, WEBHOOK_EVENTS.PAYMENT_SETTLED);
    }

    if (transaction.type === 'CAPTURE' && newStatus === 'CONFIRMED' && transaction.paymentIntentId) {
      const capturedIntent = await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: { status: 'CAPTURED', capturedAt: new Date() },
        select: { id: true, timelockDuration: true },
      });
      await markInvoicePaidIfApplicable(transaction.paymentIntentId, logger);
      await enqueueMerchantWebhook(transaction.paymentIntentId, WEBHOOK_EVENTS.PAYMENT_CAPTURED);

      // Send receipt email to customer
      await enqueueReceiptEmail(capturedIntent.id).catch((err) =>
        logger.error('Failed to enqueue receipt email', { error: String(err), paymentIntentId: capturedIntent.id }),
      );

      // Schedule auto-settlement after timelock expires
      await enqueueSettlementJob(capturedIntent.id, capturedIntent.timelockDuration, logger);
    }

    if (transaction.type === 'CAPTURE' && newStatus === 'FAILED' && transaction.paymentIntentId) {
      await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: { status: 'CAPTURE_FAILED', captureAttempts: { increment: 1 } },
      });
    }

    if (transaction.type === 'REFUND' && newStatus === 'CONFIRMED' && transaction.paymentIntentId) {
      await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundTxHash: txHash ?? undefined,
        },
      });
      await enqueueMerchantWebhook(transaction.paymentIntentId, WEBHOOK_EVENTS.PAYMENT_REFUNDED);
    }

    if (transaction.type === 'REFUND' && newStatus === 'FAILED' && transaction.paymentIntentId) {
      // Refund tx failed — revert intent back to CAPTURED so merchant can retry
      logger.warn('Refund transaction failed on-chain', { paymentIntentId: transaction.paymentIntentId, txHash });
    }

    if (transaction.type === 'DISPUTE_INITIATE' && newStatus === 'CONFIRMED' && transaction.paymentIntentId) {
      // initiateDispute() confirmed on-chain — mark PI as DISPUTED
      await db.paymentIntent.update({
        where: { id: transaction.paymentIntentId },
        data: { status: 'DISPUTED' },
      });
      const dispute = await db.dispute.findFirst({
        where: { paymentIntentId: transaction.paymentIntentId },
        include: { paymentIntent: { include: { app: { select: { id: true } } } } },
      });
      if (dispute) {
        await enqueueAppWebhook(dispute.paymentIntent.app.id, WEBHOOK_EVENTS.DISPUTE_CREATED, {
          disputeId: dispute.id,
          paymentIntentId: transaction.paymentIntentId,
          reason: dispute.reason,
          status: 'OPEN',
          amount: dispute.paymentIntent.amount.toString(),
          currency: dispute.paymentIntent.currency,
          metadata: dispute.paymentIntent.metadata ?? {},
          createdAt: dispute.createdAt.toISOString(),
        });
      }
      logger.info('Dispute initiation confirmed on-chain', { paymentIntentId: transaction.paymentIntentId, txHash });
    }

    if (transaction.type === 'DISPUTE_INITIATE' && newStatus === 'FAILED' && transaction.paymentIntentId) {
      // initiateDispute() tx failed — delete the pending dispute record so customer can try again
      await db.dispute.deleteMany({ where: { paymentIntentId: transaction.paymentIntentId, status: 'OPEN' } });
      logger.warn('Dispute initiation tx failed — removed pending dispute', { paymentIntentId: transaction.paymentIntentId });
    }

    if (transaction.type === 'DISPUTE' && newStatus === 'CONFIRMED' && transaction.paymentIntentId) {
      // Resolution tx confirmed — finalize dispute, update PI, send email + webhook
      const dispute = await db.dispute.findFirst({
        where: { paymentIntentId: transaction.paymentIntentId, status: 'RESOLVING' },
        include: {
          paymentIntent: {
            include: {
              app: { select: { id: true } },
              customerAccount: { select: { email: true, name: true } },
            },
          },
        },
      });

      if (dispute) {
        // Recover the winner from evidence metadata
        let winner: 'MERCHANT' | 'CUSTOMER' = 'MERCHANT';
        try {
          const meta = JSON.parse(dispute.evidence ?? '{}');
          if (meta.winner === 'CUSTOMER') winner = 'CUSTOMER';
        } catch {}

        const resolvedStatus = winner === 'MERCHANT' ? 'RESOLVED_MERCHANT' : 'RESOLVED_PAYER';
        const piStatus = winner === 'MERCHANT' ? 'DISPUTE_RESOLVED' : 'DISPUTE_LOST';

        await db.$transaction([
          db.dispute.update({
            where: { id: dispute.id },
            data: { status: resolvedStatus as any, resolvedAt: new Date(), resolvedBy: 'admin' },
          }),
          db.paymentIntent.update({
            where: { id: transaction.paymentIntentId },
            data: { status: piStatus as any },
          }),
        ]);

        // Webhook to merchant app
        await enqueueAppWebhook(dispute.paymentIntent.app.id, WEBHOOK_EVENTS.DISPUTE_RESOLVED, {
          disputeId: dispute.id,
          paymentIntentId: transaction.paymentIntentId,
          winner,
          status: resolvedStatus,
          amount: dispute.paymentIntent.amount.toString(),
          currency: dispute.paymentIntent.currency,
          metadata: dispute.paymentIntent.metadata ?? {},
          resolvedAt: new Date().toISOString(),
        });

        // Resolution email to customer
        if (dispute.paymentIntent.customerAccount?.email) {
          const emailQueue = queueRegistry.getOrCreateQueue<EmailSendJob>(QUEUE_NAMES.EMAIL_SEND);
          await emailQueue.add(`dispute-resolved-${dispute.id}`, {
            templateId: 'dispute-resolved',
            to: dispute.paymentIntent.customerAccount.email,
            variables: {
              disputeId: dispute.id,
              paymentIntentId: transaction.paymentIntentId,
              winner,
              resolvedAt: new Date().toISOString(),
              amount: dispute.paymentIntent.amount.toString(),
              currency: dispute.paymentIntent.currency,
            },
          });
        }

        logger.info('Dispute resolution confirmed on-chain', {
          disputeId: dispute.id,
          winner,
          txHash,
        });
      }
    }

    if (transaction.type === 'DISPUTE' && newStatus === 'FAILED' && transaction.paymentIntentId) {
      // Resolution tx failed — revert dispute back to OPEN so admin can retry
      const dispute = await db.dispute.findFirst({
        where: { paymentIntentId: transaction.paymentIntentId, status: 'RESOLVING' },
      });
      if (dispute) {
        await db.dispute.update({
          where: { id: dispute.id },
          data: { status: 'OPEN' },
        });
        logger.warn('Dispute resolution tx failed — reverted dispute to OPEN', {
          disputeId: dispute.id,
          mtxmTxId,
          txHash,
        });
      }
    }
  }

  logger.info('Processed MTXM webhook', { event, txHash, mtxmTxId, newStatus });
  return true;
}

// ── Process Indexer webhook ──

/** Valid PaymentIntent status transitions triggered by on-chain events */
const EVENT_STATUS_MAP: Record<string, { targetStatus: string; validFromStatuses: string[]; webhookEvent: string; timestampField?: string }> = {
  PaymentCaptured: {
    targetStatus: 'CAPTURED',
    validFromStatuses: ['CAPTURING', 'AUTHORIZED'],
    webhookEvent: WEBHOOK_EVENTS.PAYMENT_CAPTURED,
    timestampField: 'capturedAt',
  },
  PaymentSettled: {
    targetStatus: 'SETTLED',
    validFromStatuses: ['CAPTURED'],
    webhookEvent: WEBHOOK_EVENTS.PAYMENT_SETTLED,
    timestampField: 'settledAt',
  },
  DisputeInitiated: {
    targetStatus: 'DISPUTED',
    validFromStatuses: ['CAPTURED'],
    webhookEvent: WEBHOOK_EVENTS.PAYMENT_DISPUTED,
  },
  DisputeResolved: {
    targetStatus: 'DISPUTE_RESOLVED',
    validFromStatuses: ['DISPUTED'],
    webhookEvent: WEBHOOK_EVENTS.DISPUTE_RESOLVED,
  },
  PaymentRefunded: {
    targetStatus: 'REFUNDED',
    validFromStatuses: ['CAPTURED', 'DISPUTED', 'DISPUTE_RESOLVED'],
    webhookEvent: WEBHOOK_EVENTS.PAYMENT_REFUNDED,
  },
};

/**
 * Indexer normalizes Solana deliveries to the same top-level `event` field as EVM.
 * When the payload uses instruction names (e.g. capture_native) instead of Anchor event names,
 * map them onto the same lifecycle keys as EVM contract events.
 */
function normalizeIndexerLifecycleEventName(rawName: string): string {
  if (EVENT_STATUS_MAP[rawName]) return rawName;

  const snake = rawName
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

  const solanaInstructionToEvm: Record<string, keyof typeof EVENT_STATUS_MAP> = {
    capture_native: 'PaymentCaptured',
    capture_spl: 'PaymentCaptured',
    capture_payment: 'PaymentCaptured',
    settle_native: 'PaymentSettled',
    settle_spl: 'PaymentSettled',
    settle_payment: 'PaymentSettled',
    refund_native: 'PaymentRefunded',
    refund_spl: 'PaymentRefunded',
    refund_payment: 'PaymentRefunded',
    initiate_dispute: 'DisputeInitiated',
    resolve_dispute_native: 'DisputeResolved',
    resolve_dispute_spl: 'DisputeResolved',
    resolve_dispute: 'DisputeResolved',
  };

  const mapped = solanaInstructionToEvm[snake];
  return mapped ?? rawName;
}

export async function processIndexerWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  logger: Logger,
) {
  const valid = verifyIndexerWebhook(rawBody, signature, timestamp, env.INDEXER_WEBHOOK_SECRET);
  if (!valid) {
    logger.warn('Invalid Indexer webhook signature');
    return false;
  }

  const payload: IndexerWebhookPayload = JSON.parse(rawBody);

  // Skip native transfers — only process contract events
  if ('type' in payload && payload.type === 'native_transfer') {
    logger.info('Skipping native transfer webhook');
    return true;
  }

  const event = payload as IndexerEventWebhookPayload;
  await processIndexerEvent(event, logger);

  logger.info('Processed Indexer webhook', { event: event.event, txHash: event.transactionHash });
  return true;
}

async function processIndexerEvent(event: IndexerEventWebhookPayload, logger: Logger) {
  const db = getDatabaseClient();
  const canonicalEvent = normalizeIndexerLifecycleEventName(event.event);
  const eventConfig = EVENT_STATUS_MAP[canonicalEvent];

  if (!eventConfig) {
    logger.info('Ignoring unhandled indexer event', { eventName: event.event, canonicalEvent });
    return;
  }

  // ── Step 1: Extract and validate paymentIntentId from on-chain args ──
  // EVM: hex bytes32 string. Solana Anchor: often number[32] JSON array under payment_intent_id.

  const args = event.args as Record<string, unknown> | undefined;
  const paymentIntentUuid = paymentIntentUuidFromIndexerArgs(args);
  if (!paymentIntentUuid) {
    logger.warn('Indexer event missing or invalid paymentIntentId in args', {
      eventName: event.event,
      canonicalEvent,
      txHash: event.transactionHash,
      args: event.args,
    });
    return;
  }

  // ── Step 2: Look up the PaymentIntent and verify it exists ──

  const paymentIntent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentUuid },
  });

  if (!paymentIntent) {
    logger.warn('PaymentIntent not found for indexer event', {
      eventName: event.event,
      paymentIntentId: paymentIntentUuid,
      txHash: event.transactionHash,
    });
    return;
  }

  // ── Step 3: Cross-validate with Transaction record (if txHash matches) ──

  const transaction = await db.transaction.findUnique({
    where: { txHash: event.transactionHash },
  });

  if (transaction) {
    // If we have a matching transaction, verify the paymentIntentId matches
    if (transaction.paymentIntentId && transaction.paymentIntentId !== paymentIntentUuid) {
      logger.error('PaymentIntentId mismatch between indexer event and transaction record', {
        eventName: event.event,
        txHash: event.transactionHash,
        onChainPaymentIntentId: paymentIntentUuid,
        transactionPaymentIntentId: transaction.paymentIntentId,
      });
      return;
    }

    // Update transaction with block number from the indexer event
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        blockNumber: event.blockNumber,
        // If MTXM hasn't confirmed yet but indexer sees it on-chain, mark confirmed
        ...(transaction.status === 'PENDING' ? {
          status: 'CONFIRMED' as any,
          confirmedAt: new Date(),
        } : {}),
      },
    });
  } else {
    logger.info('No matching transaction record for indexer event txHash (may be external)', {
      eventName: event.event,
      txHash: event.transactionHash,
      paymentIntentId: paymentIntentUuid,
    });
  }

  // ── Step 4: Validate status transition ──

  const currentStatus = paymentIntent.status;
  if (!eventConfig.validFromStatuses.includes(currentStatus)) {
    // Check if we're already in the target status (duplicate/replay) — safe to skip
    if (currentStatus === eventConfig.targetStatus) {
      logger.info('PaymentIntent already in target status, skipping update (likely duplicate)', {
        eventName: event.event,
        paymentIntentId: paymentIntentUuid,
        currentStatus,
        targetStatus: eventConfig.targetStatus,
      });
      // Still enqueue the merchant webhook for idempotent delivery
      await enqueueMerchantWebhook(paymentIntentUuid, eventConfig.webhookEvent);
      return;
    }

    logger.warn('Invalid status transition for indexer event', {
      eventName: event.event,
      paymentIntentId: paymentIntentUuid,
      currentStatus,
      targetStatus: eventConfig.targetStatus,
      validFromStatuses: eventConfig.validFromStatuses,
    });
    return;
  }

  // ── Step 5: Update PaymentIntent status ──

  const updateData: Record<string, any> = {
    status: eventConfig.targetStatus,
  };

  if (eventConfig.timestampField) {
    updateData[eventConfig.timestampField] = new Date();
  }

  // For PaymentCaptured, store the capture txHash if not already set
  if (canonicalEvent === 'PaymentCaptured' && !paymentIntent.captureTxHash) {
    updateData.captureTxHash = event.transactionHash;
  }

  await db.paymentIntent.update({
    where: { id: paymentIntentUuid },
    data: updateData,
  });

  // If a capture was confirmed, mark the related invoice as paid and schedule settlement
  if (canonicalEvent === 'PaymentCaptured') {
    await markInvoicePaidIfApplicable(paymentIntentUuid, logger);

    // Send receipt email to customer
    await enqueueReceiptEmail(paymentIntentUuid).catch((err) =>
      logger.error('Failed to enqueue receipt email', { error: String(err), paymentIntentId: paymentIntentUuid }),
    );

    // Schedule auto-settlement after timelock expires
    const capturedIntent = await db.paymentIntent.findUnique({
      where: { id: paymentIntentUuid },
      select: { timelockDuration: true },
    });
    if (capturedIntent) {
      await enqueueSettlementJob(paymentIntentUuid, capturedIntent.timelockDuration, logger);
    }
  }

  logger.info('Updated PaymentIntent status from indexer event', {
    eventName: event.event,
    paymentIntentId: paymentIntentUuid,
    previousStatus: currentStatus,
    newStatus: eventConfig.targetStatus,
    txHash: event.transactionHash,
    blockNumber: event.blockNumber,
  });

  // ── Step 6: Enqueue merchant webhook ──

  await enqueueMerchantWebhook(paymentIntentUuid, eventConfig.webhookEvent);
}

// ── Mark invoice paid when an invoice-sourced payment is captured ──

async function markInvoicePaidIfApplicable(paymentIntentId: string, logger: Logger) {
  const db = getDatabaseClient();

  // ── 1. Direct lookup: Invoice linked to PaymentIntent via paymentIntentId ──
  // Subscription charges set invoice.paymentIntentId directly.
  const directInvoice = await db.invoice.findFirst({
    where: { paymentIntentId },
    select: { id: true, subscriptionId: true, status: true },
  });

  if (directInvoice && directInvoice.status !== 'PAID') {
    try {
      await markInvoicePaid(directInvoice.id, paymentIntentId);
      logger.info('Marked invoice as paid (direct link)', {
        invoiceId: directInvoice.id,
        paymentIntentId,
      });
    } catch (err) {
      logger.error('Failed to mark invoice as paid', {
        invoiceId: directInvoice.id,
        paymentIntentId,
        error: String(err),
      });
    }

    // If subscription invoice → advance subscription period
    if (directInvoice.subscriptionId) {
      await handleSubscriptionPaymentComplete(
        directInvoice.subscriptionId,
        paymentIntentId,
        logger,
      );
    }
    return;
  }

  // ── 2. Fallback: Checkout session lookup for standalone invoice payments & initial subscriptions ──
  const session = await db.checkoutSession.findFirst({
    where: { paymentIntentId },
    select: {
      sourceType: true,
      sourceId: true,
      mode: true,
      appId: true,
      customerAccountId: true,
      allowedChains: true,
      allowedTokens: true,
      items: {
        select: { productPlanId: true, productPlanPriceId: true },
        take: 1,
      },
    },
  });

  if (!session) return;

  if (session.sourceType === 'INVOICE' && session.sourceId) {
    try {
      await markInvoicePaid(session.sourceId, paymentIntentId);
      logger.info('Marked invoice as paid (checkout session)', {
        invoiceId: session.sourceId,
        paymentIntentId,
      });

      const invoice = await db.invoice.findUnique({
        where: { id: session.sourceId },
        select: { subscriptionId: true },
      });
      if (invoice?.subscriptionId) {
        await handleSubscriptionPaymentComplete(
          invoice.subscriptionId,
          paymentIntentId,
          logger,
        );
      }
    } catch (err) {
      logger.error('Failed to mark invoice as paid', {
        invoiceId: session.sourceId,
        paymentIntentId,
        error: String(err),
      });
    }
  }

  // Handle initial subscription activation (first payment via checkout)
  if (session.sourceType === 'SUBSCRIPTION' && session.sourceId) {
    await handleSubscriptionPaymentComplete(session.sourceId, paymentIntentId, logger);
  }

  // Handle payment link with subscription plan — auto-create subscription on first payment
  // This is the Stripe-like flow: customer clicks a payment link with a subscription product,
  // pays the first period, and a subscription is automatically created and activated.
  if (session.sourceType === 'PAYMENT_LINK' && session.mode === 'SUBSCRIPTION') {
    await handlePaymentLinkSubscriptionCapture(session, paymentIntentId, logger);
  }
}

// ── Payment Link Subscription Handler ──
// When a payment link with a subscription-type product plan is captured,
// auto-create a Subscription record and activate it (mimics Stripe's payment link → subscription flow).

async function handlePaymentLinkSubscriptionCapture(
  session: {
    appId: string;
    customerAccountId: string | null;
    allowedChains: any;
    allowedTokens: any;
    items: { productPlanId: string | null; productPlanPriceId: string | null }[];
  },
  paymentIntentId: string,
  logger: Logger,
) {
  const db = getDatabaseClient();

  try {
    const item = session.items[0];
    if (!item?.productPlanId || !item.productPlanPriceId) {
      logger.warn('Payment link subscription checkout has no product plan/price in items', {
        paymentIntentId,
        appId: session.appId,
      });
      return;
    }

    if (!session.customerAccountId) {
      logger.error('No customer account on subscription payment link checkout', {
        paymentIntentId,
        appId: session.appId,
      });
      return;
    }

    // Get the app's merchantId
    const app = await db.app.findUnique({
      where: { id: session.appId },
      select: { merchantId: true },
    });
    if (!app) {
      logger.error('App not found for payment link subscription', {
        appId: session.appId,
        paymentIntentId,
      });
      return;
    }

    // Create the subscription record (status: CREATED)
    const subscription = await createSubscriptionFromPaymentLink({
      appId: session.appId,
      merchantId: app.merchantId,
      customerAccountId: session.customerAccountId,
      productPlanId: item.productPlanId,
      productPlanPriceId: item.productPlanPriceId,
      allowedChains: session.allowedChains,
      allowedTokens: session.allowedTokens,
    });

    logger.info('Auto-created subscription from payment link', {
      subscriptionId: subscription.id,
      paymentIntentId,
      productPlanId: item.productPlanId,
      customerAccountId: session.customerAccountId,
    });

    // Now trigger the same activation flow that handleSubscriptionPaymentComplete uses
    await handleSubscriptionPaymentComplete(subscription.id, paymentIntentId, logger);
  } catch (err) {
    logger.error('Failed to create subscription from payment link', {
      paymentIntentId,
      appId: session.appId,
      error: String(err),
    });
  }
}

// ── Subscription Payment Complete Handler ──
// Called when a payment for a subscription is confirmed on-chain.
// Activates the subscription (first payment) or advances to the next period (renewal).

async function handleSubscriptionPaymentComplete(
  subscriptionId: string,
  paymentIntentId: string,
  logger: Logger,
) {
  const db = getDatabaseClient();

  const sub = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: { status: true },
  });

  if (!sub) {
    logger.warn('Subscription not found for payment completion', {
      subscriptionId,
      paymentIntentId,
    });
    return;
  }

  try {
    if (sub.status === 'CREATED' || sub.status === 'TRIALING') {
      // First payment — activate the subscription
      // Get payment details from the PaymentIntent to store wallet/chain/token info
      const intent = await db.paymentIntent.findUnique({
        where: { id: paymentIntentId },
        select: {
          authorizationChainId: true,
          authorizationTokenKey: true,
          authorizationWalletAddress: true,
          authorizationMethod: true,
          authorizationTxHash: true,
        },
      });

      if (!intent?.authorizationChainId || !intent.authorizationTokenKey || !intent.authorizationWalletAddress) {
        logger.error('Missing authorization details on intent for subscription activation', {
          subscriptionId,
          paymentIntentId,
        });
        return;
      }

      // Find or create customer wallet
      const session = await db.checkoutSession.findFirst({
        where: { paymentIntentId },
        select: { customerAccountId: true },
      });

      const customerAccountId = session?.customerAccountId;
      if (!customerAccountId) {
        logger.error('No customer account linked to subscription checkout session', {
          subscriptionId,
          paymentIntentId,
        });
        return;
      }

      let wallet = await db.customerWallet.findFirst({
        where: {
          customerAccountId,
          chainId: intent.authorizationChainId,
          walletAddress: intent.authorizationWalletAddress,
        },
      });

      if (!wallet) {
        wallet = await db.customerWallet.create({
          data: {
            customerAccountId,
            chainId: intent.authorizationChainId,
            walletAddress: intent.authorizationWalletAddress,
            hasActiveAuthorization: true,
            authorizationType: intent.authorizationMethod ?? 'NATIVE',
            authorizationTxHash: intent.authorizationTxHash ?? null,
            authorizedAt: new Date(),
          },
        });
      }

      const activatedSub = await activateSubscription({
        subscriptionId,
        customerWalletId: wallet.id,
        authorizationMethod: intent.authorizationMethod ?? 'NATIVE',
        authorizationChainId: intent.authorizationChainId,
        authorizationTokenKey: intent.authorizationTokenKey,
        approvalTxHash: intent.authorizationTxHash ?? undefined,
        logger,
      });

      logger.info('Subscription activated after first payment', {
        subscriptionId,
        paymentIntentId,
      });

      // ── Create first-period invoice and mark it as paid ──
      // The initial checkout payment has already been captured, but no invoice
      // exists for the first billing period. Create one now and link it.
      try {
        const price = activatedSub.productPlanPrice;
        const fiatAmount = Number(price.amount);
        const periodStart = activatedSub.currentPeriodStart ?? new Date();
        const periodEnd = activatedSub.currentPeriodEnd ?? new Date();

        const firstInvoice = await createInvoice({
          appId: activatedSub.appId,
          merchantId: activatedSub.app.merchantId,
          customerAccountId: customerAccountId,
          subscriptionId,
          currency: price.currency,
          periodStart,
          periodEnd,
          taxRateId: activatedSub.productPlan.taxRateId ?? undefined,
          items: [
            {
              description: `${activatedSub.productPlan.name} - ${price.nickname ?? price.billingInterval} (first period)`,
              amount: String(fiatAmount),
              currency: price.currency,
              quantity: 1,
              productPlanId: activatedSub.productPlanId,
              productPlanPriceId: activatedSub.productPlanPriceId,
            },
          ],
        });

        // Mark it OPEN then PAID
        await db.invoice.update({
          where: { id: firstInvoice.id },
          data: { status: 'OPEN' },
        });
        await markInvoicePaid(firstInvoice.id, paymentIntentId);

        // Create a checkout session linking invoice → payment intent
        // so the payment is traceable from the invoice
        await db.checkoutSession.create({
          data: {
            appId: activatedSub.appId,
            customerAccountId: customerAccountId,
            mode: 'PAYMENT',
            sourceType: 'INVOICE',
            sourceId: firstInvoice.id,
            amount: fiatAmount,
            currency: price.currency,
            allowedChains: intent.authorizationChainId ? [intent.authorizationChainId] as any : [],
            allowedTokens: intent.authorizationTokenKey ? [intent.authorizationTokenKey] as any : [],
            successUrl: '',
            cancelUrl: '',
            expiresAt: new Date(Date.now() + 3600_000),
            status: 'COMPLETE',
            paymentIntentId,
            completedAt: new Date(),
          },
        });

        logger.info('Created first-period invoice for subscription', {
          subscriptionId,
          invoiceId: firstInvoice.id,
          paymentIntentId,
          amount: fiatAmount,
        });
      } catch (invoiceErr) {
        // Don't fail the activation if invoice creation fails
        logger.error('Failed to create first-period invoice', {
          subscriptionId,
          paymentIntentId,
          error: String(invoiceErr),
        });
      }
    } else if (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') {
      // Renewal payment — advance to next billing period
      await advanceSubscriptionPeriod(subscriptionId, logger);

      logger.info('Subscription renewed after payment', {
        subscriptionId,
        paymentIntentId,
      });
    }
  } catch (err) {
    logger.error('Failed to process subscription payment completion', {
      subscriptionId,
      paymentIntentId,
      error: String(err),
    });
  }
}

// ── Enqueue merchant webhook delivery ──

async function enqueueMerchantWebhook(paymentIntentId: string, event: string) {
  const db = getDatabaseClient();

  const [intent, webhookConfig] = await Promise.all([
    db.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { app: { include: { webhooks: { where: { active: true } } } } },
    }),
    getWebhookDeliveryConfig(),
  ]);

  if (!intent) return;

  const payloadData = {
    event,
    paymentIntentId,
    externalId: intent.externalId ?? null,
    appId: intent.appId,
    status: intent.status,
    amount: intent.amount.toString(),
    currency: intent.currency,
    metadata: intent.metadata ?? {},
    createdAt: intent.createdAt.toISOString(),
  };

  for (const webhook of intent.app.webhooks) {
    const subscribedEvents = webhook.events as string[];
    if (!subscribedEvents.includes(event) && !subscribedEvents.includes('*')) continue;

    // Send each webhook redundantSends times with staggered delays
    for (let i = 0; i < webhookConfig.redundantSends; i++) {
      const delivery = await db.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          paymentIntentId,
          event,
          payload: payloadData,
        },
      });

      const queue = queueRegistry.getOrCreateQueue<any>(QUEUE_NAMES.WEBHOOK_DELIVER);
      await queue.add(
        `deliver-${delivery.id}`,
        {
          deliveryId: delivery.id,
          webhookUrl: webhook.url,
          webhookSecret: webhook.secret,
          payload: delivery.payload,
          attempt: 0,
        },
        {
          delay: webhookConfig.redundantDelaysMs[i] ?? 0,
        },
      );
    }
  }
}
