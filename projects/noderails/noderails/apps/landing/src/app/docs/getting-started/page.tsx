import Link from 'next/link';
import { CodeBlock, Callout, Endpoint, ParamsTable, Param } from '@/components/docs/ui';

export default function GettingStartedPage() {
  return (
    <>
      <h1>Quick Start</h1>
      <p className="subtitle">
        Accept your first crypto payment in under 5 minutes. This guide walks you through
        setting up your account, configuring your payment preferences, and processing a payment.
      </p>

      <Callout type="info" title="Check supported assets first">
        Before creating payment flows, review the full
        {' '}
        <Link href="/docs/supported-assets">supported chains and tokens list</Link>
        {' '}
        to confirm what is currently enabled.
      </Callout>

      <h2>What you&apos;ll need</h2>
      <p>Before you start integrating, you need to set up a few things in the NodeRails Dashboard:</p>
      <ol>
        <li><strong>A NodeRails account</strong> with a verified email address.</li>
        <li><strong>A connected wallet</strong> where you want to receive payments. NodeRails supports <strong>EVM</strong> wallets (<code>0x…</code>), <strong>Solana</strong> wallets (base58 public key), and <strong>Sui</strong> wallets (<code>0x</code> 32-byte address). Use the merchant dashboard to connect and verify the address for each network. Funds settle here after the timelock period.</li>
        <li><strong>An App</strong> created in the dashboard. Each app gets its own API keys, webhook endpoints, and payment configuration.</li>
        <li><strong>Chains and tokens selected.</strong> You need to choose which blockchains and tokens you want to accept payments in. This is configured per app in the dashboard.</li>
      </ol>

      <Callout type="info" title="Override chains and tokens per request">
        The chains and tokens you configure in the dashboard are your defaults. You can override
        them on a per-request basis when creating checkout sessions or payment intents via the API
        or SDK by passing specific chain and token parameters. This is useful if you want to offer
        different payment options for different products or customers.
      </Callout>

      <h2>1. Create your account and app</h2>
      <p>
        Sign up at the <a href="http://localhost:3001/login">NodeRails Dashboard</a> and
        verify your email. Then:
      </p>
      <ol>
        <li>Connect your merchant wallet(s): EVM receiving/payout wallets and, if you enable Solana, your Solana settlement address.</li>
        <li>Create a new <strong>App</strong> from the dashboard.</li>
        <li>Select which chains and tokens you want to accept for this app.</li>
      </ol>
      <p>
        Once your app is created, you will see the dashboard overview with your App ID, payment stats,
        configured wallets, and network breakdown:
      </p>
      <div style={{ margin: '24px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <img
          src="/screenshots/dashboard-overview.png"
          alt="NodeRails dashboard overview showing App ID, payment stats, and configured wallets"
          style={{ width: '100%', display: 'block' }}
        />
      </div>

      <p>
        Go to <strong>Settings</strong> to configure which blockchain networks your app accepts.
        Toggle the chains you want to enable:
      </p>
      <div style={{ margin: '24px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <img
          src="/screenshots/app-settings.png"
          alt="App Settings page showing chain selection with toggles for each blockchain network"
          style={{ width: '100%', display: 'block' }}
        />
      </div>

      <h2>2. Get your API keys</h2>
      <p>
        Navigate to <strong>Settings → API Keys</strong> tab in the dashboard. You&apos;ll
        need two pieces of information:
      </p>
      <ul>
        <li><strong>App ID</strong> &mdash; Your app&apos;s unique identifier (UUID), visible at the top of your dashboard.</li>
        <li><strong>Secret Key</strong> &mdash; Starts with <code>nr_live_sk_</code> or <code>nr_test_sk_</code>.</li>
      </ul>

      <Callout type="warning" title="Keep your secret key safe">
        Never expose your secret key in client-side code. Only use it on your server.
        Public keys (<code>nr_*_pk_</code>) are for client-side use, but the SDK requires a secret key.
      </Callout>

      <h3 id="authentication">API Key format</h3>
      <p>API keys follow the format <code>nr_&lt;env&gt;_&lt;type&gt;_&lt;random&gt;</code>:</p>

      <table>
        <thead>
          <tr><th>Key</th><th>Environment</th><th>Type</th></tr>
        </thead>
        <tbody>
          <tr><td><code>nr_live_sk_...</code></td><td>Production</td><td>Secret</td></tr>
          <tr><td><code>nr_test_sk_...</code></td><td>Test</td><td>Secret</td></tr>
          <tr><td><code>nr_live_pk_...</code></td><td>Production</td><td>Public</td></tr>
          <tr><td><code>nr_test_pk_...</code></td><td>Test</td><td>Public</td></tr>
        </tbody>
      </table>

      <h2>Chains and tokens naming</h2>
      <p>
        When working with the NodeRails API or SDK, chains and tokens follow a specific naming
        convention you should be aware of.
      </p>

      <h3>Chains</h3>
      <p>
        Chains are identified by a numeric <strong>chain ID</strong>. <strong>EVM networks</strong> use the same IDs as elsewhere
        (e.g. Ethereum <code>1</code>, Base <code>8453</code>). <strong>Solana</strong> uses NodeRails cluster IDs:
        mainnet-beta <code>103</code>, testnet <code>101</code>, devnet <code>102</code>. <strong>Sui</strong> uses{' '}
        <code>201</code> (devnet), <code>202</code> (testnet), <code>203</code> (mainnet). See the{' '}
        <Link href="/docs/chains/sui">Sui guide</Link> for checkout and webhook examples.
      </p>

      <table>
        <thead>
          <tr><th>Chain</th><th>Chain ID</th></tr>
        </thead>
        <tbody>
          <tr><td>Ethereum Mainnet</td><td><code>1</code></td></tr>
          <tr><td>Polygon</td><td><code>137</code></td></tr>
          <tr><td>Arbitrum One</td><td><code>42161</code></td></tr>
          <tr><td>Base</td><td><code>8453</code></td></tr>
          <tr><td>Optimism</td><td><code>10</code></td></tr>
          <tr><td>Solana Mainnet</td><td><code>103</code></td></tr>
          <tr><td>Solana Devnet</td><td><code>102</code></td></tr>
          <tr><td>Solana Testnet</td><td><code>101</code></td></tr>
          <tr><td>Sui Devnet</td><td><code>201</code></td></tr>
          <tr><td>Sui Testnet</td><td><code>202</code></td></tr>
          <tr><td>Sui Mainnet</td><td><code>203</code></td></tr>
          <tr><td>Sepolia (testnet)</td><td><code>11155111</code></td></tr>
        </tbody>
      </table>

      <p>
        When you pass <code>allowedChains</code> in the API, you pass an array of these numeric IDs.
      </p>

      <h3>Tokens</h3>
      <p>
        Tokens use the same <strong>token key</strong> format on every chain:{' '}
        <code>SYMBOL-chainId</code>. On Solana, <code>contractAddress</code> in the API is the SPL mint (base58);
        on EVM it is the token contract (<code>0x…</code>).
      </p>

      <table>
        <thead>
          <tr><th>Token</th><th>Token Key</th></tr>
        </thead>
        <tbody>
          <tr><td>USDC on Ethereum</td><td><code>USDC-1</code></td></tr>
          <tr><td>USDC on Base</td><td><code>USDC-8453</code></td></tr>
          <tr><td>USDT on Arbitrum</td><td><code>USDT-42161</code></td></tr>
          <tr><td>ETH on Ethereum</td><td><code>ETH-1</code></td></tr>
          <tr><td>SOL on Solana Mainnet</td><td><code>SOL-103</code></td></tr>
          <tr><td>USDC on Solana Mainnet</td><td><code>USDC-103</code></td></tr>
          <tr><td>SUI on Sui Testnet</td><td><code>SUI-202</code></td></tr>
          <tr><td>USDC on Sui Testnet</td><td><code>USDC-202</code></td></tr>
          <tr><td>USDC on Sepolia</td><td><code>USDC-11155111</code></td></tr>
        </tbody>
      </table>

      <p>
        This format ensures there&apos;s no ambiguity. USDC on Ethereum and USDC on Base (or USDC on Solana) are
        different tokens, so they have different token keys.
      </p>

      <Callout type="info" title="Where to find available tokens">
        The chains and tokens available to your app are configured in the dashboard. You can also
        see all supported chains and their tokens via the API. When passing <code>allowedTokens</code>,
        you can pass either token keys (<code>USDC-8453</code>) for a specific chain, or just the
        symbol (<code>USDC</code>) to allow that token on all enabled chains.
      </Callout>

      <h2>3. Install the SDK</h2>

      <CodeBlock language="bash" title="npm" code={`npm install @noderails/sdk`} />

      <CodeBlock language="bash" title="pnpm" code={`pnpm add @noderails/sdk`} />

      <CodeBlock language="bash" title="yarn" code={`yarn add @noderails/sdk`} />

      <h2>4. Initialize the client</h2>
      <p>
        Create a NodeRails client instance on your server. Pass your App ID and secret key
        from environment variables:
      </p>

      <CodeBlock
        language="typescript"
        title="lib/noderails.ts"
        code={`import { NodeRails } from "@noderails/sdk"

const noderails = new NodeRails({
  appId: process.env.NODERAILS_APP_ID!,
  apiKey: process.env.NODERAILS_SECRET_KEY!,
})

export default noderails`}
      />

      <h2>5. Create a checkout session</h2>
      <p>
        A checkout session generates a hosted payment page where your customer can select
        their blockchain and token, connect a wallet (<strong>WalletConnect</strong> on EVM or <strong>Solana</strong> wallet adapters),
        and complete the payment.
      </p>
      <p>
        Call <code>checkoutSessions.create</code> from your server-side API route and redirect
        the customer to the returned checkout URL:
      </p>

      <CodeBlock
        language="typescript"
        title="api/create-checkout.ts"
        code={`import noderails from "@/lib/noderails"

export async function POST(req: Request) {
  const session = await noderails.checkoutSessions.create({
    successUrl: "https://yoursite.com/success?session={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://yoursite.com/cancel",
    items: [
      {
        name: "Pro Plan",
        amount: "29.99",
        quantity: 1,
      },
    ],
  })

  const checkoutUrl = \`https://pay.noderails.com/session/\${session.id}\`
  return Response.json({ checkoutUrl })
}`}
      />

      <p>
        Your customer will see the hosted checkout page where they can review the payment, check their
        wallet balance, and authorize the transaction:
      </p>
      <div style={{ margin: '24px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <img
          src="/screenshots/checkout.png"
          alt="NodeRails hosted checkout page showing payment review with amount, token, wallet balance, and authorize button"
          style={{ width: '100%', display: 'block' }}
        />
      </div>

      <p>
        By default, the checkout page shows the chains and tokens you configured for your app.
        You can restrict them for a specific session by passing <code>allowedChains</code> and <code>allowedTokens</code>:
      </p>

      <CodeBlock
        language="typescript"
        title="Restrict to specific chains and tokens"
        code={`const session = await noderails.checkoutSessions.create({
  successUrl: "https://yoursite.com/success",
  cancelUrl: "https://yoursite.com/cancel",
  allowedChains: [8453, 42161, 103],
  allowedTokens: ["USDC", "SOL"],
  items: [
    { name: "Enterprise License", amount: "499.00", quantity: 1 },
  ],
})`}
      />

      <p>
        In this example, checkout can offer USDC on Base (8453), Arbitrum (42161), and Solana mainnet (103), plus SOL on Solana when enabled for your app. You can
        also pass specific token keys like <code>USDC-8453</code> or <code>USDC-103</code> instead of just the symbol.
      </p>

      <h2>6. Handle the webhook</h2>
      <p>
        After the customer completes payment, NodeRails sends a <code>payment.captured</code> event
        to your webhook endpoint once funds are taken from the customer&apos;s wallet and locked in escrow on-chain.
        This is your signal to fulfill the order.
      </p>
      <p>
        Verify the webhook signature using the SDK, then handle the event based on its type:
      </p>

      <CodeBlock
        language="typescript"
        title="webhooks/noderails.ts (Express)"
        code={`import { NodeRails } from "@noderails/sdk"
import express from "express"

const app = express()

app.post(
  "/webhooks/noderails",
  express.raw({ type: "application/json" }),
  (req, res) => {
    try {
      const event = NodeRails.webhooks.constructEvent(
        req.body,
        req.headers["x-noderails-signature"] as string,
        req.headers["x-noderails-timestamp"] as string,
        process.env.WEBHOOK_SECRET!,
      )

      switch (event.event) {
        case "payment.captured":
          console.log("Payment captured:", event.data.id)
          break

        case "payment.settled":
          console.log("Payment settled:", event.data.id)
          break
      }

      res.sendStatus(200)
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      res.sendStatus(400)
    }
  },
)`}
      />

      <p>
        <strong>payment.captured</strong> means funds have been authorized and locked in escrow. This is
        when you should fulfill the order. <strong>payment.settled</strong> means funds have been
        released from escrow and deposited to your wallet.
      </p>

      <Callout type="info" title="Register your webhook">
        Create a webhook endpoint in the dashboard under <strong>Settings → Webhooks</strong> tab,
        or programmatically via the SDK:
        <br />
        <code>noderails.webhookEndpoints.create({'{'} url: &apos;...&apos;, events: [&apos;payment.captured&apos;] {'}'})</code>
      </Callout>

      <h2>7. Track payments</h2>
      <p>
        Once payments start coming in, you can track them in real time from the Payments page in
        your dashboard. Each payment shows the amount, customer, network, status, and on-chain
        transaction hash:
      </p>
      <div style={{ margin: '24px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <img
          src="/screenshots/payments-list.png"
          alt="Payments list in the NodeRails dashboard showing payment status, amounts, and transaction hashes"
          style={{ width: '100%', display: 'block' }}
        />
      </div>

      <hr />

      <h2>Next steps</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 not-prose">
        <Link
          href="/docs/supported-assets"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Supported Chains &amp; Tokens →</div>
          <p className="text-sm text-slate-500 mt-1">Live list of enabled chains, token symbols, and network coverage.</p>
        </Link>
        <Link
          href="/docs/sdk"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">SDK Reference →</div>
          <p className="text-sm text-slate-500 mt-1">Full SDK configuration and all available resources.</p>
        </Link>
        <Link
          href="/docs/webhooks"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Webhooks Guide →</div>
          <p className="text-sm text-slate-500 mt-1">All webhook events and signature verification.</p>
        </Link>
        <Link
          href="/docs/api-reference/checkout-sessions"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Checkout Sessions API →</div>
          <p className="text-sm text-slate-500 mt-1">Full API reference for creating and managing checkout sessions.</p>
        </Link>
      </div>
    </>
  );
}
