export function isSuiRpcRateLimitError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
}

/** Retry transient Sui fullnode rate limits (429) when building or querying PTBs. */
export async function withSuiRpcRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isSuiRpcRateLimitError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 300 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export function formatSuiRpcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (isSuiRpcRateLimitError(err)) {
    return (
      'Sui RPC rate limit reached while preparing the transaction. ' +
      'Configure a dedicated rpcUrl for this chain in admin (or set SUI_TESTNET_RPC_URL in .env) and retry.'
    );
  }
  return msg;
}
