import { Router, Request, Response } from 'express';
import { prepareTransaction, executeTransaction, SponsorError } from './service.js';

const router = Router();

/**
 * POST /prepare
 * Step 1: Build transaction with sponsor's gas and return bytes
 */
router.post('/prepare', async (req: Request, res: Response) => {
  try {
    const { transaction, userAddress } = req.body;

    if (!transaction) {
      return res.status(400).json({
        error: 'Missing "transaction" field',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "userAddress" field',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(userAddress)) {
      return res.status(400).json({
        error: 'Invalid Sui address format',
        code: 'VALIDATION_ERROR',
      });
    }

    console.log(`[Sponsor] Preparing transaction for user: ${userAddress}`);

    const result = await prepareTransaction({ transaction, userAddress });
    return res.json(result);
  } catch (error) {
    console.error('[Sponsor] Error preparing transaction:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      const sponsorError = error as SponsorError;
      return res.status(400).json(sponsorError);
    }

    return res.status(500).json({
      error: 'Internal server error',
      code: 'SUBMISSION_FAILED',
    });
  }
});

/**
 * POST /execute
 * Step 2: Sign with sponsor and execute transaction
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { bytes, userSignature, userAddress } = req.body;

    if (!bytes || typeof bytes !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "bytes" field',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!userSignature || typeof userSignature !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "userSignature" field',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "userAddress" field',
        code: 'VALIDATION_ERROR',
      });
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(userAddress)) {
      return res.status(400).json({
        error: 'Invalid Sui address format',
        code: 'VALIDATION_ERROR',
      });
    }

    console.log(`[Sponsor] Executing transaction for user: ${userAddress}`);

    const result = await executeTransaction({ bytes, userSignature, userAddress });
    return res.json(result);
  } catch (error) {
    console.error('[Sponsor] Error executing transaction:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      const sponsorError = error as SponsorError;
      return res.status(400).json(sponsorError);
    }

    return res.status(500).json({
      error: 'Internal server error',
      code: 'SUBMISSION_FAILED',
    });
  }
});

export default router;
