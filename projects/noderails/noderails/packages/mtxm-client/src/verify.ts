import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify an incoming MTXM webhook request.
 *
 * MTXM signs the raw request body with HMAC-SHA256 and sends
 * "sha256=<hex>" in the `X-Signature-256` header.
 *
 * @param rawBody   - The raw request body string (NOT parsed JSON)
 * @param signature - Value of the `X-Signature-256` header (format: "sha256=<hex>")
 * @param secret    - The webhook secret from MTXM
 * @returns `true` if the signature is valid
 */
export function verifyMtxmWebhook(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  // Strip "sha256=" prefix if present
  const sigHex = signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature;

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  if (expected.length !== sigHex.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'utf-8'),
      Buffer.from(sigHex, 'utf-8'),
    );
  } catch {
    return false;
  }
}
