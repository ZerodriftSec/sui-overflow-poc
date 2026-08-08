import { getDatabaseClient } from '@noderails/database';
import { ValidationError, PAYMENT_CONFIG } from '@noderails/common';
import { env } from '../../config.js';

// ============================================================================
// TIMELOCK CONFIG SERVICE
//
// Resolves effective timelock configuration by priority:
//   1. Per-merchant override (Merchant.disputeStartSeconds / settlementSeconds)
//   2. Platform-level config (PlatformConfig singleton row)
//   3. Hardcoded fallback (PAYMENT_CONFIG constants)
//
// Timelocks are ALWAYS server-controlled — merchants cannot set them via API.
// ============================================================================

export interface TimelockConfig {
  /** Seconds from capture before dispute window opens */
  disputeStartSeconds: number;
  /** Seconds from capture until settlement is allowed */
  settlementSeconds: number;
}

/** Hardcoded fallback — used if DB has no PlatformConfig row */
const FALLBACK_CONFIG: TimelockConfig = {
  disputeStartSeconds: 86_400,   // 1 day
  settlementSeconds: 604_800,    // 7 days
};

// ============================================================================
// READ — Get effective config for a merchant (or platform default)
// ============================================================================

/**
 * Resolve the effective timelock config for a given merchant.
 *
 * Resolution order:
 *   1. Merchant-level override (if both fields are set)
 *   2. PlatformConfig singleton
 *   3. Hardcoded fallback
 */
export async function getEffectiveTimelockConfig(merchantId: string): Promise<TimelockConfig> {
  const db = getDatabaseClient();

  // Load merchant + platform config in parallel
  const [merchant, platformConfig] = await Promise.all([
    db.merchant.findUnique({
      where: { id: merchantId },
      select: { disputeStartSeconds: true, settlementSeconds: true },
    }),
    getPlatformTimelockConfig(),
  ]);

  // If merchant has BOTH override fields set, use them
  if (
    merchant &&
    merchant.disputeStartSeconds !== null &&
    merchant.settlementSeconds !== null
  ) {
    return {
      disputeStartSeconds: merchant.disputeStartSeconds,
      settlementSeconds: merchant.settlementSeconds,
    };
  }

  return platformConfig;
}

/**
 * Get the platform-level timelock defaults.
 * Auto-creates the singleton row if it doesn't exist.
 */
export async function getPlatformTimelockConfig(): Promise<TimelockConfig> {
  const db = getDatabaseClient();

  const config = await db.platformConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!config) {
    // Auto-create with defaults on first access
    const created = await db.platformConfig.upsert({
      where: { id: 'singleton' },
      create: {},           // uses schema defaults (86400, 604800)
      update: {},           // no-op if race condition
    });
    return {
      disputeStartSeconds: created.disputeStartSeconds,
      settlementSeconds: created.settlementSeconds,
    };
  }

  return {
    disputeStartSeconds: config.disputeStartSeconds,
    settlementSeconds: config.settlementSeconds,
  };
}

// ============================================================================
// WRITE — Admin-only mutations
// ============================================================================

/**
 * Update platform-level timelock defaults.
 */
export async function updatePlatformTimelockConfig(
  input: Partial<TimelockConfig>,
): Promise<TimelockConfig> {
  validateTimelockValues(input);

  const db = getDatabaseClient();
  const config = await db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: {
      disputeStartSeconds: input.disputeStartSeconds ?? FALLBACK_CONFIG.disputeStartSeconds,
      settlementSeconds: input.settlementSeconds ?? FALLBACK_CONFIG.settlementSeconds,
    },
    update: {
      ...(input.disputeStartSeconds !== undefined && { disputeStartSeconds: input.disputeStartSeconds }),
      ...(input.settlementSeconds !== undefined && { settlementSeconds: input.settlementSeconds }),
    },
  });

  return {
    disputeStartSeconds: config.disputeStartSeconds,
    settlementSeconds: config.settlementSeconds,
  };
}

/**
 * Set per-merchant timelock overrides.
 */
export async function setMerchantTimelockOverride(
  merchantId: string,
  input: TimelockConfig,
): Promise<TimelockConfig> {
  validateTimelockValues(input);

  const db = getDatabaseClient();
  const merchant = await db.merchant.update({
    where: { id: merchantId },
    data: {
      disputeStartSeconds: input.disputeStartSeconds,
      settlementSeconds: input.settlementSeconds,
    },
    select: { disputeStartSeconds: true, settlementSeconds: true },
  });

  return {
    disputeStartSeconds: merchant.disputeStartSeconds!,
    settlementSeconds: merchant.settlementSeconds!,
  };
}

/**
 * Remove per-merchant timelock overrides (revert to platform defaults).
 */
export async function removeMerchantTimelockOverride(merchantId: string): Promise<void> {
  const db = getDatabaseClient();
  await db.merchant.update({
    where: { id: merchantId },
    data: {
      disputeStartSeconds: null,
      settlementSeconds: null,
    },
  });
}

/**
 * Get merchant-level timelock override (null if not set).
 */
export async function getMerchantTimelockOverride(
  merchantId: string,
): Promise<TimelockConfig | null> {
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { disputeStartSeconds: true, settlementSeconds: true },
  });

  if (
    !merchant ||
    merchant.disputeStartSeconds === null ||
    merchant.settlementSeconds === null
  ) {
    return null;
  }

  return {
    disputeStartSeconds: merchant.disputeStartSeconds,
    settlementSeconds: merchant.settlementSeconds,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateTimelockValues(input: Partial<TimelockConfig>): void {
  const { disputeStartSeconds, settlementSeconds } = input;
  const minTimelock = env.ENABLE_TEST_TIMELOCKS
    ? PAYMENT_CONFIG.MIN_TIMELOCK_TEST_SEC
    : PAYMENT_CONFIG.MIN_TIMELOCK_SEC;

  if (disputeStartSeconds !== undefined) {
    if (disputeStartSeconds < 0) {
      throw new ValidationError('Dispute start delay cannot be negative');
    }
    if (disputeStartSeconds > PAYMENT_CONFIG.MAX_TIMELOCK_SEC) {
      throw new ValidationError(
        `Dispute start delay cannot exceed ${PAYMENT_CONFIG.MAX_TIMELOCK_SEC}s (${PAYMENT_CONFIG.MAX_TIMELOCK_SEC / 86_400} days)`,
      );
    }
  }

  if (settlementSeconds !== undefined) {
    if (settlementSeconds < minTimelock) {
      throw new ValidationError(
        `Settlement duration must be at least ${minTimelock}s`,
      );
    }
    if (settlementSeconds > PAYMENT_CONFIG.MAX_TIMELOCK_SEC) {
      throw new ValidationError(
        `Settlement duration cannot exceed ${PAYMENT_CONFIG.MAX_TIMELOCK_SEC}s (${PAYMENT_CONFIG.MAX_TIMELOCK_SEC / 86_400} days)`,
      );
    }
  }

  // If both provided, settlement must be > disputeStart
  if (
    disputeStartSeconds !== undefined &&
    settlementSeconds !== undefined &&
    settlementSeconds <= disputeStartSeconds
  ) {
    throw new ValidationError(
      'Settlement duration must be greater than dispute start delay',
    );
  }
}
