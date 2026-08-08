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
import * as subscriptionService from './subscription.service.js';
import * as checkoutSessionService from '../checkout-sessions/checkout-session.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey(), requirePermission('SUBSCRIPTIONS_VIEW'));

// ── Schemas ──

const createSubscriptionSchema = z.object({
  appId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  productPlanId: z.string().uuid(),
  productPlanPriceId: z.string().uuid(),
  allowedChains: z.union([z.literal('ALL'), z.array(z.number().int().positive())]).optional(),
  allowedTokens: z.union([z.literal('ALL'), z.array(z.string().min(1))]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listSubscriptionsSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(),
});

const cancelSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().optional().default(false),
});

// ── POST /subscriptions ──

router.post(
  '/',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(createSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.createSubscription({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, sub);
  }),
);

// ── GET /subscriptions ──

router.get(
  '/',
  validate(listSubscriptionsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await subscriptionService.listSubscriptions({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.subscriptions, result.total, result.page, result.pageSize);
  }),
);

// ── GET /subscriptions/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.getSubscription(getMerchantId(req), req.params.id);
    success(res, sub);
  }),
);

// ── POST /subscriptions/:id/pause ──

router.post(
  '/:id/pause',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.pauseSubscription(getMerchantId(req), req.params.id);
    success(res, sub);
  }),
);

// ── POST /subscriptions/:id/resume ──

router.post(
  '/:id/resume',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.resumeSubscription(getMerchantId(req), req.params.id);
    success(res, sub);
  }),
);

// ── POST /subscriptions/:id/cancel ──

router.post(
  '/:id/cancel',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(cancelSubscriptionSchema),
  asyncHandler(async (req, res) => {
    const sub = await subscriptionService.cancelSubscription(
      getMerchantId(req),
      req.params.id,
      req.body.cancelAtPeriodEnd,
    );
    success(res, sub);
  }),
);

// ── POST /subscriptions/:id/checkout ──
// Creates a checkout session for the initial subscription payment.
// Returns checkout session data with accepted chains/tokens (native tokens excluded).

router.post(
  '/:id/checkout',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  asyncHandler(async (req, res) => {
    // Verify merchant ownership via getSubscription
    await subscriptionService.getSubscription(getMerchantId(req), req.params.id);
    const result = await checkoutSessionService.createCheckoutSessionFromSubscription(req.params.id);
    success(res, result);
  }),
);

export default router;
