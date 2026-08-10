'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Radio } from 'lucide-react';

/** Brief “webhook verify” beat, then success + redirect. */
const WAIT_MS = 1200;
const SUCCESS_FLASH_MS = 600;

interface OrderSummary {
  id: string;
  itemName: string;
  amount: string;
  currency: string;
  webhookEvent: string;
  webhookPayload: Record<string, unknown>;
}

function buildDemoOrder(orderId: string, sessionId: string | null): OrderSummary {
  return {
    id: orderId,
    itemName: 'Buy me a coffee',
    amount: '3.00',
    currency: 'USD',
    webhookEvent: 'payment.captured',
    webhookPayload: {
      event: 'payment.captured',
      id: `evt_demo_${orderId.slice(0, 8)}`,
      paymentIntentId: `pi_demo_${orderId.replace(/-/g, '').slice(0, 12)}`,
      checkoutSessionId: sessionId,
      amount: '3.00',
      currency: 'USD',
      metadata: { orderId, source: 'buy-me-coffee-demo', chain: 'sui' },
      authorizationChainId: 202,
      authorizationTokenKey: 'SUI-202',
      verified: true,
    },
  };
}

export function SuccessAwaitingWebhook() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order');
  const rawSession = searchParams.get('session');
  const sessionId =
    rawSession && rawSession !== '{CHECKOUT_SESSION_ID}' ? rawSession : null;

  const [phase, setPhase] = useState<'waiting' | 'confirmed'>('waiting');
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;

    void fetch(`/api/orders/${orderId}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.order) {
          setOrder({
            id: data.order.id,
            itemName: data.order.itemName,
            amount: data.order.amount,
            currency: data.order.currency,
            webhookEvent: 'payment.captured',
            webhookPayload: buildDemoOrder(orderId, sessionId).webhookPayload,
          });
        }
      })
      .catch(() => {});

    const confirmTimer = window.setTimeout(() => {
      setOrder((prev) => prev ?? buildDemoOrder(orderId, sessionId));
      setPhase('confirmed');
    }, WAIT_MS);

    const redirectTimer = window.setTimeout(() => {
      window.location.replace('/');
    }, WAIT_MS + SUCCESS_FLASH_MS);

    return () => {
      window.clearTimeout(confirmTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [orderId, sessionId]);

  if (!orderId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="text-stone-600">Missing order id.</p>
        <Link href="/" className="mt-6 text-sm font-semibold text-amber-700 hover:underline">
          Back to demo
        </Link>
      </main>
    );
  }

  const display = order ?? buildDemoOrder(orderId, sessionId);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <div className="rounded-3xl border border-amber-200/80 bg-white p-8 shadow-lg shadow-amber-900/5 sm:p-10">
        {phase === 'waiting' ? (
          <>
            <div className="flex items-center justify-center gap-3 text-amber-700">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
              <Radio className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="mt-6 text-center text-2xl font-bold text-stone-900">Waiting for webhook…</h1>
            <p className="mt-3 text-center text-sm text-stone-600">
              Verifying <code className="text-xs">payment.captured</code>…
            </p>
            <div className="mt-6 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600 text-center">
              {display.itemName} · ${display.amount} {display.currency}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-600" aria-hidden />
            </div>
            <h1 className="mt-4 text-center text-2xl font-bold text-stone-900">Payment confirmed</h1>
            <p className="mt-2 text-center text-sm text-stone-600">
              Webhook <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{display.webhookEvent}</code>{' '}
              verified.
            </p>
            <p className="mt-4 text-center text-xs text-stone-500">Redirecting…</p>
          </>
        )}
      </div>
    </main>
  );
}
