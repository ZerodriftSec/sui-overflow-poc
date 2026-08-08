import { NodeRails } from '@noderails/sdk';
import {
  appendWebhookLog,
  findOrderByPaymentIntentId,
  getOrder,
  orderIdFromPayload,
  PAYMENT_CONFIRM_EVENTS,
  updateOrder,
} from '@/lib/orders-store';

export interface WebhookHandleResult {
  verified: boolean;
  orderId: string | null;
  event: string;
  confirmed: boolean;
}

export function handleNodeRailsWebhook(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
): WebhookHandleResult {
  const secret = process.env.NODERAILS_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Set NODERAILS_WEBHOOK_SECRET in .env.local (from dashboard webhook endpoint)');
  }

  let payload: Record<string, unknown>;

  try {
    payload = NodeRails.webhooks.constructEvent<Record<string, unknown>>(
      rawBody,
      signatureHeader ?? undefined,
      timestampHeader ?? undefined,
      secret,
    );
  } catch (err) {
    appendWebhookLog({
      event: 'verification_failed',
      orderId: null,
      verified: false,
      payload: { error: err instanceof Error ? err.message : 'Invalid signature' },
    });
    throw err;
  }

  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  let orderId = orderIdFromPayload(payload);

  if (!orderId && typeof payload.paymentIntentId === 'string') {
    const byPi = findOrderByPaymentIntentId(payload.paymentIntentId);
    orderId = byPi?.id ?? null;
  }

  appendWebhookLog({
    event,
    orderId,
    verified: true,
    payload,
  });

  const confirmed = PAYMENT_CONFIRM_EVENTS.has(event);
  if (confirmed && orderId) {
    const order = getOrder(orderId);
    if (order && order.status !== 'confirmed') {
      updateOrder(orderId, {
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
        webhookEvent: event,
        webhookPayload: payload,
        paymentIntentId:
          typeof payload.paymentIntentId === 'string' ? payload.paymentIntentId : order.paymentIntentId,
      });
    }
  }

  return { verified: true, orderId, event, confirmed };
}
