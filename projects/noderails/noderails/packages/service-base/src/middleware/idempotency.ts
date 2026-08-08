/**
 * Idempotency Key Middleware
 *
 * Inspects the `Idempotency-Key` header on mutating requests (POST/PUT/PATCH).
 * If a previous response has been cached for this key, it is replayed immediately.
 * Otherwise the response is captured and stored in Redis for replay within a TTL window.
 *
 * Stripe-compatible behaviour:
 * - Keys are scoped to the API key / merchant (via `req.appCtx.id` or `req.merchant.id`)
 * - Concurrent requests with the same key receive 409 (lock-based)
 * - Cached responses are replayed with the same status code, headers, and body
 * - Keys expire after 24 hours
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '@noderails/redis';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const LOCK_TTL_SECONDS = 60; // 1 minute lock while processing

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function scopeKey(req: Request): string {
  // Scope to app (API key auth) or merchant (JWT auth)
  const scope = req.appCtx?.id ?? req.merchant?.id ?? 'anon';
  return scope;
}

/**
 * Middleware factory. Attach after auth middleware so `req.appCtx` or `req.merchant` is available.
 */
export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only apply to mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return next(); // No key = no idempotency enforcement
    }

    if (idempotencyKey.length > 255) {
      res.status(400).json({
        success: false,
        error: {
          type: 'invalid_request_error',
          message: 'Idempotency-Key must be at most 255 characters',
        },
      });
      return;
    }

    const redis = getRedis();
    const scope = scopeKey(req);
    const cacheKey = `idempotency:${scope}:${idempotencyKey}`;
    const lockKey = `${cacheKey}:lock`;

    // Check for cached response
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed: CachedResponse = JSON.parse(cached);
      // Replay the original response
      for (const [k, v] of Object.entries(parsed.headers)) {
        res.setHeader(k, v);
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(parsed.statusCode).send(parsed.body);
      return;
    }

    // Acquire lock — prevent concurrent processing of the same key
    const lockAcquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!lockAcquired) {
      res.status(409).json({
        success: false,
        error: {
          type: 'idempotency_error',
          message: 'A request with this Idempotency-Key is currently being processed. Retry shortly.',
        },
      });
      return;
    }

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const captureAndCache = async (body: string) => {
      const headersToCache: Record<string, string> = {};
      const contentType = res.getHeader('content-type');
      if (contentType) headersToCache['content-type'] = String(contentType);

      const entry: CachedResponse = {
        statusCode: res.statusCode,
        headers: headersToCache,
        body,
      };

      // Cache the response and release the lock
      await Promise.all([
        redis.set(cacheKey, JSON.stringify(entry), 'EX', IDEMPOTENCY_TTL_SECONDS),
        redis.del(lockKey),
      ]);
    };

    res.json = function (data: unknown) {
      const body = JSON.stringify(data);
      captureAndCache(body).catch(() => {}); // fire-and-forget
      res.setHeader('content-type', 'application/json');
      return originalSend(body);
    } as typeof res.json;

    res.send = function (data: unknown) {
      const body = typeof data === 'string' ? data : JSON.stringify(data);
      captureAndCache(body).catch(() => {}); // fire-and-forget
      return originalSend(data);
    } as typeof res.send;

    // Release lock on error
    res.on('close', () => {
      if (!res.writableEnded) {
        redis.del(lockKey).catch(() => {});
      }
    });

    next();
  };
}
