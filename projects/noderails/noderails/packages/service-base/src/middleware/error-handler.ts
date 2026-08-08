import type { Request, Response, NextFunction } from 'express';
import { isNodeRailsError, type NodeRailsError } from '@noderails/common';
import type { Logger } from '../helpers/logger.js';

export function errorHandler(logger: Logger) {
  // Express error handlers must have 4 parameters
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (isNodeRailsError(err)) {
      const nrErr = err as NodeRailsError;

      if (nrErr.statusCode >= 500) {
        logger.error(nrErr.message, {
          code: nrErr.code,
          statusCode: nrErr.statusCode,
          path: req.path,
          method: req.method,
        });
      }

      res.status(nrErr.statusCode).json({
        success: false,
        error: {
          code: nrErr.code,
          message: nrErr.message,
          ...(nrErr.details ? { details: nrErr.details } : {}),
        },
      });
      return;
    }

    // Unknown errors
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  };
}
