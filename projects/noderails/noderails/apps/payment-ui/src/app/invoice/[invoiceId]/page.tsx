'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getInvoicePublic, createCheckoutSessionFromInvoice } from '@/lib/api';
import { PaymentLinkCheckout } from '@/components/payment-link-checkout';
import { CheckoutWeb3Provider } from '@/components/checkout-web3-provider';
import { NodeRailsLogo } from '@/components/noderails-logo';
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Ban,
} from 'lucide-react';

type InvoiceState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'paid'; invoice: any }
  | { phase: 'void'; invoice: any }
  | { phase: 'inactive'; invoice: any }
  | { phase: 'creating-session'; invoice: any }
  | { phase: 'checkout'; sessionData: any }
  | { phase: 'error'; message: string; invoice?: any };

export default function InvoicePage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [state, setState] = useState<InvoiceState>({ phase: 'loading' });

  useEffect(() => {
    if (!invoiceId) return;

    async function init() {
      // Step 1: Fetch invoice to check status
      const invoice = await getInvoicePublic(invoiceId);
      if (!invoice) {
        setState({ phase: 'not-found' });
        return;
      }

      // Handle terminal states
      if (invoice.status === 'PAID') {
        setState({ phase: 'paid', invoice });
        return;
      }
      if (invoice.status === 'VOID') {
        setState({ phase: 'void', invoice });
        return;
      }
      if (invoice.status !== 'OPEN') {
        setState({ phase: 'inactive', invoice });
        return;
      }

      // Step 2: Create checkout session from invoice
      setState({ phase: 'creating-session', invoice });

      const sessionData = await createCheckoutSessionFromInvoice(invoiceId);
      if (!sessionData) {
        setState({ phase: 'error', message: 'Failed to create checkout session', invoice });
        return;
      }

      setState({ phase: 'checkout', sessionData });
    }

    init();
  }, [invoiceId]);

  // ── Loading ──
  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">Loading invoice...</p>
        </div>
      </div>
    );
  }

  // ── Not Found ──
  if (state.phase === 'not-found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Invoice Not Found</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This invoice does not exist or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  // ── Paid ──
  if (state.phase === 'paid') {
    const { invoice } = state;
    return (
      <InvoiceShell invoice={invoice}>
        <div className="text-center py-4">
          <CheckCircle className="mx-auto h-14 w-14 text-green-500" />
          <p className="mt-3 text-lg font-semibold text-green-600">Paid</p>
          {invoice.paidAt && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Paid on {new Date(invoice.paidAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </InvoiceShell>
    );
  }

  // ── Void ──
  if (state.phase === 'void') {
    const { invoice } = state;
    return (
      <InvoiceShell invoice={invoice}>
        <div className="text-center py-4">
          <Ban className="mx-auto h-14 w-14 text-[var(--muted-foreground)]" />
          <p className="mt-3 text-lg font-semibold text-[var(--muted-foreground)]">Voided</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This invoice has been voided and is no longer payable.
          </p>
        </div>
      </InvoiceShell>
    );
  }

  // ── Inactive (DRAFT, PAST_DUE, UNCOLLECTIBLE) ──
  if (state.phase === 'inactive') {
    const { invoice } = state;
    return (
      <InvoiceShell invoice={invoice}>
        <div className="text-center py-4">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--muted-foreground)]" />
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            This invoice is {invoice.status.toLowerCase()} and cannot be paid at this time.
          </p>
        </div>
      </InvoiceShell>
    );
  }

  // ── Creating Session ──
  if (state.phase === 'creating-session') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--primary)]" />
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">Preparing checkout...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (state.phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Something went wrong</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{state.message}</p>
        </div>
      </div>
    );
  }

  // ── Checkout — reuse the full PaymentLinkCheckout component ──
  const { sessionData } = state;
  const linkData = {
    id: sessionData.invoiceId,
    checkoutSessionId: sessionData.checkoutSessionId,
    name: `Invoice ${sessionData.invoiceNumber}`,
    description: sessionData.memo ?? null,
    slug: sessionData.invoiceId,
    amount: sessionData.amount,
    currency: sessionData.currency,
    subtotal: sessionData.subtotal ?? null,
    taxAmount: sessionData.taxAmount ?? null,
    taxDescription: sessionData.taxDescription ?? null,
    isActive: true,
    requireBillingDetails: sessionData.requireBillingDetails ?? true,
    successUrl: null,
    cancelUrl: null,
    app: sessionData.app,
    acceptedChains: sessionData.acceptedChains,
    acceptedTokens: sessionData.acceptedTokens,
    productPlan: null,
    productPlanPrice: null,
    items: sessionData.items ?? [],
  };

    return (
      <CheckoutWeb3Provider chains={linkData.acceptedChains ?? []}>
        <PaymentLinkCheckout link={linkData} />
      </CheckoutWeb3Provider>
    );
}

