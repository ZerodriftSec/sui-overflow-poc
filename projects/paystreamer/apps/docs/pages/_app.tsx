import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayStreamerProvider } from '@paystreamer/sdk/react';
import { PayStreamerThemeProvider } from '@paystreamer/sdk/ui';
import { DAppKitProvider, createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { createPersistentBurnerWalletInitializer } from '../lib/persistentBurnerWallet';
import { createGraphqlClient } from '../lib/networkRouting';
const targetNet = (process.env.VITE_NETWORK as any) || NETWORK || "testnet";
const activeNetworks = targetNet === 'local' ? ["local"] : ["mainnet", "testnet", "devnet", "local"];

const dAppKit = createDAppKit({
  enableBurnerWallet: false,
  networks: activeNetworks,
  defaultNetwork: targetNet,
  createClient: createGraphqlClient,
  walletInitializers: [createPersistentBurnerWalletInitializer()]
});

import { NETWORK_CONFIGS, NETWORK } from '@paystreamer/sdk';

const sdKConfig = NETWORK_CONFIGS[NETWORK];

// Testnet/Local Config for the Docs
const config = {
  packageId: sdKConfig.PACKAGE_ID,
  registryId: sdKConfig.COIN_TYPE_REGISTRY_ID,
  clockId: "0x0000000000000000000000000000000000000000000000000000000000000006",
  pusdType: sdKConfig.PUSD_TYPE_ARG,
  network: NETWORK,
  sponsorApiUrl: "/api/sponsor",
  pusdPackageId: sdKConfig.PUSD_PACKAGE_ID,
  pusdTreasuryCapId: sdKConfig.PUSD_TREASURY_CAP_ID
};

const queryClient = new QueryClient();

import { LiveModeProvider } from '../lib/LiveModeContext';

export default function App({ Component, pageProps }: any) {
  return (
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <PayStreamerProvider config={config as any}>
          <PayStreamerThemeProvider>
            <LiveModeProvider>
              <Component {...pageProps} />
            </LiveModeProvider>
          </PayStreamerThemeProvider>
        </PayStreamerProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  )
}
