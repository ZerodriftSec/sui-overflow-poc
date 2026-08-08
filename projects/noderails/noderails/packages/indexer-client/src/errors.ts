/**
 * Custom error thrown for non-2xx Indexer API responses.
 */
export class IndexerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`Indexer API error ${status} on ${endpoint}: ${body}`);
    this.name = 'IndexerApiError';
  }
}
