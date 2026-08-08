import type {
  AllowedChains,
  AllowedTokens,
  Metadata,
  PaginationParams,
  SubscriptionStatus,
} from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface Subscription {
  id: string;
  appId: string;
  customerAccountId: string;
  productPlanId: string;
  productPlanPriceId: string;
  status: SubscriptionStatus;
  customerWalletId: string | null;
  authorizationMethod: string | null;
  authorizationChainId: number | null;
  authorizationTokenKey: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingCycleAnchor: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAt: string | null;
  cancelledAt: string | null;
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  pastDueSince: string | null;
  allowedChains: AllowedChains;
  allowedTokens: AllowedTokens;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface SubscriptionCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  customerAccountId: string;
  productPlanId: string;
  productPlanPriceId: string;
  allowedChains?: AllowedChains;
  allowedTokens?: AllowedTokens;
  metadata?: Metadata;
}

export interface SubscriptionCancelParams {
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionListParams extends PaginationParams {
  appId?: string;
  status?: SubscriptionStatus;
}
