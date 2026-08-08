'use client';

import { clsx } from 'clsx';
import { CheckCircle, XCircle, Clock, Wallet, Shield } from 'lucide-react';
import { useCheckoutWallet } from '@/lib/satellite-wallet';
import { CheckoutWalletGrid } from './checkout/checkout-wallet-grid';
import { ConnectedWalletPill } from './checkout/connected-wallet-pill';
import { CheckoutTrustFooter } from './checkout/checkout-trust-footer';

interface PaymentData {
  id: string;
  amountUsd: string;
  chain: string;
  tokenAddress?: string | null;
  status: string;
  successUrl?: string | null;
  cancelUrl?: string | null;
  metadata?: Record<string, unknown>;
}

/** Legacy `/pay/[intentId]` — EVM-only connect via Satellite headless grid. */
export function CheckoutCard({ payment }: { payment: PaymentData }) {
  const { connected } = useCheckoutWallet('EVM');
  const isCompleted = ['CAPTURED', 'SETTLED'].includes(payment.status);
  const isCancelled = ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(payment.status);
  const isPending = payment.status === 'CREATED' || payment.status === 'AUTHORIZED';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="checkout-mesh" />
      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/20">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">NodeRails Checkout</h1>
        </div>

        {/* Payment Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-[var(--card)] shadow-[0_8px_40px_rgba(15,23,42,0.08)]">
          {/* Amount */}
          <div className="border-b border-[var(--border)] p-6 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">Amount Due</p>
            <p className="mt-1 text-4xl font-bold text-[var(--foreground)]">${payment.amountUsd}</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              on {payment.chain} &middot; {payment.tokenAddress ? 'ERC20' : 'Native'}
            </p>
          </div>

          {/* Status / Action */}
          <div className="p-6">
            {isCompleted && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success)]/10">
                  <CheckCircle className="h-8 w-8 text-[var(--success)]" />
                </div>
                <p className="text-lg font-semibold text-[var(--success)]">Payment Complete</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Your payment has been processed successfully.
                </p>
                {payment.successUrl && (
                  <a
                    href={payment.successUrl}
                    className="mt-4 inline-block rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 shadow-lg shadow-[var(--primary)]/20"
                  >
                    Return to Merchant
                  </a>
                )}
              </div>
            )}

            {isCancelled && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--destructive)]/10">
                  <XCircle className="h-8 w-8 text-[var(--destructive)]" />
                </div>
                <p className="text-lg font-semibold text-[var(--destructive)]">
                  Payment {payment.status.toLowerCase()}
                </p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  This payment is no longer active.
                </p>
                {payment.cancelUrl && (
                  <a
                    href={payment.cancelUrl}
                    className="mt-4 inline-block rounded-xl bg-[var(--muted)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition-all hover:brightness-95"
                  >
                    Return to Merchant
                  </a>
                )}
              </div>
            )}

            {isPending && (
              <div className="space-y-4">
                <CheckoutWalletGrid chainType="EVM" chainId={1} />
                {connected ? <ConnectedWalletPill /> : null}

                {/* Payment Details */}
                <div className="space-y-2.5 rounded-xl bg-[var(--muted)] p-4">
                  <DetailRow label="Payment ID" value={payment.id.slice(0, 12) + '...'} mono />
                  <DetailRow label="Network" value={payment.chain} />
                  <DetailRow label="Token" value={payment.tokenAddress ? `${payment.tokenAddress.slice(0, 8)}...` : 'Native'} />
                  <DetailRow label="Status" value={payment.status} />
                </div>

                {/* Security */}
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <Shield className="h-3.5 w-3.5 text-[var(--success)]" />
                  <span>Secured by NodeRails smart contracts</span>
                </div>

                {payment.cancelUrl && (
                  <div className="text-center pt-2">
                    <a
                      href={payment.cancelUrl}
                      className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Cancel and return
                    </a>
                  </div>
                )}

                <CheckoutTrustFooter />
              </div>
            )}

            {payment.status === 'DISPUTED' && (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--warning)]/10">
                  <Clock className="h-8 w-8 text-[var(--warning)]" />
                </div>
                <p className="text-lg font-semibold text-[var(--warning)]">Under Dispute</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  This payment is currently being reviewed.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
          Powered by <span className="font-semibold text-[var(--foreground)]">NodeRails</span>
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className={clsx('text-xs font-semibold text-[var(--foreground)]', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
