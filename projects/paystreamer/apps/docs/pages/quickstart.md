# Quickstart

This guide will walk you through setting up the PayStreamer SDK in your React application.

## 1. Installation

Install the PayStreamer SDK alongside its peer dependencies (`@mysten/dapp-kit-react`, `@mysten/sui`, and `@tanstack/react-query`).

```bash
npm install @paystreamer/sdk @mysten/dapp-kit-react @mysten/sui @tanstack/react-query
```

## 2. Setup the Provider

Wrap your application in the `PayStreamerProvider` along with the standard `SuiClientProvider` and `WalletProvider` from dApp Kit.

```tsx
import React from "react";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayStreamerProvider } from "@paystreamer/sdk/react";

const queryClient = new QueryClient();

const payStreamerConfig = {
  packageId: "0x...",
  registryId: "0x...",
  clockId: "0x6",
  pusdType: "0x...::pusd::PUSD",
  network: "devnet",
  graphqlClient: /* your SuiGraphQLClient instance */
};

export default function App({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={{ devnet: { url: "https://fullnode.devnet.sui.io:443" } }}>
        <WalletProvider>
          <PayStreamerProvider config={payStreamerConfig}>
            {children}
          </PayStreamerProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

## 3. Drop in a Component

With the provider configured, you can import drop-in UI components or use headless hooks. Here is how to easily render a subscription modal.

```tsx
import { useState } from "react";
import { SetupSubscriptionModal } from "@paystreamer/sdk/ui";

export function SubscribeSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Subscribe Now</button>
      
      <SetupSubscriptionModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        platformId="0xYOUR_PLATFORM_ID"
        tierIndex={0}
        tierAmount={10000000000n} // 10 PUSD
        tierFrequencyMs={2592000000n} // Monthly
        onSuccess={(digest) => console.log("Subscribed!", digest)}
      />
    </div>
  );
}
```
