import type { CursorPaginationParams, WebhookDeliveryStatus, WebhookEvent } from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string;
  appId: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  paymentIntentId: string | null;
  event: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  attempts: number;
  status: WebhookDeliveryStatus;
  nextRetryAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface WebhookEndpointCreateParams {
  url: string;
  events: WebhookEvent[];
}

export interface WebhookEndpointUpdateParams {
  url?: string;
  events?: WebhookEvent[];
  active?: boolean;
}

export interface WebhookDeliveryListParams extends CursorPaginationParams {
  status?: WebhookDeliveryStatus;
}
