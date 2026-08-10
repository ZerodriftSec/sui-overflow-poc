'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createCheckoutSessionFromLink } from '@/lib/api';
import { PaymentLinkCheckout } from '@/components/payment-link-checkout';
import { CheckoutWeb3Provider } from '@/components/checkout-web3-provider';
import { Loader2, AlertCircle } from 'lucide-react';

type LinkPageState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'checkout'; sessionData: Record<string, unknown> };

function toLinkData(sessionData: Record<string, unknown>) {
  return {
    id: String(sessionData.id ?? ''),
    checkoutSessionId: String(sessionData.checkoutSessionId ?? ''),
    name: String(sessionData.name ?? 'Checkout'),
    description: (sessionData.description as string | null | undefined) ?? null,
    slug: String(sessionData.slug ?? ''),
    amount: sessionData.amount as number | null | undefined,
    subtotal: sessionData.subtotal as number | null | undefined,
    taxAmount: sessionData.taxAmount as number | null | undefined,
    taxDescription: (sessionData.taxDescription as string | null | undefined) ?? null,
    currency: String(sessionData.currency ?? 'USD'),
    isActive: Boolean(sessionData.isActive ?? true),
    successUrl: (sessionData.successUrl as string | null | undefined) ?? null,
    cancelUrl: (sessionData.cancelUrl as string | null | undefined) ?? null,
    requireBillingDetails: Boolean(sessionData.requireBillingDetails ?? false),
    app: sessionData.app as
      | { name: string; orgName?: string | null; environment?: string; logoUrl?: string | null }
      | null
      | undefined,
    acceptedChains: (sessionData.acceptedChains as never[]) ?? [],
    acceptedTokens: (sessionData.acceptedTokens as never[]) ?? [],
    productPlan: sessionData.productPlan as
      | { name: string; description?: string | null; imageUrl?: string | null }
      | null
      | undefined,
    productPlanPrice: sessionData.productPlanPrice as
      | {
          id: string;
          amount: number;
          currency: string;
          billingInterval?: string | null;
          billingIntervalCount?: number | null;
          nickname?: string | null;
        }
      | null
      | undefined,
    items: (sessionData.items as never[]) ?? [],
  };
}

export default function PaymentLinkPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LinkPageState>({ phase: 'loading' });

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    async function init() {
      try {
        const sessionData = await createCheckoutSessionFromLink(slug);
        if (cancelled) return;

        if (!sessionData) {
          setState({ phase: 'not-found' });
          return;
        }

        setState({ phase: 'checkout', sessionData: sessionData as Record<string, unknown> });
      } catch (e) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: e instanceof Error ? e.message : 'Failed to load payment link',
        });
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [slug]);

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
          <p className="mt-3 text-lg font-semibold">Payment link not found</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This link does not exist or is no longer active.
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
          <p className="mt-3 text-lg font-semibold">Checkout unavailable</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{state.message}</p>
        </div>
      </div>
    );
  }

  const linkData = toLinkData(state.sessionData);

  return (
    <CheckoutWeb3Provider chains={linkData.acceptedChains ?? []}>
      <PaymentLinkCheckout link={linkData} />
    </CheckoutWeb3Provider>
  );
}
