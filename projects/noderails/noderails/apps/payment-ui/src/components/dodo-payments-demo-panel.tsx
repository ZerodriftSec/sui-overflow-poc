'use client';

import { ExternalLink } from 'lucide-react';
import { getDodoPaymentsDemoConfig } from '@/lib/dodo-payments-demo';

/** Dodo Payments test checkout link (new tab). Enabled via `NEXT_PUBLIC_ENABLE_DODO_PAYMENTS_DEMO` + URL env. */
export function DodoPaymentsDemoPanel() {
  const cfg = getDodoPaymentsDemoConfig();
  if (!cfg) return null;

  return (
    <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-800 mb-1">
        Pay with card
      </p>
      <p className="text-[13px] text-violet-900/85 leading-snug mb-3">
        Dodo Payments · Test checkout opens in a new tab.
      </p>
      <button
        type="button"
        onClick={() => {
          window.open(cfg.checkoutUrl, '_blank', 'noopener,noreferrer');
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
      >
        Continue with Dodo
        <ExternalLink className="h-4 w-4 opacity-90" aria-hidden />
      </button>
    </div>
  );
}
