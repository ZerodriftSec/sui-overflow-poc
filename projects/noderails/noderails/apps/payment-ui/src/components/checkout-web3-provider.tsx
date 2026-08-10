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
import { SuiCheckoutProvider } from '@/components/sui-checkout-provider';
import {
  buildSatelliteSolanaRpcUrls,
  buildWagmiConfig,
  type WagmiChainInput,
} from '@/lib/wagmi';

const queryClient = new QueryClient();

export function CheckoutWeb3Provider({
  chains,
  children,
}: {
  chains: WagmiChainInput[];
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  const wagmiConfig = useMemo(() => buildWagmiConfig(chains), [chains]);

  const adapters = useMemo(
    () => [
      satelliteEVMAdapter(wagmiConfig, wagmiConfig.chains as readonly [Chain, ...Chain[]]),
      satelliteSolanaAdapter({
        rpcUrls: buildSatelliteSolanaRpcUrls(chains),
      }),
    ],
    [chains, wagmiConfig],
  );

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" />
      </div>
    );
  }

  const suiChain = chains.find((c) => c.chainType === 'SUI' || [201, 202, 203].includes(c.chainId));

  return (
    <QueryClientProvider client={queryClient}>
      <SuiCheckoutProvider chainId={suiChain?.chainId} rpcUrl={suiChain?.rpcUrl}>
        <WagmiProvider config={wagmiConfig}>
          <SatelliteConnectProvider adapter={adapters as never} autoConnect={false}>
            <EVMConnectorsWatcher wagmiConfig={wagmiConfig} />
            <SolanaConnectorsWatcher />
            {children}
          </SatelliteConnectProvider>
        </WagmiProvider>
      </SuiCheckoutProvider>
    </QueryClientProvider>
  );
}
