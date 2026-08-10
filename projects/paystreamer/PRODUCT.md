# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mostly Platform Integrators (Developers and Admins) at Web3 SaaS companies, decentralized content platforms (like Substack/Patreon competitors), and DAOs. They want to integrate recurring monetization seamlessly without forcing bad UX on their end consumers.

## Product Purpose

PayStreamer handles recurring crypto subscriptions without users ever losing control of their accounts. It enables platforms to secure stable Monthly Recurring Revenue (MRR) without the massive churn caused by manual monthly transaction signing.

## Positioning

An on-chain, token-agnostic recurring payment protocol that mimics the UX of a Web2 credit card subscription. Unlike escrow contracts (locking capital) or streaming (draining per second), PayStreamer uses highly customizable, time-based "Policies" (via OpenZeppelin's `rate_limiter`). Funds are kept entirely liquid in the user's wallet right up until a permissionless Scheduler triggers the discrete interval-based payment.

## Operating Context

Integrated into Web3 platforms. Operates on the Sui blockchain. Utilizes a React frontend (Vite), a React SDK (`@mysten/dapp-kit-react`), and a Node.js gas sponsor service (`paystreamer-service`) for gasless transactions. Involves permissionless Schedulers that execute the smart contract logic based on user policies.

## Capabilities and Constraints

- **Architecture:** Move smart contracts (`move/subscriptions/`) leveraging OpenZeppelin for `AccessControl` and `rate_limiter`.
- **Transactions:** Frontend builds tx, uses sponsored transaction flow via backend sponsor service for execution.
- **Demo UX:** A persistent burner wallet is kept in LocalStorage (`paystreamer_burner_sk`) to allow seamless demo onboarding.
- **Constraints:** E2E testing must be done in localnet (docker compose). `process.env` is not used in Vite; only `import.meta.env.VITE_*`.

## Brand Commitments

- **Name:** PayStreamer
- **Voice/Personality:** Web3-native, cutting-edge, and developer-focused.
- **Assets:** Logo located at `public/logo.png`.

## Evidence on Hand

- Live Demo: [usepaystreamer.xyz](https://www.usepaystreamer.xyz)
- Existing Smart Contracts (`move/subscriptions/`, `move/stablecoin/`)
- Existing React SDK and Gas Sponsor service.
- Demo Video (YouTube link in README).
- Testnet package deployments.

## Product Principles

1. **Absolute Custody:** Users keep their capital liquid in their own wallets right up until the exact moment a payment triggers.
2. **Decentralized Execution:** No centralized cron servers; uses permissionless on-chain Schedulers.
3. **Web2-Grade UX:** Gasless, sponsored transactions and seamless connection flows rival traditional credit card experiences.
4. **Standard Billing Models:** Focuses on discrete, interval-based payments (SaaS model) rather than micro-payment streams.
