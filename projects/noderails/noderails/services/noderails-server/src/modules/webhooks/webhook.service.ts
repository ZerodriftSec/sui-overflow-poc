import { randomBytes } from 'node:crypto';
import { getDatabaseClient } from '@noderails/database';
import { NotFoundError, QUEUE_NAMES } from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import * as appService from '../apps/app.service.js';
import { getWebhookDeliveryConfig } from './webhook-config.service.js';

// ── Create Webhook ──

interface CreateWebhookInput {
  merchantId: string;
  appId: string;
  url: string;
  events: string[];
}

export async function createWebhook(input: CreateWebhookInput) {
  await appService.getApp(input.merchantId, input.appId);

  const db = getDatabaseClient();
  const secret = randomBytes(32).toString('hex');

  const webhook = await db.webhook.create({
    data: {
      appId: input.appId,
      url: input.url,
      secret,
      events: input.events,
    },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  return { ...webhook, secret };
}

// ── List Webhooks ──

export async function listWebhooks(merchantId: string, appId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  return db.webhook.findMany({
    where: { appId },
    select: {
      id: true, url: true, events: true, active: true,
      createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Update Webhook ──

interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  active?: boolean;
}

export async function updateWebhook(
  merchantId: string,
  appId: string,
  webhookId: string,
  input: UpdateWebhookInput,
) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.appId !== appId) throw new NotFoundError('Webhook', webhookId);

  return db.webhook.update({
    where: { id: webhookId },
    data: {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: input.events }),
      ...(input.active !== undefined && { active: input.active }),
    },
    select: { id: true, url: true, events: true, active: true, updatedAt: true },
  });
}

// ── Delete Webhook ──

export async function deleteWebhook(merchantId: string, appId: string, webhookId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.appId !== appId) throw new NotFoundError('Webhook', webhookId);

  await db.webhook.delete({ where: { id: webhookId } });
}

// ── Rotate Secret ──

export async function rotateWebhookSecret(merchantId: string, appId: string, webhookId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();

  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.appId !== appId) throw new NotFoundError('Webhook', webhookId);

  const newSecret = randomBytes(32).toString('hex');
  await db.webhook.update({ where: { id: webhookId }, data: { secret: newSecret } });

  return { secret: newSecret };
}

// ── Test Ping ──

export async function sendTestPing(merchantId: string, appId: string, webhookId: string) {
  await appService.getApp(merchantId, appId);

  const db = getDatabaseClient();
  const webhook = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.appId !== appId) throw new NotFoundError('Webhook', webhookId);

  const { deliverWebhook } = await import('./webhook.deliver.js');
  const { createLogger } = await import('@noderails/service-base');
  const logger = createLogger('webhook-test-ping');

  const testPayload = {
    event: 'test.ping',
    data: {
      message: 'This is a test webhook ping from NodeRails.',
      webhookId: webhook.id,
      timestamp: new Date().toISOString(),
    },
  };

  const result = await deliverWebhook(
    { url: webhook.url, secret: webhook.secret, payload: testPayload },
    logger,
  );

  return {
    success: result.success,
    statusCode: result.statusCode ?? null,
    responseBody: result.responseBody?.substring(0, 1000) ?? null,
    error: result.error ?? null,
  };
}

// ── List Deliveries ──

interface ListDeliveriesInput {
  merchantId: string;
  appId: string;
  webhookId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export async function listDeliveries(input: ListDeliveriesInput) {
  await appService.getApp(input.merchantId, input.appId);

  const db = getDatabaseClient();
  const webhook = await db.webhook.findUnique({ where: { id: input.webhookId } });
  if (!webhook || webhook.appId !== input.appId) throw new NotFoundError('Webhook', input.webhookId);

  const limit = Math.min(input.limit ?? 25, 100);

  const where: Record<string, unknown> = { webhookId: input.webhookId };
  if (input.status) where.status = input.status;

  const deliveries = await db.webhookDelivery.findMany({
    where,
    select: {
      id: true,
      event: true,
      status: true,
      responseStatus: true,
      attempts: true,
      createdAt: true,
      deliveredAt: true,
      nextRetryAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = deliveries.length > limit;
  const items = hasMore ? deliveries.slice(0, limit) : deliveries;

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  };
}

// ── Enqueue Webhook Event for an App ──

/**
 * Generic webhook dispatcher: finds all active webhooks for an app that
 * subscribe to `event`, creates WebhookDelivery records, and enqueues
 * delivery jobs.  Works for any event type (payment, subscription, etc.).
 */
export async function enqueueAppWebhook(
  appId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const db = getDatabaseClient();

  const [webhooks, webhookConfig] = await Promise.all([
    db.webhook.findMany({ where: { appId, active: true } }),
    getWebhookDeliveryConfig(),
  ]);

  for (const webhook of webhooks) {
    const subscribedEvents = webhook.events as string[];
    if (!subscribedEvents.includes(event) && !subscribedEvents.includes('*')) continue;

    // Send each webhook redundantSends times with staggered delays
    for (let i = 0; i < webhookConfig.redundantSends; i++) {
      const delivery = await db.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: { event, ...payload },
        },
      });

      const queue = queueRegistry.getOrCreateQueue<any>(QUEUE_NAMES.WEBHOOK_DELIVER);
      await queue.add(
        `deliver-${delivery.id}`,
        {
          deliveryId: delivery.id,
          webhookUrl: webhook.url,
          webhookSecret: webhook.secret,
          payload: delivery.payload,
          attempt: 0,
        },
        {
          delay: webhookConfig.redundantDelaysMs[i] ?? 0,
        },
      );
    }
  }
}
