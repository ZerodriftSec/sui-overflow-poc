'use client';

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { getFullnodeUrl } from '@mysten/sui/client';
import { useMemo } from 'react';
import { merchantChainId } from '@/lib/merchant-wallet-networks';

export function suiNetworkForAppEnv(appEnv: 'TEST' | 'PRODUCTION'): 'devnet' | 'mainnet' {
  return appEnv === 'PRODUCTION' ? 'mainnet' : 'devnet';
}

export function SuiWalletProvider({
  appEnv,
  children,
}: {
  appEnv: 'TEST' | 'PRODUCTION';
  children: React.ReactNode;
}) {
  const chainId = merchantChainId('SUI', appEnv);
  const defaultNetwork = suiNetworkForAppEnv(appEnv);

  const { networkConfig } = useMemo(() => {
    const url =
      chainId === 202
        ? getFullnodeUrl('testnet')
        : chainId === 203
          ? getFullnodeUrl('mainnet')
          : getFullnodeUrl('devnet');

    return createNetworkConfig({
      localnet: { url: getFullnodeUrl('localnet') },
      devnet: { url: defaultNetwork === 'devnet' ? url : getFullnodeUrl('devnet') },
      testnet: { url: getFullnodeUrl('testnet') },
      mainnet: { url: defaultNetwork === 'mainnet' ? url : getFullnodeUrl('mainnet') },
    });
  }, [chainId, defaultNetwork]);

  return (
    <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
      <WalletProvider autoConnect={false}>{children}</WalletProvider>
    </SuiClientProvider>
  );
}
