import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success } from '@noderails/service-base';
import * as publicService from './public.service.js';

const router: express.Router = Router();

const supportedAssetsQuerySchema = z.object({
  environment: z.enum(['TEST', 'PRODUCTION']).optional(),
});

router.get(
  '/supported-assets',
  validate(supportedAssetsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const environment = req.query.environment as 'TEST' | 'PRODUCTION' | undefined;
    const data = await publicService.getSupportedAssets(environment);
    success(res, data);
  }),
);

router.get(
  '/chain-registry',
  asyncHandler(async (_req, res) => {
    const data = await publicService.getChainRegistry();
    res.set('Cache-Control', 'public, max-age=300');
    success(res, data);
  }),
);

export default router;
