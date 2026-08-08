import {  PUSD_TYPE_ARG  } from "@paystreamer/sdk";

export const APP_COIN_DECIMALS = 9;
export const APP_COIN_SYMBOL = "PUSD";
export const APP_COIN_TYPE = PUSD_TYPE_ARG;

export function formatMistToPUSD(mist: string | number | bigint | undefined | null): string {
  if (mist === undefined || mist === null) return `0 ${APP_COIN_SYMBOL}`;
  const raw = typeof mist === "string" ? parseInt(mist, 10) : Number(mist);
  if (Number.isNaN(raw)) return `0 ${APP_COIN_SYMBOL}`;
  const normalized = raw / Math.pow(10, APP_COIN_DECIMALS);
  return `${normalized.toFixed(2)} ${APP_COIN_SYMBOL}`;
}

export function parsePUSDToMist(amount: string | number): bigint {
  const raw = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(raw) || raw < 0) return 0n;
  return BigInt(Math.floor(raw * Math.pow(10, APP_COIN_DECIMALS)));
}

// Kept temporarily to make migration easier, they will be removed once all components are updated.
export function formatAmount(amount: string | number | bigint, _type?: string): string {
    return formatMistToPUSD(amount);
}

export function symbolFor(_type?: string): string {
    return APP_COIN_SYMBOL;
}

export function getDenominationDecimals(_type?: string): number {
    return APP_COIN_DECIMALS;
}

const FREQUENCY_LABELS = ["Daily", "Weekly", "Monthly", "Yearly"];

export interface TierInfo {
  name?: string;
  amount?: string;
  frequency_ms?: string;
  frequency?: string | { variant: number };
  is_active?: boolean;
}

export function formatFrequency(tier: TierInfo): string {
  const freq = tier.frequency_ms || tier.frequency;
  if (typeof freq === "object" && freq !== null && "variant" in freq) {
    return FREQUENCY_LABELS[freq.variant] || "Unknown";
  }
  const fStr = String(freq);
  if (fStr === "86400000") return "Daily";
  if (fStr === "604800000") return "Weekly";
  if (fStr === "2592000000") return "Monthly";
  if (fStr === "31536000000") return "Yearly";
  if (fStr === "daily" || fStr === "weekly" || fStr === "monthly" || fStr === "yearly") {
    return fStr.charAt(0).toUpperCase() + fStr.slice(1);
  }
  
  const ms = parseInt(fStr);
  if (!Number.isNaN(ms) && ms > 0) {
    if (ms < 3600000) {
      const mins = Math.round(ms / 60000);
      return `${mins} ${mins === 1 ? 'min' : 'mins'}`;
    }
    if (ms < 86400000) {
      const hours = Math.round(ms / 3600000);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    const days = Math.round(ms / 86400000);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return "Unknown";
}

export function getFrequencyMs(tier: TierInfo): bigint {
  const freq = tier.frequency_ms || tier.frequency;
  if (typeof freq === "object" && freq !== null && "variant" in freq) {
    return BigInt(freq.variant === 0 ? 86400000 : freq.variant === 1 ? 604800000 : 2592000000);
  }
  const fStr = String(freq);
  if (fStr === "daily") return BigInt(86400000);
  if (fStr === "weekly") return BigInt(604800000);
  if (fStr === "monthly") return BigInt(2592000000);
  if (fStr === "yearly") return BigInt(31536000000);
  return BigInt(fStr || "2592000000");
}
