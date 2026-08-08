import type {
  AllowedChains,
  AllowedTokens,
  AuthorizationMethod,
  CaptureMode,
  Metadata,
  PaginationParams,
  PaymentSourceType,
  PaymentStatus,
} from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface PaymentIntent {
  id: string;
  appId: string;
  customerAccountId: string | null;
  externalId: string | null;
  amount: string;
  currency: string;
  allowedChains: AllowedChains;
  allowedTokens: AllowedTokens;
  captureMode: CaptureMode;
  timelockDuration: number;
  disputeStartDuration: number;
  status: PaymentStatus;
  authorizationMethod: AuthorizationMethod | null;
  authorizationChainId: number | null;
  authorizationTokenKey: string | null;
  authorizationWalletAddress: string | null;
  authorizationTxHash: string | null;
  authorizedAt: string | null;
  cryptoAmount: string | null;
  cryptoTokenKey: string | null;
  cryptoTokenDecimals: number | null;
  exchangeRate: string | null;
  captureTxHash: string | null;
  capturedAt: string | null;
  captureAttempts: number;
  timelockEndsAt: string | null;
  settledAt: string | null;
  refundedAt: string | null;
  refundTxHash: string | null;
  refundReason: string | null;
  platformFeeBps: number | null;
  expiresAt: string | null;
  sourceType: PaymentSourceType | null;
  sourceId: string | null;
  successUrl: string | null;
  cancelUrl: string | null;
  metadata: Metadata | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface PaymentIntentCreateParams {
  customerAccountId?: string;
  externalId?: string;
  amount: string;
  currency?: string;
  allowedChains?: AllowedChains;
  allowedTokens?: AllowedTokens;
  captureMode?: CaptureMode;
  metadata?: Metadata;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}

export interface PaymentIntentListParams extends PaginationParams {
  appId?: string;
  status?: PaymentStatus;
}

export interface PaymentIntentRefundParams {
  reason: string;
}
