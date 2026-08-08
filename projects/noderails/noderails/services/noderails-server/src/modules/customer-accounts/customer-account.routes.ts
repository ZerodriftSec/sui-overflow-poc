import express, { Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  validate,
  authenticateJwtOrApiKey,
  requirePermission,
  success,
  created,
  noContent,
  paginated,
} from '@noderails/service-base';
import { MerchantWalletAddressSchema } from '@noderails/common';
import * as customerService from './customer-account.service.js';
import { env } from '../../config.js';

const router: express.Router = Router();

router.use(authenticateJwtOrApiKey(env.JWT_SECRET), requirePermission('CUSTOMERS_VIEW'));

// ── Schemas ──

const createCustomerSchema = z.object({
  appId: z.string().uuid(),
  externalId: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  name: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  country: z.string().max(255).optional(),
  postalCode: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateCustomerSchema = z.object({
  externalId: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  name: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  country: z.string().max(255).optional(),
  postalCode: z.string().max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const addWalletSchema = z.object({
  chainId: z.number().int().positive(),
  walletAddress: MerchantWalletAddressSchema,
});

const listCustomersSchema = z.object({
  appId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().max(255).optional(),
});

// Helper to get merchant ID from either JWT or API key auth
function getMerchantId(req: express.Request): string {
  return req.merchant?.id ?? req.appCtx?.merchantId ?? '';
}

// ── POST /customers ──

router.post(
  '/',
  requirePermission('CUSTOMERS_MANAGE'),
  validate(createCustomerSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.createCustomer({
      merchantId: getMerchantId(req),
      ...req.body,
    });
    created(res, customer);
  }),
);

// ── GET /customers ──

router.get(
  '/',
  validate(listCustomersSchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await customerService.listCustomers({
      merchantId: getMerchantId(req),
      ...req.query,
    });
    paginated(res, result.customers, result.total, result.page, result.pageSize);
  }),
);

// ── GET /customers/:id ──

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomer(getMerchantId(req), req.params.id);
    success(res, customer);
  }),
);

// ── PUT /customers/:id ──

router.put(
  '/:id',
  requirePermission('CUSTOMERS_MANAGE'),
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(getMerchantId(req), req.params.id, req.body);
    success(res, customer);
  }),
);

// ── POST /customers/:id/wallets ──

router.post(
  '/:id/wallets',
  requirePermission('CUSTOMERS_MANAGE'),
  validate(addWalletSchema),
  asyncHandler(async (req, res) => {
    const wallet = await customerService.addWallet(getMerchantId(req), req.params.id, req.body);
    created(res, wallet);
  }),
);

// ── DELETE /customers/:customerId/wallets/:walletId ──

router.delete(
  '/:customerId/wallets/:walletId',
  requirePermission('CUSTOMERS_MANAGE'),
  asyncHandler(async (req, res) => {
    await customerService.removeWallet(getMerchantId(req), req.params.customerId, req.params.walletId);
    noContent(res);
  }),
);

export default router;
