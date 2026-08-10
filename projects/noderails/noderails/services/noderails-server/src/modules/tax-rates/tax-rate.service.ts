import { getDatabaseClient } from '@noderails/database';
import { NotFoundError, AuthorizationError, ValidationError } from '@noderails/common';

// ── Types ──

interface CreateTaxRateInput {
  merchantId: string;
  displayName: string;
  percentage: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
}

interface UpdateTaxRateInput {
  displayName?: string;
  percentage?: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
  isActive?: boolean;
}

// ── Tax Computation Helpers ──

/**
 * Compute tax amount for a given item amount and tax rate.
 * - Exclusive: tax = amount × (percentage / 100)
 * - Inclusive: tax = amount − (amount / (1 + percentage / 100))
 *
 * Returns { subtotal, taxAmount, total } rounded to 2 decimals.
 */
export function computeTax(
  amount: number,
  percentage: number,
  inclusive: boolean,
): { subtotal: number; taxAmount: number; total: number } {
  const rate = percentage / 100;

  if (inclusive) {
    // Amount already includes tax
    const subtotal = Math.round((amount / (1 + rate)) * 100) / 100;
    const taxAmount = Math.round((amount - subtotal) * 100) / 100;
    return { subtotal, taxAmount, total: amount };
  }

  // Tax added on top
  const taxAmount = Math.round(amount * rate * 100) / 100;
  return { subtotal: amount, taxAmount, total: amount + taxAmount };
}

// ── Create Tax Rate ──

export async function createTaxRate(input: CreateTaxRateInput) {
  const db = getDatabaseClient();

  if (input.percentage < 0 || input.percentage > 100) {
    throw new ValidationError('Tax percentage must be between 0 and 100');
  }

  return db.taxRate.create({
    data: {
      merchantId: input.merchantId,
      displayName: input.displayName,
      percentage: input.percentage,
      inclusive: input.inclusive ?? false,
      jurisdiction: input.jurisdiction,
      description: input.description,
    },
  });
}

// ── List Tax Rates ──

export async function listTaxRates(merchantId: string, includeInactive = false) {
  const db = getDatabaseClient();

  const where: Record<string, unknown> = { merchantId };
  if (!includeInactive) where.isActive = true;

  return db.taxRate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

// ── Get Tax Rate ──

export async function getTaxRate(merchantId: string, taxRateId: string) {
  const db = getDatabaseClient();

  const rate = await db.taxRate.findUnique({ where: { id: taxRateId } });
  if (!rate) throw new NotFoundError('TaxRate', taxRateId);
  if (rate.merchantId !== merchantId) throw new AuthorizationError('Access denied to this tax rate');

  return rate;
}

// ── Update Tax Rate ──

export async function updateTaxRate(merchantId: string, taxRateId: string, input: UpdateTaxRateInput) {
  await getTaxRate(merchantId, taxRateId);
  const db = getDatabaseClient();

  if (input.percentage !== undefined && (input.percentage < 0 || input.percentage > 100)) {
    throw new ValidationError('Tax percentage must be between 0 and 100');
  }

  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.percentage !== undefined) data.percentage = input.percentage;
  if (input.inclusive !== undefined) data.inclusive = input.inclusive;
  if (input.jurisdiction !== undefined) data.jurisdiction = input.jurisdiction;
  if (input.description !== undefined) data.description = input.description;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return db.taxRate.update({
    where: { id: taxRateId },
    data: data as any,
  });
}

// ── Delete Tax Rate (soft delete) ──

export async function archiveTaxRate(merchantId: string, taxRateId: string) {
  await getTaxRate(merchantId, taxRateId);
  const db = getDatabaseClient();

  return db.taxRate.update({
    where: { id: taxRateId },
    data: { isActive: false },
  });
}
