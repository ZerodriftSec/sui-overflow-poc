'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SatelliteConnectProvider } from '@tuwaio/satellite-react';
import { EVMConnectorsWatcher } from '@tuwaio/satellite-react/evm';
import { SolanaConnectorsWatcher } from '@tuwaio/satellite-react/solana';
import { satelliteEVMAdapter } from '@tuwaio/satellite-evm';
import { satelliteSolanaAdapter } from '@tuwaio/satellite-solana';
import type { Chain } from 'viem';
import { WagmiProvider } from 'wagmi';
import {
  buildSatelliteSolanaRpcUrls,
  buildWagmiConfig,
} from '@/lib/wagmi';
import { defaultMerchantWalletChains } from '@/lib/merchant-wallet-networks';

const queryClient = new QueryClient();

export function MerchantWeb3Provider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const chainInputs = useMemo(() => defaultMerchantWalletChains(), []);
  const wagmiConfig = useMemo(() => buildWagmiConfig(chainInputs), [chainInputs]);

  const adapters = useMemo(
    () => [
      satelliteEVMAdapter(wagmiConfig, wagmiConfig.chains as readonly [Chain, ...Chain[]]),
      satelliteSolanaAdapter({
        rpcUrls: buildSatelliteSolanaRpcUrls(chainInputs),
      }),
    ],
    [chainInputs, wagmiConfig],
  );

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SatelliteConnectProvider adapter={adapters as never} autoConnect={false}>
          <EVMConnectorsWatcher wagmiConfig={wagmiConfig} />
          <SolanaConnectorsWatcher />
          {children}
        </SatelliteConnectProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
