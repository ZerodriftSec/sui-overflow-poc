import { getDatabaseClient } from '@noderails/database';
import { ValidationError } from '@noderails/common';

// ============================================================================
// FEE CONFIG SERVICE
//
// Resolves effective platform fee (in basis points) by priority:
//   1. Per-merchant override (Merchant.platformFeeBps)
//   2. Platform-level config (PlatformConfig.platformFeeBps)
//   3. Hardcoded fallback (200 bps = 2%)
//
// On-chain, the fee is capped at 1000 bps (10%) by MAX_FEE_BPS in the
// escrow contract. This service enforces the same constraint.
// ============================================================================

/** Hard limits matching the contract's MAX_FEE_BPS */
const MIN_FEE_BPS = 0;
const MAX_FEE_BPS = 1000; // 10%

/** Hardcoded fallback if DB has no PlatformConfig row */
const FALLBACK_FEE_BPS = 200; // 2%

// ============================================================================
// READ — Get effective fee for a merchant
// ============================================================================

/**
 * Resolve the platform fee (in basis points) for a given merchant.
 *
 * Resolution order:
 *   1. Merchant-level override (if set)
 *   2. PlatformConfig singleton
 *   3. Hardcoded fallback (200 bps)
 */
export async function getEffectiveFeeBps(merchantId: string): Promise<number> {
  const db = getDatabaseClient();

  const [merchant, platformConfig] = await Promise.all([
    db.merchant.findUnique({
      where: { id: merchantId },
      select: { platformFeeBps: true },
    }),
    getPlatformFeeBps(),
  ]);

  // Merchant-level override takes priority
  if (merchant && merchant.platformFeeBps !== null) {
    return merchant.platformFeeBps;
  }

  return platformConfig;
}

/**
 * Get the platform-level default fee in basis points.
 * Auto-creates the PlatformConfig singleton if it doesn't exist.
 */
export async function getPlatformFeeBps(): Promise<number> {
  const db = getDatabaseClient();

  const config = await db.platformConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!config) {
    const created = await db.platformConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
    });
    return created.platformFeeBps;
  }

  return config.platformFeeBps;
}

// ============================================================================
// WRITE — Admin-only mutations
// ============================================================================

/**
 * Update the platform-level default fee.
 */
export async function updatePlatformFeeBps(feeBps: number): Promise<number> {
  validateFeeBps(feeBps);

  const db = getDatabaseClient();
  const config = await db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: { platformFeeBps: feeBps },
    update: { platformFeeBps: feeBps },
  });

  return config.platformFeeBps;
}

/**
 * Set a per-merchant fee override.
 */
export async function setMerchantFeeOverride(
  merchantId: string,
  feeBps: number,
): Promise<number> {
  validateFeeBps(feeBps);

  const db = getDatabaseClient();
  const merchant = await db.merchant.update({
    where: { id: merchantId },
    data: { platformFeeBps: feeBps },
    select: { platformFeeBps: true },
  });

  return merchant.platformFeeBps!;
}

/**
 * Remove per-merchant fee override (revert to platform default).
 */
export async function removeMerchantFeeOverride(merchantId: string): Promise<void> {
  const db = getDatabaseClient();
  await db.merchant.update({
    where: { id: merchantId },
    data: { platformFeeBps: null },
  });
}

/**
 * Get merchant-level fee override (null if not set).
 */
export async function getMerchantFeeOverride(
  merchantId: string,
): Promise<number | null> {
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { platformFeeBps: true },
  });

  return merchant?.platformFeeBps ?? null;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps)) {
    throw new ValidationError('Fee must be a whole number of basis points');
  }
  if (feeBps < MIN_FEE_BPS) {
    throw new ValidationError('Fee cannot be negative');
  }
  if (feeBps > MAX_FEE_BPS) {
    throw new ValidationError(
      `Fee cannot exceed ${MAX_FEE_BPS} basis points (${MAX_FEE_BPS / 100}%)`,
    );
  }
}
