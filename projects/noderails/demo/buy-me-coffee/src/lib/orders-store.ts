import type { PayFlow } from '@/lib/types';

export type OrderStatus = 'awaiting_webhook' | 'confirmed' | 'failed';

export interface StoredOrder {
  id: string;
  flow: PayFlow;
  status: OrderStatus;
  amount: string;
  currency: string;
  itemName: string;
  createdAt: string;
  paymentUrl: string;
  checkoutSessionId?: string;
  paymentLinkSlug?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
  confirmedAt?: string;
  webhookEvent?: string;
  webhookPayload?: Record<string, unknown>;
  debug?: Record<string, unknown>;
}

export interface WebhookLogEntry {
  id: string;
  receivedAt: string;
  event: string;
  orderId: string | null;
  verified: boolean;
  payload: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __coffeeOrders: Map<string, StoredOrder> | undefined;
  // eslint-disable-next-line no-var
  var __coffeeWebhooks: WebhookLogEntry[] | undefined;
}

const MAX_WEBHOOK_LOG = 50;

function ordersMap(): Map<string, StoredOrder> {
  if (!globalThis.__coffeeOrders) {
    globalThis.__coffeeOrders = new Map();
  }
  return globalThis.__coffeeOrders;
}

function webhookLog(): WebhookLogEntry[] {
  if (!globalThis.__coffeeWebhooks) {
    globalThis.__coffeeWebhooks = [];
  }
  return globalThis.__coffeeWebhooks;
}

export function createOrder(input: Omit<StoredOrder, 'status' | 'createdAt'>): StoredOrder {
  const order: StoredOrder = {
    ...input,
    status: 'awaiting_webhook',
    createdAt: new Date().toISOString(),
  };
  ordersMap().set(order.id, order);
  return order;
}

export function getOrder(orderId: string): StoredOrder | undefined {
  return ordersMap().get(orderId);
}

export function updateOrder(orderId: string, patch: Partial<StoredOrder>): StoredOrder | undefined {
  const existing = ordersMap().get(orderId);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  ordersMap().set(orderId, next);
  return next;
}

export function findOrderByPaymentIntentId(paymentIntentId: string): StoredOrder | undefined {
  for (const order of ordersMap().values()) {
    if (order.paymentIntentId === paymentIntentId) return order;
  }
  return undefined;
}

export function listRecentWebhooks(limit = 20): WebhookLogEntry[] {
  return webhookLog().slice(0, limit);
}

export function appendWebhookLog(entry: Omit<WebhookLogEntry, 'id' | 'receivedAt'>): WebhookLogEntry {
  const row: WebhookLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
  };
  const log = webhookLog();
  log.unshift(row);
  if (log.length > MAX_WEBHOOK_LOG) log.length = MAX_WEBHOOK_LOG;
  return row;
}

/** Events that mark an order as paid for this demo. */
export const PAYMENT_CONFIRM_EVENTS = new Set([
  'payment.captured',
  'payment.settled',
  'subscription.activated',
]);

export function orderIdFromPayload(payload: Record<string, unknown>): string | null {
  const metadata = payload.metadata;
  if (metadata && typeof metadata === 'object' && metadata !== null && 'orderId' in metadata) {
    const orderId = (metadata as Record<string, unknown>).orderId;
    if (typeof orderId === 'string' && orderId.length > 0) return orderId;
  }
  return null;
}
