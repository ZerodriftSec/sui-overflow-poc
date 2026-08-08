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
  noContent,
} from '@noderails/service-base';
import * as paymentLinkService from './payment-link.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Helper to attach full paymentUrl ──

function withPaymentUrl<T extends { slug: string }>(link: T): T & { paymentUrl: string } {
  return { ...link, paymentUrl: `${env.PAYMENT_UI_URL}/link/${link.slug}` };
}

// ── Public route — view payment link by slug ──

router.get(
  '/public/:slug',
  asyncHandler(async (req, res) => {
    const link = await paymentLinkService.getPaymentLinkBySlug(req.params.slug);
    success(res, withPaymentUrl(link));
  }),
);

// ── Authenticated routes ──

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey(), requirePermission('PAYMENT_LINKS_MANAGE'));

// ── Schemas ──

const createPaymentLinkSchema = z.object({
  appId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().max(10).optional(),
  productPlanId: z.string().uuid().optional(),
  productPlanPriceId: z.string().uuid().optional(),
  allowedChains: z.union([z.literal('ALL'), z.array(z.number().int().positive())]).optional(),
  allowedTokens: z.union([z.literal('ALL'), z.array(z.string().min(1))]).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  requireBillingDetails: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  taxRateId: z.string().uuid().optional(),
});

const updatePaymentLinkSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().max(10).optional(),
  productPlanId: z.string().uuid().nullable().optional(),
  productPlanPriceId: z.string().uuid().nullable().optional(),
  allowedChains: z.union([z.literal('ALL'), z.array(z.number().int().positive())]).optional(),
  allowedTokens: z.union([z.literal('ALL'), z.array(z.string().min(1))]).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  requireBillingDetails: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  taxRateId: z.string().uuid().nullable().optional(),
});

const listPaymentLinksSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

// ── POST /payment-links ──

router.post(
  '/',
  validate(createPaymentLinkSchema),
  asyncHandler(async (req, res) => {
    const link = await paymentLinkService.createPaymentLink({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, withPaymentUrl(link));
  }),
);

// ── GET /payment-links ──

router.get(
  '/',
  validate(listPaymentLinksSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { isActive, ...rest } = req.query as Record<string, string>;
    const result = await paymentLinkService.listPaymentLinks({
      merchantId: getMerchantId(req),
      ...rest,
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    });
    paginated(res, result.links.map(withPaymentUrl), result.total, result.page, result.pageSize);
  }),
);

// ── GET /payment-links/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const link = await paymentLinkService.getPaymentLink(getMerchantId(req), req.params.id);
    success(res, withPaymentUrl(link));
  }),
);

// ── PUT /payment-links/:id ──

router.put(
  '/:id',
  validate(updatePaymentLinkSchema),
  asyncHandler(async (req, res) => {
    const link = await paymentLinkService.updatePaymentLink(getMerchantId(req), req.params.id, req.body);
    success(res, withPaymentUrl(link));
  }),
);

// ── DELETE /payment-links/:id ──

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await paymentLinkService.deletePaymentLink(getMerchantId(req), req.params.id);
    noContent(res);
  }),
);

export default router;
