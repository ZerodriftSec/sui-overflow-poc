'use client';

import { Shield, Lock, Zap, ShieldCheck } from 'lucide-react';

export function CheckoutTrustFooter() {
  const items = [
    { icon: Shield, label: 'Secure', iconClass: 'text-emerald-600' },
    { icon: Lock, label: 'Non-custodial', iconClass: 'text-slate-600' },
    { icon: Zap, label: 'Instant', iconClass: 'text-amber-600' },
    { icon: ShieldCheck, label: 'Buyer protection', iconClass: 'text-indigo-600' },
  ] as const;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2">
      {items.map(({ icon: Icon, label, iconClass }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
          <span className="text-xs font-semibold text-slate-700">{label}</span>
        </div>
      ))}
    </div>
  );
}
