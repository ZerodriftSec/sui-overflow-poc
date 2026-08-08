import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, success, createLogger } from '@noderails/service-base';
import * as priceService from './price.service.js';

const router: express.Router = Router();
const logger = createLogger('prices');

// ── Schemas ──

const convertSchema = z.object({
  symbol: z.string().min(1),
  currency: z.string().min(1).max(10).optional(),
  amountFiat: z.coerce.number().positive().optional(),
  amountUsd: z.coerce.number().positive().optional(), // backward compat
  tokenAmount: z.coerce.number().positive().optional(),
});

// ── GET /prices/convert ──
// Must be before /:symbol to avoid matching "convert" as a symbol

router.get(
  '/convert',
  validate(convertSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      symbol: string;
      currency?: string;
      amountFiat?: number;
      amountUsd?: number;
      tokenAmount?: number;
    };

    const fiatCurrency = query.currency ?? 'USD';
    const fiatAmount = query.amountFiat ?? query.amountUsd;
    const priceData = await priceService.getPrice(query.symbol, logger, fiatCurrency);

    if (fiatAmount !== undefined) {
      const tokens = priceService.convertFiatToToken(fiatAmount, priceData.priceFiat);
      success(res, { ...priceData, amountFiat: fiatAmount, tokenAmount: tokens });
      return;
    }

    if (query.tokenAmount !== undefined) {
      const fiat = priceService.convertTokenToFiat(query.tokenAmount, priceData.priceFiat);
      success(res, { ...priceData, tokenAmount: query.tokenAmount, amountFiat: fiat });
      return;
    }

    success(res, priceData);
  }),
);

// ── GET /prices/:symbol ──

router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    const currency = (req.query.currency as string) ?? 'USD';
    const result = await priceService.getPrice(req.params.symbol, logger, currency);
    success(res, result);
  }),
);

export default router;