// ── Invoice Display Shell (for non-checkout states) ──

function InvoiceShell({
  invoice,
  children,
}: {
  invoice: any;
  children: React.ReactNode;
}) {
  const total = Number(invoice.total ?? invoice.subtotal ?? 0);
  const taxAmount = Number(invoice.taxAmount ?? 0);
  const subtotal = Number(invoice.subtotal ?? 0);
  const hasTax = taxAmount > 0 && invoice.taxRate;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <NodeRailsLogo withText className="mx-auto mb-3 w-[260px] h-auto" />
          <h1 className="text-lg font-semibold">
            Invoice from {invoice.app?.name ?? 'NodeRails'}
          </h1>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {/* Invoice summary */}
          <div className="border-b border-[var(--border)] p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-[var(--muted-foreground)]">
                {invoice.invoiceNumber}
              </span>
              <InvoiceStatusBadge status={invoice.status} />
            </div>

            <p className="text-3xl font-bold text-center">
              ${total.toFixed(2)}
              <span className="ml-2 text-base font-normal text-[var(--muted-foreground)]">
                {invoice.currency ?? 'USD'}
              </span>
            </p>

            {hasTax && (
              <div className="mt-2 text-xs text-center text-[var(--muted-foreground)] space-y-0.5">
                <p>Subtotal: ${subtotal.toFixed(2)}</p>
                <p>
                  {invoice.taxRate.displayName} ({invoice.taxRate.percentage}%
                  {invoice.taxRate.inclusive ? ', incl.' : ''}): ${taxAmount.toFixed(2)}
                </p>
              </div>
            )}

            {invoice.dueDate && (
              <p className="mt-2 text-xs text-center text-[var(--muted-foreground)]">
                Due: {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Line items */}
          {invoice.items && invoice.items.length > 0 && (
            <div className="border-b border-[var(--border)] px-6 py-4">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Items
              </p>
              <div className="space-y-2">
                {invoice.items.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground)]">
                      {item.description}
                      {item.quantity > 1 && (
                        <span className="text-[var(--muted-foreground)] ml-1">
                          &times; {item.quantity}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[var(--foreground)]">
                      ${(Number(item.amount) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Memo */}
          {invoice.memo && (
            <div className="border-b border-[var(--border)] px-6 py-4">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                Memo
              </p>
              <p className="text-sm text-[var(--foreground)]">{invoice.memo}</p>
            </div>
          )}

          {/* Action area */}
          <div className="p-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
          Powered by{' '}
          <span className="font-medium text-[var(--foreground)]">NodeRails</span>
        </p>
      </div>
    </div>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PAID: 'bg-green-100 text-green-700',
    OPEN: 'bg-blue-100 text-blue-700',
    DRAFT: 'bg-gray-100 text-gray-500',
    VOID: 'bg-gray-100 text-gray-500',
    PAST_DUE: 'bg-red-100 text-red-700',
    UNCOLLECTIBLE: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}
    >
      {status}
    </span>
  );
}
