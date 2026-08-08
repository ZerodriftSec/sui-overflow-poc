import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, authenticateJwtOrApiKey, requireSecretKey, requirePermission, requireAppAccess, getMerchantId, success, created, noContent } from '@noderails/service-base';
import * as webhookService from './webhook.service.js';
import { env } from '../../config.js';

const router: express.Router = Router({ mergeParams: true });

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requireSecretKey(), requirePermission('WEBHOOKS_MANAGE'), requireAppAccess('appId'));

// ── Schemas ──

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});

// ── POST /apps/:appId/webhooks ──

router.post(
  '/',
  validate(createWebhookSchema),
  asyncHandler(async (req, res) => {
    const webhook = await webhookService.createWebhook({
      merchantId: getMerchantId(req),
      appId: req.params.appId,
      ...req.body,
    });
    created(res, webhook);
  }),
);

// ── GET /apps/:appId/webhooks ──

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const webhooks = await webhookService.listWebhooks(getMerchantId(req), req.params.appId);
    success(res, webhooks);
  }),
);

// ── PUT /apps/:appId/webhooks/:webhookId ──

router.put(
  '/:webhookId',
  validate(updateWebhookSchema),
  asyncHandler(async (req, res) => {
    const webhook = await webhookService.updateWebhook(
      getMerchantId(req), req.params.appId, req.params.webhookId, req.body,
    );
    success(res, webhook);
  }),
);

// ── DELETE /apps/:appId/webhooks/:webhookId ──

router.delete(
  '/:webhookId',
  asyncHandler(async (req, res) => {
    await webhookService.deleteWebhook(getMerchantId(req), req.params.appId, req.params.webhookId);
    noContent(res);
  }),
);

// ── POST /apps/:appId/webhooks/:webhookId/rotate-secret ──

router.post(
  '/:webhookId/rotate-secret',
  asyncHandler(async (req, res) => {
    const result = await webhookService.rotateWebhookSecret(
      getMerchantId(req), req.params.appId, req.params.webhookId,
    );
    success(res, result);
  }),
);

// ── POST /apps/:appId/webhooks/:webhookId/test-ping ──

router.post(
  '/:webhookId/test-ping',
  asyncHandler(async (req, res) => {
    const result = await webhookService.sendTestPing(
      getMerchantId(req), req.params.appId, req.params.webhookId,
    );
    success(res, result);
  }),
);

// ── GET /apps/:appId/webhooks/:webhookId/deliveries ──

router.get(
  '/:webhookId/deliveries',
  asyncHandler(async (req, res) => {
    const result = await webhookService.listDeliveries({
      merchantId: getMerchantId(req),
      appId: req.params.appId,
      webhookId: req.params.webhookId,
      status: req.query.status as string | undefined,
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result);
  }),
);

export default router;
