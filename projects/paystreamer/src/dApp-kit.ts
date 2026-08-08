import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  SUBSCRIPTION_DEVNET_PACKAGE_ID,
  SUBSCRIPTION_TESTNET_PACKAGE_ID,
  SUBSCRIPTION_MAINNET_PACKAGE_ID,
  NETWORK,
} from "@paystreamer/sdk";
import { createPersistentBurnerWalletInitializer } from "./lib/persistentBurnerWallet.ts";

const GRPC_URLS = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

function makeMvrOverrides(pkgIds: Record<string, string | undefined>) {
  const pkgs: Record<string, string> = {};
  if (pkgIds.counter) pkgs["@local-pkg/counter"] = pkgIds.counter;
  if (pkgIds.subscriptions) pkgs["@local-pkg/subscriptions"] = pkgIds.subscriptions;
  return Object.keys(pkgs).length > 0 ? { packages: pkgs } : undefined;
}

export const dAppKit = createDAppKit({
  // WARNING: Unsafe burner wallet stores private keys in LocalStorage. This is insecure and
  // should only be used for testing/development. Never enable this in production with
  // real funds or on mainnet.
  enableBurnerWallet: import.meta.env.DEV,
  networks: import.meta.env.PROD ? ["testnet"] : ["mainnet", "testnet", "devnet"],
  defaultNetwork: import.meta.env.PROD ? "testnet" : (NETWORK as any),
  createClient(network) {
    const mvr = makeMvrOverrides({
      subscriptions: GRPC_URLS[network] === GRPC_URLS.mainnet
        ? SUBSCRIPTION_MAINNET_PACKAGE_ID
        : GRPC_URLS[network] === GRPC_URLS.testnet
        ? SUBSCRIPTION_TESTNET_PACKAGE_ID
        : SUBSCRIPTION_DEVNET_PACKAGE_ID,
    });
    return new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[network],
      ...(mvr ? { mvr: { overrides: mvr } } : {}),
    });
  },
  walletInitializers: [createPersistentBurnerWalletInitializer()],
});

// global type registration necessary for the hooks to work correctly
declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
