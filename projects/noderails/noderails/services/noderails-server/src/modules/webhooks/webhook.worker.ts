import { getDatabaseClient } from '@noderails/database';
import { QUEUE_NAMES, WORKER_CONFIG, computeRetryDelay } from '@noderails/common';
import { createWorker, configureQueue, queueRegistry } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { deliverWebhook } from './webhook.deliver.js';
import { getWebhookDeliveryConfig } from './webhook-config.service.js';
import { env } from '../../config.js';

interface WebhookJob {
  deliveryId: string;
  webhookUrl: string;
  webhookSecret: string;
  payload: unknown;
  /** Which retry attempt this is (0 = first delivery) */
  attempt?: number;
}

export function startWebhookWorker(logger: Logger) {
  configureQueue({ redisUrl: env.REDIS_URL });

  const worker = createWorker<WebhookJob>(
    QUEUE_NAMES.WEBHOOK_DELIVER,
    async (job) => {
      const { deliveryId, webhookUrl, webhookSecret, payload, attempt = 0 } = job.data;
      const db = getDatabaseClient();

      const result = await deliverWebhook(
        { url: webhookUrl, secret: webhookSecret, payload },
        logger,
      );

      const attemptNumber = attempt + 1;

      if (result.success) {
        await db.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'DELIVERED',
            responseStatus: result.statusCode,
            responseBody: result.responseBody?.slice(0, 1000),
            attempts: attemptNumber,
            deliveredAt: new Date(),
          },
        });
        logger.info('Webhook delivery succeeded', { deliveryId, attempt: attemptNumber });
      } else {
        // Read config from DB to get current retry settings
        const config = await getWebhookDeliveryConfig();
        const isLastAttempt = attemptNumber >= config.maxRetries;

        const nextDelay = computeRetryDelay(
          attemptNumber - 1,
          config.baseDelayMs,
          config.backoffMultiplier,
          config.maxDelayMs,
        );

        await db.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: isLastAttempt ? 'FAILED' : 'PENDING',
            responseStatus: result.statusCode ?? null,
            responseBody: (result.responseBody ?? result.error)?.slice(0, 1000),
            attempts: attemptNumber,
            nextRetryAt: isLastAttempt ? null : new Date(Date.now() + nextDelay),
          },
        });

        if (!isLastAttempt) {
          // Re-enqueue with computed exponential backoff delay
          const queue = queueRegistry.getOrCreateQueue<WebhookJob>(QUEUE_NAMES.WEBHOOK_DELIVER);
          await queue.add(
            `deliver-${deliveryId}-retry-${attemptNumber}`,
            { deliveryId, webhookUrl, webhookSecret, payload, attempt: attemptNumber },
            { delay: nextDelay },
          );
          logger.warn('Webhook delivery failed, scheduled retry', {
            deliveryId,
            attempt: attemptNumber,
            nextRetryMs: nextDelay,
          });
        } else {
          logger.error('Webhook delivery permanently failed', { deliveryId, attempts: attemptNumber });
        }
      }
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  logger.info('Webhook delivery worker started', {
    queue: QUEUE_NAMES.WEBHOOK_DELIVER,
    concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY,
  });

  return worker;
}
