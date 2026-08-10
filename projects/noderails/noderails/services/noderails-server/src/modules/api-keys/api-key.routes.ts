import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, authenticateJwt, requirePermission, requireAppAccess, success, created, noContent } from '@noderails/service-base';
import * as apiKeyService from './api-key.service.js';
import { env } from '../../config.js';

const router: express.Router = Router({ mergeParams: true });

router.use(authenticateJwt(env.JWT_SECRET), requirePermission('API_KEYS_MANAGE'), requireAppAccess('appId'));

// ── Schemas ──

const createKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['PUBLIC', 'SECRET']),
});

// ── POST /apps/:appId/api-keys ──

router.post(
  '/',
  validate(createKeySchema),
  asyncHandler(async (req, res) => {
    const result = await apiKeyService.createApiKey({
      merchantId: req.merchant!.id,
      appId: req.params.appId,
      ...req.body,
    });
    created(res, result);
  }),
);

// ── GET /apps/:appId/api-keys ──

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const keys = await apiKeyService.listApiKeys(req.merchant!.id, req.params.appId);
    success(res, keys);
  }),
);

// ── DELETE /apps/:appId/api-keys/:keyId ──

router.delete(
  '/:keyId',
  asyncHandler(async (req, res) => {
    await apiKeyService.revokeApiKey(req.merchant!.id, req.params.appId, req.params.keyId);
    noContent(res);
  }),
);

export default router;
