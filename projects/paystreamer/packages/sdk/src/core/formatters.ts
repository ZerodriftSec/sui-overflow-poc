/**
 * Formats a raw MIST value to a decimal PUSD amount.
 * 1 PUSD = 10^9 MIST
 */
export function formatMistToPusd(mist: bigint | string | number): number {
  const val = BigInt(mist);
  return Number(val) / 1e9;
}

/**
 * Formats milliseconds frequency to human readable days.
 */
export function formatFrequencyMsToDays(frequencyMs: bigint | string | number): number {
  const ms = BigInt(frequencyMs);
  return Number(ms) / (24 * 60 * 60 * 1000);
}

/**
 * Calculates a recommended deposit buffer (between 3 and 10 cycles, aiming for 90 days) based on tier amount and frequency.
 */
export function calculateRecommendedBuffer(tierAmount: bigint, frequencyMs: bigint): bigint {
  const THREE_MONTHS_MS = 90n * 24n * 60n * 60n * 1000n;
  let cyclesBuffer = 3n;
  if (frequencyMs > 0n) {
    cyclesBuffer = THREE_MONTHS_MS / frequencyMs;
    if (cyclesBuffer < 3n) cyclesBuffer = 3n;
    if (cyclesBuffer > 10n) cyclesBuffer = 10n;
  }
  return tierAmount * cyclesBuffer;
}
