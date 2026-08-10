'use client';

import { Button, Chip, Label } from '@heroui/react';
import { CheckCircle2, Copy, Check } from 'lucide-react';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { formatConnectorName } from '@tuwaio/orbit-core';
import { useState, useCallback } from 'react';
import { WalletBrandIcon } from './wallet-brand-icon';

function truncateAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectedWalletPill() {
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const disconnect = useSatelliteConnectStore((state) => state.disconnect);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (activeConnection?.address) {
      navigator.clipboard.writeText(String(activeConnection.address));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeConnection?.address]);

  if (!activeConnection?.isConnected || !activeConnection.address) {
    return null;
  }

  const connectorLabel = activeConnection.connectorType
    ? formatConnectorName(String(activeConnection.connectorType))
    : 'Wallet';

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold text-slate-900">Connected wallet</Label>
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <WalletBrandIcon name={connectorLabel} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-900">{connectorLabel}</span>
            <Chip size="sm" color="success" variant="soft">
              Connected
            </Chip>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs text-slate-600">
              {truncateAddress(String(activeConnection.address))}
            </span>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Copy address"
              onPress={handleCopy}
              className="h-6 w-6 min-w-6 text-slate-500"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => disconnect(activeConnection.connectorType)}
          className="shrink-0 text-xs font-semibold text-slate-700"
        >
          Change
        </Button>
      </div>
    </div>
  );
}
