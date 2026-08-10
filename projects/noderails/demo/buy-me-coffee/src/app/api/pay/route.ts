import { NextResponse } from 'next/server';
import { createOrder } from '@/lib/orders-store';
import { runPayFlow } from '@/lib/pay-flows';
import { getSuiPaymentConstraints, getWebhookUrl } from '@/lib/noderails';
import type { PayRequestBody } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PayRequestBody;

    if (!body.flow) {
      return NextResponse.json({ error: 'Missing flow' }, { status: 400 });
    }

    const orderId = crypto.randomUUID();
    const result = await runPayFlow(body, orderId);

    const order = createOrder({
      id: orderId,
      flow: body.flow,
      amount: body.amount,
      currency: body.currency,
      itemName: body.itemName,
      paymentUrl: result.paymentUrl,
      checkoutSessionId: 'checkoutSessionId' in result ? result.checkoutSessionId : undefined,
      paymentLinkSlug: 'paymentLinkSlug' in result ? result.paymentLinkSlug : undefined,
      subscriptionId: 'subscriptionId' in result ? result.subscriptionId : undefined,
      debug: result.debug,
    });

    return NextResponse.json({
      orderId: order.id,
      paymentUrl: result.paymentUrl,
      flow: body.flow,
      debug: result.debug,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[buy-me-coffee/pay]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3005';
  const configured = Boolean(process.env.NODERAILS_APP_ID && process.env.NODERAILS_API_KEY);
  const webhookConfigured = Boolean(process.env.NODERAILS_WEBHOOK_SECRET);
  const { allowedChains, allowedTokens, chainId } = getSuiPaymentConstraints();

  return NextResponse.json({
    ok: configured,
    webhookConfigured,
    apiUrl: process.env.NODERAILS_API_URL ?? 'http://localhost:8080',
    paymentUiUrl: process.env.PAYMENT_UI_URL ?? 'http://localhost:3002',
    appBaseUrl: appBase,
    webhookUrl: getWebhookUrl(),
    suiChainId: chainId,
    allowedChains,
    allowedTokens,
    appIdConfigured: Boolean(process.env.NODERAILS_APP_ID),
  });
}
