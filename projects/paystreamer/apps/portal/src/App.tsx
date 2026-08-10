import { useMemo } from "react";
import Router from "./router";
import { usePaymentNotifications } from "./hooks/usePaymentNotifications";
import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { PayStreamerProvider, PayStreamerConfig } from "@paystreamer/sdk/react";
import { NETWORK_CONFIGS, SupportedNetwork, CLOCK_OBJECT_ID, NETWORK } from "@paystreamer/sdk";

function PayStreamerProviderWrapper({ children }: { children: React.ReactNode }) {
  const currentNetwork = useCurrentNetwork() as SupportedNetwork;
  const network = currentNetwork || NETWORK;
  const networkConfig = NETWORK_CONFIGS[network] || NETWORK_CONFIGS.testnet!;

  const config: PayStreamerConfig = useMemo(() => ({
    network,
    packageId: networkConfig.PACKAGE_ID,
    registryId: networkConfig.COIN_TYPE_REGISTRY_ID,
    clockId: CLOCK_OBJECT_ID,
    pusdType: networkConfig.PUSD_TYPE_ARG,
    graphqlUrl: networkConfig.GRAPHQL_URL,
    sponsorApiUrl: import.meta.env.VITE_SPONSOR_API_URL || "http://localhost:3000/sponsor",
  }), [network, networkConfig]);

  return <PayStreamerProvider config={config}>{children}</PayStreamerProvider>;
}

function MainApp() {
  usePaymentNotifications();
  return <Router />;
}

export default function App() {
  return (
    <PayStreamerProviderWrapper>
      <MainApp />
    </PayStreamerProviderWrapper>
  );
}
