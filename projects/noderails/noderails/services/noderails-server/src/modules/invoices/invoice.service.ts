import { getDatabaseClient } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@noderails/common';
import { computeTax } from '../tax-rates/tax-rate.service.js';

// ── Types ──

interface InvoiceLineItem {
  description: string;
  amount: string;
  currency?: string;
  quantity?: number;
  productPlanId?: string;
  productPlanPriceId?: string;
  taxRateId?: string;
}

interface CreateInvoiceInput {
  appId: string;
  merchantId: string;
  customerAccountId: string;
  subscriptionId?: string;
  currency?: string;
  dueDate?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  allowedChains?: unknown;
  allowedTokens?: unknown;
  memo?: string;
  items: InvoiceLineItem[];
  metadata?: Record<string, unknown>;
  taxRateId?: string;
}

// ── Create Invoice ──

export async function createInvoice(input: CreateInvoiceInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  // Validate customer account
  const customer = await db.customerAccount.findUnique({
    where: { id: input.customerAccountId },
  });
  if (!customer || customer.appId !== input.appId) {
    throw new NotFoundError('CustomerAccount', input.customerAccountId);
  }

  if (!input.items || input.items.length === 0) {
    throw new ValidationError('Invoice must have at least one line item');
  }

  // Validate productPlanId / productPlanPriceId references
  for (const item of input.items) {
    if (item.productPlanId) {
      const plan = await db.productPlan.findUnique({
        where: { id: item.productPlanId },
        select: { id: true, appId: true, isActive: true },
      });
      if (!plan || plan.appId !== input.appId) {
        throw new NotFoundError('ProductPlan', item.productPlanId);
      }
      if (!plan.isActive) {
        throw new ValidationError(`Product plan "${item.productPlanId}" is inactive`);
      }
    }

    if (item.productPlanPriceId) {
      if (!item.productPlanId) {
        throw new ValidationError('productPlanId is required when productPlanPriceId is set');
      }
      const price = await db.productPlanPrice.findUnique({
        where: { id: item.productPlanPriceId },
        select: { id: true, productPlanId: true, isActive: true },
      });
      if (!price || price.productPlanId !== item.productPlanId) {
        throw new NotFoundError('ProductPlanPrice', item.productPlanPriceId);
      }
      if (!price.isActive) {
        throw new ValidationError(`Product plan price "${item.productPlanPriceId}" is inactive`);
      }
    }
  }

  // Generate sequential invoice number
  const lastInvoice = await db.invoice.findFirst({
    where: { appId: input.appId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNum = 1;
  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  const invoiceNumber = `INV-${String(nextNum).padStart(5, '0')}`;

  // Compute totals
  const currency = input.currency ?? 'USD';
  let subtotal = 0;
  for (const item of input.items) {
    const qty = item.quantity ?? 1;
    subtotal += parseFloat(item.amount) * qty;
  }

  // Resolve invoice-level tax rate if provided
  let invoiceTaxRateId: string | undefined;
  let invoiceTaxPercentage = 0;
  let invoiceTaxInclusive = false;

  if (input.taxRateId) {
    const taxRate = await db.taxRate.findUnique({ where: { id: input.taxRateId } });
    if (!taxRate) throw new NotFoundError('TaxRate', input.taxRateId);
    if (taxRate.merchantId !== input.merchantId) {
      throw new AuthorizationError('Tax rate does not belong to this merchant');
    }
    if (!taxRate.isActive) {
      throw new ValidationError('Tax rate is inactive');
    }
    invoiceTaxRateId = taxRate.id;
    invoiceTaxPercentage = Number(taxRate.percentage);
    invoiceTaxInclusive = taxRate.inclusive;
  }

  // Collect unique item-level tax rate IDs that differ from the invoice-level one
  const itemTaxRateIds = new Set<string>();
  for (const item of input.items) {
    if (item.taxRateId && item.taxRateId !== invoiceTaxRateId) {
      itemTaxRateIds.add(item.taxRateId);
    }
  }

  // Batch-fetch item-level tax rates
  const itemTaxRateMap = new Map<string, { percentage: number; inclusive: boolean }>();
  if (itemTaxRateIds.size > 0) {
    const itemTaxRates = await db.taxRate.findMany({
      where: { id: { in: Array.from(itemTaxRateIds) } },
      select: { id: true, percentage: true, inclusive: true, isActive: true, merchantId: true },
    });
    for (const tr of itemTaxRates) {
      if (tr.merchantId !== input.merchantId) {
        throw new AuthorizationError(`Tax rate "${tr.id}" does not belong to this merchant`);
      }
      if (!tr.isActive) {
        throw new ValidationError(`Tax rate "${tr.id}" is inactive`);
      }
      itemTaxRateMap.set(tr.id, { percentage: Number(tr.percentage), inclusive: tr.inclusive });
    }
    // Verify all requested tax rate IDs were found
    for (const id of itemTaxRateIds) {
      if (!itemTaxRateMap.has(id)) {
        throw new NotFoundError('TaxRate', id);
      }
    }
  }

  // Compute per-item tax and build item create data
  let totalTax = 0;
  let hasExclusiveTax = false;
  const itemsData = input.items.map((item) => {
    const qty = item.quantity ?? 1;
    const lineAmount = parseFloat(item.amount) * qty;

    // Item-level tax rate overrides invoice-level tax rate
    const effectiveTaxRateId = item.taxRateId ?? invoiceTaxRateId;
    let itemTaxAmount = 0;

    if (effectiveTaxRateId) {
      // Resolve the correct percentage and inclusive flag for this item
      let pct: number;
      let inclusive: boolean;

      if (effectiveTaxRateId === invoiceTaxRateId) {
        pct = invoiceTaxPercentage;
        inclusive = invoiceTaxInclusive;
      } else {
        const itemRate = itemTaxRateMap.get(effectiveTaxRateId)!;
        pct = itemRate.percentage;
        inclusive = itemRate.inclusive;
      }

      if (pct > 0) {
        const taxResult = computeTax(lineAmount, pct, inclusive);
        itemTaxAmount = taxResult.taxAmount;
        if (!inclusive) hasExclusiveTax = true;
      }
    }

    totalTax += itemTaxAmount;

    return {
      description: item.description,
      amount: item.amount,
      currency: item.currency ?? currency,
      quantity: qty,
      productPlanId: item.productPlanId,
      productPlanPriceId: item.productPlanPriceId,
      taxRateId: effectiveTaxRateId,
      taxAmount: itemTaxAmount,
    };
  });

  // For exclusive tax: total = subtotal + tax
  // For inclusive tax: subtotal already includes tax, total = subtotal
  // Mixed: if any item has exclusive tax, add total tax to subtotal
  const allInclusive = !hasExclusiveTax && totalTax > 0;
  const total = allInclusive ? subtotal : subtotal + totalTax;

  return db.invoice.create({
    data: {
      appId: input.appId,
      customerAccountId: input.customerAccountId,
      subscriptionId: input.subscriptionId,
      invoiceNumber,
      currency,
      subtotal,
      total,
      taxAmount: totalTax,
      taxRateId: invoiceTaxRateId,
      dueDate: input.dueDate,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      allowedChains: input.allowedChains ?? 'ALL',
      allowedTokens: input.allowedTokens ?? 'ALL',
      memo: input.memo,
      metadata: (input.metadata ?? undefined) as any,
      items: {
        create: itemsData,
      },
    },
    include: { items: true, customerAccount: true, taxRate: true },
  });
}

// ── Get Invoice ──

export async function getInvoice(merchantId: string, invoiceId: string) {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      app: true,
      items: { include: { taxRate: true } },
      taxRate: true,
      paymentIntent: { include: { transactions: true } },
      customerAccount: true,
    },
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  if (invoice.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return invoice;
}

// ── Get Invoice (public — for payer/checkout view) ──

export async function getInvoicePublic(invoiceId: string) {
  const db = getDatabaseClient();

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      currency: true,
      subtotal: true,
      total: true,
      taxAmount: true,
      memo: true,
      dueDate: true,
      status: true,
      paidAt: true,
      allowedChains: true,
      allowedTokens: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
      taxRate: {
        select: { id: true, displayName: true, percentage: true, inclusive: true },
      },
      items: {
        select: {
          id: true,
          description: true,
          amount: true,
          currency: true,
          quantity: true,
          taxAmount: true,
          taxRate: {
            select: { id: true, displayName: true, percentage: true, inclusive: true },
          },
        },
      },
      app: { select: { name: true } },
      customerAccount: { select: { id: true, externalId: true, email: true, name: true } },
    },
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);
  return invoice;
}

// ── List Invoices ──

interface ListInvoicesInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listInvoices(input: ListInvoicesInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const apps = await db.app.findMany({
    where: { merchantId: input.merchantId },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  const where: Record<string, unknown> = { appId: { in: appIds } };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        items: { include: { taxRate: true } },
        customerAccount: true,
        taxRate: true,
        paymentIntent: { include: { transactions: true } },
      },
    }),
    db.invoice.count({ where }),
  ]);

  return { invoices, total, page, pageSize };
}

