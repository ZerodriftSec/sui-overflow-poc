/**
 * Central Configuration
 *
 * Every tuneable value lives here so it can be changed from one place.
 * Services import from `@noderails/common/constants` and override via env vars.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ============ JWT / Auth ============

export const AUTH_CONFIG = {
  /** Access-token lifetime */
  ACCESS_TOKEN_TTL: '15m',
  /** Refresh-token lifetime */
  REFRESH_TOKEN_TTL: '7d',
  /** Refresh-token cookie name (merchant dashboard) */
  REFRESH_COOKIE_NAME: 'nr_refresh',
  /** Refresh-token cookie name (platform admin) */
  ADMIN_REFRESH_COOKIE_NAME: 'nr_admin_refresh',
  /** Refresh-token cookie name (team member) */
  TEAM_REFRESH_COOKIE_NAME: 'nr_team_refresh',
  /** Invite token expiry in days */
  INVITE_TOKEN_EXPIRY_DAYS: 7,
  /** Bcrypt salt rounds for password hashing */
  BCRYPT_SALT_ROUNDS: 12,
  /** Max failed login attempts before temporary lockout */
  MAX_LOGIN_ATTEMPTS: 5,
  /** Lockout duration after max failed attempts (seconds) */
  LOCKOUT_DURATION_SEC: 900, // 15 min
} as const;

// ============ Webhook Delivery ============

export const WEBHOOK_CONFIG = {
  // ── Redundant sends ──
  /** Number of redundant sends per event (each fires independently) */
  REDUNDANT_SENDS: 3,
  /** Stagger delays (ms) for each redundant send: 0s, 1 min, 5 min */
  REDUNDANT_DELAYS_MS: [0, 60_000, 300_000] as readonly number[],

  // ── Exponential-backoff retries ──
  /** Base delay in ms (first retry waits this long) */
  BASE_DELAY_MS: 5_000,
  /** Multiplier per retry — stored as x100 int in DB (130 = 1.3) */
  BACKOFF_MULTIPLIER: 1.3,
  /** Max delay cap per retry (default: 1 h) */
  MAX_DELAY_MS: 3_600_000,
  /** Total retry attempts per delivery */
  MAX_RETRIES: 50,

  // ── HTTP delivery ──
  /** HTTP timeout per delivery attempt (ms) */
  TIMEOUT_MS: 30_000,
  /** HMAC algorithm for webhook signatures */
  SIGNATURE_ALGO: 'sha256' as const,
  /** Header name for the webhook signature */
  SIGNATURE_HEADER: 'x-noderails-signature',
  /** Header name for the webhook timestamp */
  TIMESTAMP_HEADER: 'x-noderails-timestamp',
} as const;

/**
 * Compute the delay (ms) for a given retry attempt using exponential backoff.
 *
 *   delay = min(baseDelay × multiplier^attempt, maxDelay)
 *
 * With defaults (5 s base, 1.3×, 1 h cap):
 *   ~15 retries in first 30 min, ~25 in first hour, then 1 h intervals.
 */
export function computeRetryDelay(
  attempt: number,
  baseDelayMs: number = WEBHOOK_CONFIG.BASE_DELAY_MS,
  multiplier: number = WEBHOOK_CONFIG.BACKOFF_MULTIPLIER,
  maxDelayMs: number = WEBHOOK_CONFIG.MAX_DELAY_MS,
): number {
  return Math.min(
    Math.round(baseDelayMs * Math.pow(multiplier, attempt)),
    maxDelayMs,
  );
}

// ============ Price Service ============

export const PRICE_CONFIG = {
  /** CryptoCompare API base URL */
  CRYPTOCOMPARE_BASE_URL: 'https://min-api.cryptocompare.com/data',
  /** Cache TTL for token prices (seconds) — 1 second for real-time checkout */
  PRICE_CACHE_TTL_SEC: 1,
  /** HTTP timeout for price API calls (ms) */
  TIMEOUT_MS: 10_000,
  /** Max price staleness before rejecting (seconds) */
  MAX_STALENESS_SEC: 300, // 5 min
} as const;

// ============ Payment ============

export const PAYMENT_CONFIG = {
  /** Default timelock duration (seconds) — 7 days */
  DEFAULT_TIMELOCK_SEC: 7 * 24 * 60 * 60,
  /** Minimum timelock duration (seconds) — 1 day */
  MIN_TIMELOCK_SEC: 24 * 60 * 60,
  /** Minimum timelock in test mode (seconds) — 60 seconds */
  MIN_TIMELOCK_TEST_SEC: 60,
  /** Maximum timelock duration (seconds) — 30 days */
  MAX_TIMELOCK_SEC: 30 * 24 * 60 * 60,
  /** Payment-intent expiry if not authorised (seconds) — 1 hour */
  INTENT_EXPIRY_SEC: 3_600,
  /** Seconds before settlement to schedule the auto-settle job */
  AUTO_SETTLE_LEAD_SEC: 60,
} as const;

// ============ Payout ============

export const PAYOUT_CONFIG = {
  /** Default session signature expiry (seconds) — 24 hours */
  SESSION_EXPIRY_SEC: 24 * 60 * 60,
  /** Min payout amount in USD */
  MIN_PAYOUT_USD: '1.00',
} as const;

// ============ Rate Limiting ============

export const RATE_LIMIT_CONFIG = {
  /** Default requests per window */
  DEFAULT_MAX: 100,
  /** Default window size (seconds) */
  DEFAULT_WINDOW_SEC: 60,
  /** Stricter limit for auth endpoints */
  AUTH_MAX: 100,
  AUTH_WINDOW_SEC: 60,
  /** Payment creation limit */
  PAYMENT_MAX: 30,
  PAYMENT_WINDOW_SEC: 60,
} as const;

// ============ Server ============

export const SERVER_CONFIG = {
  /** Default service port (overridden per service via env) */
  DEFAULT_PORT: 3000,
  /** Graceful shutdown timeout (ms) */
  SHUTDOWN_TIMEOUT_MS: 15_000,
  /** Request body size limit */
  BODY_LIMIT: '1mb',
  /** CORS allowed origins (comma-separated in env, '*' for dev) */
  DEFAULT_CORS_ORIGIN: '*',
} as const;

// ============ Queue / Worker ============

export const WORKER_CONFIG = {
  /** Default concurrency per worker */
  DEFAULT_CONCURRENCY: 5,
  /** Max attempts before dead-letter */
  DEFAULT_MAX_ATTEMPTS: 3,
  /** Base back-off delay (ms) */
  DEFAULT_BACKOFF_MS: 5_000,
  /** Back-off type */
  BACKOFF_TYPE: 'exponential' as const,
} as const;

// ============ Subscription Billing ============

export const SUBSCRIPTION_CONFIG = {
  /** Max charge retry attempts before PAST_DUE */
  MAX_CAPTURE_RETRIES: 3,
  /** Retry delay schedule (hours after failed charge) */
  RETRY_DELAYS_HOURS: [24, 48, 72] as readonly number[],
  /** Days in PAST_DUE before auto-cancellation */
  GRACE_PERIOD_DAYS: 7,
  /** Whether to reconcile missed jobs on server startup */
  RECONCILE_ON_STARTUP: true,
} as const;

// ============ EIP-712 Signing Domains ============

export const EIP712_DOMAINS = {
  ESCROW: {
    name: 'NodeRailsEscrow',
    version: '1',
  },
  MERCHANT_MANAGER: {
    name: 'NodeRailsMerchantManager',
    version: '1',
  },
} as const;
