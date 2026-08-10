import { NextResponse } from 'next/server';
import { handleNodeRailsWebhook } from '@/lib/webhook-handler';
import { listRecentWebhooks } from '@/lib/orders-store';
import { getWebhookUrl } from '@/lib/noderails';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-noderails-signature');
  const timestamp = request.headers.get('x-noderails-timestamp');

  try {
    const result = handleNodeRailsWebhook(rawBody, signature, timestamp);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook rejected';
    console.error('[buy-me-coffee/webhook]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    webhookUrl: getWebhookUrl(),
    secretConfigured: Boolean(process.env.NODERAILS_WEBHOOK_SECRET),
    recent: listRecentWebhooks(10),
    confirmEvents: ['payment.captured', 'payment.settled', 'subscription.activated'],
  });
}