// ── Open Invoice (transition DRAFT → OPEN) ──

export async function openInvoice(merchantId: string, invoiceId: string) {
  const invoice = await getInvoice(merchantId, invoiceId);

  if (invoice.status !== 'DRAFT') {
    throw new ValidationError(`Cannot open invoice in ${invoice.status} status`);
  }

  const db = getDatabaseClient();
  return db.invoice.update({
    where: { id: invoiceId },
    data: { status: 'OPEN' },
    include: { items: true },
  });
}

// ── Mark Invoice Paid (internal — called when payment completes) ──

export async function markInvoicePaid(invoiceId: string, paymentIntentId: string) {
  const db = getDatabaseClient();

  return db.invoice.update({
    where: { id: invoiceId },
    data: { status: 'PAID', paymentIntentId, paidAt: new Date() },
  });
}

// ── Void Invoice ──

export async function voidInvoice(merchantId: string, invoiceId: string) {
  const invoice = await getInvoice(merchantId, invoiceId);

  if (invoice.status === 'PAID') {
    throw new ValidationError('Cannot void a paid invoice');
  }
  if (invoice.status === 'VOID') {
    throw new ValidationError('Invoice already voided');
  }

  const db = getDatabaseClient();
  return db.invoice.update({
    where: { id: invoiceId },
    data: { status: 'VOID', voidedAt: new Date() },
    include: { items: true },
  });
}
