import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, authenticateJwt, requirePermission, success } from '@noderails/service-base';
import { env } from '../../config.js';
import * as statsService from './stats.service.js';

const router: express.Router = Router();

router.use(authenticateJwt(env.JWT_SECRET), requirePermission('STATS_VIEW'));

const querySchema = z.object({
  appId: z.string().uuid().optional(),
});

router.get(
  '/',
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const stats = await statsService.getMerchantStats(
      req.merchant!.id,
      req.query.appId as string | undefined,
    );
    success(res, stats);
  }),
);

export default router;
