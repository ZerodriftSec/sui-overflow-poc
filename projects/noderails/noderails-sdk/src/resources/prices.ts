import type { HttpClient } from "../http";
import type { PriceConversion, PriceConvertParams } from "../types/price";

export class Prices {
  constructor(private readonly http: HttpClient) {}

  /**
   * Convert between fiat and a crypto token amount.
   *
   * @example
   * ```ts
   * // Get token amount for a fiat value
   * const result = await noderails.prices.convert({
   *   symbol: 'ETH',
   *   amountFiat: 100,
   *   currency: 'USD',
   * });
   * console.log(result.tokenAmount); // "0.031234..."
   *
   * // Get fiat value for a token amount
   * const result2 = await noderails.prices.convert({
   *   symbol: 'ETH',
   *   tokenAmount: 1.5,
   * });
   * console.log(result2.amountFiat); // "4800.50..."
   * ```
   */
  async convert(params: PriceConvertParams): Promise<PriceConversion> {
    return this.http.request<PriceConversion>({
      method: "GET",
      path: "/prices/convert",
      query: params as unknown as Record<string, string | number | boolean | undefined>,
    });
  }

  /**
   * Get the current price for a token symbol.
   */
  async getPrice(symbol: string, currency?: string): Promise<PriceConversion> {
    return this.http.request<PriceConversion>({
      method: "GET",
      path: `/prices/${symbol}`,
      query: currency ? { currency } : undefined,
    });
  }
}
