import type { Request, Response, NextFunction } from 'express';

// ── Async handler wrapper for Express 4 ──

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async Express handler to forward rejected promises to next().
 * Not needed in Express 5, but required for Express 4.
 */
export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
