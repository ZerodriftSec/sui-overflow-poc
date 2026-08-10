/**
 * Streaming math from the StreamLine spec. The gasless floor is 1.00 USDC per
 * transfer, so the drip *interval* adapts to the rate instead of the drip size:
 *   drip_interval_s = ceil(1.00 / (total_usdc / duration_s))
 * Kept in sync with `MIN_DRIP_BASE` in backend `core/types.rs`.
 */

export const USDC_DECIMALS = 6;
export const USDC_BASE = 10 ** USDC_DECIMALS; // 1 USDC = 1_000_000 base units
export const MIN_DRIP_USDC = 1.0;
export const MIN_DRIP_BASE = Math.round(MIN_DRIP_USDC * USDC_BASE); // 1_000_000

export type DurationUnit = "hours" | "days" | "weeks";

const UNIT_MS: Record<DurationUnit, number> = {
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

export function durationToMs(value: number, unit: DurationUnit): number {
  return value * UNIT_MS[unit];
}

/** USDC per second for a stream of `totalUsdc` over `durationMs`. */
export function ratePerSecond(totalUsdc: number, durationMs: number): number {
  if (totalUsdc <= 0 || durationMs <= 0) return 0;
  return totalUsdc / (durationMs / 1000);
}

/** Milliseconds between gasless drips: time to accrue 1.00 USDC. */
export function dripIntervalMs(totalUsdc: number, durationMs: number): number {
  if (totalUsdc <= 0 || durationMs <= 0) return 0;
  return Math.ceil((MIN_DRIP_USDC / totalUsdc) * durationMs);
}

/** Whole base-unit emission rate per millisecond (matches the Move contract). */
export function ratePerMsBase(totalUsdc: number, durationMs: number): number {
  if (totalUsdc <= 0 || durationMs <= 0) return 0;
  return Math.floor((totalUsdc * USDC_BASE) / durationMs);
}

/** Human label for a drip interval, e.g. "~52 seconds" / "~8.6 minutes". */
export function formatInterval(ms: number): string {
  if (ms <= 0) return "—";
  const s = ms / 1000;
  if (s < 60) {
    return s < 10 ? `~${s.toFixed(1)} seconds` : `~${Math.round(s)} seconds`;
  }
  const m = s / 60;
  if (m < 60) return `~${m.toFixed(1)} minutes`;
  const h = m / 60;
  if (h < 24) return `~${h.toFixed(1)} hours`;
  return `~${(h / 24).toFixed(1)} days`;
}

/** Compact USD string, e.g. $1,200.00 or $0.000064 for tiny per-second rates. */
export function formatUsd(n: number, opts?: { maxFrac?: number }): string {
  if (!isFinite(n)) return "$0.00";
  const maxFrac = opts?.maxFrac ?? (Math.abs(n) < 1 && n !== 0 ? 6 : 2);
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  })}`;
}

/** Convert a USDC amount to integer base units for on-chain calls. */
export function toBaseUnits(usdc: number): bigint {
  return BigInt(Math.round(usdc * USDC_BASE));
}
