import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import {  NETWORK_CONFIGS, SupportedNetwork  } from "@paystreamer/sdk";

export function useAppConfig() {
  const currentNetwork = useCurrentNetwork() as SupportedNetwork;
  
  // Default to testnet if currentNetwork isn't resolved or is unsupported
  const config = NETWORK_CONFIGS[currentNetwork] || NETWORK_CONFIGS.testnet!;
  
  return {
    network: currentNetwork || "testnet",
    ...config,
  };
}
