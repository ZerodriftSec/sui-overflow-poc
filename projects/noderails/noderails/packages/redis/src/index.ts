/**
 * @noderails/redis
 *
 * Shared Redis client for NodeRails services.
 * Provides a singleton ioredis instance configured once at startup
 * and reusable across modules (rate-limiting, caching, OTP, etc.).
 */

import Redis from 'ioredis';

// ── Singleton ──

let client: Redis | null = null;

export interface RedisConfig {
  /** Redis connection URL (e.g. redis://localhost:6379 or rediss://... for TLS) */
  url: string;
}

/**
 * Initialise the shared Redis client.
 * Call once at application startup before any module uses `getRedis()`.
 *
 * Automatically enables TLS when the URL uses `rediss://` scheme
 * (required for AWS ElastiCache Serverless).
 */
export function createRedisClient(config: RedisConfig): Redis {
  if (client) return client;

  const isTls = config.url.startsWith('rediss://');

  client = new Redis(config.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    // ElastiCache Serverless requires TLS — ioredis needs explicit tls option
    ...(isTls && { tls: { rejectUnauthorized: true } }),
    // Exponential backoff retry: 50ms → 100ms → ... capped at 5s
    retryStrategy(times: number) {
      return Math.min(times * 50, 5000);
    },
  });

  // Prevent unhandled error events from crashing the process / flooding logs
  client.on('error', (err: Error) => {
    // Log once per unique error code, suppress duplicates
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
    if (code !== lastErrorCode) {
      lastErrorCode = code;
      console.error(`[noderails/redis] connection error: ${err.message} (${code})`);
    }
  });

  client.on('connect', () => {
    lastErrorCode = null; // reset so next error is logged
  });

  return client;
}

let lastErrorCode: string | null = null;

/**
 * Return the shared Redis client.
 * Throws if `createRedisClient()` has not been called yet.
 */
export function getRedis(): Redis {
  if (!client) {
    throw new Error('@noderails/redis: client not initialised — call createRedisClient() first');
  }
  return client;
}

/**
 * Disconnect the shared Redis client.
 */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

// Re-export the Redis type so consumers don't need to install ioredis directly
export type { Redis };
