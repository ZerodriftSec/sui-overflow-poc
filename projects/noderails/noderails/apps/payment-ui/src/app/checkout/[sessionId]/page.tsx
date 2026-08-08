'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCheckoutSession } from '@/lib/api';
import { PaymentLinkCheckout } from '@/components/payment-link-checkout';
import { CheckoutWeb3Provider } from '@/components/checkout-web3-provider';
import { Loader2, AlertCircle, XCircle } from 'lucide-react';

type PageState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'expired' }
  | { phase: 'error'; message: string }
  | { phase: 'checkout'; sessionData: any };

export default function CheckoutSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [state, setState] = useState<PageState>({ phase: 'loading' });

  useEffect(() => {
    if (!sessionId) return;

    async function init() {
      const session = await getCheckoutSession(sessionId);
      if (session && 'error' in session && typeof session.error === 'string') {
        setState({ phase: 'error', message: session.error });
        return;
      }
      if (!session) {
        setState({ phase: 'not-found' });
        return;
      }

      if (session.status === 'EXPIRED') {
        setState({ phase: 'expired' });
        return;
      }

      if (session.status === 'COMPLETE') {
        setState({ phase: 'error', message: 'This checkout session has already been completed.' });
        return;
      }

      setState({ phase: 'checkout', sessionData: session });
    }

    init();
  }, [sessionId]);

  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'not-found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Checkout Not Found</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This checkout session does not exist or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <XCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Session Expired</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This checkout session has expired. Please request a new checkout link.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Checkout Unavailable</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{state.message}</p>
        </div>
      </div>
    );
  }

  // Map session data to PaymentLinkCheckout shape
  const { sessionData } = state;
  const firstItem = sessionData.items?.[0];

  const linkData = {
    id: sessionData.id,
    checkoutSessionId: sessionData.id,
    name: firstItem?.name ?? 'Checkout',
    description: firstItem?.description ?? null,
    slug: sessionData.id,
    amount: sessionData.amount,
    subtotal: sessionData.subtotal ?? null,
    taxAmount: sessionData.taxAmount ?? null,
    taxDescription: sessionData.taxDescription ?? null,
    currency: sessionData.currency,
    isActive: true,
    requireBillingDetails: sessionData.requireBillingDetails ?? false,
    successUrl: sessionData.successUrl || null,
    cancelUrl: sessionData.cancelUrl || null,
    app: sessionData.app,
    acceptedChains: sessionData.acceptedChains ?? [],
    acceptedTokens: sessionData.acceptedTokens ?? [],
    productPlan: firstItem?.productPlan ?? null,
    productPlanPrice: firstItem?.productPlanPrice ?? null,
    items: sessionData.items ?? [],
  };

  return (
    <CheckoutWeb3Provider chains={linkData.acceptedChains ?? []}>
      <PaymentLinkCheckout link={linkData} />
    </CheckoutWeb3Provider>
  );
}
