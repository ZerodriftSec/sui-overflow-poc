'use client';

import { useEffect, useState } from 'react';
import { Button, Label, Spinner } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import {
  OrbitAdapter,
  formatConnectorName,
  getAdapterFromConnectorType,
  getConnectorTypeFromName,
  type ConnectorType,
} from '@tuwaio/orbit-core';
import { getAvailableSolanaConnectors } from '@tuwaio/orbit-solana';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { useConnectors } from 'wagmi';
import { solanaClusterForChainId } from '@/lib/wagmi';
import { WalletBrandIcon } from './wallet-brand-icon';

function WalletTile({
  name,
  isReady,
  isConnecting,
  onClick,
}: {
  name: string;
  isReady: boolean;
  isConnecting: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      fullWidth
      isDisabled={isConnecting}
      onPress={onClick}
      className="h-auto min-h-[3.75rem] justify-start gap-3 border border-indigo-100 bg-white px-4 py-3 text-slate-900 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/30"
    >
      <WalletBrandIcon name={name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{name}</span>
      {isConnecting ? (
        <Spinner size="sm" />
      ) : isReady ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      ) : null}
    </Button>
  );
}

export function CheckoutWalletGrid({
  chainType,
  chainId,
}: {
  chainType: 'EVM' | 'SOLANA';
  chainId: number;
}) {
  const evmConnectors = useConnectors();
  const [solanaWallets, setSolanaWallets] = useState(() => getAvailableSolanaConnectors());

  const connect = useSatelliteConnectStore((state) => state.connect);
  const disconnect = useSatelliteConnectStore((state) => state.disconnect);
  const connecting = useSatelliteConnectStore((state) => state.connecting);
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const connectionError = useSatelliteConnectStore((state) => state.connectionError);

  useEffect(() => {
    const refresh = () => setSolanaWallets(getAvailableSolanaConnectors());
    refresh();
    const timer = window.setTimeout(refresh, 600);
    return () => window.clearTimeout(timer);
  }, [chainType]);

  const activeMatchesSelection =
    activeConnection?.isConnected &&
    ((chainType === 'SOLANA' &&
      getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.SOLANA) ||
      (chainType === 'EVM' &&
        getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.EVM));

  if (activeMatchesSelection) {
    return null;
  }

  const tiles =
    chainType === 'EVM'
      ? evmConnectors.map((connector) => ({
          key: connector.uid,
          name: connector.name,
          connectorType: getConnectorTypeFromName(
            OrbitAdapter.EVM,
            formatConnectorName(connector.name),
          ) as ConnectorType,
          chainTarget: chainId,
          ready: connector.ready,
        }))
      : solanaWallets.map((wallet) => ({
          key: wallet.name,
          name: wallet.name,
          connectorType: getConnectorTypeFromName(
            OrbitAdapter.SOLANA,
            formatConnectorName(wallet.name),
          ) as ConnectorType,
          chainTarget: solanaClusterForChainId(chainId),
          ready: true,
        }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="checkout-field-label !mb-0">Connect wallet</Label>
        {chainType === 'SOLANA' && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setSolanaWallets(getAvailableSolanaConnectors())}
            className="h-8 min-w-0 px-2 text-xs text-slate-500"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        )}
      </div>

      {tiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-900">
            {chainType === 'SOLANA' ? 'No Solana wallet found' : 'No wallet found'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {chainType === 'SOLANA' ? 'Install Phantom or Solflare' : 'Install MetaMask'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <WalletTile
              key={tile.key}
              name={tile.name}
              isReady={Boolean(tile.ready)}
              isConnecting={connecting}
              onClick={async () => {
                if (
                  activeConnection?.isConnected &&
                  activeConnection.connectorType !== tile.connectorType
                ) {
                  await disconnect(activeConnection.connectorType);
                }
                await connect({
                  connectorType: tile.connectorType,
                  chainId: tile.chainTarget,
                });
              }}
            />
          ))}
        </div>
      )}

      {connecting && <p className="text-center text-xs text-slate-500">Connecting...</p>}

      {connectionError?.message && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          {connectionError.message}
        </div>
      )}
    </div>
  );
}
