import { randomBytes, createHash, createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { API_KEY_CONFIG, buildApiKeyPrefix } from '../constants/index.js';
import { isValidSuiAddress } from '../format/sui.js';

// ============ ID Generation ============

/**
 * Generate a random UUID v4
 * Uses the battle-tested uuid library for RFC 4122 compliance
 */
export function generateUuid(): string {
  return uuidv4();
}

/**
 * Generate a random bytes32 hex string (for blockchain nonces, etc.)
 */
export function generateBytes32(): string {
  return '0x' + randomBytes(32).toString('hex');
}

/**
 * Generate a random nonce for blockchain transactions
 */
export function generateNonce(): string {
  return generateBytes32();
}

/**
 * Generate a NodeRails API key
 * Format: nr_<environment>_<type>_<random>
 * 
 * @example
 * generateApiKey('pk', 'test') => 'nr_test_pk_a1b2c3d4e5f6g7h8...'
 * generateApiKey('sk', 'live') => 'nr_live_sk_x9y8z7w6v5u4t3s2...'
 */
export function generateApiKey(type: 'pk' | 'sk', environment: 'test' | 'live'): string {
  const prefix = buildApiKeyPrefix(type, environment);
  const randomPart = randomBytes(API_KEY_CONFIG.RANDOM_BYTES).toString('base64url');
  return `${prefix}_${randomPart}`;
}

/**
 * Extract info from an API key without validating it
 */
export function parseApiKey(key: string): {
  brand: string;
  type: 'pk' | 'sk';
  environment: 'test' | 'live';
  isValid: boolean;
} | null {
  const parts = key.split('_');
  if (parts.length !== 4) return null;
  
  const [brand, env, type] = parts;
  
  if (brand !== API_KEY_CONFIG.BRAND_PREFIX) return null;
  if (type !== 'pk' && type !== 'sk') return null;
  if (env !== 'test' && env !== 'live') return null;
  
  return {
    brand,
    type,
    environment: env,
    isValid: true, // Structural validity only, not cryptographic
  };
}

// ============ Hashing ============

/**
 * Hash a string using SHA256
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return sha256(key);
}

/**
 * Create HMAC signature for webhook payloads
 */
export function createWebhookSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createWebhookSignature(payload, secret);
  return timingSafeEqual(signature, expected);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

// ============ Address Utils ============

/**
 * Normalize an Ethereum address to checksum format
 * Simplified version - for production use ethers.getAddress()
 */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if a string is a plausible Solana base58 public key.
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export { isValidSuiAddress, normalizeSuiAddress } from '../format/sui.js';

/** Receiving / payout wallets may be EVM (0x…) or Solana base58. */
export function isValidMerchantWalletAddress(address: string): boolean {
  return isValidAddress(address) || isValidSolanaAddress(address) || isValidSuiAddress(address);
}

/**
 * Shorten address for display (0x1234...5678)
 */
export function shortenAddress(address: string, chars = 4): string {
  if (isValidAddress(address)) {
    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
  }
  if (isValidSolanaAddress(address)) {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
  }
  return address;
}

// ============ Amount Utils ============

/**
 * Parse a decimal string to bigint with decimals
 */
export function parseUnits(amount: string, decimals: number): bigint {
  const [integer, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integer + paddedFraction);
}

/**
 * Format bigint to decimal string with decimals
 */
export function formatUnits(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, '0');
  const integer = str.slice(0, -decimals) || '0';
  const fraction = str.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${integer}.${fraction}` : integer;
}

// ============ Time Utils ============

/**
 * Get current Unix timestamp in seconds
 */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Convert seconds to milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * Convert milliseconds to seconds
 */
export function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/**
 * Check if a timestamp (in seconds) has passed
 */
export function isExpired(timestampSeconds: number): boolean {
  return nowSeconds() >= timestampSeconds;
}

/**
 * Calculate timelock end timestamp
 */
export function calculateTimelockEnd(capturedAt: Date, durationSeconds: number): Date {
  return new Date(capturedAt.getTime() + durationSeconds * 1000);
}

// ============ Retry Utils ============

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}

// ============ Object Utils ============

/**
 * Omit specified keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Pick specified keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ============ Timelock Utils ============
// CANONICAL SOURCE: @noderails/web3 (packages/web3/src/timelocks.ts)
// All timelock pack/unpack/query functions live in @noderails/web3.
// Do NOT duplicate them here.
