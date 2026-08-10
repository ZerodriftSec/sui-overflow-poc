# PayStreamer SDK

Welcome to the **PayStreamer SDK** documentation!

PayStreamer is a decentralized, recurring billing and subscription protocol built on the **Sui** blockchain. Our SDK allows third-party platforms and decentralized applications (dApps) to easily accept subscriptions in PUSD directly inside their own UI.

## Features

- **Headless React Hooks:** Full control over the user experience. You can build your own UI while the SDK handles all the complex Move transaction construction and gas sponsorship routing.
- **Drop-in UI Components:** Need to get to market quickly? We provide fully styled, functional React components like `<SetupSubscriptionModal />` and `<TierCard />` out of the box.
- **Gas Sponsorship (Optional):** Ensure a web2-like experience for your users by routing transactions through our sponsor backend, abstracting gas fees.
- **Automated PUSD Billing:** Set up tiers, subscribe users, and let the PayStreamer smart contracts handle the recurring deductions automatically using Sui's powerful shared objects and clock features.

## Where to go next?

- Jump into the [Quickstart](quickstart.md) to integrate PayStreamer in your React/Vite app.
- Explore the [React Hooks](hooks/useSubscribe.md) for custom integrations.
- View our [UI Components](components/SetupSubscriptionModal.md) for easy drop-in solutions.
