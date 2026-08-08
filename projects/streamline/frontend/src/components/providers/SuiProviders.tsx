"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";

import { networkConfig, DEFAULT_NETWORK } from "@/lib/networks";
import { isConnectableSuiWallet } from "@/lib/sui-wallets";
import { HandleProvider } from "@/lib/use-handle";
import { RegisterEnokiWallets } from "./RegisterEnokiWallets";

/**
 * Wraps the app in the Sui dApp Kit + React Query providers. zkLogin
 * onboarding (Google OAuth → Sui address) registers via RegisterEnokiWallets
 * so it shows up in the wallet list alongside extension wallets.
 */
export function SuiProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={DEFAULT_NETWORK}>
        <RegisterEnokiWallets />
        <WalletProvider
          autoConnect
          walletFilter={isConnectableSuiWallet}
          preferredWallets={[
            "Sign in with Google",
            "Slush",
            "Sui Wallet",
            "Suiet",
          ]}
          slushWallet={{ name: "StreamLine" }}
        >
          <HandleProvider>{children}</HandleProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
