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
import * as productPlanService from './product-plan.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey(), requirePermission('SUBSCRIPTIONS_VIEW'));

// ── Schemas ──

const priceSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().max(10).optional(),
  billingInterval: z.enum(['MINUTE', 'DAY', 'WEEK', 'MONTH', 'YEAR']).optional(),
  billingIntervalCount: z.number().int().positive().optional(),
  trialPeriodDays: z.number().int().min(0).optional(),
  nickname: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createPlanSchema = z.object({
  appId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  planType: z.enum(['ONE_TIME', 'SUBSCRIPTION']).optional(),
  taxRateId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  prices: z.array(priceSchema).min(1),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  taxRateId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listPlansSchema = z.object({
  appId: z.string().uuid().optional(),
  planType: z.enum(['ONE_TIME', 'SUBSCRIPTION']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const addPriceSchema = priceSchema;

const updatePriceSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  nickname: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  trialPeriodDays: z.number().int().min(0).optional(),
});

// ── POST /product-plans ──

router.post(
  '/',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(createPlanSchema),
  asyncHandler(async (req, res) => {
    const plan = await productPlanService.createProductPlan({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, plan);
  }),
);

// ── GET /product-plans ──

router.get(
  '/',
  validate(listPlansSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await productPlanService.listProductPlans({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.plans, result.total, result.page, result.pageSize);
  }),
);

// ── GET /product-plans/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const plan = await productPlanService.getProductPlan(getMerchantId(req), req.params.id);
    success(res, plan);
  }),
);

// ── PUT /product-plans/:id ──

router.put(
  '/:id',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(updatePlanSchema),
  asyncHandler(async (req, res) => {
    const plan = await productPlanService.updateProductPlan(getMerchantId(req), req.params.id, req.body);
    success(res, plan);
  }),
);

// ── POST /product-plans/:id/prices ──

router.post(
  '/:id/prices',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(addPriceSchema),
  asyncHandler(async (req, res) => {
    const price = await productPlanService.addPrice(getMerchantId(req), req.params.id, req.body);
    created(res, price);
  }),
);

// ── PUT /product-plans/:planId/prices/:priceId ──

router.put(
  '/:planId/prices/:priceId',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  validate(updatePriceSchema),
  asyncHandler(async (req, res) => {
    const price = await productPlanService.updatePrice(
      getMerchantId(req),
      req.params.planId,
      req.params.priceId,
      req.body,
    );
    success(res, price);
  }),
);

// ── DELETE /product-plans/:planId/prices/:priceId ──

router.delete(
  '/:planId/prices/:priceId',
  requirePermission('SUBSCRIPTIONS_MANAGE'),
  asyncHandler(async (req, res) => {
    await productPlanService.deactivatePrice(
      getMerchantId(req),
      req.params.planId,
      req.params.priceId,
    );
    success(res, { deactivated: true });
  }),
);

export default router;
