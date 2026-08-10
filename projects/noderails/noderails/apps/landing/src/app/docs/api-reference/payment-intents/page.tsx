import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function PaymentIntentsPage() {
  return (
    <>
      <h1>Payment Intents</h1>
      <p className="subtitle">
        A payment intent represents a single payment from a customer. It tracks the lifecycle
        from creation through authorization and capture. Settlement happens automatically
        after the escrow timelock expires. You can also cancel or refund payments.
      </p>

      <h2>Payment intent lifecycle</h2>
      <CodeBlock
        language="text"
        title="Status flow"
        code={`CREATED → AUTHORIZED → CAPTURED → SETTLED
           ↘ CANCELLED
                       ↘ REFUND_PENDING → REFUNDED
                       ↘ FAILED`}
      />

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a payment intent</h2>
      <Endpoint method="POST" path="/payments/intents" />

      <Callout type="info" title="API key only">
        Creating payment intents requires a secret API key. JWT authentication is not supported
        for this endpoint.
      </Callout>

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>Yes</td><td>Payment amount (decimal string, e.g. &quot;99.99&quot;)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Fiat currency code (default: &quot;USD&quot;)</td></tr>
          <tr><td><code>customerAccountId</code></td><td><code>string</code></td><td>No</td><td>Existing customer UUID</td></tr>
          <tr><td><code>externalId</code></td><td><code>string</code></td><td>No</td><td>Your system&apos;s order or reference ID (max 255)</td></tr>
          <tr><td><code>allowedChains</code></td><td><code>&quot;ALL&quot; | number[]</code></td><td>No</td><td>Allowed blockchain chain IDs</td></tr>
          <tr><td><code>allowedTokens</code></td><td><code>&quot;ALL&quot; | string[]</code></td><td>No</td><td>Allowed token identifiers</td></tr>
          <tr><td><code>captureMode</code></td><td><code>&quot;AUTOMATIC&quot; | &quot;MANUAL&quot;</code></td><td>No</td><td>Whether to capture immediately or hold in escrow</td></tr>
          <tr><td><code>successUrl</code></td><td><code>string</code></td><td>No</td><td>Redirect URL after payment</td></tr>
          <tr><td><code>cancelUrl</code></td><td><code>string</code></td><td>No</td><td>Redirect URL on cancel</td></tr>
          <tr><td><code>idempotencyKey</code></td><td><code>string</code></td><td>No</td><td>Prevent duplicate intents (max 255)</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const intent = await noderails.paymentIntents.create({
  amount: '99.99',
  currency: 'USD',
  captureMode: 'AUTOMATIC',
  allowedChains: [1, 137, 42161],   // Ethereum, Polygon, Arbitrum
  allowedTokens: 'ALL',
  metadata: { orderId: 'order_456' },
  idempotencyKey: 'order_456',
});

console.log(intent.id);     // "pi_xyz789"
console.log(intent.status); // "CREATED"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl -X POST https://api.noderails.com/payments/intents \\
  -H "x-api-key: nr_live_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "99.99",
    "currency": "USD",
    "captureMode": "AUTOMATIC",
    "allowedChains": [1, 137],
    "metadata": { "orderId": "order_456" }
  }'`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List payment intents</h2>
      <Endpoint method="GET" path="/payments/intents" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>status</code></td><td><code>string</code></td><td>Filter by status</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (max 100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.paymentIntents.list({
  status: 'CAPTURED',
  page: 1,
  pageSize: 50,
});

for (const intent of result.data) {
  console.log(intent.id, intent.amount, intent.status);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a payment intent</h2>
      <Endpoint method="GET" path="/payments/intents/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const intent = await noderails.paymentIntents.retrieve('pi_xyz789');
console.log(intent.status);    // "CAPTURED"
console.log(intent.txHash);    // "0x..."
console.log(intent.chainId);   // 1`}
      />

      <hr />

      {/* --- CANCEL --- */}
      <h2>Cancel a payment intent</h2>
      <Endpoint method="POST" path="/payments/intents/:id/cancel" />

      <p>Cancels a payment intent that hasn&apos;t been captured yet.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const cancelled = await noderails.paymentIntents.cancel('pi_xyz789');
console.log(cancelled.status); // "CANCELLED"`}
      />

      <hr />

      {/* --- REFUND --- */}
      <h2>Refund a payment</h2>
      <Endpoint method="POST" path="/payments/intents/:id/refund" />

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>reason</code></td><td><code>string</code></td><td>Yes</td><td>Refund reason (1–500 chars)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const refunded = await noderails.paymentIntents.refund('pi_xyz789', {
  reason: 'Customer requested refund',
});

console.log(refunded.status); // "REFUND_PENDING"`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code> with <code>total</code>, <code>page</code>,{' '}
        <code>pageSize</code>, and <code>totalPages</code>.
      </p>

      <CodeBlock
        language="json"
        title="PaymentIntent object (create / cancel)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "customerAccountId": null,
    "externalId": "order_456",
    "amount": "99.99",
    "currency": "USD",
    "allowedChains": [1, 137, 42161],
    "allowedTokens": "ALL",
    "captureMode": "AUTOMATIC",
    "timelockDuration": 86400,
    "disputeStartDuration": 43200,
    "status": "CREATED",
    "authorizationMethod": null,
    "authorizationChainId": null,
    "authorizationTokenKey": null,
    "authorizationWalletAddress": null,
    "authorizationTxHash": null,
    "authorizationSignature": null,
    "authorizedAt": null,
    "cryptoAmount": null,
    "cryptoTokenKey": null,
    "cryptoTokenDecimals": null,
    "exchangeRate": null,
    "captureTxHash": null,
    "capturedAt": null,
    "captureAttempts": 0,
    "timelockEndsAt": null,
    "settledAt": null,
    "refundedAt": null,
    "refundTxHash": null,
    "refundReason": null,
    "platformFeeBps": 0,
    "expiresAt": "2025-01-16T10:30:00.000Z",
    "sourceType": null,
    "sourceId": null,
    "successUrl": null,
    "cancelUrl": null,
    "metadata": { "orderId": "order_456" },
    "idempotencyKey": "order_456",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}`}
      />

      <ResponseTable title="PaymentIntent fields">
        <ResponseField name="id" type="string" description="Unique payment intent UUID" />
        <ResponseField name="appId" type="string" description="App this payment belongs to" />
        <ResponseField name="customerAccountId" type="string | null" description="Linked customer UUID" />
        <ResponseField name="externalId" type="string | null" description="Your system's order or reference ID" />
        <ResponseField name="amount" type="string" description="Payment amount as a decimal string" />
        <ResponseField name="currency" type="string" description="Fiat currency code (e.g. USD)" />
        <ResponseField name="allowedChains" type="'ALL' | number[]" description="Permitted blockchain chain IDs" />
        <ResponseField name="allowedTokens" type="'ALL' | string[]" description="Permitted token identifiers" />
        <ResponseField name="captureMode" type="string" description="AUTOMATIC or MANUAL" />
        <ResponseField name="timelockDuration" type="number" description="Escrow lock duration in seconds" />
        <ResponseField name="disputeStartDuration" type="number" description="Window (seconds) after capture during which a dispute can start" />
        <ResponseField name="status" type="string" description="CREATED, AUTHORIZED, CAPTURED, SETTLED, CANCELLED, REFUND_PENDING, REFUNDED, or FAILED" />
        <ResponseField name="authorizationMethod" type="string | null" description="DIRECT, PERMIT, or APPROVAL" />
        <ResponseField name="authorizationChainId" type="number | null" description="Chain ID used for payment" />
        <ResponseField name="authorizationTokenKey" type="string | null" description="Token key used for payment" />
        <ResponseField name="authorizationWalletAddress" type="string | null" description="Payer wallet address" />
        <ResponseField name="authorizationTxHash" type="string | null" description="On-chain authorization tx hash" />
        <ResponseField name="authorizationSignature" type="string | null" description="EIP-2612 permit signature, if applicable" />
        <ResponseField name="authorizedAt" type="string | null" description="ISO 8601 timestamp of authorization" />
        <ResponseField name="cryptoAmount" type="string | null" description="Token amount paid (raw units)" />
        <ResponseField name="cryptoTokenKey" type="string | null" description="Token key of the payment token" />
        <ResponseField name="cryptoTokenDecimals" type="number | null" description="Decimal precision of the payment token" />
        <ResponseField name="exchangeRate" type="string | null" description="USD-to-token exchange rate at time of payment" />
        <ResponseField name="captureTxHash" type="string | null" description="On-chain capture tx hash" />
        <ResponseField name="capturedAt" type="string | null" description="ISO 8601 capture timestamp" />
        <ResponseField name="captureAttempts" type="number" description="Number of capture attempts" />
        <ResponseField name="timelockEndsAt" type="string | null" description="ISO 8601 timestamp when the escrow timelock expires" />
        <ResponseField name="settledAt" type="string | null" description="ISO 8601 settlement timestamp" />
        <ResponseField name="refundedAt" type="string | null" description="ISO 8601 refund timestamp" />
        <ResponseField name="refundTxHash" type="string | null" description="On-chain refund tx hash" />
        <ResponseField name="refundReason" type="string | null" description="Reason for refund" />
        <ResponseField name="platformFeeBps" type="number" description="Platform fee in basis points" />
        <ResponseField name="expiresAt" type="string | null" description="ISO 8601 expiration timestamp" />
        <ResponseField name="sourceType" type="string | null" description="Origin: CHECKOUT, PAYMENT_LINK, INVOICE, or SUBSCRIPTION" />
        <ResponseField name="sourceId" type="string | null" description="ID of the originating resource" />
        <ResponseField name="successUrl" type="string | null" description="Redirect URL after payment" />
        <ResponseField name="cancelUrl" type="string | null" description="Redirect URL on cancel" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="idempotencyKey" type="string | null" description="Deduplication key" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>

      <Callout type="info" title="Retrieve and list include relations">
        The <strong>retrieve</strong> endpoint adds nested <code>transactions</code> (Transaction[]),{' '}
        <code>dispute</code> (Dispute | null), and <code>customerAccount</code> (CustomerAccount | null).
        The <strong>list</strong> endpoint includes <code>transactions</code> only.
      </Callout>

      <h3>Refund response</h3>
      <p>The refund endpoint returns a custom object, not a full PaymentIntent:</p>
      <CodeBlock
        language="json"
        title="Refund response"
        code={`{
  "success": true,
  "data": {
    "paymentIntentId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "transactionId": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "mtxmTxId": "mtxm_tx_id",
    "txHash": "0x...",
    "status": "PENDING"
  }
}`}
      />
    </>
  );
}
