# PayStreamer <img src="public/logo.png" alt="PayStreamer Logo" width="30" height="30" align="top">

**Subscriptions fully on-chain**

[![Live Demo](https://img.shields.io/badge/Live_Demo-usepaystreamer.xyz-brightgreen.svg)](https://www.usepaystreamer.xyz)
[![Demo Video](https://img.shields.io/badge/Demo_Video-YouTube-red.svg)](https://www.youtube.com/watch?v=9QA0DDg1kyc)
[![Testnet Package](https://img.shields.io/badge/Testnet_Package-0x48c2c4ea...d38c-blue.svg)](https://suiscan.xyz/testnet/object/0x48c2c4ea663d95748ae53f3945f58433cf259b42c3aedfd62ba6a13ba4f2d38c)

PayStreamer is an on-chain plugin for Web3 platforms that handles recurring crypto subscriptions without users ever losing control of their accounts.

---

## 🛑 The Pain Point

Last year, we built an award-winning project for the Walrus hackathon called Fundsui, a podcast platform where users could subscribe to their favorite creators using cryptocurrency. It was an amazing concept, but we ran into a massive roadblock: handling recurring payments on-chain was incredibly difficult. Current Web3 solutions are flawed: they force users to manually sign transactions every 30 days (causing massive churn), lock up huge sums of capital in escrow, or drain funds per-second via payment streaming which is terrible UX for standard SaaS. We needed a fully decentralized, interval-based solution. That’s why we built PayStreamer.

## 💡 The Solution

PayStreamer is an on-chain, token-agnostic recurring payment protocol for Web3 platforms. It mimics the seamless UX of a Web2 credit card subscription—without users ever losing custody of their accounts. Users own and manage a single subscription account across all platforms, granting access to funds via highly customizable, time-based **"Policies"**. By leveraging **OpenZeppelin's `rate_limiter`**, these policies strictly enforce how much and how often a platform can withdraw funds (e.g., Platform X can withdraw 10 Tokens, but only every 30 days). Users keep their capital completely liquid in their own wallets right up until the exact moment a payment triggers.

## 🏆 Why PayStreamer is Better

Most "Web3 recurring payments" fall into three categories—and PayStreamer improves on all of them:
- **vs. Manual Payments (The Status Quo):** Users forget to pay and churn out. PayStreamer pulls the funds automatically, preserving MRR for platforms.
- **vs. Escrow Contracts:** Many protocols require users to lock up 6-12 months of tokens in an escrow contract up-front. With PayStreamer's policy model, users keep their funds in their own wallet right up until the payment triggers.
- **vs. Custodial Bots:** Other solutions require giving a centralized server custody of your wallet keys to run cron jobs. PayStreamer relies on permissionless on-chain Schedulers, maintaining absolute decentralization.
- **vs. Payment Streaming (e.g. Superfluid):** Streaming is excellent for payroll, but terrible for consumer SaaS UX. Streaming requires users to lock up capital upfront that slowly drains per second. PayStreamer triggers discrete, standard monthly billing—letting users keep their capital liquid until the exact due date.
- **vs. x402 (HTTP 402):** x402 is the gold standard for M2M pay-per-request API calls. However, human consumer subscriptions (like a $10/mo podcast) are interval-based, not usage-based. PayStreamer handles traditional recurring SaaS models without making the user authorize a micro-payment on every page load.

## ⚙️ How It Works (The Core Protocol)

Platforms integrate with PayStreamer directly on-chain for zero-middleman settlement. But how does the contract know when to pull funds without a centralized server running cron jobs? We solved this using a network of permissionless "time keepers" called **Schedulers**. When a billing interval hits, anyone running a Scheduler can call the `process_due_payment` function. The Schedulers never hold the funds; they simply execute the smart contract logic based on the user's policy. 

## 🎬 The Live Demo Experience

To prove how frictionless this protocol can be, we built a Live Demo platform. In our demo, we utilized Sui's sponsored transactions and a custom testnet stablecoin (PUSD). This allows a user to subscribe to a service without needing native gas tokens, demonstrating that PayStreamer can provide a Web2-level onboarding experience while remaining entirely decentralized under the hood.

## 🎯 Market Opportunity

PayStreamer bridges the gap between Web3 infrastructure and Web2 business models. Our immediate target audiences include:
*   **Web3 SaaS & Tooling:** RPC providers, analytics dashboards, and node infrastructure that require stable Monthly Recurring Revenue (MRR).
*   **Decentralized Content Platforms:** Substack or Patreon competitors (like our previous project, Fundsui) looking for native crypto monetization.
*   **DAOs:** Automating recurring grants, continuous contributor funding, or software subscriptions.

## 🏗️ Technical Architecture

PayStreamer utilizes two main layers:
1. **Move Smart Contracts** (`move/subscriptions/`): Built on Sui, heavily utilizing **OpenZeppelin (OZ)** libraries—specifically `AccessControl` for role management and `rate_limiter` for enforcing subscription policies—alongside permissionless schedulers and BalanceContainers for secure fund management.
2. **Frontend dApp**: Built with React, Vite, Tailwind CSS v4, and integrated with `@mysten/dapp-kit-react` for seamless wallet connections. A Node.js backend handles the gas-sponsored transactions.

---

## 🚀 Setup and Installation

### Prerequisites

- [Node.js](https://nodejs.org/en/) & [pnpm](https://pnpm.io/)
- [Sui CLI](https://docs.sui.io/build/install)

### 1. Smart Contract Deployment

To run the application, deploy the Move contracts to a Sui network (Testnet recommended):

```bash
# Setup a Testnet environment if you haven't already
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet

# Request test tokens
sui client faucet

# Publish the package
cd move/subscriptions
sui client publish --gas-budget 100000000 --skip-dependency-verification
```

Take note of the `"packageId"` in the output and update `src/constants.ts`:

```typescript
export const NETWORK_CONFIGS = {
  // ...
  testnet: {
    PACKAGE_ID: "<YOUR_NEW_PACKAGE_ID>",
    // ... update other deployed object IDs accordingly
  }
}
```

### 2. Frontend Setup

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

### 3. Backend Service (For Sponsored Transactions)

To enable gasless transactions for users, start the backend sponsor service:

```bash
cd paystreamer-service
npm install
npm run build
npm start
```

*(Note: Ensure your `.env` files are properly configured with your sponsor private keys and RPC endpoints.)*

---

## 🔮 Next Steps

- **Platform Outreach:** The core protocol works! Our next step is to reach out to existing web3 content platforms to understand how we can tailor this plugin to their exact integration needs.
- **Security Audits:** As we move toward mainnet, we plan to invest heavily in smart contract security audits to ensure user funds are absolutely bulletproof.
- **Scheduler Incentives:** Implement direct financial incentives on-chain to reward the decentralized network of Schedulers for processing payments.
