import { z } from 'zod';
import {
  PAYMENT_STATUS,
  DISPUTE_STATUS,
  PAYOUT_STATUS,
  TRANSACTION_TYPE,
  ENVIRONMENT,
} from '../constants/index.js';
import { isValidMerchantWalletAddress } from '../utils/index.js';

// ============ Base Types ============

/**
 * Ethereum address (0x prefixed, 42 chars)
 */
export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export type Address = z.infer<typeof AddressSchema>;

/**
 * Solana base58 public key (mint, token account, program id).
 */
export const SolanaAddressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export type SolanaAddress = z.infer<typeof SolanaAddressSchema>;

/**
 * Sui address / object id / package id (0x + up to 64 hex digits).
 */
export const SuiAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{1,64}$/i);
export type SuiAddress = z.infer<typeof SuiAddressSchema>;

/**
 * Sui coin type (e.g. 0x2::sui::SUI or 0xPACKAGE::module::COIN).
 */
export const SuiCoinTypeSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((val) => val === '0x2::sui::SUI' || val.includes('::'), {
    message: 'Invalid Sui coin type — use 0x2::sui::SUI or package::module::Type',
  });
export type SuiCoinType = z.infer<typeof SuiCoinTypeSchema>;

/** Max stored length for EVM / Solana / Sui wallet & object addresses. */
export const MERCHANT_WALLET_MAX_LENGTH = 66;

/** Max stored length for token contract / coin type strings (Sui coin types can exceed 64). */
export const TOKEN_CONTRACT_MAX_LENGTH = 128;

export const MerchantWalletAddressSchema = z
  .string()
  .min(1)
  .max(MERCHANT_WALLET_MAX_LENGTH)
  .refine(isValidMerchantWalletAddress, {
    message:
      'Invalid wallet address — use EVM (0x + 40 hex), Solana base58, or Sui (0x + up to 64 hex)',
  });

export const NullableMerchantWalletAddressSchema = z
  .union([MerchantWalletAddressSchema, z.null()])
  .transform((s) => (s === '' ? null : s));

export const TokenContractAddressSchema = z.string().min(1).max(TOKEN_CONTRACT_MAX_LENGTH);

/**
 * Bytes32 hex string (0x prefixed, 66 chars)
 */
export const Bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export type Bytes32 = z.infer<typeof Bytes32Schema>;

/**
 * Transaction hash
 */
export const TxHashSchema = Bytes32Schema;
export type TxHash = z.infer<typeof TxHashSchema>;

/**
 * UUID v4
 */
export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

// ============ Enums as Zod Schemas ============

export const PaymentStatusSchema = z.enum([
  PAYMENT_STATUS.NONE,
  PAYMENT_STATUS.CREATED,
  PAYMENT_STATUS.AUTHORIZED,
  PAYMENT_STATUS.CAPTURED,
  PAYMENT_STATUS.SETTLED,
  PAYMENT_STATUS.DISPUTED,
  PAYMENT_STATUS.REFUNDED,
  PAYMENT_STATUS.CANCELLED,
  PAYMENT_STATUS.EXPIRED,
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const DisputeStatusSchema = z.enum([
  DISPUTE_STATUS.OPEN,
  DISPUTE_STATUS.RESOLVED_MERCHANT,
  DISPUTE_STATUS.RESOLVED_PAYER,
]);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const PayoutStatusSchema = z.enum([
  PAYOUT_STATUS.PENDING,
  PAYOUT_STATUS.EXECUTED,
  PAYOUT_STATUS.FAILED,
]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

/**
 * Transaction status — stored as a plain string because
 * MTXM is the source of truth for transaction lifecycle.
 * Values mirror MtxmTxStatus from @noderails/mtxm-client.
 */
export const TransactionStatusSchema = z.string();
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const TransactionTypeSchema = z.enum([
  TRANSACTION_TYPE.AUTHORIZE,
  TRANSACTION_TYPE.CAPTURE,
  TRANSACTION_TYPE.SETTLE,
  TRANSACTION_TYPE.DISPUTE,
  TRANSACTION_TYPE.REFUND,
  TRANSACTION_TYPE.PAYOUT,
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const EnvironmentSchema = z.enum([ENVIRONMENT.TEST, ENVIRONMENT.PRODUCTION]);
export type Environment = z.infer<typeof EnvironmentSchema>;

// ============ Domain Types ============

/**
 * Payment intent - core payment object
 */
export const PaymentIntentSchema = z.object({
  id: UuidSchema,
  appId: UuidSchema,
  externalId: z.string().optional(),
  amountUsd: z.string(), // Decimal as string for precision
  tokenAmount: z.string().optional(),
  tokenAddress: AddressSchema.optional(),
  chain: z.string(),
  payerWallet: AddressSchema.optional(),
  captureMode: z.enum(['automatic', 'manual']).default('automatic'),
  timelockDuration: z.number().int().positive(),
  status: PaymentStatusSchema,
  authorizationType: z.enum(['permit', 'approval']).optional(),
  permitSignature: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  authorizedAt: z.date().optional(),
  capturedAt: z.date().optional(),
  timelockEndsAt: z.date().optional(),
  settledAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

/**
 * Create payment intent request
 */
export const CreatePaymentIntentSchema = z.object({
  amountUsd: z.string(),
  chain: z.string(),
  tokenAddress: AddressSchema.optional(),
  captureMode: z.enum(['automatic', 'manual']).default('automatic'),
  timelockDuration: z.number().int().positive().optional(),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type CreatePaymentIntent = z.infer<typeof CreatePaymentIntentSchema>;

/**
 * Payout intent
 */
export const PayoutIntentSchema = z.object({
  id: UuidSchema,
  merchantId: UuidSchema,
  appId: UuidSchema,
  recipientWallet: AddressSchema,
  amountUsd: z.string(),
  tokenAmount: z.string(),
  tokenAddress: AddressSchema,
  chain: z.string(),
  nonce: Bytes32Schema,
  sessionSignature: z.string().optional(),
  sessionExpiry: z.date().optional(),
  status: PayoutStatusSchema,
  txHash: TxHashSchema.optional(),
  createdAt: z.date(),
  executedAt: z.date().optional(),
});
export type PayoutIntent = z.infer<typeof PayoutIntentSchema>;

/**
 * Blockchain transaction record
 */
export const TransactionSchema = z.object({
  id: UuidSchema,
  paymentIntentId: UuidSchema.optional(),
  payoutIntentId: UuidSchema.optional(),
  txHash: TxHashSchema,
  chain: z.string(),
  type: TransactionTypeSchema,
  status: TransactionStatusSchema,
  blockNumber: z.number().int().optional(),
  gasUsed: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  confirmedAt: z.date().optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

/**
 * Dispute
 */
export const DisputeSchema = z.object({
  id: UuidSchema,
  paymentIntentId: UuidSchema,
  reason: z.string(),
  evidence: z.string().optional(),
  status: DisputeStatusSchema,
  resolvedBy: AddressSchema.optional(),
  deadline: z.date(),
  createdAt: z.date(),
  resolvedAt: z.date().optional(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

/**
 * Webhook event payload
 */
export const WebhookEventSchema = z.object({
  id: UuidSchema,
  type: z.string(),
  data: z.record(z.unknown()),
  createdAt: z.date(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ============ API Response Types ============

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Pagination params
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;
