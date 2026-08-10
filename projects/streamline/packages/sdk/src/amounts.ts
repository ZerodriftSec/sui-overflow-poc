/** USDC amount helpers (6 decimals). */

export const USDC_DECIMALS = 6;
export const USDC_BASE = 10 ** USDC_DECIMALS;

/** Convert a USDC amount to integer base units for on-chain calls. */
export function toBaseUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * USDC_BASE));
}

/**
 * Split a total into N per-milestone base-unit amounts that sum exactly.
 */
export function splitMilestoneAmounts(totalBase: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const per = totalBase / BigInt(n);
  const out = Array.from({ length: n }, () => per);
  out[n - 1] = totalBase - per * BigInt(n - 1);
  return out;
}
