/**
 * Job Type Definitions
 * 
 * Define the data structures for each type of job that can be queued.
 * These types ensure type safety when adding and processing jobs.
 */

// ============ MTXM / Indexer Webhook Processing ============

/**
 * Process an incoming MTXM (Multichain Transaction Manager) webhook.
 * payment-service and payout-service both use this queue to handle
 * transaction lifecycle events coming from MTXM.
 */
export interface MtxmWebhookProcessJob {
  /** Raw JSON body from MTXM webhook POST */
  rawBody: string;

  /** HMAC-SHA256 hex signature from X-Webhook-Signature header */
  signature: string;
}

/**
 * Process an incoming Indexer webhook.
 * payment-service uses this queue to handle on-chain contract events
 * and native-transfer notifications from the Indexer.
 */
export interface IndexerWebhookProcessJob {
  /** Raw JSON body from Indexer webhook POST */
  rawBody: string;

  /** HMAC-SHA256 hex signature from X-Indexer-Signature header */
  signature: string;

  /** Unix-ms timestamp from X-Indexer-Timestamp header */
  timestamp: string;
}

// ============ Webhook Jobs ============

/**
 * Deliver a webhook
 */
export interface WebhookDeliveryJob {
  /** Webhook delivery ID */
  deliveryId: string;
  
  /** Webhook configuration ID */
  webhookId: string;
  
  /** Target URL */
  url: string;
  
  /** Event type */
  event: string;
  
  /** Payload to send */
  payload: Record<string, unknown>;
  
  /** Signing secret */
  secret: string;
  
  /** Current attempt number */
  attempt?: number;
}

// ============ Subscription Jobs ============

/**
 * Process a subscription charge
 */
export interface SubscriptionChargeJob {
  /** Subscription ID */
  subscriptionId: string;
  
  /** Billing period start */
  periodStart: string; // ISO date
  
  /** Billing period end */
  periodEnd: string; // ISO date
  
  /** Amount in USD */
  amountUsd: string;
}

/**
 * Retry a failed subscription charge
 */
export interface SubscriptionRetryJob {
  /** Subscription ID */
  subscriptionId: string;

  /** Which retry attempt this is (1-based) */
  attemptNumber: number;
}

/**
 * Check if a PAST_DUE subscription should be cancelled after grace period
 */
export interface SubscriptionGracePeriodJob {
  /** Subscription ID */
  subscriptionId: string;
}

// ============ Payout Jobs ============

/**
 * Execute a payout
 */
export interface PayoutExecuteJob {
  /** Payout intent ID */
  payoutIntentId: string;
  
  /** Merchant ID */
  merchantId: string;
  
  /** Chain to execute on */
  chain: string;
}

// ============ Payment Jobs ============

/**
 * Auto-settle a payment after timelock expires
 */
export interface PaymentAutoSettleJob {
  /** Payment intent ID */
  paymentIntentId: string;
  
  /** Expected settlement timestamp (for verification) */
  settlementAt: number;
}

// ============ Email Jobs ============

/**
 * Send an email notification
 */
export interface EmailSendJob {
  /** Email template ID */
  templateId: string;
  
  /** Recipient email */
  to: string;
  
  /** Template variables */
  variables: Record<string, unknown>;
  
  /** Optional reply-to address */
  replyTo?: string;
}

// ============ Queue Registry ============

/**
 * Queue names with descriptive naming convention
 * Format: noderails.<domain>.<action>
 * 
 * Import QUEUE_NAMES from @noderails/common for the actual string values
 */
export const QUEUE_JOB_TYPES = {
  'noderails.mtxm.process-webhook': {} as MtxmWebhookProcessJob,
  'noderails.indexer.process-webhook': {} as IndexerWebhookProcessJob,
  'noderails.webhook.deliver': {} as WebhookDeliveryJob,
  'noderails.subscription.process-charge': {} as SubscriptionChargeJob,
  'noderails.subscription.retry-charge': {} as SubscriptionRetryJob,
  'noderails.subscription.grace-period': {} as SubscriptionGracePeriodJob,
  'noderails.payout.execute': {} as PayoutExecuteJob,
  'noderails.payment.auto-settle': {} as PaymentAutoSettleJob,
  'noderails.email.send': {} as EmailSendJob,
} as const;

export type QueueNameType = keyof typeof QUEUE_JOB_TYPES;
export type QueueJobType<T extends QueueNameType> = (typeof QUEUE_JOB_TYPES)[T];
