/**
 * Supported blockchain networks - TYPE DEFINITIONS ONLY
 * 
 * NOTE: Actual chain configuration (RPC URLs, enabled status, tokens, etc.)
 * comes from the database, managed via the platform admin dashboard.
 * These are type definitions and defaults for reference only.
 */

// ── LeanRPC ──
// All RPC calls across the platform go through our LeanRPC service.
// The URL pattern is: https://rpc.leanrpc.xyz/rpc?chainId={chainId}&apiKey={apiKey}
const LEANRPC_BASE = 'https://rpc.leanrpc.xyz/rpc';
const LEANRPC_API_KEY = 'ak_8166c2e4adfb1fc508ee8d1680f507c4';

/**
 * Build the LeanRPC URL for a given chain ID.
 * This is the ONLY RPC provider used across the entire NodeRails platform.
 */
export function getLeanRpcUrl(chainId: number): string {
  return `${LEANRPC_BASE}?chainId=${chainId}&apiKey=${LEANRPC_API_KEY}`;
}

/** Official Solana JSON-RPC endpoints for NodeRails chain IDs (101 / 102 / 103). */
export const SOLANA_PUBLIC_RPC_URL: Record<number, string> = {
  101: 'https://api.testnet.solana.com',
  102: 'https://api.devnet.solana.com',
  103: 'https://api.mainnet-beta.solana.com',
};

export function getSolanaPublicRpcUrl(chainId: number): string | undefined {
  return SOLANA_PUBLIC_RPC_URL[chainId];
}

export { LEANRPC_API_KEY };

