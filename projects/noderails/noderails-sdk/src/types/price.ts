// ─── Response Types ──────────────────────────────────────────────────

export interface PriceConversion {
  symbol: string;
  currency: string;
  priceFiat: number;
  /** @deprecated Use priceFiat — kept for backward compatibility */
  priceUsd: number;
  cachedAt: string;
  amountFiat?: number | string;
  tokenAmount?: number | string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface PriceConvertParams {
  symbol: string;
  currency?: string;
  amountFiat?: number;
  /** @deprecated Use amountFiat — kept for backward compatibility */
  amountUsd?: number;
  tokenAmount?: number;
}
