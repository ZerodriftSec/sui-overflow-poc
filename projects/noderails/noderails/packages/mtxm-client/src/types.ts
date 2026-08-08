/**
 * MTXM (Multichain Transaction Manager) Type Definitions
 *
 * These types mirror the MTXM REST API shapes exactly.
 * @see multichaininTxManager-api-integration-latest.md
 */

// ============ API Envelope ============

export interface MtxmSuccessResponse<T> {
  success: true;
  data: T;
}

export interface MtxmErrorResponse {
  success: false;
  message: string;
}

export type MtxmResponse<T> = MtxmSuccessResponse<T> | MtxmErrorResponse;

// ============ Transactions ============

export type MtxmTxStatus =
  | 'QUEUED'
  | 'SIGNING'
  | 'SIGNED'
  | 'BROADCASTING'
  | 'BROADCAST'
  | 'CONFIRMED'
  | 'FAILED'
  | 'STUCK'
  | 'SPEED_UP'
  | 'CANCELLED';

export type MtxmChainType = 'EVM' | 'SOLANA' | 'SUI';

export interface MtxmSuiSignDomain {
  name: string;
  version: string;
  chainId: number;
}

export interface MtxmSuiSignTypedPayload {
  domain: MtxmSuiSignDomain;
  rawPreimageBase64?: string;
  rawPreimageHex?: string;
  payload?: Record<string, unknown>;
}

export interface MtxmSuiMoveCall {
  package: string;
  module: string;
  function: string;
  typeArguments?: string[];
  arguments?: unknown[];
}

export interface MtxmSolanaSignDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingProgramId?: string;
  authority?: string;
}

export interface MtxmSolanaSignTypedPayload {
  domain: MtxmSolanaSignDomain;
  /**
   * 32-byte SHA-256 digest as 0x-prefixed 64-char hex. Legacy path; omit when using
   * `rawPreimageBase64` / `rawPreimageHex` so MTXM signs the exact on-chain preimage.
   */
  structHash?: string;
  /**
   * Base64-encoded raw bytes MTXM must sign (preferred for on-chain `Ed25519SigVerify`).
   * Must match the exact `message` bytes embedded in the Ed25519 verify instruction.
   */
  rawPreimageBase64?: string;
  /** 0x-prefixed hex of the same raw bytes as `rawPreimageBase64` (alternative). */
  rawPreimageHex?: string;
  payload?: Record<string, unknown>;
}

export interface MtxmSendTxRequest {
  /** Database ID of the chain (from Chains API) */
  chainId: string;
  /** Database ID of the signer — required by MTXM for `solana.transactionBase64` sends */
  signerId?: string;
  /** Recipient address (0x + 40 hex for EVM) */
  to?: string;
  /** Amount in wei as string (EVM) */
  value?: string;
  /** Hex-encoded calldata (0x prefix, EVM) */
  data?: string;
  /** Gas limit as string */
  gasLimit?: string;
  /** Arbitrary JSON — stored with TX and included in webhooks */
  metadata?: Record<string, unknown>;
  /** Solana program transaction — per MTXM API */
  solana?: {
    instructions?: Array<{
      programId: string;
      keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
      dataBase64?: string;
    }>;
    transactionBase64?: string;
    cuLimit?: number;
    cuPriceMicroLamports?: number;
  };
  /** Sui programmable transaction — per MTXM API */
  sui?: {
    moveCalls?: MtxmSuiMoveCall[];
    transactionBase64?: string;
  };
}

export interface MtxmExecuteSponsoredResponse {
  digest: string;
  transactionId?: string;
  status: string;
}

export interface MtxmSponsorSignRequest {
  chainId: string;
  /** Base64 transaction kind from `tx.build({ onlyTransactionKind: true })`. */
  transactionKindBase64?: string;
  /** Alternative to kind bytes — mutually exclusive with transactionKindBase64. */
  transactionBase64?: string;
  senderAddress: string;
  gasBudget?: string;
  sponsorSignerId?: string;
}

export interface MtxmSponsorSignResponse {
  sponsor: string;
  sender: string;
  gasOwner: string;
  /** When false, sender pays gas — only sponsor signature needed on execute. */
  dualSignRequired?: boolean;
  transactionBlockBase64: string;
  sponsorSignature: string;
  gasPayment: Array<{ objectId: string; version: string; digest: string }>;
  gasBudget: string;
  gasPrice?: string;
}

export interface MtxmExecuteSponsoredRequest {
  chainId: string;
  transactionBlockBase64: string;
  userSignature?: string;
  sponsorSignature?: string;
  /** User first, sponsor second. Alternative to userSignature + sponsorSignature. */
  signatures?: [string, string];
  track?: boolean;
  to?: string;
  metadata?: Record<string, unknown>;
}

