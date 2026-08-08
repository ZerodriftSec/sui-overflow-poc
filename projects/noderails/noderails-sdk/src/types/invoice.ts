import type {
  AllowedChains,
  AllowedTokens,
  InvoiceStatus,
  Metadata,
  PaginationParams,
} from "./common";
import type { PaymentIntent } from "./payment-intent";

// ─── Response Types ──────────────────────────────────────────────────

export interface Invoice {
  id: string;
  appId: string;
  customerAccountId: string;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: string;
  taxAmount: string;
  total: string;
  currency: string;
  taxRateId: string | null;
  dueDate: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  allowedChains: AllowedChains;
  allowedTokens: AllowedTokens;
  memo: string | null;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
  items?: InvoiceItem[];
  paymentIntent?: PaymentIntent | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productPlanId: string | null;
  productPlanPriceId: string | null;
  taxRateId: string | null;
  description: string;
  amount: string;
  currency: string;
  quantity: number;
  taxAmount: string;
  createdAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface InvoiceCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  customerAccountId: string;
  subscriptionId?: string;
  currency?: string;
  dueDate?: string;
  periodStart?: string;
  periodEnd?: string;
  allowedChains?: AllowedChains;
  allowedTokens?: AllowedTokens;
  memo?: string;
  taxRateId?: string;
  items: InvoiceCreateItem[];
  metadata?: Metadata;
}

export interface InvoiceCreateItem {
  description: string;
  amount: string;
  currency?: string;
  quantity?: number;
  productPlanId?: string;
  productPlanPriceId?: string;
  taxRateId?: string;
}

export interface InvoiceListParams extends PaginationParams {
  appId?: string;
  status?: InvoiceStatus;
}
