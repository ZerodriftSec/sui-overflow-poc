import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify an incoming Indexer webhook request.
 *
 * The Indexer signs `{timestamp}.{rawBody}` with HMAC-SHA256 and
 * sends the hex digest in `X-Indexer-Signature` and the unix-ms
 * timestamp in `X-Indexer-Timestamp`.
 *
 * @param rawBody   - The raw request body string (NOT parsed JSON)
 * @param signature - Value of the `X-Indexer-Signature` header (hex)
 * @param timestamp - Value of the `X-Indexer-Timestamp` header (unix ms string)
 * @param secret    - The webhook secret configured in the Indexer admin
 * @param maxAgeMs  - Maximum age of the timestamp (default: 5 minutes)
 * @returns `true` if the signature is valid and not too old
 */
export function verifyIndexerWebhook(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
  maxAgeMs = 300_000,
): boolean {
  // Reject stale timestamps
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > maxAgeMs) {
    return false;
  }

  const signed = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signed).digest('hex');

  // Lengths must match before timingSafeEqual
  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

/**
 * Discriminate between event and native-transfer webhook payloads.
 */
export function isNativeTransferPayload(
  payload: unknown,
): payload is { type: 'native_transfer' } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    (payload as Record<string, unknown>).type === 'native_transfer'
  );
}
