import type { BillingInterval, Metadata, PaginationParams, PlanType } from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface ProductPlan {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  planType: PlanType;
  taxRateId: string | null;
  isActive: boolean;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
  prices?: ProductPlanPrice[];
}

export interface ProductPlanPrice {
  id: string;
  productPlanId: string;
  appId: string;
  amount: string;
  currency: string;
  billingInterval: BillingInterval | null;
  billingIntervalCount: number;
  trialPeriodDays: number;
  nickname: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface ProductPlanCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  planType?: PlanType;
  taxRateId?: string;
  metadata?: Metadata;
  prices: PriceCreateParams[];
}

export interface ProductPlanUpdateParams {
  name?: string;
  description?: string;
  imageUrl?: string;
  taxRateId?: string | null;
  isActive?: boolean;
  metadata?: Metadata;
}

export interface PriceCreateParams {
  amount: string;
  currency?: string;
  billingInterval?: BillingInterval;
  billingIntervalCount?: number;
  trialPeriodDays?: number;
  nickname?: string;
  sortOrder?: number;
  isDefault?: boolean;
  metadata?: Metadata;
}

export interface PriceUpdateParams {
  amount?: string;
  nickname?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isActive?: boolean;
  trialPeriodDays?: number;
}

export interface ProductPlanListParams extends PaginationParams {
  appId?: string;
  planType?: PlanType;
}
