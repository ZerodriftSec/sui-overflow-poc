import Link from 'next/link';
import { CodeBlock, Callout, Endpoint, ParamsTable, Param } from '@/components/docs/ui';

export default function SuiChainPage() {
  return (
    <>
      <h1>Sui payments</h1>
      <p className="subtitle">
        Accept native SUI and Sui coins (e.g. USDC) on devnet, testnet, and mainnet through hosted checkout,
        payment links, and the NodeRails SDK — with gas-sponsored one-time payments and subscription wallets.
      </p>

      <Callout type="info" title="Try the demo">
        See the <strong>Buy me a coffee</strong> sample app in the monorepo (<code>apps/buy-me-coffee</code>).
        It creates Sui-only checkout sessions and receives <code>payment.captured</code> webhooks at{' '}
        <code>/api/webhooks/noderails</code>.
      </Callout>

      <h2>Chain IDs</h2>
      <p>
        Sui uses NodeRails-specific numeric chain IDs (same pattern as Solana cluster IDs). Pass these in{' '}
        <code>allowedChains</code> on checkout sessions, payment links, invoices, and payment intents.
      </p>

      <table>
        <thead>
          <tr><th>Network</th><th>Chain ID</th><th>Native token key</th></tr>
        </thead>
        <tbody>
          <tr><td>Sui Devnet</td><td><code>201</code></td><td><code>SUI-201</code></td></tr>
          <tr><td>Sui Testnet</td><td><code>202</code></td><td><code>SUI-202</code></td></tr>
          <tr><td>Sui Mainnet</td><td><code>203</code></td><td><code>SUI-203</code></td></tr>
        </tbody>
      </table>

      <h2>Merchant setup</h2>
      <ol>
        <li>In the <strong>merchant dashboard</strong>, enable Sui on your app (Settings → Chains).</li>
        <li>Connect a <strong>Sui settlement wallet</strong> (Wallet Standard extension such as Sui Wallet or Slush).</li>
        <li>Ensure SUI and/or USDC (or other enabled coins) are toggled for the Sui network you use.</li>
        <li>Register Sui escrow object IDs in admin after publishing the Move package (platform ops).</li>
      </ol>

      <Callout type="warning" title="Wallet address format">
        Sui addresses are 32-byte hex prefixed with <code>0x</code> (e.g.{' '}
        <code>0xabc…def</code>). They are <strong>not</strong> EVM <code>0x</code> 20-byte addresses.
      </Callout>

      <h2>SDK: Sui-only checkout session</h2>
      <p>
        Restrict checkout to Sui testnet and USDC + native SUI using <code>allowedChains</code> and{' '}
        <code>allowedTokens</code>:
      </p>

      <CodeBlock
        language="typescript"
        title="Sui checkout via @noderails/sdk"
        code={`import { NodeRails } from '@noderails/sdk';

const noderails = new NodeRails({
  appId: process.env.NODERAILS_APP_ID!,
  apiKey: process.env.NODERAILS_API_KEY!,
});

const session = await noderails.checkoutSessions.create({
  mode: 'PAYMENT',
  successUrl: 'https://yoursite.com/success?session={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://yoursite.com/cancel',
  allowedChains: [202],              // Sui testnet only
  allowedTokens: ['SUI-202', 'USDC-202'],
  items: [
    {
      name: 'Buy me a coffee',
      amount: '5.00',
      currency: 'USD',
      quantity: 1,
    },
  ],
  metadata: { orderId: 'order_123' },
});

// Redirect: https://pay.noderails.com/checkout/{session.id}`}
      />

      <h2>Customer checkout flow</h2>
      <ol>
        <li>Customer opens the hosted payment page.</li>
        <li>Connects a Sui wallet (Wallet Standard).</li>
        <li>For one-time payments, approves a <strong>gas-sponsored</strong> capture transaction (user signs; platform sponsors gas via MTXM).</li>
        <li>For subscriptions, customer funds a NodeRails subscription wallet on Sui, then renewals are captured from that wallet.</li>
        <li>NodeRails sends <code>payment.captured</code> to your webhook when escrow holds funds.</li>
      </ol>

      <h2>Webhooks</h2>
      <p>
        Sui payments use the same webhook events as EVM and Solana. Register your endpoint in the dashboard
        (Settings → Webhooks) and verify signatures with your signing secret (<code>whsec_…</code>).
      </p>

      <CodeBlock
        language="typescript"
        title="Webhook handler (Express)"
        code={`app.post('/api/webhooks/noderails', express.raw({ type: 'application/json' }), (req, res) => {
  const event = NodeRails.webhooks.constructEvent(
    req.body,
    req.headers['x-noderails-signature'] as string,
    req.headers['x-noderails-timestamp'] as string,
    process.env.NODERAILS_WEBHOOK_SECRET!,
  );

  if (event.event === 'payment.captured') {
    const chainId = event.data.authorizationChainId; // 201 | 202 | 203 for Sui
    const tokenKey = event.data.authorizationTokenKey; // e.g. SUI-202
    const txRef = event.data.captureTxHash; // Sui transaction digest
    console.log('Sui payment captured', { chainId, tokenKey, txRef });
  }

  res.sendStatus(200);
});`}
      />

      <p>
        Subscribe at minimum to <code>payment.captured</code>. Use{' '}
        <Link href="/docs/webhooks">Webhooks</Link> for the full event list and signature details.
      </p>

      <h2>Sponsored checkout API (payment-ui / custom integrators)</h2>
      <p>
        If you build a custom checkout UI (not hosted pay.noderails.com), the server exposes Sui sponsor
        endpoints used by payment-ui. These are called <strong>after</strong> authorize returns{' '}
        <code>captureData</code> with <code>chainType: &quot;SUI&quot;</code> and <code>sponsored: true</code>.
      </p>

      <Endpoint method="POST" path="/checkout/sui/sponsor-sign" description="Checkout session context (public checkout API)" />
      <ParamsTable>
        <Param name="checkoutSessionId" type="string" required description="Open checkout session UUID" />
        <Param name="chainId" type="number" required description="201, 202, or 203" />
        <Param name="senderAddress" type="string" required description="Customer Sui address" />
        <Param name="transactionKindBase64" type="string" description="Unsigned PTB kind bytes (from authorize)" />
        <Param name="transactionBase64" type="string" description="Partial/full unsigned PTB (alternative to kind)" />
        <Param name="walletSetup" type="boolean" description="Set true for subscription wallet setup (higher gas budget)" />
      </ParamsTable>

      <Endpoint method="POST" path="/checkout/sui/execute-sponsored" description="After user signs sponsored PTB (public checkout API)" />
      <ParamsTable>
        <Param name="checkoutSessionId" type="string" required description="Checkout session UUID" />
        <Param name="chainId" type="number" required description="201, 202, or 203" />
        <Param name="packageId" type="string" required description="Published escrow package ID" />
        <Param name="transactionBlockBase64" type="string" required description="Full PTB from sponsor-sign" />
        <Param name="sponsorSignature" type="string" required description="Sponsor signature from sponsor-sign" />
        <Param name="userSignature" type="string" description="User Ed25519 signature when dualSignRequired" />
        <Param name="dualSignRequired" type="boolean" description="From sponsor-sign response" />
      </ParamsTable>

      <Callout type="warning" title="Gas sponsorship operations">
        Sponsored Sui transactions require the platform MTXM sponsor wallet to hold enough SUI for gas.
        If execute fails with insufficient gas on the sponsor coin, top up the sponsor signer in MTXM.
      </Callout>

      <h2>Subscriptions on Sui</h2>
      <p>
        Subscriptions on Sui use an on-chain <strong>subscription wallet</strong> per customer. The customer
        authorizes and funds the wallet once; renewals are captured from that wallet without a new wallet
        connection each cycle. Enable Sui on your app and create subscription checkout sessions or payment
        links with a product plan as usual.
      </p>

      <h2>Token keys and coin types</h2>
      <ul>
        <li><strong>Native SUI:</strong> token key <code>SUI-202</code> (testnet), contract <code>native</code> in API responses.</li>
        <li><strong>USDC on Sui:</strong> token key <code>USDC-202</code>; <code>contractAddress</code> is the full Move coin type (e.g. <code>0x2::sui::SUI</code> or USDC type string from admin).</li>
      </ul>

      <h2>Related docs</h2>
      <ul>
        <li><Link href="/docs/getting-started">Quick Start</Link></li>
        <li><Link href="/docs/sdk/checkout-sessions">SDK — Checkout Sessions</Link></li>
        <li><Link href="/docs/sdk/webhook-endpoints">SDK — Webhook Endpoints</Link></li>
        <li><Link href="/docs/supported-assets">Supported Chains &amp; Tokens</Link></li>
      </ul>
    </>
  );
}
