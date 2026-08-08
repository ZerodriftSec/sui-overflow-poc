import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import cookieParser from 'cookie-parser';
import {
  createApp,
  attachErrorHandler,
  createLogger,
  gracefulShutdown,
  createRateLimiter,
  apiVersion,
  idempotency,
  type CorsOrigin,
} from '@noderails/service-base';
import { createDatabaseClient, disconnectDatabase } from '@noderails/database';
import { createRedisClient, disconnectRedis } from '@noderails/redis';
import { RATE_LIMIT_CONFIG } from '@noderails/common';
import { env } from './config.js';

// ── Module routes ──
import authRoutes from './modules/auth/auth.routes.js';
import appRoutes from './modules/apps/app.routes.js';
import apiKeyRoutes from './modules/api-keys/api-key.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';
import intentRoutes from './modules/payments/intent.routes.js';
import checkoutRoutes from './modules/payments/checkout.routes.js';
import ingestRoutes from './modules/payments/ingest.routes.js';
import priceRoutes from './modules/prices/price.routes.js';
import payoutRoutes from './modules/payouts/payout.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscription.routes.js';
import invoiceRoutes from './modules/invoices/invoice.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import productPlanRoutes from './modules/product-plans/product-plan.routes.js';
import customerAccountRoutes from './modules/customer-accounts/customer-account.routes.js';
import checkoutSessionRoutes from './modules/checkout-sessions/checkout-session.routes.js';
import paymentLinkRoutes from './modules/payment-links/payment-link.routes.js';
import taxRateRoutes from './modules/tax-rates/tax-rate.routes.js';
import disputeRoutes from './modules/disputes/dispute.routes.js';
import teamRoutes from './modules/team/team.routes.js';
import feedbackRoutes from './modules/feedback/feedback.routes.js';
import publicRoutes from './modules/public/public.routes.js';

// ── Webhook worker ──
import { startWebhookWorker } from './modules/webhooks/webhook.worker.js';
// ── Subscription workers ──
import { startSubscriptionWorkers } from './modules/subscriptions/subscription.worker.js';
import { reconcileSubscriptions } from './modules/subscriptions/subscription.service.js';
import { SUBSCRIPTION_CONFIG } from '@noderails/common';
// ── Settlement worker ──
import { startSettlementWorker, reconcileSettlements } from './modules/payments/settlement.worker.js';
// ── Email worker ──
import { startEmailWorker } from './modules/email/email.worker.js';
import { startSesNotificationPoller } from './modules/email/ses-notifications.service.js';
import { queueRegistry } from '@noderails/queue';
import statsRoutes from './modules/stats/stats.routes.js';

const logger = createLogger('noderails-server', env.LOG_LEVEL);

