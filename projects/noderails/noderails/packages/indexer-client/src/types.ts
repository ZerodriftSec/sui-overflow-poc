/**
 * Indexer (Project API) Type Definitions
 *
 * These types mirror the Indexer REST API shapes exactly.
 * @see MTXM_API_INTEGRATION.md (sections 4–11)
 */

// ============ API Envelope ============

export interface IndexerSuccessResponse<T> {
  success: true;
  data: T;
}

export interface IndexerPaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface IndexerErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export type IndexerResponse<T> = IndexerSuccessResponse<T> | IndexerErrorResponse;

// ============ Chains (read-only) ============

export interface IndexerChain {
  id: string;
  chainId: number;
  name: string;
  rpcUrls: string[];
  isActive: boolean;
  blockTime: number;
  finalityBlocks: number;
}

// ============ Contracts ============

export interface IndexerEventSubscription {
  id: string;
  eventName: string;
  isActive: boolean;
}

export interface IndexerIndexState {
  id: string;
  chainId: number;
  contractId: string;
  lastIndexedBlock: string;
  lastFinalizedBlock: string | null;
}

export interface IndexerContract {
  id: string;
  projectId: string;
  chainId: number;
  address: string;
  name: string;
  abi: unknown[];
  isActive: boolean;
  startBlock: string;
  chain: { id: string; name: string; chainId: number };
  eventSubscriptions: IndexerEventSubscription[];
  indexStates?: IndexerIndexState[];
}

export interface IndexerAddContractRequest {
  /** Chain ID (e.g. 1 for Ethereum). Chain must exist in admin. */
  chainId: number;
  /** Contract address */
  address: string;
  /** Full ABI JSON array — must contain at least one event */
  abi: unknown[];
  /** Display name (default "Contract") */
  name?: string;
  /** Block to start indexing from; defaults to current block */
  startBlock?: number;
}

// ============ Event Filters ============

export type IndexerFilterOp = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte';

export interface IndexerFilter {
  contractId: string;
  eventName: string;
  subscriptionId: string;
  filterConditions: Record<string, Record<string, unknown>>;
  contract: { id: string; name: string; address: string };
}

export interface IndexerAddFilterRequest {
  contractId: string;
  eventName: string;
  /** Argument name (with or without "args." prefix) */
  field: string;
  op: IndexerFilterOp;
  /** Value string; for in/nin use JSON array string */
  value: string;
}

export interface IndexerUpdateFilterRequest {
  field: string;
  op: IndexerFilterOp;
  value: string;
}

// ============ Watched Addresses ============

export type IndexerDirection = 'in' | 'out' | 'both';

export interface IndexerWatchedAddress {
  id: string;
  projectId: string;
  chainId: number | null;
  address: string;
  direction: IndexerDirection;
  label?: string;
}

export interface IndexerAddWatchedAddressRequest {
  address: string;
  /** Chain ID, or null / omit for "all chains" */
  chainId?: number | null;
  direction?: IndexerDirection;
  label?: string;
}

export interface IndexerBulkAddWatchedRequest {
  addresses: string[];
  chainId?: number | null;
  direction?: IndexerDirection;
  label?: string;
}

export interface IndexerBulkAddResult {
  created: IndexerWatchedAddress[];
  skipped: string[];
}

// ============ Events Query ============

export interface IndexerEventQueryParams {
  contractId?: string;
  eventName?: string;
  chainId?: number;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface IndexerEvent {
  id: string;
  eventName: string;
  eventSignature: string;
  contractName: string;
  contractAddress: string;
  chainId: number;
  chainName: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

// ============ Native Transfers Query ============

export interface IndexerNativeTransferParams {
  chainId?: number;
  address?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface IndexerNativeTransfer {
  id: string;
  chainId: number;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  from: string;
  to: string;
  /** Value in wei (string) */
  value: string;
  timestamp: string;
  createdAt: string;
}

// ============ Webhook Payloads (incoming from indexer) ============

/** Contract event webhook payload (no "type" field) */
export interface IndexerEventWebhookPayload {
  id: string;
  event: string;
  chainId: number;
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
  timestamp: string;
}

/** Native transfer webhook payload (has "type": "native_transfer") */
export interface IndexerNativeTransferWebhookPayload {
  type: 'native_transfer';
  id: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
}

export type IndexerWebhookPayload =
  | IndexerEventWebhookPayload
  | IndexerNativeTransferWebhookPayload;

// ============ Client Config ============

export interface IndexerClientConfig {
  /** Indexer base URL (e.g. https://your-indexer-host) */
  baseUrl: string;
  /** Project API key */
  apiKey: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}
