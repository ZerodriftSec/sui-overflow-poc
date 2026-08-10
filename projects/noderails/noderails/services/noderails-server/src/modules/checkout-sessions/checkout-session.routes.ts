import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateApiKey,
  requireSecretKey,
  authenticateJwt,
  authenticateJwtOrApiKey,
  requirePermission,
  success,
  created,
  paginated,
} from '@noderails/service-base';
import * as checkoutService from './checkout-session.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Public routes — no auth required ──

// GET /checkout-sessions/public/:id — checkout UI loads session with chain/token data
router.get(
  '/public/:id',
  asyncHandler(async (req, res) => {
    const session = await checkoutService.getCheckoutSessionForPayment(req.params.id);
    success(res, session);
  }),
);

// POST /checkout-sessions/from-link — create a checkout session from a payment link slug
// Called by payment-ui when a customer visits a payment link URL
const fromLinkSchema = z.object({
  slug: z.string().min(1).max(100),
});

router.post(
  '/from-link',
  validate(fromLinkSchema),
  asyncHandler(async (req, res) => {
    const result = await checkoutService.createCheckoutSessionFromLink(req.body.slug);
    created(res, result);
  }),
);

// POST /checkout-sessions/from-invoice — create a checkout session from an invoice ID
// Called by payment-ui when a customer clicks "Pay Invoice"
const fromInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

router.post(
  '/from-invoice',
  validate(fromInvoiceSchema),
  asyncHandler(async (req, res) => {
    const result = await checkoutService.createCheckoutSessionFromInvoice(req.body.invoiceId);
    created(res, result);
  }),
);

// ── Authenticated routes ──

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requirePermission('PAYMENTS_VIEW'));

// ── Schemas ──

const checkoutItemSchema = z.object({
  productPlanId: z.string().uuid().optional(),
  productPlanPriceId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().max(10).optional(),
  quantity: z.number().int().positive().optional(),
  isPriceOption: z.boolean().optional(),
});

const createSessionSchema = z.object({
  appId: z.string().uuid(),
  customerAccountId: z.string().uuid().optional(),
  mode: z.enum(['PAYMENT', 'SUBSCRIPTION']).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  expiresInMinutes: z.number().int().positive().max(1440).optional(),
  items: z.array(checkoutItemSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

const listSessionsSchema = z.object({
  appId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'COMPLETE', 'EXPIRED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

// Helper to get merchant ID from either JWT or API key auth
function getMerchantId(req: express.Request): string {
  return req.merchant?.id ?? req.appCtx?.merchantId ?? '';
}

// ── POST /checkout-sessions ──

router.post(
  '/',
  validate(createSessionSchema),
  asyncHandler(async (req, res) => {
    const session = await checkoutService.createCheckoutSession({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, session);
  }),
);

// ── GET /checkout-sessions ──

router.get(
  '/',
  validate(listSessionsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await checkoutService.listCheckoutSessions({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.sessions, result.total, result.page, result.pageSize);
  }),
);

// ── GET /checkout-sessions/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const session = await checkoutService.getCheckoutSession(getMerchantId(req), req.params.id);
    success(res, session);
  }),
);

// ── POST /checkout-sessions/:id/expire ──

router.post(
  '/:id/expire',
  asyncHandler(async (req, res) => {
    const session = await checkoutService.expireCheckoutSession(getMerchantId(req), req.params.id);
    success(res, session);
  }),
);

export default router;
