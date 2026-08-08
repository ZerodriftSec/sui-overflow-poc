import type { Request, Response, NextFunction } from 'express';
import { RateLimitError, RATE_LIMIT_CONFIG } from '@noderails/common';
import { getRedis } from '@noderails/redis';

interface RateLimitOptions {
  max?: number;
  windowSec?: number;
  keyFn?: (req: Request) => string;
}

/**
 * Redis-backed fixed-window rate limiter.
 * All instances share the same counters — safe for horizontal scaling.
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    max = RATE_LIMIT_CONFIG.DEFAULT_MAX,
    windowSec = RATE_LIMIT_CONFIG.DEFAULT_WINDOW_SEC,
    keyFn = (req) => req.ip ?? 'unknown',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rl:${keyFn(req)}:${windowSec}`;
    const redis = getRedis();

    try {
      const count = await redis.incr(key);

      // Set TTL only on first request in the window
      if (count === 1) {
        await redis.expire(key, windowSec);
      }

      const ttl = await redis.ttl(key);
      const resetAt = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', resetAt);

      if (count > max) {
        const retryAfter = Math.max(ttl, 1);
        res.setHeader('Retry-After', retryAfter);
        next(new RateLimitError(retryAfter));
        return;
      }

      next();
    } catch {
      // If Redis is down, fail-open — allow the request through
      next();
    }
  };
}