export const CHAIN_DEFINITIONS = {
  // Mainnets
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
  optimism: {
    chainId: 10,
    name: 'Optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://optimistic.etherscan.io',
    isTestnet: false,
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  base: {
    chainId: 8453,
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
  },
  // Testnets
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
  amoy: {
    chainId: 80002,
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    explorerUrl: 'https://amoy.polygonscan.com',
    isTestnet: true,
  },
  solanaTestnet: {
    chainId: 101,
    name: 'Solana Testnet',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    explorerUrl: 'https://solscan.io',
    isTestnet: true,
  },
  solanaDevnet: {
    chainId: 102,
    name: 'Solana Devnet',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    explorerUrl: 'https://solscan.io',
    isTestnet: true,
  },
  solanaMainnet: {
    chainId: 103,
    name: 'Solana',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    explorerUrl: 'https://solscan.io',
    isTestnet: false,
  },
  suiDevnet: {
    chainId: 201,
    name: 'Sui Devnet',
    nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
    explorerUrl: 'https://suiscan.xyz/devnet',
    isTestnet: true,
  },
  suiTestnet: {
    chainId: 202,
    name: 'Sui Testnet',
    nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
    explorerUrl: 'https://suiscan.xyz/testnet',
    isTestnet: true,
  },
  suiMainnet: {
    chainId: 203,
    name: 'Sui',
    nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
    explorerUrl: 'https://suiscan.xyz/mainnet',
    isTestnet: false,
  },
} as const;

export type ChainKey = keyof typeof CHAIN_DEFINITIONS;
export type ChainId = (typeof CHAIN_DEFINITIONS)[ChainKey]['chainId'];

/** NodeRails `SupportedChain.chainId` values for Solana networks. */
export const NODE_RAILS_SOLANA_CHAIN_IDS = new Set<number>([101, 102, 103]);

/** NodeRails `SupportedChain.chainId` values for Sui networks. */
export const NODE_RAILS_SUI_CHAIN_IDS = new Set<number>([201, 202, 203]);

export function resolveChainTypeFromId(
  chainId: number,
  explicit?: 'EVM' | 'SOLANA' | 'SUI',
): 'EVM' | 'SOLANA' | 'SUI' {
  if (explicit) return explicit;
  if (NODE_RAILS_SOLANA_CHAIN_IDS.has(chainId)) return 'SOLANA';
  if (NODE_RAILS_SUI_CHAIN_IDS.has(chainId)) return 'SUI';
  return 'EVM';
}

export type ChainFamily = 'EVM' | 'SOLANA' | 'SUI';

/** Map Prisma `ChainType` (or API string) to checkout/API chain family. */
export function chainFamilyFromDb(chainType: string | null | undefined): ChainFamily {
  if (chainType === 'SOLANA') return 'SOLANA';
  if (chainType === 'SUI') return 'SUI';
  return 'EVM';
}

// ── Merged chain registry (static + admin DB) ──

/** Admin DB row shape (subset) used to build the merged registry. */
export interface ChainRegistryDbInput {
  chainId: number;
  name: string;
  displayName: string;
  explorerUrl?: string | null;
  isTestnet?: boolean;
  nativeCurrencySymbol?: string;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
}

/** Single chain entry returned by GET /public/chain-registry. */
export interface MergedChainRegistryEntry {
  chainId: number;
  name: string;
  displayName: string;
  explorerUrl: string | null;
  isTestnet: boolean;
  nativeCurrencySymbol: string;
  chainType: 'EVM' | 'SOLANA' | 'SUI';
  sources: Array<'static' | 'database'>;
}

export type ChainRegistryMap = Record<number, MergedChainRegistryEntry>;

function solanaClusterSuffix(chainId: number): string | undefined {
  if (chainId === 102) return 'devnet';
  if (chainId === 101) return 'testnet';
  return undefined;
}

function normalizeExplorerBase(explorerUrl: string): string {
  return explorerUrl.trim().replace(/\/$/, '');
}

function suiNetworkSuffix(chainId: number): string | undefined {
  if (chainId === 201) return 'devnet';
  if (chainId === 202) return 'testnet';
  return undefined;
}

function staticRegistryMap(): ChainRegistryMap {
  const map: ChainRegistryMap = {};
  for (const def of Object.values(CHAIN_DEFINITIONS)) {
    map[def.chainId] = {
      chainId: def.chainId,
      name: def.name,
      displayName: def.name,
      explorerUrl: def.explorerUrl ?? null,
      isTestnet: def.isTestnet,
      nativeCurrencySymbol: def.nativeCurrency.symbol,
      chainType: resolveChainTypeFromId(def.chainId),
      sources: ['static'],
    };
  }
  return map;
}

/**
 * Merge admin-managed chains with static {@link CHAIN_DEFINITIONS}.
 * Database fields override static defaults for the same chainId.
 */
export function mergeChainRegistry(dbChains: ChainRegistryDbInput[]): ChainRegistryMap {
  const merged = staticRegistryMap();

  for (const db of dbChains) {
    const existing = merged[db.chainId];
    const chainType = resolveChainTypeFromId(db.chainId, db.chainType);

    merged[db.chainId] = {
      chainId: db.chainId,
      name: db.name,
      displayName: db.displayName || db.name,
      explorerUrl: db.explorerUrl?.trim() || existing?.explorerUrl || null,
      isTestnet: db.isTestnet ?? existing?.isTestnet ?? false,
      nativeCurrencySymbol:
        db.nativeCurrencySymbol ?? existing?.nativeCurrencySymbol ?? 'ETH',
      chainType,
      sources: existing ? ['static', 'database'] : ['database'],
    };
  }

  return merged;
}

export function chainRegistryToArray(registry: ChainRegistryMap): MergedChainRegistryEntry[] {
  return Object.values(registry).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Build a lookup map from API `chains` array (JSON-friendly). */
export function chainRegistryMapFromList(chains: MergedChainRegistryEntry[]): ChainRegistryMap {
  const map: ChainRegistryMap = {};
  for (const entry of chains) {
    map[entry.chainId] = entry;
  }
  return map;
}

function explorerTxFromEntry(
  entry: MergedChainRegistryEntry,
  chainId: number,
  txHash: string,
): string {
  const base = normalizeExplorerBase(entry.explorerUrl!);
  if (entry.chainType === 'SOLANA') {
    const cluster = solanaClusterSuffix(chainId);
    const path = `${base}/tx/${encodeURIComponent(txHash)}`;
    return cluster ? `${path}?cluster=${cluster}` : path;
  }
  if (entry.chainType === 'SUI') {
    const network = suiNetworkSuffix(chainId);
    const path = `${base}/tx/${encodeURIComponent(txHash)}`;
    return network ? `${path}?network=${network}` : path;
  }
  return `${base}/tx/${txHash}`;
}

function explorerAddressFromEntry(
  entry: MergedChainRegistryEntry,
  chainId: number,
  address: string,
): string {
  const base = normalizeExplorerBase(entry.explorerUrl!);
  if (entry.chainType === 'SOLANA') {
    const cluster = solanaClusterSuffix(chainId);
    const path = `${base}/account/${encodeURIComponent(address)}`;
    return cluster ? `${path}?cluster=${cluster}` : path;
  }
  if (entry.chainType === 'SUI') {
    const network = suiNetworkSuffix(chainId);
    const path = `${base}/object/${encodeURIComponent(address)}`;
    return network ? `${path}?network=${network}` : path;
  }
  return `${base}/address/${address}`;
}

/**
 * Block explorer URL for a transaction (EVM or Solana).
 * Pass optional `registry` from {@link mergeChainRegistry} for admin-added chains.
 */
export function blockExplorerTxUrl(
  chainId: number,
  txHash: string,
  registry?: ChainRegistryMap,
): string | null {
  const h = txHash?.trim();
  if (!h) return null;

  const regEntry = registry?.[chainId];
  if (regEntry?.explorerUrl) {
    return explorerTxFromEntry(regEntry, chainId, h);
  }

  if (NODE_RAILS_SOLANA_CHAIN_IDS.has(chainId)) {
    const cluster = solanaClusterSuffix(chainId);
    const path = `https://solscan.io/tx/${encodeURIComponent(h)}`;
    return cluster ? `${path}?cluster=${cluster}` : path;
  }
  if (NODE_RAILS_SUI_CHAIN_IDS.has(chainId)) {
    const network = suiNetworkSuffix(chainId);
    const path = `https://suiscan.xyz/devnet/tx/${encodeURIComponent(h)}`;
    if (chainId === 202) return `https://suiscan.xyz/testnet/tx/${encodeURIComponent(h)}`;
    if (chainId === 203) return `https://suiscan.xyz/mainnet/tx/${encodeURIComponent(h)}`;
    return network ? `${path}?network=${network}` : path;
  }
  const entry = Object.values(CHAIN_DEFINITIONS).find((c) => c.chainId === chainId);
  if (!entry?.explorerUrl) return null;
  const base = entry.explorerUrl.split('?')[0];
  return `${base}/tx/${h}`;
}

/**
 * Block explorer URL for an address (EVM or Solana).
 * Pass optional `registry` from {@link mergeChainRegistry} for admin-added chains.
 */
export function blockExplorerAddressUrl(
  chainId: number,
  address: string,
  registry?: ChainRegistryMap,
): string | null {
  const a = address?.trim();
  if (!a) return null;

  const regEntry = registry?.[chainId];
  if (regEntry?.explorerUrl) {
    return explorerAddressFromEntry(regEntry, chainId, a);
  }

  if (NODE_RAILS_SOLANA_CHAIN_IDS.has(chainId)) {
    const cluster = solanaClusterSuffix(chainId);
    const path = `https://solscan.io/account/${encodeURIComponent(a)}`;
    return cluster ? `${path}?cluster=${cluster}` : path;
  }
  if (NODE_RAILS_SUI_CHAIN_IDS.has(chainId)) {
    if (chainId === 202) return `https://suiscan.xyz/testnet/object/${encodeURIComponent(a)}`;
    if (chainId === 203) return `https://suiscan.xyz/mainnet/object/${encodeURIComponent(a)}`;
    return `https://suiscan.xyz/devnet/object/${encodeURIComponent(a)}`;
  }
  const entry = Object.values(CHAIN_DEFINITIONS).find((c) => c.chainId === chainId);
  if (!entry?.explorerUrl) return null;
  const base = entry.explorerUrl.split('?')[0];
  return `${base}/address/${a}`;
}

/**
 * Display name for a chain id.
 * Pass optional `registry` from {@link mergeChainRegistry} for admin-added chains.
 */
export function chainDisplayName(chainId: number, registry?: ChainRegistryMap): string {
  const regEntry = registry?.[chainId];
  if (regEntry) return regEntry.displayName || regEntry.name;
  const entry = Object.values(CHAIN_DEFINITIONS).find((c) => c.chainId === chainId);
  return entry?.name ?? `Chain ${chainId}`;
}

/**
 * Well-known token symbols (actual addresses come from database)
 */
export const TOKEN_SYMBOLS = ['ETH', 'MATIC', 'USDC', 'USDT', 'DAI', 'WETH', 'WBTC'] as const;
export type TokenSymbol = (typeof TOKEN_SYMBOLS)[number];

export * from './logo-variants.js';

/**
 * Payment status enum matching smart contract
 */
export const PAYMENT_STATUS = {
  NONE: 'none',
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  SETTLED: 'settled',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type PaymentStatusType = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * Dispute status enum
 */
export const DISPUTE_STATUS = {
  OPEN: 'open',
  RESOLVED_MERCHANT: 'resolved_merchant',
  RESOLVED_PAYER: 'resolved_payer',
} as const;

export type DisputeStatusType = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS];

/**
 * Payout status enum
 */
export const PAYOUT_STATUS = {
  PENDING: 'pending',
  EXECUTED: 'executed',
  FAILED: 'failed',
} as const;

/**
 * Transaction types
 */
export const TRANSACTION_TYPE = {
  AUTHORIZE: 'authorize',
  CAPTURE: 'capture',
  SETTLE: 'settle',
  DISPUTE: 'dispute',
  REFUND: 'refund',
  PAYOUT: 'payout',
} as const;

/**
 * Transaction confirmation status
 * 
 * NOTE: For on-chain transaction lifecycle statuses (QUEUED, SIGNING,
 * BROADCASTING, CONFIRMED, FAILED, etc.) see the MTXM client types
 * (`MtxmTxStatus` in @noderails/mtxm-client). NodeRails no longer
 * maintains its own TX status enum — MTXM is the source of truth.
 */

/**
 * Webhook event types
 */
export const WEBHOOK_EVENTS = {
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_SETTLED: 'payment.settled',
  PAYMENT_DISPUTED: 'payment.disputed',
  PAYMENT_REFUNDED: 'payment.refunded',
  DISPUTE_CREATED: 'dispute.created',
  DISPUTE_RESOLVED: 'dispute.resolved',
  PAYOUT_EXECUTED: 'payout.executed',
  PAYOUT_FAILED: 'payout.failed',
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_PAYMENT_FAILED: 'subscription.payment_failed',
  SUBSCRIPTION_PAST_DUE: 'subscription.past_due',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_PAUSED: 'subscription.paused',
  SUBSCRIPTION_RESUMED: 'subscription.resumed',
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

// ============ Timelock Configuration ============

/**
 * Timelock durations in seconds
 * These values are passed to the contract's TimelocksLib.init() function
 * 
 * The contract packs timelocks into a uint256:
 * - [224-255] capturedAt (32 bits) - set by contract at capture time
 * - [64-95]   settlement (32 bits) - seconds until settlement allowed
 * - [32-63]   disputeStart (32 bits) - seconds until dispute window opens
 */
export const TIMELOCK_DURATIONS = {
  /** When dispute window opens (0 = immediately after capture) */
  DISPUTE_START_IMMEDIATE: 0,
  
  /** 1 hour delay before disputes allowed */
  DISPUTE_START_1_HOUR: 60 * 60,

  /** 3 minutes - TEST ONLY: quick settlement for dev/testing */
  SETTLEMENT_3_MINUTES: 3 * 60, // 180
  
  /** 1 day - express settlement */
  SETTLEMENT_1_DAY: 24 * 60 * 60, // 86400
  
  /** 3 days - faster settlement for trusted merchants */
  SETTLEMENT_3_DAYS: 3 * 24 * 60 * 60, // 259200
  
  /** 7 days - standard settlement timelock (DEFAULT) */
  SETTLEMENT_7_DAYS: 7 * 24 * 60 * 60, // 604800
  
  /** 14 days - extended protection */
  SETTLEMENT_14_DAYS: 14 * 24 * 60 * 60, // 1209600
} as const;

/**
 * Default settlement duration (7 days in seconds)
 */
export const DEFAULT_SETTLEMENT_DURATION = TIMELOCK_DURATIONS.SETTLEMENT_7_DAYS;

/**
 * Default dispute start (immediate)
 */
export const DEFAULT_DISPUTE_START = TIMELOCK_DURATIONS.DISPUTE_START_IMMEDIATE;

// ============ Queue Names ============

/**
 * Queue names for job processing
 * 
 * Naming convention: noderails.<domain>.<action>
 * - noderails: Brand prefix for easy identification in Redis
 * - domain: The service/feature area
 * - action: What the job does (verb-noun format)
 */
export const QUEUE_NAMES = {
  /** Process incoming MTXM transaction-lifecycle webhooks */
  MTXM_PROCESS_WEBHOOK: 'noderails.mtxm.process-webhook',
  
  /** Process incoming Indexer event / native-transfer webhooks */
  INDEXER_PROCESS_WEBHOOK: 'noderails.indexer.process-webhook',
  
  /** Deliver a webhook to merchant endpoint */
  WEBHOOK_DELIVER: 'noderails.webhook.deliver',
  
  /** Process a recurring subscription charge */
  SUBSCRIPTION_PROCESS_CHARGE: 'noderails.subscription.process-charge',
  
  /** Retry a failed subscription charge */
  SUBSCRIPTION_RETRY_CHARGE: 'noderails.subscription.retry-charge',
  
  /** Check grace period expiry for past-due subscription */
  SUBSCRIPTION_GRACE_PERIOD: 'noderails.subscription.grace-period',
  
  /** Execute a payout from merchant wallet */
  PAYOUT_EXECUTE: 'noderails.payout.execute',
  
  /** Auto-settle a payment after timelock expires */
  PAYMENT_AUTO_SETTLE: 'noderails.payment.auto-settle',
  
  /** Send email notifications */
  EMAIL_SEND: 'noderails.email.send',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============ API Key Configuration ============

/**
 * Environment types
 */
export const ENVIRONMENT = {
  TEST: 'test',
  PRODUCTION: 'production',
} as const;

export type EnvironmentType = (typeof ENVIRONMENT)[keyof typeof ENVIRONMENT];

/**
 * API key configuration
 * 
 * Format: nr_<environment>_<type>_<random>
 * 
 * Examples:
 * - nr_test_pk_a1b2c3d4e5f6... (test mode, public key)
 * - nr_live_sk_x9y8z7w6v5u4... (live mode, secret key)
 */
export const API_KEY_CONFIG = {
  /** NodeRails brand prefix */
  BRAND_PREFIX: 'nr',
  
  /** Key type identifiers */
  TYPE: {
    PUBLIC: 'pk',  // For client-side (browser) usage - read-only operations
    SECRET: 'sk',  // For server-side usage only - full access
  },
  
  /** Environment identifiers */
  ENV: {
    TEST: 'test',
    LIVE: 'live',
  },
  
  /** Random part length (in bytes, will be base64url encoded) */
  RANDOM_BYTES: 24,
} as const;

/**
 * Build API key prefix
 * @example buildApiKeyPrefix('pk', 'test') => 'nr_test_pk'
 * @example buildApiKeyPrefix('sk', 'live') => 'nr_live_sk'
 */
export function buildApiKeyPrefix(
  type: 'pk' | 'sk',
  environment: 'test' | 'live'
): string {
  return `${API_KEY_CONFIG.BRAND_PREFIX}_${environment}_${type}`;
}

// ============ Misc Constants ============

/**
 * Maximum webhook delivery retry attempts
 */
export const MAX_WEBHOOK_RETRIES = 5;

/**
 * Webhook delivery timeout in milliseconds
 */
export const WEBHOOK_TIMEOUT_MS = 30000;

/**
 * Default page size for paginated APIs
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum page size for paginated APIs
 */
export const MAX_PAGE_SIZE = 100;
