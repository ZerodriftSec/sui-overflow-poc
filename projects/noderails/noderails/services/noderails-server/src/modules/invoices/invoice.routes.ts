import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwtOrApiKey,
  requireSecretKey,
  requirePermission,
  getMerchantId,
  success,
  created,
  paginated,
} from '@noderails/service-base';
import * as invoiceService from './invoice.service.js';
import { enqueueInvoiceEmail } from '../email/email.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Public route (no auth) — payer views an invoice ──

router.get(
  '/public/:id',
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoicePublic(req.params.id);
    success(res, invoice);
  }),
);

// ── Authenticated routes ──

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey(), requirePermission('INVOICES_VIEW'));

// ── Schemas ──

const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().max(10).optional(),
  quantity: z.number().int().positive().optional().default(1),
  productPlanId: z.string().uuid().optional(),
  productPlanPriceId: z.string().uuid().optional(),
  taxRateId: z.string().uuid().optional(),
});

const createInvoiceSchema = z.object({
  appId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  currency: z.string().max(10).optional().default('USD'),
  dueDate: z.coerce.date().optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  allowedChains: z.union([z.literal('ALL'), z.array(z.number().int().positive())]).optional(),
  allowedTokens: z.union([z.literal('ALL'), z.array(z.string().min(1))]).optional(),
  memo: z.string().max(2000).optional(),
  items: z.array(invoiceItemSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
  taxRateId: z.string().uuid().optional(),
});

const listInvoicesSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(),
});

// ── POST /invoices ──

router.post(
  '/',
  requirePermission('INVOICES_MANAGE'),
  validate(createInvoiceSchema),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.createInvoice({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, invoice);
  }),
);

// ── GET /invoices ──

router.get(
  '/',
  validate(listInvoicesSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await invoiceService.listInvoices({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.invoices, result.total, result.page, result.pageSize);
  }),
);

// ── GET /invoices/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getInvoice(getMerchantId(req), req.params.id);
    success(res, invoice);
  }),
);

// ── POST /invoices/:id/open ──

router.post(
  '/:id/open',
  requirePermission('INVOICES_MANAGE'),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.openInvoice(getMerchantId(req), req.params.id);
    success(res, invoice);
  }),
);

// ── POST /invoices/:id/void ──

router.post(
  '/:id/void',
  requirePermission('INVOICES_MANAGE'),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.voidInvoice(getMerchantId(req), req.params.id);
    success(res, invoice);
  }),
);

// ── POST /invoices/:id/send ──

router.post(
  '/:id/send',
  requirePermission('INVOICES_MANAGE'),
  asyncHandler(async (req, res) => {
    await enqueueInvoiceEmail(getMerchantId(req), req.params.id);
    success(res, { sent: true });
  }),
);

export default router;
