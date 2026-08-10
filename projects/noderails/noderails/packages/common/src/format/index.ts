/**
 * Browser-safe formatting helpers for crypto amounts.
 *
 * CONVENTION:
 *   The database always stores crypto amounts in the token's **smallest unit**
 *   (raw integer, uint256-compatible).  e.g. 10 USDC = "10000000" (6 decimals).
 *   Front-ends call `formatCryptoAmount` to get a human-readable string.
 *   When sending to MTXM / contracts, use the raw value directly.
 */

// ── Formatting ──

/**
 * Format a raw (smallest-unit) crypto amount into a human-readable decimal string.
 *
 * @param rawAmount  - The raw integer amount as a string, number, or bigint (e.g. "10000000")
 * @param decimals   - Number of decimals for the token (e.g. 6 for USDC)
 * @returns Human-readable string (e.g. "10.00")
 *
 * @example
 * formatRawAmount("10000000", 6)       // "10.00"
 * formatRawAmount("1500000000000000000", 18) // "1.50"
 */
export function formatRawAmount(rawAmount: string | number | bigint, decimals: number): string {
  const raw = String(rawAmount);

  // Handle zero
  if (raw === '0') return '0.' + '0'.repeat(Math.min(decimals, 2));

  if (decimals === 0) return raw;

  // Pad with leading zeros if shorter than decimals
  const padded = raw.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals) || '0';
  const fracPart = padded.slice(padded.length - decimals);

  // Trim trailing zeros but keep at least minDecimals
  const minDecimals = decimals <= 8 ? 2 : 4;
  let trimmed = fracPart.replace(/0+$/, '');
  if (trimmed.length < minDecimals) trimmed = trimmed.padEnd(minDecimals, '0');
  // Cap display at 6 decimal places max
  if (trimmed.length > 6) trimmed = trimmed.slice(0, 6);

  return `${intPart}.${trimmed}`;
}

/**
 * High-level helper: format a raw crypto amount using the token's decimals.
 *
 * @param rawAmount   - The raw integer amount (e.g. "10000000")
 * @param decimals    - Number of decimals for the token (e.g. 6 for USDC, 18 for ETH).
 *                      This should come from the database, not a hardcoded map.
 * @returns Human-readable string (e.g. "10.00")
 *
 * @example
 * formatCryptoAmount("10000000", 6)  // "10.00"
 * formatCryptoAmount("1000000000000000000", 18) // "1.0000"
 */
export function formatCryptoAmount(
  rawAmount: string | number | bigint | null | undefined,
  decimals: number | null | undefined,
): string {
  if (rawAmount == null || rawAmount === '') return '—';
  return formatRawAmount(rawAmount, decimals ?? 18);
}

/**
 * Parse a token key like "USDC-11155111" into { symbol, chainId }.
 */
export function parseTokenKey(tokenKey: string | null | undefined): { symbol: string; chainId: number } | null {
  if (!tokenKey) return null;
  const dashIdx = tokenKey.indexOf('-');
  if (dashIdx < 1) return null;
  const symbol = tokenKey.slice(0, dashIdx);
  const chainId = parseInt(tokenKey.slice(dashIdx + 1), 10);
  if (Number.isNaN(chainId)) return null;
  return { symbol, chainId };
}

// ── Native Token Detection ──

/**
 * Well-known addresses that represent native tokens (ETH, MATIC, etc.)
 * on EVM chains. address(0) is used by the smart contracts; the EEE address
 * is a widely adopted convention in aggregators, wallets, and indexers.
 */
import { SUI_NATIVE_COIN_TYPE } from './sui.js';

/** Solana program sentinel for wrapped/native SOL in escrow (32 zero bytes, standard base58). */
export const SOLANA_NATIVE_TOKEN_SENTINEL = '11111111111111111111111111111111';

export { SUI_NATIVE_COIN_TYPE, isValidSuiAddress, normalizeSuiAddress } from './sui.js';

export const NATIVE_TOKEN_ADDRESSES: readonly string[] = [
  '0x0000000000000000000000000000000000000000',
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  SOLANA_NATIVE_TOKEN_SENTINEL,
  SUI_NATIVE_COIN_TYPE,
];

/** Canonical zero address used in smart contracts for native ETH */
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Check if a contract address represents a native token (ETH, MATIC, etc.).
 * Returns true for the zero address, the EEE convention address,
 * or null/undefined/empty.
 */
export function isNativeToken(contractAddress: string | null | undefined): boolean {
  if (!contractAddress) return true;
  return NATIVE_TOKEN_ADDRESSES.includes(contractAddress);
}
