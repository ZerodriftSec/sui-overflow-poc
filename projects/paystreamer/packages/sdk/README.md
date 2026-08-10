# @paystreamer/sdk

The official TypeScript/React SDK for [PayStreamer](https://usepaystreamer.xyz), providing non-custodial recurring subscriptions and billing infrastructure on the Sui blockchain.

## Features

- ⚡ **Core Client**: Build, sign, and manage subscription contracts on Sui.
- ⚛️ **React Hooks**: Pre-built React hooks (`usePayStreamer`, `useSponsoredTransaction`, etc.).
- 🎨 **UI Components**: Turnkey components including `SetupSubscriptionModal`, `TestnetFaucetButton`, and customizable billing UI.
- ⛽ **Sponsored Transactions**: Seamless gas station integration for gasless user transactions.

## Installation

```bash
pnpm add @paystreamer/sdk @mysten/sui @mysten/dapp-kit-react
```

## Quick Start

### 1. React Setup

Wrap your application with the PayStreamer provider:

```tsx
import { PayStreamerProvider } from '@paystreamer/sdk/react';
import { SetupSubscriptionModal } from '@paystreamer/sdk/ui';

function App() {
  return (
    <PayStreamerProvider network="devnet">
      <YourAppComponents />
    </PayStreamerProvider>
  );
}
```

### 2. Open Subscription Modal

```tsx
import { useState } from 'react';
import { SetupSubscriptionModal } from '@paystreamer/sdk/ui';

export function SubscribeButton({ platformId }: { platformId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Subscribe Now
      </button>

      <SetupSubscriptionModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        platformId={platformId}
        onSuccess={(digest) => {
          console.log('Subscription created!', digest);
        }}
      />
    </>
  );
}
```

## Modular Exports

- `@paystreamer/sdk` — Main bundle entry point
- `@paystreamer/sdk/core` — Low-level Sui PTB builders, transaction utilities, and client methods
- `@paystreamer/sdk/react` — React hooks and context providers
- `@paystreamer/sdk/ui` — React UI components and modal dialogs

## License

MIT
