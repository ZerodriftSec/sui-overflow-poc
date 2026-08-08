import type {
  AllowedChains,
  AllowedTokens,
  Metadata,
  PaginationParams,
} from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface PaymentLink {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  slug: string;
  amount: string | null;
  currency: string;
  productPlanId: string | null;
  productPlanPriceId: string | null;
  taxRateId: string | null;
  allowedChains: AllowedChains;
  allowedTokens: AllowedTokens;
  successUrl: string | null;
  cancelUrl: string | null;
  requireBillingDetails: boolean;
  isActive: boolean;
  usageCount: number;
  metadata: Metadata;
  paymentUrl: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface PaymentLinkCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  name: string;
  description?: string;
  slug: string;
  amount?: string;
  currency?: string;
  productPlanId?: string;
  productPlanPriceId?: string;
  allowedChains?: AllowedChains;
  allowedTokens?: AllowedTokens;
  successUrl?: string;
  cancelUrl?: string;
  requireBillingDetails?: boolean;
  metadata?: Metadata;
  taxRateId?: string;
}

export interface PaymentLinkUpdateParams {
  name?: string;
  description?: string;
  amount?: string;
  currency?: string;
  productPlanId?: string | null;
  productPlanPriceId?: string | null;
  allowedChains?: AllowedChains;
  allowedTokens?: AllowedTokens;
  successUrl?: string;
  cancelUrl?: string;
  isActive?: boolean;
  requireBillingDetails?: boolean;
  metadata?: Metadata;
  taxRateId?: string | null;
}

export interface PaymentLinkListParams extends PaginationParams {
  appId?: string;
  isActive?: boolean;
}
