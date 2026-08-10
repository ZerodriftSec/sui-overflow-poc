import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateApiKey,
  authenticateJwtOrApiKey,
  requireSecretKey,
  requirePermission,
  success,
  created,
  paginated,
  noContent,
} from '@noderails/service-base';
import * as intentService from './intent.service.js';
import * as captureService from './capture.service.js';
import * as refundService from './refund.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

// ── Schemas ──

const createIntentSchema = z.object({
  customerAccountId: z.string().uuid().optional(),
  externalId: z.string().max(255).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount'),
  currency: z.string().min(1).max(10).default('USD').optional(),
  allowedChains: z.union([z.literal('ALL'), z.array(z.number().int())]).optional(),
  allowedTokens: z.union([z.literal('ALL'), z.array(z.string())]).optional(),
  captureMode: z.enum(['AUTOMATIC', 'MANUAL']).optional(),
  metadata: z.record(z.unknown()).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  idempotencyKey: z.string().max(255).optional(),
});

const listIntentsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(),
  appId: z.string().uuid().optional(),
});

const captureNativeSchema = z.object({
  escrowAddress: z.string(),
  chainId: z.string(),
  paymentIntentId: z.string(),
  merchant: z.string(),
  feeBps: z.number().int().min(0).max(1000),
  timelocks: z.string(),
  noderailsSignature: z.string(),
  value: z.string(),
});

const captureERC20Schema = z.object({
  escrowAddress: z.string(),
  chainId: z.string(),
  paymentIntentId: z.string(),
  merchant: z.string(),
  token: z.string(),
  amount: z.string(),
  payer: z.string(),
  feeBps: z.number().int().min(0).max(1000),
  timelocks: z.string(),
  permitData: z.object({
    amount: z.string(),
    deadline: z.string(),
    v: z.number(),
    r: z.string(),
    s: z.string(),
  }),
  noderailsSignature: z.string(),
});

const settleSchema = z.object({
  escrowAddress: z.string(),
  chainId: z.string(),
  paymentIntentId: z.string(),
});

// ── POST /payments/intents ──

router.post(
  '/intents',
  authenticateApiKey(),
  validate(createIntentSchema),
  asyncHandler(async (req, res) => {
    const intent = await intentService.createIntent({ appId: req.appCtx!.id, ...req.body });
    created(res, intent);
  }),
);

// ── GET /payments/intents ──

router.get(
  '/intents',
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requirePermission('PAYMENTS_VIEW'),
  validate(listIntentsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = req.merchant
      ? await intentService.listIntentsByMerchant({ merchantId: req.merchant.id, ...req.query })
      : await intentService.listIntents({ appId: req.appCtx!.id, ...req.query });
    paginated(res, result.intents, result.total, result.page, result.pageSize);
  }),
);

// ── GET /payments/intents/:id ──

router.get(
  '/intents/:id',
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requirePermission('PAYMENTS_VIEW'),
  asyncHandler(async (req, res) => {
    const intent = req.merchant
      ? await intentService.getIntentByMerchant(req.merchant.id, req.params.id)
      : await intentService.getIntent(req.appCtx!.id, req.params.id);
    success(res, intent);
  }),
);

// ── POST /payments/intents/:id/capture-native ──

router.post(
  '/intents/:id/capture-native',
  authenticateApiKey(),
  requireSecretKey(),
  validate(captureNativeSchema),
  asyncHandler(async (req, res) => {
    const intent = await intentService.getIntent(req.appCtx!.id, req.params.id);
    const tx = await captureService.submitCaptureNative({
      intentId: intent.id,
      ...req.body,
      timelocks: BigInt(req.body.timelocks),
    });
    success(res, tx);
  }),
);

// ── POST /payments/intents/:id/capture-erc20 ──

router.post(
  '/intents/:id/capture-erc20',
  authenticateApiKey(),
  requireSecretKey(),
  validate(captureERC20Schema),
  asyncHandler(async (req, res) => {
    const intent = await intentService.getIntent(req.appCtx!.id, req.params.id);
    const tx = await captureService.submitCaptureERC20({
      intentId: intent.id,
      ...req.body,
      amount: BigInt(req.body.amount),
      timelocks: BigInt(req.body.timelocks),
      permitData: {
        ...req.body.permitData,
        amount: BigInt(req.body.permitData.amount),
        deadline: BigInt(req.body.permitData.deadline),
      },
    });
    success(res, tx);
  }),
);

// ── POST /payments/intents/:id/settle ──

router.post(
  '/intents/:id/settle',
  authenticateApiKey(),
  requireSecretKey(),
  validate(settleSchema),
  asyncHandler(async (req, res) => {
    const intent = await intentService.getIntent(req.appCtx!.id, req.params.id);
    const tx = await captureService.submitSettle({ intentId: intent.id, ...req.body });
    success(res, tx);
  }),
);

// ── POST /payments/intents/:id/cancel ──

router.post(
  '/intents/:id/cancel',
  authenticateApiKey(),
  requireSecretKey(),
  asyncHandler(async (req, res) => {
    const intent = await intentService.cancelIntent(req.appCtx!.id, req.params.id);
    success(res, intent);
  }),
);

// ── POST /payments/intents/:id/refund ──

const refundSchema = z.object({
  reason: z.string().min(1).max(500),
});

router.post(
  '/intents/:id/refund',
  authenticateJwtOrApiKey(env.JWT_SECRET),
  requirePermission('REFUNDS_MANAGE'),
  validate(refundSchema),
  asyncHandler(async (req, res) => {
    const merchantId = req.merchant?.id ?? req.appCtx?.merchantId;
    if (!merchantId) {
      throw new Error('Authentication required');
    }
    const result = await refundService.initiateRefund(merchantId, req.params.id, req.body.reason);
    success(res, result);
  }),
);

export default router;
