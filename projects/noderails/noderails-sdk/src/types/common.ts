// ─── Shared / Common Types ───────────────────────────────────────────

export type Metadata = Record<string, unknown>;

/** `"ALL"` or chain ids: EVM numeric chain id, or Solana cluster `101` / `102` / `103`. */
export type AllowedChains = "ALL" | number[];

/** `"ALL"` or token keys `SYMBOL-chainId` (e.g. `ETH-1`, `SOL-103`, `USDC-103`). */
export type AllowedTokens = "ALL" | string[];

// ─── Enums ───────────────────────────────────────────────────────────

export type PaymentStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "CAPTURING"
  | "CAPTURED"
  | "SETTLED"
  | "DISPUTED"
  | "DISPUTE_RESOLVED"
  | "DISPUTE_LOST"
  | "REFUNDED"
  | "CANCELLED"
  | "EXPIRED"
  | "CAPTURE_FAILED"
  | "PAST_DUE";

export type CheckoutSessionStatus = "OPEN" | "COMPLETE" | "EXPIRED";

export type CheckoutMode = "PAYMENT" | "SUBSCRIPTION";

export type InvoiceStatus =
  | "DRAFT"
  | "OPEN"
  | "PAID"
  | "PAST_DUE"
  | "VOID"
  | "UNCOLLECTIBLE";

export type SubscriptionStatus =
  | "CREATED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCELLED";

export type PlanType = "ONE_TIME" | "SUBSCRIPTION";

export type BillingInterval = "MINUTE" | "DAY" | "WEEK" | "MONTH" | "YEAR";

export type CaptureMode = "AUTOMATIC" | "MANUAL";

export type AuthorizationMethod = "NATIVE" | "PERMIT" | "EIP7702";

export type PaymentSourceType =
  | "CHECKOUT_SESSION"
  | "PAYMENT_LINK"
  | "INVOICE"
  | "SUBSCRIPTION"
  | "API";

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

// ─── Webhook Events ──────────────────────────────────────────────────

export type WebhookEvent =
  | "payment.created"
  | "payment.authorized"
  | "payment.captured"
  | "payment.settled"
  | "payment.disputed"
  | "payment.refunded"
  | "dispute.created"
  | "dispute.resolved"
  | "payout.executed"
  | "payout.failed"
  | "subscription.created"
  | "subscription.activated"
  | "subscription.renewed"
  | "subscription.payment_failed"
  | "subscription.past_due"
  | "subscription.cancelled"
  | "subscription.paused"
  | "subscription.resumed";

// ─── Pagination ──────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Cursor-based pagination ─────────────────────────────────────────

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}
