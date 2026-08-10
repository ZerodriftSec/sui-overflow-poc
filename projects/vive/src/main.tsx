import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { WalrusStorageProvider } from "./components/WalrusStorageProvider.tsx";
import { SkillsProvider } from "./components/SkillsProvider.tsx";
import { dAppKit } from "./dApp-kit.ts";
import { installSealKeyServerFetchProxy } from "./lib/walrus/seal-fetch-proxy";

installSealKeyServerFetchProxy();

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <WalrusStorageProvider>
          <SkillsProvider>
            <App />
          </SkillsProvider>
        </WalrusStorageProvider>
      </DAppKitProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
