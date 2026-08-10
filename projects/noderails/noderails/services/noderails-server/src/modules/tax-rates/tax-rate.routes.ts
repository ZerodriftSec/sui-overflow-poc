import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, authenticateJwtOrApiKey, requireSecretKey, requirePermission, getMerchantId, success, created, noContent } from '@noderails/service-base';
import * as taxRateService from './tax-rate.service.js';
import { env } from '../../config.js';

const router: Router = Router();

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey());

// ── Schemas ──

const createSchema = z.object({
  displayName: z.string().min(1).max(100),
  percentage: z.number().min(0).max(100),
  inclusive: z.boolean().optional(),
  jurisdiction: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  percentage: z.number().min(0).max(100).optional(),
  inclusive: z.boolean().optional(),
  jurisdiction: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

// ── POST /tax-rates ──

router.post(
  '/',
  requirePermission('SETTINGS_MANAGE'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const rate = await taxRateService.createTaxRate({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, rate);
  }),
);

// ── GET /tax-rates ──

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const rates = await taxRateService.listTaxRates(getMerchantId(req), includeInactive);
    success(res, rates);
  }),
);

// ── GET /tax-rates/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rate = await taxRateService.getTaxRate(getMerchantId(req), req.params.id);
    success(res, rate);
  }),
);

// ── PUT /tax-rates/:id ──

router.put(
  '/:id',
  requirePermission('SETTINGS_MANAGE'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const rate = await taxRateService.updateTaxRate(getMerchantId(req), req.params.id, req.body);
    success(res, rate);
  }),
);

// ── DELETE /tax-rates/:id (archive) ──

router.delete(
  '/:id',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    await taxRateService.archiveTaxRate(getMerchantId(req), req.params.id);
    noContent(res);
  }),
);

export default router;
