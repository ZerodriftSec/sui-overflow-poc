import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IndexedSuiEvent } from '../types/sui.js';

export interface WebhookDelivery {
  id: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  signature: string;
  attempt: number;
  createdAt: string;
}

export class WebhookDispatcher {
  constructor(private readonly signingSecret: string) {}

  sign(body: string): string {
    const mac = createHmac('sha256', this.signingSecret).update(body).digest('hex');
    return `v1=${mac}`;
  }

  verify(header: string | undefined, body: string): boolean {
    if (!header?.startsWith('v1=')) return false;
    const expected = this.sign(body);
    try {
      return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  buildDelivery(evt: IndexedSuiEvent, url: string): WebhookDelivery {
    const payload = {
      id: `evt_${evt.eventKey.replace(/:/g, '_')}`,
      type: evt.name,
      chain_id: evt.chainId,
      data: evt.payload,
      tx_digest: evt.txDigest,
    };
    const raw = JSON.stringify(payload);
    return {
      id: payload.id,
      url,
      event: evt.name,
      payload,
      signature: this.sign(raw),
      attempt: 1,
      createdAt: new Date().toISOString(),
    };
  }
}
