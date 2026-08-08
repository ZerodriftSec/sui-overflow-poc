import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwt,
  requirePermission,
  success,
  created,
  paginated,
} from '@noderails/service-base';
import { MerchantWalletAddressSchema, TokenContractAddressSchema } from '@noderails/common';
import * as payoutService from './payout.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(authenticateJwt(env.JWT_SECRET), requirePermission('PAYOUTS_VIEW'));

// ── Schemas ──

const createPayoutSchema = z.object({
  appId: z.string().uuid(),
  recipientWallet: MerchantWalletAddressSchema,
  amountUsd: z.string().regex(/^\d+(\.\d{1,8})?$/),
  tokenAmount: z.string(),
  tokenAddress: TokenContractAddressSchema,
  chain: z.string().min(1),
  sessionSignature: z.string().optional(),
  sessionExpiry: z.coerce.date().optional(),
});

const listPayoutsSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(),
});

const executePayoutSchema = z.object({
  merchantManagerAddress: MerchantWalletAddressSchema,
  chainId: z.string(),
  noderailsSignature: z.string().optional(),
});

// ── POST /payouts ──

router.post(
  '/',
  requirePermission('PAYOUTS_MANAGE'),
  validate(createPayoutSchema),
  asyncHandler(async (req, res) => {
    const payout = await payoutService.createPayout({
      merchantId: req.merchant!.id,
      ...req.body,
    });
    created(res, payout);
  }),
);

// ── GET /payouts ──

router.get(
  '/',
  validate(listPayoutsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await payoutService.listPayouts({
      merchantId: req.merchant!.id,
      ...req.query,
    });
    paginated(res, result.payouts, result.total, result.page, result.pageSize);
  }),
);

// ── GET /payouts/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const payout = await payoutService.getPayout(req.merchant!.id, req.params.id);
    success(res, payout);
  }),
);

// ── POST /payouts/:id/execute ──

router.post(
  '/:id/execute',
  requirePermission('PAYOUTS_MANAGE'),
  validate(executePayoutSchema),
  asyncHandler(async (req, res) => {
    const tx = await payoutService.executePayout({
      merchantId: req.merchant!.id,
      payoutId: req.params.id,
      ...req.body,
    });
    success(res, tx);
  }),
);

export default router;
