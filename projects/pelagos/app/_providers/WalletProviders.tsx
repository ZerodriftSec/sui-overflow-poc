"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { fromBase64 } from "@mysten/sui/utils";

// Real Sui wallet stack: react-query → SuiClientProvider → WalletProvider.
// Non-custodial — deposits are built by the backend (/api/deposit/prepare) and
// signed by the user's connected wallet, never the server.
const TESTNET_RPC = "https://fullnode.testnet.sui.io:443";
const { networkConfig } = createNetworkConfig({
  testnet: { url: process.env.NEXT_PUBLIC_SUI_RPC_URL ?? TESTNET_RPC, network: "testnet" },
});

class DappKitGrpcClient extends SuiGrpcClient {
  async executeTransactionBlock({
    transactionBlock,
    signature,
  }: {
    transactionBlock: string | Uint8Array;
    signature: string | string[];
    options?: { showRawEffects?: boolean };
  }) {
    const result = await this.executeTransaction({
      transaction:
        typeof transactionBlock === "string" ? fromBase64(transactionBlock) : transactionBlock,
      signatures: Array.isArray(signature) ? signature : [signature],
      include: { effects: true },
    });
    const transaction =
      result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
    if (!transaction.status.success) {
      throw new Error(transaction.status.error.message);
    }
    if (!transaction.effects?.bcs) {
      throw new Error("Sui execution completed without raw effects");
    }
    return {
      digest: transaction.digest,
      rawEffects: Array.from(transaction.effects.bcs),
    };
  }
}

function createGrpcClient(
  _name: string,
  config: { url: string; network?: string },
): SuiJsonRpcClient {
  return new DappKitGrpcClient({
    baseUrl: config.url,
    network: (config.network ?? "testnet") as "mainnet" | "testnet" | "devnet" | "localnet",
  }) as unknown as SuiJsonRpcClient;
}

const queryClient = new QueryClient();
const walletStorage = {
  getItem: (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

export function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork="testnet"
        createClient={createGrpcClient}
      >
        <WalletProvider autoConnect storage={walletStorage}>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
