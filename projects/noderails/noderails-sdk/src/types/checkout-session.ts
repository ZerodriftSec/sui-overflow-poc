import type {
  AllowedChains,
  AllowedTokens,
  CheckoutMode,
  CheckoutSessionStatus,
  Metadata,
  PaginationParams,
} from "./common";
import type { PaymentIntent } from "./payment-intent";

// ─── Response Types ──────────────────────────────────────────────────

export interface CheckoutSession {
  id: string;
  appId: string;
  customerAccountId: string | null;
  paymentIntentId: string | null;
  mode: CheckoutMode;
  status: CheckoutSessionStatus;
  sourceType: string | null;
  sourceId: string | null;
  amount: string | null;
  currency: string;
  subtotal: string | null;
  taxAmount: string | null;
  taxDescription: string | null;
  allowedChains: AllowedChains;
  allowedTokens: AllowedTokens;
  successUrl: string | null;
  cancelUrl: string | null;
  selectedPriceId: string | null;
  requireBillingDetails: boolean;
  metadata: Metadata;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: CheckoutSessionItem[];
  paymentIntent?: PaymentIntent | null;
}

export interface CheckoutSessionItem {
  id: string;
  checkoutSessionId: string;
  productPlanId: string | null;
  productPlanPriceId: string | null;
  name: string;
  description: string | null;
  amount: string | null;
  currency: string;
  quantity: number;
  isPriceOption: boolean;
  createdAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface CheckoutSessionCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  customerAccountId?: string;
  mode?: CheckoutMode;
  successUrl: string;
  cancelUrl: string;
  expiresInMinutes?: number;
  items: CheckoutSessionCreateItem[];
  metadata?: Metadata;
}

export interface CheckoutSessionCreateItem {
  productPlanId?: string;
  productPlanPriceId?: string;
  name: string;
  description?: string;
  amount?: string;
  currency?: string;
  quantity?: number;
  isPriceOption?: boolean;
}

export interface CheckoutSessionListParams extends PaginationParams {
  appId?: string;
  status?: CheckoutSessionStatus;
}
