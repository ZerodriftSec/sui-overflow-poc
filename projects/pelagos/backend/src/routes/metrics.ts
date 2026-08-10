import { Router, Request, Response } from 'express';
import { buildSnapshot } from '../monitor/server';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const t0 = Date.now();
  try {
    const snapshot = await buildSnapshot();
    res.json({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        generation_ms: Date.now() - t0,
      },
    });
  } catch (err) {
    // A buildSnapshot() rejection must not float to an unhandled rejection — return
    // a clean 500 so the metrics endpoint degrades gracefully instead of crashing.
    res.status(500).json({ error: `Failed to build metrics snapshot: ${(err as Error).message}` });
  }
});

export const metricsRoutes = router;
