import express from 'express';
import cors from 'cors';
import { SERVER_CONFIG } from '@noderails/common';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import type { Logger } from './helpers/logger.js';

/** Matches the `cors` library's accepted origin types */
export type CorsOrigin =
  | boolean
  | string
  | RegExp
  | Array<boolean | string | RegExp>
  | ((requestOrigin: string | undefined, callback: (err: Error | null, origin?: boolean | string | RegExp | Array<boolean | string | RegExp>) => void) => void);

export interface AppOptions {
  logger: Logger;
  corsOrigin?: CorsOrigin;
  bodyLimit?: string;
}

/**
 * Create a configured Express app with standard middleware.
 * Routes should be mounted by the caller before calling listen().
 * Call `attachErrorHandler(app, logger)` after all routes are mounted.
 */
export function createApp(options: AppOptions): express.Express {
  const { logger, corsOrigin, bodyLimit } = options;
  const app = express();

  // Trust proxy for rate limiting behind reverse-proxy
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.removeHeader('X-Powered-By');
    next();
  });

  // Request ID
  app.use(requestId());

  // CORS
  app.use(cors({ origin: corsOrigin ?? SERVER_CONFIG.DEFAULT_CORS_ORIGIN, credentials: true }));

  // Body parsing — skip /webhooks so ingest routes can use express.raw() for signature verification
  app.use((req, res, next) => {
    if (req.path.startsWith('/webhooks')) return next();
    express.json({ limit: bodyLimit ?? SERVER_CONFIG.BODY_LIMIT })(req, res, next);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        requestId: req.requestId,
      });
    });
    next();
  });

  return app;
}

/**
 * Attach the error handler — call this AFTER all routes are mounted.
 */
export function attachErrorHandler(app: express.Express, logger: Logger): void {
  // 404 for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // Global error handler
  app.use(errorHandler(logger));
}
