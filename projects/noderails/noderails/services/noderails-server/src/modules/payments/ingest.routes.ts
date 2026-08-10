import express, { Router } from 'express';
import { asyncHandler, createLogger } from '@noderails/service-base';
import * as ingestService from './ingest.service.js';

const router: express.Router = Router();
const logger = createLogger('ingest');

// Raw body for signature verification

// ── POST /webhooks/mtxm ──

router.post(
  '/mtxm',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body);
    const signature = req.headers['x-signature-256'] as string ?? '';

    const ok = await ingestService.processMtxmWebhook(rawBody, signature, logger);

    if (!ok) {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }

    res.status(200).json({ success: true });
  }),
);

// ── POST /webhooks/indexer ──

router.post(
  '/indexer',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf-8') : String(req.body);
    const signature = req.headers['x-indexer-signature'] as string ?? '';
    const timestamp = req.headers['x-indexer-timestamp'] as string ?? '';

    const ok = await ingestService.processIndexerWebhook(rawBody, signature, timestamp, logger);

    if (!ok) {
      res.status(401).json({ success: false, error: { message: 'Invalid signature' } });
      return;
    }

    res.status(200).json({ success: true });
  }),
);

export default router;