async function main() {
  // ── Database ──
  // In production (EC2), RDS handles SSL natively within VPC — no CA cert needed.
  // In dev/test, use local ca.pem for SSL connections.
  const isProduction = process.env.NODE_ENV === 'production';
  const dbUrl = new URL(env.DATABASE_URL);
  logger.info(`Connecting to database: ${dbUrl.hostname}:${dbUrl.port || 5432}/${dbUrl.pathname.slice(1)} (user: ${dbUrl.username})`);
  createDatabaseClient({
    url: env.DATABASE_URL,
    ...(!isProduction && {
      sslCaPath: path.resolve(__dirname, '../../../ca.pem'),
    }),
  });
  logger.info('Database connected');

  // ── Redis ──
  createRedisClient({ url: env.REDIS_URL });
  logger.info('Redis connected');

  logger.info(
    'Solana solana.cuLimit is capped at 1.4M CUs per transaction (protocol); MTXM_SOLANA_CU_LIMIT is clamped to the same. Heavy instructions (e.g. CaptureSpl) must use less on-chain or be split.',
    {
      MTXM_SOLANA_CU_LIMIT: env.MTXM_SOLANA_CU_LIMIT,
      MTXM_SOLANA_CU_LIMIT_ENV: process.env.MTXM_SOLANA_CU_LIMIT ?? '(unset)',
    },
  );

  // ── Express app ──
  // Allow any *.noderails.com subdomain + explicit origins from env
  const explicitOrigins = env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  const corsOrigin: CorsOrigin = (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);
    // Allow any *.noderails.com subdomain (including noderails.com itself)
    if (/^https:\/\/([a-z0-9-]+\.)*noderails\.com$/.test(origin)) return callback(null, true);
    // Allow explicit origins from CORS_ORIGIN env var (e.g. localhost for dev)
    if (explicitOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  };
  const app = createApp({ logger, corsOrigin });
  app.use(cookieParser());

  // ── API Versioning ──
  app.use(apiVersion());

  // ── Idempotency ──
  app.use(idempotency());

  // ── Rate limiting ──
  app.use('/auth', createRateLimiter({
    max: RATE_LIMIT_CONFIG.AUTH_MAX,
    windowSec: RATE_LIMIT_CONFIG.AUTH_WINDOW_SEC,
  }));
  app.use('/payments', createRateLimiter({
    max: RATE_LIMIT_CONFIG.PAYMENT_MAX,
    windowSec: RATE_LIMIT_CONFIG.PAYMENT_WINDOW_SEC,
  }));
  app.use('/prices', createRateLimiter({ max: 200, windowSec: 60 }));
  app.use('/feedback', createRateLimiter({ max: 12, windowSec: 60 }));

  // ── Mount routes ──
  app.use('/auth', authRoutes);
  app.use('/apps/:appId/api-keys', apiKeyRoutes);
  app.use('/apps/:appId/webhooks', webhookRoutes);
  app.use('/apps', appRoutes);
  app.use('/payments', intentRoutes);
  app.use('/checkout', checkoutRoutes);
  app.use('/webhooks', ingestRoutes);
  app.use('/prices', priceRoutes);
  app.use('/payouts', payoutRoutes);
  app.use('/subscriptions', subscriptionRoutes);
  app.use('/invoices', invoiceRoutes);
  app.use('/payment-links', paymentLinkRoutes);
  app.use('/tax-rates', taxRateRoutes);
  app.use('/admin', adminRoutes);
  app.use('/product-plans', productPlanRoutes);
  app.use('/customers', customerAccountRoutes);
  app.use('/checkout-sessions', checkoutSessionRoutes);
  app.use('/stats', statsRoutes);
  app.use('/disputes', disputeRoutes);
  app.use('/team', teamRoutes);
  app.use('/feedback', feedbackRoutes);
  app.use('/public', publicRoutes);

  // ── Error handler (must be last) ──
  attachErrorHandler(app, logger);

  // ── Start webhook delivery worker ──
  const worker = startWebhookWorker(logger);

  // ── Start subscription workers ──
  const subWorkers = startSubscriptionWorkers(logger);

  // ── Start settlement worker ──
  const settlementWorkers = startSettlementWorker(logger);

  // ── Start email worker ──
  const emailWorker = startEmailWorker(logger);

  // ── Start SES bounce/complaint/delivery notification poller ──
  const sesPoller = startSesNotificationPoller(logger);

  // ── Reconcile missed subscription charges on startup ──
  if (SUBSCRIPTION_CONFIG.RECONCILE_ON_STARTUP) {
    reconcileSubscriptions(logger).catch((err) => {
      logger.error('Subscription reconciliation failed', { error: String(err) });
    });
  }

  // ── Reconcile missed settlements on startup ──
  reconcileSettlements(logger).catch((err) => {
    logger.error('Settlement reconciliation failed', { error: String(err) });
  });

  // ── Start server ──
  const server = app.listen(env.PORT, () => {
    logger.info(`NodeRails server listening on port ${env.PORT}`);
  });

  // ── Graceful shutdown ──
  gracefulShutdown(server, logger, [
    async () => { await worker.close(); logger.info('Webhook worker stopped'); },
    async () => {
      await subWorkers.chargeWorker.close();
      await subWorkers.retryWorker.close();
      await subWorkers.gracePeriodWorker.close();
      logger.info('Subscription workers stopped');
    },
    async () => {
      await settlementWorkers.settleWorker.close();
      logger.info('Settlement worker stopped');
    },
    async () => {
      sesPoller.stop();
    },
    async () => {
      await queueRegistry.closeAll();
      logger.info('All queues closed');
    },
    disconnectDatabase,
    disconnectRedis,
  ]);
}

main().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
