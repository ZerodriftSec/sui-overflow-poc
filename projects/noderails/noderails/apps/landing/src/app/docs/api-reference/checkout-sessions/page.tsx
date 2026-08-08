import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function CheckoutSessionsPage() {
  return (
    <>
      <h1>Checkout Sessions</h1>
      <p className="subtitle">
        A checkout session represents a hosted payment page. Create a session, redirect your
        customer to the session URL, and NodeRails handles the rest: chain selection, wallet
        connection (EVM via WalletConnect, Solana via compatible wallets), and payment capture.
      </p>

      <Callout type="info" title="Hosted payment page">
        Checkout sessions power the NodeRails hosted payment UI. Your customer never leaves a
        NodeRails-hosted page, reducing PCI-equivalent complexity for crypto payments.
      </Callout>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a checkout session</h2>
      <Endpoint method="POST" path="/checkout-sessions" />

      <p>Creates a new checkout session. Returns a session object with line items.</p>

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>successUrl</code></td><td><code>string</code></td><td>Yes</td><td>URL to redirect on successful payment</td></tr>
          <tr><td><code>cancelUrl</code></td><td><code>string</code></td><td>Yes</td><td>URL to redirect on cancellation</td></tr>
          <tr><td><code>items</code></td><td><code>CheckoutItem[]</code></td><td>Yes</td><td>Line items (min 1)</td></tr>
          <tr><td><code>customerAccountId</code></td><td><code>string</code></td><td>No</td><td>Existing customer UUID</td></tr>
          <tr><td><code>mode</code></td><td><code>&quot;PAYMENT&quot; | &quot;SUBSCRIPTION&quot;</code></td><td>No</td><td>Checkout mode (default: PAYMENT)</td></tr>
          <tr><td><code>expiresInMinutes</code></td><td><code>number</code></td><td>No</td><td>Auto-expire in 1–1440 minutes</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <h4>CheckoutItem</h4>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>name</code></td><td><code>string</code></td><td>Yes</td><td>Item name (1–255 chars)</td></tr>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>No</td><td>Price in fiat (decimal string)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Currency code (max 10 chars)</td></tr>
          <tr><td><code>quantity</code></td><td><code>number</code></td><td>No</td><td>Item quantity (positive integer)</td></tr>
          <tr><td><code>description</code></td><td><code>string</code></td><td>No</td><td>Item description (max 500)</td></tr>
          <tr><td><code>productPlanId</code></td><td><code>string</code></td><td>No</td><td>Link to a product plan</td></tr>
          <tr><td><code>productPlanPriceId</code></td><td><code>string</code></td><td>No</td><td>Specific price option</td></tr>
          <tr><td><code>isPriceOption</code></td><td><code>boolean</code></td><td>No</td><td>Whether to use price option</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const session = await noderails.checkoutSessions.create({
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
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

// Redirect your customer to the hosted payment page:
// https://pay.noderails.com/checkout/{session.id}
console.log(session.id);     // UUID
console.log(session.status); // "OPEN"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl -X POST https://api.noderails.com/checkout-sessions \\
  -H "x-api-key: nr_live_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "your-app-id",
    "successUrl": "https://example.com/success",
    "cancelUrl": "https://example.com/cancel",
    "items": [{
      "name": "Pro Plan",
      "amount": "49.99",
      "currency": "USD",
      "quantity": 1
    }]
  }'`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List checkout sessions</h2>
      <Endpoint method="GET" path="/checkout-sessions" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>status</code></td><td><code>&quot;OPEN&quot; | &quot;COMPLETE&quot; | &quot;EXPIRED&quot;</code></td><td>Filter by status</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (1–100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.checkoutSessions.list({
  status: 'OPEN',
  page: 1,
  pageSize: 25,
});

console.log(result.data);       // CheckoutSession[]
console.log(result.pagination); // { total, page, pageSize, totalPages }`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a checkout session</h2>
      <Endpoint method="GET" path="/checkout-sessions/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const session = await noderails.checkoutSessions.retrieve('cs_abc123');
console.log(session.status); // "OPEN" | "COMPLETE" | "EXPIRED"`}
      />

      <hr />

      {/* --- EXPIRE --- */}
      <h2>Expire a checkout session</h2>
      <Endpoint method="POST" path="/checkout-sessions/:id/expire" />

      <p>Manually expires an open checkout session, preventing any further payments.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const expired = await noderails.checkoutSessions.expire('cs_abc123');
console.log(expired.status); // "EXPIRED"`}
      />

      <hr />

      {/* --- FROM LINK --- */}
      <h2>Create from payment link</h2>
      <Endpoint method="POST" path="/checkout-sessions/from-link" />

      <p>Creates a checkout session from a payment link slug. This is a <strong>public</strong> endpoint, no authentication required.</p>

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>slug</code></td><td><code>string</code></td><td>Yes</td><td>Payment link slug (1–100 chars)</td></tr>
        </tbody>
      </table>

      <hr />

      {/* --- FROM INVOICE --- */}
      <h2>Create from invoice</h2>
      <Endpoint method="POST" path="/checkout-sessions/from-invoice" />

      <p>Creates a checkout session from an invoice ID. This is a <strong>public</strong> endpoint, no authentication required.</p>

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>invoiceId</code></td><td><code>string</code></td><td>Yes</td><td>Invoice UUID</td></tr>
        </tbody>
      </table>

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code> with <code>total</code>, <code>page</code>,{' '}
        <code>pageSize</code>, and <code>totalPages</code>.
      </p>

      <CodeBlock
        language="json"
        title="CheckoutSession object (create / expire)"
        code={`{
  "success": true,
  "data": {
    "id": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
    "appId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "customerAccountId": null,
    "paymentIntentId": null,
    "mode": "PAYMENT",
    "status": "OPEN",
    "sourceType": "CHECKOUT",
    "sourceId": null,
    "amount": "49.99",
    "currency": "USD",
    "subtotal": "49.99",
    "taxAmount": "0",
    "taxDescription": null,
    "allowedChains": "ALL",
    "allowedTokens": "ALL",
    "successUrl": "https://example.com/success",
    "cancelUrl": "https://example.com/cancel",
    "selectedPriceId": null,
    "requireBillingDetails": false,
    "metadata": { "orderId": "order_123" },
    "expiresAt": "2025-01-16T10:30:00.000Z",
    "completedAt": null,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "items": [
      {
        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "checkoutSessionId": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
        "productPlanId": null,
        "productPlanPriceId": null,
        "name": "Pro Plan",
        "description": null,
        "amount": "49.99",
        "currency": "USD",
        "quantity": 1,
        "isPriceOption": false,
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  }
}`}
      />

      <ResponseTable title="CheckoutSession fields">
        <ResponseField name="id" type="string" description="Unique checkout session UUID" />
        <ResponseField name="appId" type="string" description="App this session belongs to" />
        <ResponseField name="customerAccountId" type="string | null" description="Linked customer UUID, if any" />
        <ResponseField name="paymentIntentId" type="string | null" description="Associated payment intent UUID once payment begins" />
        <ResponseField name="mode" type="string" description="PAYMENT or SUBSCRIPTION" />
        <ResponseField name="status" type="string" description="OPEN, COMPLETE, or EXPIRED" />
        <ResponseField name="sourceType" type="string" description="Origin type: CHECKOUT, PAYMENT_LINK, INVOICE, or SUBSCRIPTION" />
        <ResponseField name="sourceId" type="string | null" description="ID of the originating resource (payment link, invoice, etc.)" />
        <ResponseField name="amount" type="string" description="Total payment amount as a decimal string" />
        <ResponseField name="currency" type="string" description="Fiat currency code (e.g. USD)" />
        <ResponseField name="subtotal" type="string" description="Amount before tax" />
        <ResponseField name="taxAmount" type="string" description="Calculated tax amount" />
        <ResponseField name="taxDescription" type="string | null" description="Tax label shown to customer (e.g. 'VAT 20%')" />
        <ResponseField name="allowedChains" type="'ALL' | number[]" description="Permitted chain IDs (EVM + Solana e.g. 103)" />
        <ResponseField name="allowedTokens" type="'ALL' | string[]" description="Permitted token identifiers" />
        <ResponseField name="successUrl" type="string" description="Redirect URL after successful payment" />
        <ResponseField name="cancelUrl" type="string" description="Redirect URL on cancellation" />
        <ResponseField name="selectedPriceId" type="string | null" description="Selected product plan price UUID" />
        <ResponseField name="requireBillingDetails" type="boolean" description="Whether billing details are required at checkout" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="expiresAt" type="string" description="ISO 8601 expiration timestamp" />
        <ResponseField name="completedAt" type="string | null" description="ISO 8601 timestamp when session completed" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
        <ResponseField name="items" type="CheckoutSessionItem[]" description="Line items in this session" />
      </ResponseTable>

      <ResponseTable title="CheckoutSessionItem fields">
        <ResponseField name="id" type="string" description="Item UUID" />
        <ResponseField name="checkoutSessionId" type="string" description="Parent checkout session UUID" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan UUID" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price UUID" />
        <ResponseField name="name" type="string" description="Item display name" />
        <ResponseField name="description" type="string | null" description="Item description" />
        <ResponseField name="amount" type="string" description="Price per unit as decimal string" />
        <ResponseField name="currency" type="string" description="Currency code" />
        <ResponseField name="quantity" type="number" description="Item quantity" />
        <ResponseField name="isPriceOption" type="boolean" description="Whether this item uses a price option" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
      </ResponseTable>

      <Callout type="info" title="Retrieve response">
        The <strong>retrieve</strong> endpoint returns additional nested objects:{' '}
        <code>app</code> (full app record), <code>paymentIntent</code> (full payment intent),
        and each item includes <code>productPlan</code> and <code>productPlanPrice</code> when linked.
      </Callout>
    </>
  );
}
