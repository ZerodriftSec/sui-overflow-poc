import { WEBHOOK_CONFIG, createWebhookSignature, nowSeconds } from '@noderails/common';
import type { Logger } from '@noderails/service-base';

interface DeliveryInput {
  url: string;
  secret: string;
  payload: unknown;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

/**
 * Deliver a webhook payload to a merchant endpoint.
 * Signs with HMAC-SHA256, enforces timeout.
 */
export async function deliverWebhook(
  input: DeliveryInput,
  logger: Logger,
): Promise<DeliveryResult> {
  const body = JSON.stringify(input.payload);
  const timestamp = nowSeconds().toString();
  const signedPayload = `${timestamp}.${body}`;
  const signature = createWebhookSignature(signedPayload, input.secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WEBHOOK_CONFIG.SIGNATURE_HEADER]: signature,
        [WEBHOOK_CONFIG.TIMESTAMP_HEADER]: timestamp,
      },
      body,
      signal: controller.signal,
    });

    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      logger.info('Webhook delivered', { url: input.url, status: response.status });
      return { success: true, statusCode: response.status, responseBody };
    }

    logger.warn('Webhook delivery failed', { url: input.url, status: response.status });
    return { success: false, statusCode: response.status, responseBody };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Webhook delivery error', { url: input.url, error: errorMsg });
    return { success: false, error: errorMsg };
  } finally {
    clearTimeout(timeout);
  }
}
