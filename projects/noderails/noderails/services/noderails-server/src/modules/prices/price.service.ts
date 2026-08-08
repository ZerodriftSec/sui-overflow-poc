import { PRICE_CONFIG } from '@noderails/common';
import type { Logger } from '@noderails/service-base';
import { getRedis } from '@noderails/redis';
import { env } from '../../config.js';

// ── Redis-backed price cache ──

const CACHE_PREFIX = 'price:';

interface CacheEntry {
  price: number;
  fetchedAt: number;
}

function cacheKey(symbol: string, currency: string): string {
  return `${CACHE_PREFIX}${symbol}:${currency}`;
}

async function getCached(symbol: string, currency: string): Promise<CacheEntry | null> {
  const raw = await getRedis().get(cacheKey(symbol, currency));
  if (!raw) return null;
  return JSON.parse(raw) as CacheEntry;
}

async function setCached(symbol: string, currency: string, entry: CacheEntry): Promise<void> {
  await getRedis().set(
    cacheKey(symbol, currency),
    JSON.stringify(entry),
    'EX',
    PRICE_CONFIG.MAX_STALENESS_SEC,
  );
}

/**
 * Token symbols CryptoCompare does not list — use a liquid proxy for /price?fsym=…
 nee * (e.g. USD-pegged stablecoins). Returned API `symbol` stays the request symbol (PUSD, MUSD).
 */
const CRYPTOCOMPARE_FSYM_ALIASES: Record<string, string> = {
  PUSD: 'USDC',
  MUSD: 'USDC',
};

function cryptoCompareFsym(symbol: string): string {
  const u = symbol.toUpperCase();
  return CRYPTOCOMPARE_FSYM_ALIASES[u] ?? u;
}


async function fetchPrice(symbol: string, fiatCurrency: string, logger: Logger): Promise<number> {
  const fsym = cryptoCompareFsym(symbol);
  const fiat = fiatCurrency.toUpperCase();
  const url = `${PRICE_CONFIG.CRYPTOCOMPARE_BASE_URL}/price?fsym=${fsym}&tsyms=${fiat}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (env.CRYPTOCOMPARE_API_KEY) {
    headers['authorization'] = `Apikey ${env.CRYPTOCOMPARE_API_KEY}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRICE_CONFIG.TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`CryptoCompare responded with ${res.status}`);

    const data = (await res.json()) as Record<string, unknown>;
    if ((data as any).Response === 'Error') throw new Error((data as any).Message ?? `Price not available for ${symbol}`);
    const price = data[fiat] as number | undefined;
    if (price === undefined) throw new Error(`Price not available for ${symbol} in ${fiat}`);

    logger.debug('Price fetched', {
      symbol: symbol.toUpperCase(),
      cryptoCompareFsym: fsym,
      fiatCurrency: fiat,
      price,
    });
    return price;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ──

export interface PriceResult {
  symbol: string;
  currency: string;
  priceFiat: number;
  /** @deprecated Use priceFiat — kept for backward compatibility */
  priceUsd: number;
  cachedAt: string;
}

export async function getPrice(symbol: string, logger: Logger, fiatCurrency = 'USD'): Promise<PriceResult> {
  const key = symbol.toUpperCase();
  const fiat = fiatCurrency.toUpperCase();
  const now = Date.now();
  const cached = await getCached(key, fiat);

  const buildResult = (price: number, fetchedAt: number): PriceResult => ({
    symbol: key,
    currency: fiat,
    priceFiat: price,
    priceUsd: price, // backward compat — accurate only when fiat is USD
    cachedAt: new Date(fetchedAt).toISOString(),
  });

  if (cached && now - cached.fetchedAt < PRICE_CONFIG.PRICE_CACHE_TTL_SEC * 1000) {
    return buildResult(cached.price, cached.fetchedAt);
  }

  if (cached && now - cached.fetchedAt < PRICE_CONFIG.MAX_STALENESS_SEC * 1000) {
    try {
      const price = await fetchPrice(key, fiat, logger);
      await setCached(key, fiat, { price, fetchedAt: now });
      return buildResult(price, now);
    } catch {
      logger.warn('Using stale price', { symbol: key, currency: fiat, age: now - cached.fetchedAt });
      return buildResult(cached.price, cached.fetchedAt);
    }
  }

  const price = await fetchPrice(key, fiat, logger);
  await setCached(key, fiat, { price, fetchedAt: now });
  return buildResult(price, now);
}

export function convertFiatToToken(fiatAmount: number, priceFiat: number): string {
  if (priceFiat <= 0) throw new Error('Invalid price');
  return (fiatAmount / priceFiat).toFixed(18);
}

export function convertTokenToFiat(tokenAmount: number, priceFiat: number): string {
  return (tokenAmount * priceFiat).toFixed(8);
}

/** @deprecated Use convertFiatToToken */
export const convertUsdToToken = convertFiatToToken;

/** @deprecated Use convertTokenToFiat */
export const convertTokenToUsd = convertTokenToFiat;
