import { createDAppKit } from "@mysten/dapp-kit-react";
import { enokiWalletsInitializer } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { readEnokiPublicConfig } from "./lib/enoki/config";

const GRPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
} as const;

function getGrpcBaseUrl(network: keyof typeof GRPC_URLS): string {
  if (import.meta.env.DEV) {
    return `${window.location.origin}/sui-rpc/${network}`;
  }
  return GRPC_URLS[network];
}

const enokiConfig = readEnokiPublicConfig();

export const dAppKit = createDAppKit({
  enableBurnerWallet: import.meta.env.DEV,
  networks: ["mainnet", "testnet", "devnet"],
  defaultNetwork: "testnet",
  createClient(network) {
    return new SuiGrpcClient({
      network,
      baseUrl: getGrpcBaseUrl(network),
    });
  },
  walletInitializers: enokiConfig
    ? [
        enokiWalletsInitializer({
          apiKey: enokiConfig.apiKey,
          providers: enokiConfig.providers,
        }),
      ]
    : undefined,
});

// global type registration necessary for the hooks to work correctly
declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