export interface MtxmTransaction {
  id: string;
  status: MtxmTxStatus;
  txHash?: string;
  from?: string;
  to: string;
  value?: string;
  chainId: string;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  blockNumber?: number;
  attempts?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface MtxmListTxParams {
  status?: MtxmTxStatus;
  chainId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface MtxmPaginatedTxResponse {
  transactions: MtxmTransaction[];
  total: number;
  page: number;
  limit: number;
}

// ============ EIP-712 Signing ============

export interface MtxmEIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface MtxmEIP712TypeField {
  name: string;
  type: string;
}

export interface MtxmSignTypedRequest {
  chainId: string;
  /** Defaults to EVM when omitted (backward compatible). */
  chainType?: MtxmChainType;
  signerId?: string;
  /** EIP-712 (EVM) */
  domain?: MtxmEIP712Domain;
  types?: Record<string, MtxmEIP712TypeField[]>;
  value?: Record<string, unknown>;
  /** Solana authorization blob — required when `chainType` is `SOLANA`. */
  solana?: MtxmSolanaSignTypedPayload;
  /** Sui authorization preimage — required when `chainType` is `SUI`. */
  sui?: MtxmSuiSignTypedPayload;
}

export interface MtxmSignTypedResponse {
  chainType?: MtxmChainType;
  /** EVM ECDSA signature (hex). */
  signature?: string;
  /** Canonical message bytes as returned by MTXM (often UTF-8). */
  message?: string;
  /** Echo of preimage when `rawPreimageHex` was sent. */
  messageHex?: string;
  /** Echo of preimage when `rawPreimageBase64` was sent. */
  messageBase64?: string;
  /** Solana / Sui ed25519 signature (base58). */
  signatureBase58?: string;
  /** Sui ed25519 signature (base64 raw 64 bytes) — alternate encoding. */
  signatureBase64?: string;
  signer: string;
}

// ============ Chains ============

export interface MtxmChain {
  id: string;
  name: string;
  chainId: number;
  rpcUrls: string[];
  explorerUrl?: string;
  nativeCurrency: string;
  isTestnet: boolean;
  isActive: boolean;
}

export interface MtxmAddChainRequest {
  name: string;
  chainId: number;
  rpcUrls: string[];
  explorerUrl?: string;
  nativeCurrency: string;
  isTestnet: boolean;
}

export interface MtxmUpdateChainRequest {
  name?: string;
  rpcUrls?: string[];
  explorerUrl?: string;
  isActive?: boolean;
}

// ============ Signers ============

export type MtxmAdapterType = 'ENV' | 'KMS';

export interface MtxmSigner {
  id: string;
  label: string;
  address: string;
  adapterType: MtxmAdapterType;
  isActive: boolean;
  isMaster: boolean;
}

/** Request body for `POST .../signers/allocate`. */
export interface MtxmAllocateSignerRequest {
  chainType?: MtxmChainType;
}

/** Runtime signer credentials from MTXM allocate (replaces env MTXM_SUI_* when unset). */
export interface MtxmAllocatedSigner {
  signerId: string;
  label: string;
  chainType: MtxmChainType;
  address: string;
  publicBase64Key: string;
}

export interface MtxmCreateSignerRequest {
  label: string;
  adapterType: MtxmAdapterType;
  kmsKeyId?: string;
}

export interface MtxmSignerChainDetail {
  chainId: number;
  name: string;
  balance: string;
  nonce: number;
  pendingTxCount: number;
}

export interface MtxmSignerDetail {
  signer: Pick<MtxmSigner, 'id' | 'label' | 'address'>;
  chains: MtxmSignerChainDetail[];
}

export interface MtxmFundSignerRequest {
  chainDbId: string;
}

// ============ Webhooks ============

export type MtxmWebhookEvent =
  | 'tx.signing'
  | 'tx.signed'
  | 'tx.broadcasting'
  | 'tx.broadcast'
  | 'tx.confirmed'
  | 'tx.failed'
  | 'tx.stuck'
  | 'tx.cancelled'
  | 'tx.speed_up';

export interface MtxmWebhook {
  id: string;
  url: string;
  events: MtxmWebhookEvent[];
  secret?: string;
  isActive: boolean;
}

export interface MtxmCreateWebhookRequest {
  url: string;
  events: MtxmWebhookEvent[];
}

export interface MtxmUpdateWebhookRequest {
  url?: string;
  events?: MtxmWebhookEvent[];
  isActive?: boolean;
}

/** Payload sent by MTXM to our webhook endpoint */
export interface MtxmWebhookPayload {
  event: MtxmWebhookEvent;
  timestamp: string;
  data: {
    /** MTXM internal transaction ID (always present) */
    transactionId: string;
    status: MtxmTxStatus;
    /** On-chain tx hash — only present after broadcasting */
    hash?: string;
    from?: string;
    to?: string;
    value?: string;
    chainId: number;
    blockNumber?: number;
    metadata?: Record<string, unknown>;
  };
}

// ============ Webhook Delivery ============

export interface MtxmDeliveryParams {
  event?: string;
  statusCode?: number;
  page?: number;
  limit?: number;
}

// ============ Client Config ============

export interface MtxmClientConfig {
  /** MTXM base URL (e.g. https://your-mtxm-host) */
  baseUrl: string;
  /** MTXM project ID */
  projectId: string;
  /** MTXM API key (mtxm_...) */
  apiKey: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}
