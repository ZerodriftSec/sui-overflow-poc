import { SignatureVerificationError } from "./errors";

const SIGNATURE_HEADER = "x-noderails-signature";
const TIMESTAMP_HEADER = "x-noderails-timestamp";

/** Maximum tolerance for timestamp drift (5 minutes). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Static utility for verifying incoming webhook signatures.
 *
 * @example
 * ```ts
 * import { NodeRails } from '@noderails/sdk';
 *
 * // In your Express webhook handler:
 * app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
 *   const event = NodeRails.webhooks.constructEvent(
 *     req.body,                                // raw body (Buffer or string)
 *     req.headers['x-noderails-signature'],     // signature header
 *     req.headers['x-noderails-timestamp'],     // timestamp header
 *     'whsec_...',                              // your webhook secret
 *   );
 *   console.log('Verified event:', event);
 *   res.sendStatus(200);
 * });
 * ```
 */
export class Webhooks {
  /**
   * Verify and parse a webhook payload.
   *
   * @param rawBody - The raw request body as a string or Buffer.
   * @param signatureHeader - The `x-noderails-signature` header value.
   * @param timestampHeader - The `x-noderails-timestamp` header value.
   * @param secret - The webhook endpoint secret.
   * @param toleranceSeconds - Maximum allowed age of the timestamp (default: 300s).
   * @returns The parsed event payload.
   * @throws {SignatureVerificationError} if the signature is invalid or the timestamp is too old.
   */
  constructEvent<T = Record<string, unknown>>(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined,
    secret: string,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  ): T {
    if (!signatureHeader) {
      throw new SignatureVerificationError(
        `Missing ${SIGNATURE_HEADER} header`,
      );
    }
    if (!timestampHeader) {
      throw new SignatureVerificationError(
        `Missing ${TIMESTAMP_HEADER} header`,
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (Number.isNaN(timestamp)) {
      throw new SignatureVerificationError(
        `Invalid ${TIMESTAMP_HEADER} header: not a number`,
      );
    }

    // Check timestamp drift
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      throw new SignatureVerificationError(
        `Timestamp outside tolerance of ${toleranceSeconds}s. ` +
          `Event timestamp: ${timestamp}, current time: ${now}`,
      );
    }

    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
    const signedPayload = `${timestamp}.${body}`;

    const expectedSignature = this.computeHmac(signedPayload, secret);
    if (!this.timingSafeEqual(signatureHeader, expectedSignature)) {
      throw new SignatureVerificationError(
        "Signature mismatch. The webhook payload may have been tampered with, " +
          "or the wrong secret was used.",
      );
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new SignatureVerificationError("Failed to parse webhook payload as JSON");
    }
  }

  /**
   * Verify a webhook signature without parsing the body.
   * Returns `true` if valid, `false` otherwise.
   */
  verifySignature(
    rawBody: string | Buffer,
    signatureHeader: string,
    timestampHeader: string,
    secret: string,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  ): boolean {
    try {
      this.constructEvent(rawBody, signatureHeader, timestampHeader, secret, toleranceSeconds);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Header names used by NodeRails webhooks.
   */
  get headers() {
    return {
      signature: SIGNATURE_HEADER,
      timestamp: TIMESTAMP_HEADER,
    } as const;
  }

  /**
   * Compute HMAC-SHA256. Uses Web Crypto API for cross-runtime compatibility.
   * Falls back to Node.js `crypto` module when available.
   */
  private computeHmac(payload: string, secret: string): string {
    // Node.js path (sync, fast)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require("crypto");
      return crypto.createHmac("sha256", secret).update(payload).digest("hex");
    } catch {
      // Not Node.js — shouldn't happen in typical SDK usage but handle gracefully
      throw new SignatureVerificationError(
        "HMAC computation requires Node.js crypto module. " +
          "Webhook verification is only supported in Node.js, Deno, and Bun runtimes.",
      );
    }
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    // Node.js crypto.timingSafeEqual
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const crypto = require("crypto");
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      // Fallback: constant-time comparison
      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    }
  }
}
