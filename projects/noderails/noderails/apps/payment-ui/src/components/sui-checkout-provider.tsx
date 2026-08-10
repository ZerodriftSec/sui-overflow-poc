'use client';

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { getFullnodeUrl } from '@mysten/sui/client';
import { useMemo } from 'react';
import { resolveSuiBrowserRpcUrl } from '../lib/sui-rpc';

export function suiNetworkForChainId(chainId: number): 'devnet' | 'testnet' | 'mainnet' {
  if (chainId === 202) return 'testnet';
  if (chainId === 203) return 'mainnet';
  return 'devnet';
}

export function SuiCheckoutProvider({
  chainId,
  rpcUrl,
  children,
}: {
  chainId?: number;
  rpcUrl?: string | null;
  children: React.ReactNode;
}) {
  const { networkConfig } = useMemo(() => {
    const url =
      (chainId != null ? resolveSuiBrowserRpcUrl(chainId, rpcUrl) : undefined) ||
      getFullnodeUrl('devnet');
    return createNetworkConfig({
      localnet: { url: getFullnodeUrl('localnet') },
      devnet: { url: chainId === 201 ? url : getFullnodeUrl('devnet') },
      testnet: { url: chainId === 202 ? url : getFullnodeUrl('testnet') },
      mainnet: { url: chainId === 203 ? url : getFullnodeUrl('mainnet') },
    });
  }, [chainId, rpcUrl]);

  const defaultNetwork = chainId != null ? suiNetworkForChainId(chainId) : 'devnet';

  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
      <WalletProvider autoConnect={false}>{children}</WalletProvider>
    </SuiClientProvider>
  );
}
