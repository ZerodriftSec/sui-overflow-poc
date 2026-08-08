import { getDatabaseClient } from '@noderails/database';
import { ValidationError, WEBHOOK_CONFIG } from '@noderails/common';

// ============================================================================
// WEBHOOK DELIVERY CONFIG SERVICE
//
// Reads/writes webhook delivery settings from the PlatformConfig singleton.
// All values fall back to WEBHOOK_CONFIG constants when not yet in the DB.
// ============================================================================

export interface WebhookDeliverySettings {
  redundantSends: number;
  redundantDelaysMs: number[];
  baseDelayMs: number;
  backoffMultiplier: number;   // actual float, e.g. 1.3
  maxDelayMs: number;
  maxRetries: number;
}

// ── Hardcoded fallback matching WEBHOOK_CONFIG ──

const DEFAULTS: WebhookDeliverySettings = {
  redundantSends: WEBHOOK_CONFIG.REDUNDANT_SENDS,
  redundantDelaysMs: [...WEBHOOK_CONFIG.REDUNDANT_DELAYS_MS],
  baseDelayMs: WEBHOOK_CONFIG.BASE_DELAY_MS,
  backoffMultiplier: WEBHOOK_CONFIG.BACKOFF_MULTIPLIER,
  maxDelayMs: WEBHOOK_CONFIG.MAX_DELAY_MS,
  maxRetries: WEBHOOK_CONFIG.MAX_RETRIES,
};

// ============================================================================
// READ
// ============================================================================

/**
 * Load the webhook delivery config from the DB. Auto-creates the
 * PlatformConfig singleton if it doesn't exist.
 */
export async function getWebhookDeliveryConfig(): Promise<WebhookDeliverySettings> {
  const db = getDatabaseClient();

  const config = await db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: {},
    update: {},
  });

  return {
    redundantSends: config.webhookRedundantSends,
    redundantDelaysMs: parseJsonIntArray(config.webhookRedundantDelays, DEFAULTS.redundantDelaysMs),
    baseDelayMs: config.webhookBaseDelayMs,
    backoffMultiplier: config.webhookBackoffMultiplier / 100,
    maxDelayMs: config.webhookMaxDelayMs,
    maxRetries: config.webhookMaxRetries,
  };
}

// ============================================================================
// WRITE
// ============================================================================

export interface UpdateWebhookConfigInput {
  redundantSends?: number;
  redundantDelaysMs?: number[];
  baseDelayMs?: number;
  backoffMultiplier?: number;   // actual float, e.g. 1.3
  maxDelayMs?: number;
  maxRetries?: number;
}

export async function updateWebhookDeliveryConfig(
  input: UpdateWebhookConfigInput,
): Promise<WebhookDeliverySettings> {
  validate(input);

  const db = getDatabaseClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};

  if (input.redundantSends !== undefined) data.webhookRedundantSends = input.redundantSends;
  if (input.redundantDelaysMs !== undefined) data.webhookRedundantDelays = JSON.stringify(input.redundantDelaysMs);
  if (input.baseDelayMs !== undefined) data.webhookBaseDelayMs = input.baseDelayMs;
  if (input.backoffMultiplier !== undefined) data.webhookBackoffMultiplier = Math.round(input.backoffMultiplier * 100);
  if (input.maxDelayMs !== undefined) data.webhookMaxDelayMs = input.maxDelayMs;
  if (input.maxRetries !== undefined) data.webhookMaxRetries = input.maxRetries;

  const config = await db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: data,
    update: data,
  });

  return {
    redundantSends: config.webhookRedundantSends,
    redundantDelaysMs: parseJsonIntArray(config.webhookRedundantDelays, DEFAULTS.redundantDelaysMs),
    baseDelayMs: config.webhookBaseDelayMs,
    backoffMultiplier: config.webhookBackoffMultiplier / 100,
    maxDelayMs: config.webhookMaxDelayMs,
    maxRetries: config.webhookMaxRetries,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJsonIntArray(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch {
      // fall through
    }
  }
  return fallback;
}

function validate(input: UpdateWebhookConfigInput): void {
  if (input.redundantSends !== undefined) {
    if (!Number.isInteger(input.redundantSends) || input.redundantSends < 1 || input.redundantSends > 10) {
      throw new ValidationError('redundantSends must be an integer between 1 and 10');
    }
  }
  if (input.redundantDelaysMs !== undefined) {
    if (!Array.isArray(input.redundantDelaysMs) || input.redundantDelaysMs.some(d => typeof d !== 'number' || d < 0)) {
      throw new ValidationError('redundantDelaysMs must be an array of non-negative numbers');
    }
    if (input.redundantDelaysMs.length > 10) {
      throw new ValidationError('redundantDelaysMs must have at most 10 entries');
    }
  }
  if (input.baseDelayMs !== undefined) {
    if (!Number.isInteger(input.baseDelayMs) || input.baseDelayMs < 1000 || input.baseDelayMs > 300_000) {
      throw new ValidationError('baseDelayMs must be between 1000 (1s) and 300000 (5min)');
    }
  }
  if (input.backoffMultiplier !== undefined) {
    if (input.backoffMultiplier < 1.01 || input.backoffMultiplier > 5) {
      throw new ValidationError('backoffMultiplier must be between 1.01 and 5');
    }
  }
  if (input.maxDelayMs !== undefined) {
    if (!Number.isInteger(input.maxDelayMs) || input.maxDelayMs < 60_000 || input.maxDelayMs > 86_400_000) {
      throw new ValidationError('maxDelayMs must be between 60000 (1min) and 86400000 (24h)');
    }
  }
  if (input.maxRetries !== undefined) {
    if (!Number.isInteger(input.maxRetries) || input.maxRetries < 1 || input.maxRetries > 200) {
      throw new ValidationError('maxRetries must be between 1 and 200');
    }
  }
}
