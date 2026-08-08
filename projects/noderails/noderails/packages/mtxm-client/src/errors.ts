/**
 * Custom error thrown for non-2xx MTXM API responses.
 */
export class MtxmApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`MTXM API error ${status} on ${endpoint}: ${body}`);
    this.name = 'MtxmApiError';
  }
}
