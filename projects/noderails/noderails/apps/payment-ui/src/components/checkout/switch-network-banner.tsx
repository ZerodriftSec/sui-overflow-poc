'use client';

import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { useChainSwitch } from '@/lib/checkout-hooks';

export function SwitchNetworkBanner({
  targetChainId,
  targetChainName,
}: {
  targetChainId: number;
  targetChainName: string;
}) {
  const { needsSwitch, switchToTarget, isPending } = useChainSwitch(targetChainId);

  if (!needsSwitch) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={switchToTarget}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-950 transition-all hover:bg-amber-100 disabled:opacity-60"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowLeftRight className="h-4 w-4" />
      )}
      Switch to {targetChainName}
    </button>
  );
}
