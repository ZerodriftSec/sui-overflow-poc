import Link from 'next/link';
import { Callout } from '@/components/docs/ui';

export default function DocsPage() {
  return (
    <>
      <h1>NodeRails Documentation</h1>
      <p className="subtitle">
        Accept crypto payments as easily as you accept fiat.
        A comprehensive, developer-friendly crypto payments infrastructure.
      </p>

      <Callout type="info" title="Need support or want to join the community?">
        Join our
        {' '}
        <a href="https://t.me/+fzUTcAYr-zhhZjg1" target="_blank" rel="noreferrer">Telegram channel</a>
        {' '}
        or
        {' '}
        <a href="https://discord.gg/8uwSfv9Tvk" target="_blank" rel="noreferrer">Discord channel</a>
        .
      </Callout>

      <Callout type="success" title="Quick Start">
        Already know about NodeRails? Jump straight to the <Link href="/docs/getting-started">Quick Start guide</Link> to
        accept your first payment in under 5 minutes.
      </Callout>

      {/* ── What is NodeRails? ── */}

      <h2>What is NodeRails?</h2>
      <p>
        If you&apos;ve ever wanted to accept crypto payments in your app but couldn&apos;t find anything
        as simple and reliable as what Stripe, Razorpay, or Dodo Payments offer for fiat, NodeRails is
        built exactly for you.
      </p>
      <p>
        NodeRails is a comprehensive crypto payments infrastructure that gives you everything you need
        to accept, manage, and settle cryptocurrency payments. We&apos;ve worked hard to make it feel
        as familiar and effortless as accepting fiat, with all the power that comes from building on
        blockchain: instant cross-border settlement, low fees, and full transparency.
      </p>
      <p>
        No complicated wallet integrations. No manually tracking transactions on block explorers.
        You create a payment, your customer pays, you get notified. That&apos;s it.
      </p>

      {/* ── Key features ── */}

      <h2>Key features</h2>
      <ul>
        <li><strong>Multi-chain, multi-token:</strong> Accept payments across <strong>EVM networks</strong> (e.g. Ethereum, Base, Arbitrum) and <strong>Solana</strong> (native SOL and SPL tokens). Your customers pick the chain and token they prefer; you receive the funds.</li>
        <li><strong>Hosted checkout:</strong> A ready-to-use payment page. Create a session, redirect your customer, done. No frontend work needed.</li>
        <li><strong>Recurring payments &amp; subscriptions:</strong> Set up subscription plans with automatic renewal. Perfect for SaaS, memberships, or any recurring billing.</li>
        <li><strong>Invoicing:</strong> Create professional invoices with line items and tax, send them via email, and let customers pay with one click.</li>
        <li><strong>Payment links:</strong> Generate shareable payment links for quick, no-code payment collection.</li>
        <li><strong>Developer-first SDK:</strong> A clean TypeScript SDK with type safety, zero dependencies, and a familiar API design. If you&apos;ve used Stripe&apos;s SDK, you&apos;ll feel right at home.</li>
        <li><strong>Webhooks:</strong> Get real-time notifications for every payment event with signed payloads and automatic retries.</li>
      </ul>

      {/* ── How it works ── */}

      <h2>How it works</h2>
      <ol>
        <li><strong>Create a checkout session</strong> from your server using the SDK or REST API.</li>
        <li><strong>Redirect your customer</strong> to the hosted payment page. They pick their preferred chain and token, connect their wallet, and approve the transaction.</li>
        <li><strong>Payment is captured</strong>: funds are taken from the customer&apos;s wallet and locked in escrow on-chain. You receive a <code>payment.captured</code> webhook confirming the funds are secured.</li>
        <li><strong>Funds are settled</strong> to your merchant wallet automatically. You get a <code>payment.settled</code> webhook when it&apos;s done.</li>
      </ol>

      {/* ── Why NodeRails? ── */}

      <h2>Why NodeRails?</h2>

      <h3>Your money is always safe</h3>
      <p>
        One of the biggest reasons people hesitate to pay with crypto is the fear that if something
        goes wrong, if the product isn&apos;t delivered or the service doesn&apos;t work, they can&apos;t
        get their money back. With traditional crypto payments, that&apos;s a real concern.
      </p>
      <p>
        NodeRails solves this with an on-chain escrow system. When a customer pays, the funds are held
        in a secure escrow (<strong>EVM smart contracts</strong> or <strong>Solana programs</strong>), not in anyone&apos;s personal wallet. The money can only go to one
        of two places: the merchant or the customer. No middlemen, no third-party custody. It&apos;s all
        enforced by code on the blockchain.
      </p>

      <h3>Built-in dispute resolution</h3>
      <p>
        If a customer has a problem with their purchase, they can raise a dispute during the dispute
        window. The merchant or an admin reviews it and decides the outcome. If the customer wins,
        their funds are returned automatically. If the merchant wins, the funds are released to them.
        The entire process is transparent and settled on-chain.
      </p>
      <p>
        This means customers can pay with crypto with the same confidence they have with credit card
        chargebacks, and merchants know their money is protected from fraudulent claims once the
        dispute window closes.
      </p>

      <h3>No middlemen</h3>
      <p>
        There is no intermediary holding your funds. Payments flow directly from the customer&apos;s 
        wallet to the on-chain escrow, and then to your merchant wallet. NodeRails never has custody
        of your money at any point.
      </p>

      {/* ── Understanding payment states ── */}

      <h2>Understanding payment states</h2>
      <p>
        Every payment in NodeRails goes through a lifecycle of states. Understanding these states
        is key to building a solid integration.
      </p>

      <h3>Authorized</h3>
      <p>
        When a customer approves the payment, the payment moves to <code>AUTHORIZED</code>.
        Think of it like a credit card authorization: the customer has given permission 
        for you to charge a specific amount from their wallet, but the money hasn&apos;t moved yet.
      </p>
      <p>
        On EVM chains, this typically means the customer has signed an approval or permit
        allowing the specified amount to be pulled from their wallet. On Solana, authorization follows the wallet and program flow for native SOL or SPL tokens (including delegation where applicable). The funds are still under the customer&apos;s control at this point. Authorization can still fail (insufficient balance,
        revoked approval, etc.), so don&apos;t fulfill orders at this stage.
      </p>

      <h3>Captured</h3>
      <p>
        Once the authorized funds are actually moved from the customer&apos;s wallet and locked 
        in the escrow (EVM contract or Solana program), the payment becomes <code>CAPTURED</code>. <strong>This is the 
        confirmation you&apos;re waiting for.</strong> Captured means the money has left the 
        customer&apos;s wallet and is now secured. You can safely fulfill the order, deliver 
        the product, or activate the service.
      </p>
      <p>
        The only scenario where captured funds don&apos;t end up in your wallet is if the customer raises
        a dispute and wins. Outside of that, captured funds will automatically settle to your wallet.
      </p>

      <h3>Settled</h3>
      <p>
        After the timelock period passes without any disputes, the funds are released from the escrow
        and transferred to your merchant wallet. The payment moves to <code>SETTLED</code>. This is
        the final, irreversible state, the funds are now in your wallet.
      </p>

      <h3>Disputed</h3>
      <p>
        If a customer raises a dispute during the dispute window (after capture but before settlement),
        the payment moves to <code>DISPUTED</code>. Funds remain in escrow until the dispute is resolved.
        The outcome is either:
      </p>
      <ul>
        <li><strong>Resolved in merchant&apos;s favor:</strong> Funds are released to your wallet as normal.</li>
        <li><strong>Resolved in customer&apos;s favor:</strong> Funds are returned to the customer&apos;s wallet.</li>
      </ul>

      <Callout type="info" title="When to fulfill orders">
        Listen for the <code>payment.captured</code> webhook event. That&apos;s your signal to deliver
        the product or activate the service. Don&apos;t wait for settlement, capture is your green light.
      </Callout>

      {/* ── Tracking payments ── */}

      <h2>Tracking payments</h2>
      <p>
        No matter how you accept payments (checkout sessions, invoices, payment links, or subscriptions),
        there is one object that ties everything together: the <strong>payment intent</strong>.
      </p>
      <p>
        When you create a checkout session, invoice, or payment link, a payment intent doesn&apos;t exist yet.
        It is created the moment your customer actually authorizes the payment, picks their chain and token,
        and signs the transaction. Once it exists, the payment intent becomes the single source of truth
        for that payment.
      </p>

      <h3>What to store</h3>
      <p>
        Store the ID of whatever you created (checkout session, invoice, etc.) in your database against your order. 
        Once the customer pays, that object will contain a <code>paymentIntentId</code> linking to the payment intent.
      </p>

      <h3>What the payment intent gives you</h3>
      <ul>
        <li><code>status</code> &mdash; current state: <code>AUTHORIZED</code>, <code>CAPTURED</code>, <code>SETTLED</code>, <code>DISPUTED</code>, etc.</li>
        <li><code>sourceType</code> &mdash; what created it: <code>CHECKOUT_SESSION</code>, <code>INVOICE</code>, <code>SUBSCRIPTION</code>, <code>PAYMENT_LINK</code></li>
        <li><code>sourceId</code> &mdash; the ID of the checkout session, invoice, or subscription that created it</li>
        <li><code>authorizationChainId</code>, <code>authorizationTokenKey</code> &mdash; which chain and token the customer used</li>
        <li><code>cryptoAmount</code>, <code>exchangeRate</code> &mdash; exact crypto amount and conversion rate</li>
        <li><code>captureTxHash</code> &mdash; the on-chain transaction hash</li>
        <li><code>metadata</code>, <code>externalId</code> &mdash; your custom data and order reference</li>
      </ul>

      <h3>Two ways to track</h3>
      <p><strong>1. Webhooks (recommended):</strong> Listen for <code>payment.captured</code> and other events.
        The webhook payload includes the full payment intent with all the fields above, plus any metadata you set.
      </p>
      <p><strong>2. Polling:</strong> If you don&apos;t use webhooks, retrieve the object you created to check its status.
        For example, retrieve a checkout session to see if it moved to <code>COMPLETE</code> and read
        its <code>paymentIntentId</code>, then retrieve the payment intent for transaction details.
      </p>

      <Callout type="info" title="One ID to rule them all">
        Once a payment intent exists, you can track everything from it: the payment status, on-chain
        transaction details, which invoice or subscription it belongs to, and your custom metadata.
        It&apos;s the single object that connects your order to the blockchain transaction.
      </Callout>

      {/* ── Ways to accept payments ── */}

      <h2>Three ways to accept payments</h2>
      <p>NodeRails gives you flexibility in how you integrate. Pick the approach that fits your use case.</p>

      <h3>1. Merchant Dashboard</h3>
      <p>
        No code required. Log into your NodeRails dashboard, create payment links or invoices, and
        share them with your customers. Great for freelancers, small businesses, or one-off payments.
      </p>

      <h3>2. REST API</h3>
      <p>
        Use the REST API directly from any language or framework. Create checkout sessions, manage
        subscriptions, send invoices, all through standard HTTP requests with your API key.
      </p>

      <h3>3. TypeScript SDK</h3>
      <p>
        The fastest way to integrate if you&apos;re building with Node.js, Deno, or Bun. The SDK
        wraps the REST API with full type safety, automatic error handling, and a clean, intuitive interface.
        Install it with <code>npm install @noderails/sdk</code> and you&apos;re ready to go.
      </p>

      {/* ── Services overview ── */}

      <h2>Services we offer</h2>
      <p>
        NodeRails provides several payment services. Here&apos;s a quick overview of what&apos;s available
        and when to use each one.
      </p>

      <h3>Checkout Sessions</h3>
      <p>
        The simplest way to accept a one-time payment. You create a checkout session on your server,
        redirect the customer to our hosted payment page, and we handle everything: chain selection,
        wallet connection, transaction approval, and confirmation. Use this when you want to charge
        a customer for a specific amount right now.
      </p>

      <h3>Payment Intents</h3>
      <p>
        The core payment object. Every checkout session creates a payment intent under the hood.
        If you need more control over the payment flow (custom UIs, server-to-server payments),
        you can work with payment intents directly.
      </p>

      <h3>Invoices</h3>
      <p>
        Send a professional invoice with line items, tax rates, and a payment link. The customer
        receives an email with a one-click pay button. Use invoices when you need to bill a specific
        customer for specific items, especially for B2B or freelance work.
      </p>

      <h3>Subscriptions</h3>
      <p>
        Recurring payments on a schedule. You create a product plan with a price (monthly, yearly, etc.),
        and customers subscribe to it. NodeRails handles the billing cycle, renewals, and notifications.
        Use subscriptions for SaaS products, memberships, or any service with regular billing.
      </p>
      <p>
        To set up subscriptions, you&apos;ll need:
      </p>
      <ul>
        <li><strong>A product plan:</strong> What you&apos;re selling (e.g., &quot;Pro Plan&quot;, &quot;Enterprise Tier&quot;).</li>
        <li><strong>A price:</strong> How much and how often (e.g., $29/month, $299/year). A product can have multiple prices.</li>
        <li><strong>A customer:</strong> Who is subscribing. Customers are tracked by email and wallet address.</li>
      </ul>

      <h3>Payment Links</h3>
      <p>
        Shareable URLs that open a payment page. No integration needed at all. Create a link in the
        dashboard or via API, share it anywhere (email, social media, QR code), and anyone with the
        link can pay. Great for tips, donations, or quick payments.
      </p>

      {/* ── Getting started cards ── */}

      <h2>Get started</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <Link
          href="/docs/getting-started"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '20px',
            textDecoration: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
            Quick Start &rarr;
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>Install the SDK and accept your first payment in minutes.</p>
        </Link>

        <Link
          href="/docs/sdk"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '20px',
            textDecoration: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
            SDK Reference &rarr;
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>Full configuration options, all resources, and usage patterns.</p>
        </Link>

        <Link
          href="/docs/supported-assets"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '20px',
            textDecoration: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
            Supported Chains &amp; Tokens &rarr;
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>See all currently enabled chains and payment tokens.</p>
        </Link>

        <Link
          href="/docs/api-reference/checkout-sessions"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '20px',
            textDecoration: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
            API Reference &rarr;
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>Complete REST API documentation with request and response examples.</p>
        </Link>

        <Link
          href="/docs/webhooks"
          style={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            padding: '20px',
            textDecoration: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
            Webhooks &rarr;
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>Receive real-time events and verify webhook signatures.</p>
        </Link>
      </div>
    </>
  );
}
