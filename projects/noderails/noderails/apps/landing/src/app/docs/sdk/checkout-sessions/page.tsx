import { CodeBlock, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKCheckoutSessionsPage() {
  return (
    <>
      <h1>Checkout Sessions</h1>
      <p className="subtitle">
        Checkout sessions are the easiest way to accept a payment. Create a session on your
        server, redirect the customer to the hosted payment page, and wait for the webhook.
      </p>

      <h2>Step 1: Create a checkout session</h2>

      <CodeBlock
        language="typescript"
        title="Create session"
        code={`const session = await noderails.checkoutSessions.create({
  successUrl: 'https://yoursite.com/success?session={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://yoursite.com/cancel',
  items: [
    {
      name: 'Pro Plan',
      amount: '49.99',
      currency: 'USD',
      quantity: 1,
    },
  ],
  metadata: { orderId: 'order_123' },
});

// Redirect customer to the hosted checkout page
const checkoutUrl = \`https://pay.noderails.com/checkout/\${session.id}\`;`}
      />

      <Callout type="info" title="Session URL">
        The checkout URL follows the pattern <code>https://pay.noderails.com/checkout/SESSION_ID</code>.
        Redirect your customer here after creating the session.
      </Callout>

      <h2>Step 2: Customer completes payment</h2>
      <p>
        On the hosted checkout page, the customer selects their preferred chain and token, connects
        a wallet (EVM via WalletConnect-compatible wallets, Solana via Phantom / Solflare, Sui via Wallet Standard
        extensions such as Sui Wallet or Slush),
        and approves the transaction. You don&apos;t need to build any of this. NodeRails
        handles the entire payment UI.
      </p>
      <p>
        Once the customer pays, they&apos;re redirected to your <code>successUrl</code>. But don&apos;t
        rely on the redirect to confirm the payment. Always use webhooks.
      </p>

      <h2>Step 3: Listen for the webhook</h2>
      <p>
        NodeRails sends a <code>payment.captured</code> event to your webhook endpoint when funds
        have been taken from the customer&apos;s wallet, locked in escrow, and confirmed on-chain.
        This is your signal to fulfill the order.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle webhook"
        code={`app.post('/webhooks/noderails', express.raw({ type: 'application/json' }), (req, res) => {
  const event = NodeRails.webhooks.constructEvent(
    req.body,
    req.headers['x-noderails-signature'] as string,
    req.headers['x-noderails-timestamp'] as string,
    process.env.WEBHOOK_SECRET!,
  );

  switch (event.event) {
    case 'payment.captured':
      // Payment confirmed! Fulfill the order
      const paymentIntentId = event.data.id;
      const amount = event.data.amount;
      const orderId = event.data.metadata?.orderId;
      console.log(\`Payment \${paymentIntentId} captured for order \${orderId}\`);
      break;

    case 'payment.settled':
      // Funds released to your merchant wallet
      console.log('Funds settled:', event.data.id);
      break;
  }

  res.sendStatus(200);
});`}
      />

      <h2>Step 4: Check payment status</h2>
      <p>
        After creating a checkout session, you can check its status at any time. When the customer
        completes payment, the full payment intent is included in the response, no extra API call needed.
      </p>

      <CodeBlock
        language="typescript"
        title="Check session and payment status"
        code={`const session = await noderails.checkoutSessions.retrieve('session-id');
console.log(session.status);          // "OPEN" | "COMPLETE" | "EXPIRED"
console.log(session.paymentIntentId); // null until customer pays

// Once payment is made, the full payment intent is included
if (session.paymentIntent) {
  console.log(session.paymentIntent.status);              // "CAPTURED"
  console.log(session.paymentIntent.amount);              // "49.99"
  console.log(session.paymentIntent.cryptoAmount);        // "50000000" (in token's smallest unit)
  console.log(session.paymentIntent.captureTxHash);       // "0x..." (on-chain tx hash)
  console.log(session.paymentIntent.authorizationChainId); // 8453 (chain used)
  console.log(session.paymentIntent.authorizationTokenKey); // "USDC-8453" (token used)
  console.log(session.paymentIntent.exchangeRate);        // "1.0001"
}`}
      />

      <Callout type="info" title="No extra calls needed">
        When you retrieve a checkout session, the full <code>paymentIntent</code> object is automatically
        included once the customer has paid. You don&apos;t need to make a separate call
        to <code>paymentIntents.retrieve()</code>.
      </Callout>

      <h2>List checkout sessions</h2>

      <CodeBlock
        language="typescript"
        title="List and filter"
        code={`const result = await noderails.checkoutSessions.list({
  status: 'OPEN',
  page: 1,
  pageSize: 25,
});

console.log(result.data);              // CheckoutSession[]
console.log(result.pagination.total);  // Total matching sessions`}
      />

      <h2>Expire a session</h2>
      <p>
        Manually expire an open checkout session. This prevents the customer from completing
        the payment after the session is expired.
      </p>

      <CodeBlock
        language="typescript"
        title="Expire session"
        code={`const expired = await noderails.checkoutSessions.expire('session-id');
console.log(expired.status); // "EXPIRED"`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new checkout session</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a session by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List sessions with optional filters</td></tr>
          <tr><td><code>expire(id)</code></td><td>Expire an open session</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  CheckoutSession,
  CheckoutSessionCreateParams,
  CheckoutSessionListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> response</h3>
      <ResponseTable title="CheckoutSession (create)">
        <ResponseField name="id" type="string" description="Unique session ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="customerAccountId" type="string | null" description="Linked customer, if provided" />
        <ResponseField name="paymentIntentId" type="null" description="Always null at creation" />
        <ResponseField name="mode" type="string" description="&quot;PAYMENT&quot; or &quot;SUBSCRIPTION&quot;" />
        <ResponseField name="status" type="string" description="&quot;OPEN&quot; at creation" />
        <ResponseField name="sourceType" type="string" description="&quot;API&quot; when created via SDK" />
        <ResponseField name="sourceId" type="null" description="Not set at creation" />
        <ResponseField name="amount" type="string | null" description="Total amount (null until computed)" />
        <ResponseField name="currency" type="string" description="Currency code, default &quot;USD&quot;" />
        <ResponseField name="subtotal" type="string | null" description="Pre-tax total" />
        <ResponseField name="taxAmount" type="string | null" description="Tax portion" />
        <ResponseField name="taxDescription" type="string | null" description="Tax label, e.g. &quot;VAT 20%&quot;" />
        <ResponseField name="allowedChains" type="string | number[]" description="&quot;ALL&quot; or array of chain IDs (EVM, Solana e.g. 103, Sui e.g. 202)" />
        <ResponseField name="allowedTokens" type="string | string[]" description="&quot;ALL&quot; or symbols / token keys (incl. SOL-103, SUI-202, USDC-202)" />
        <ResponseField name="successUrl" type="string" description="Redirect URL after payment" />
        <ResponseField name="cancelUrl" type="string" description="Redirect URL if cancelled" />
        <ResponseField name="requireBillingDetails" type="boolean" description="Whether billing details are required" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="expiresAt" type="string" description="ISO 8601 expiration timestamp" />
        <ResponseField name="completedAt" type="null" description="Set when session completes" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="items" type="CheckoutSessionItem[]" description="Line items (see below)" />
      </ResponseTable>

      <ResponseTable title="CheckoutSessionItem (nested in items[])">
        <ResponseField name="id" type="string" description="Item ID (UUID)" />
        <ResponseField name="checkoutSessionId" type="string" description="Parent session ID" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan, if any" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price, if any" />
        <ResponseField name="name" type="string" description="Item name" />
        <ResponseField name="description" type="string | null" description="Item description" />
        <ResponseField name="amount" type="string | null" description="Item amount (Decimal as string)" />
        <ResponseField name="currency" type="string" description="Item currency" />
        <ResponseField name="quantity" type="number" description="Item quantity" />
        <ResponseField name="isPriceOption" type="boolean" description="Whether this is a price selection" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Returns all fields from <code>create()</code> above, plus these additional nested objects:
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="app" type="App" description="Full app object (id, name, environment, etc.)" />
        <ResponseField name="paymentIntent" type="PaymentIntent | null" description="Full payment intent once customer pays (all PI fields)" />
        <ResponseField name="items[].productPlan" type="ProductPlan | null" description="Full product plan on each item, if linked" />
        <ResponseField name="items[].productPlanPrice" type="ProductPlanPrice | null" description="Full price on each item, if linked" />
      </ResponseTable>

      <h3><code>list()</code> response</h3>
      <p>
        Returns an array of sessions. Each session has the same shape as <code>create()</code>
        (with <code>items</code> but without <code>app</code>, <code>paymentIntent</code>, or nested plan/price on items).
        The response includes pagination:
      </p>
      <CodeBlock
        language="json"
        title="Paginated response shape"
        code={`{
  "success": true,
  "data": [ /* CheckoutSession[] */ ],
  "pagination": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}`}
      />

      <h3><code>expire()</code> response</h3>
      <p>
        Same shape as <code>create()</code> (session + items). The <code>status</code> field will be <code>&quot;EXPIRED&quot;</code>.
      </p>
    </>
  );
}
