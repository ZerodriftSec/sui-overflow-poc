import { CodeBlock, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKPaymentIntentsPage() {
  return (
    <>
      <h1>Payment Intents</h1>
      <p className="subtitle">
        Payment intents are the core payment object. Every checkout session creates a payment intent
        under the hood when the customer pays. You can also create payment intents directly for
        more control over the payment flow.
      </p>

      <Callout type="info" title="Payment intent lifecycle">
        A payment intent moves through these states: <code>CREATED</code> → <code>AUTHORIZED</code> → <code>CAPTURED</code> → <code>SETTLED</code>.
        It can also be <code>CANCELLED</code> (before capture) or <code>REFUNDED</code> (after capture).
        If a dispute is raised, it moves to <code>DISPUTED</code> and then <code>DISPUTE_RESOLVED</code> or <code>DISPUTE_LOST</code>.
      </Callout>

      <h2>Create a payment intent</h2>

      <CodeBlock
        language="typescript"
        title="Create payment intent"
        code={`const intent = await noderails.paymentIntents.create({
  amount: '100.00',
  currency: 'USD',
  captureMode: 'AUTOMATIC',
  allowedChains: [1, 137, 42161, 103],   // Ethereum, Polygon, Arbitrum, Solana mainnet
  allowedTokens: ['USDC', 'USDT', 'SOL'],
  externalId: 'order_456',                 // Your internal order ID
  metadata: { plan: 'enterprise' },
});

console.log(intent.id);     // Payment intent ID
console.log(intent.status); // "CREATED"`}
      />

      <h2>Retrieve a payment intent</h2>
      <p>
        Check a payment intent&apos;s status at any time. Useful for polling or verifying the
        state after receiving a webhook.
      </p>

      <CodeBlock
        language="typescript"
        title="Check payment status"
        code={`const intent = await noderails.paymentIntents.retrieve('payment-intent-id');

console.log(intent.status);           // Current status
console.log(intent.amount);           // Fiat amount
console.log(intent.cryptoAmount);     // Crypto amount paid
console.log(intent.captureTxHash);    // On-chain capture transaction hash
console.log(intent.authorizationChainId);  // Chain the payment was made on
console.log(intent.authorizationTokenKey); // Token used (e.g., "USDC-8453", "SOL-103")
console.log(intent.externalId);       // Your order reference`}
      />

      <h2>List payment intents</h2>

      <CodeBlock
        language="typescript"
        title="List and filter"
        code={`// List all captured payments
const captured = await noderails.paymentIntents.list({
  status: 'CAPTURED',
  page: 1,
  pageSize: 50,
});

for (const intent of captured.data) {
  console.log(intent.id, intent.amount, intent.cryptoAmount);
}`}
      />

      <h2>Cancel a payment intent</h2>
      <p>
        Cancel a payment that hasn&apos;t been captured yet. This releases the authorized funds
        back to the customer.
      </p>

      <CodeBlock
        language="typescript"
        title="Cancel"
        code={`const cancelled = await noderails.paymentIntents.cancel('payment-intent-id');
console.log(cancelled.status); // "CANCELLED"`}
      />

      <h2>Refund a payment</h2>
      <p>
        Refund a captured payment. The funds are sent back to the customer&apos;s wallet on-chain.
      </p>

      <CodeBlock
        language="typescript"
        title="Refund"
        code={`const refunded = await noderails.paymentIntents.refund('payment-intent-id', {
  reason: 'Customer requested refund',
});
      console.log(refunded.status); // Updated payment status`}
      />

      <Callout type="warning" title="Refund timing">
        Refunds are processed on-chain and may take a few minutes to complete depending on
        the network. Track <code>refundTxHash</code> and webhook events to confirm completion.
      </Callout>

      <h2>Webhooks</h2>
      <p>
        Listen for these events to track payment intent state changes:
      </p>

      <table>
        <thead>
          <tr><th>Event</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>payment.authorized</code></td><td>Customer gave approval to pull money from their wallet</td></tr>
          <tr><td><code>payment.captured</code></td><td>Funds taken from wallet, locked in escrow, and confirmed on-chain</td></tr>
          <tr><td><code>payment.settled</code></td><td>Funds released to your merchant wallet</td></tr>
          <tr><td><code>payment.refunded</code></td><td>Refund completed on-chain</td></tr>
          <tr><td><code>payment.disputed</code></td><td>Customer raised a dispute</td></tr>
        </tbody>
      </table>

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new payment intent</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a payment intent by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List payment intents with optional filters</td></tr>
          <tr><td><code>cancel(id)</code></td><td>Cancel an authorized payment</td></tr>
          <tr><td><code>refund(id, params?)</code></td><td>Refund a captured payment</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  PaymentIntent,
  PaymentIntentCreateParams,
  PaymentIntentListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> response</h3>
      <p>Returns all scalar fields only (no relations):</p>
      <ResponseTable title="PaymentIntent (create)">
        <ResponseField name="id" type="string" description="Unique payment intent ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="customerAccountId" type="string | null" description="Linked customer" />
        <ResponseField name="externalId" type="string | null" description="Your external reference ID" />
        <ResponseField name="amount" type="string" description="Fiat amount (Decimal as string, e.g. &quot;100.00&quot;)" />
        <ResponseField name="currency" type="string" description="Currency code, e.g. &quot;USD&quot;" />
        <ResponseField name="allowedChains" type="string | number[]" description="&quot;ALL&quot; or array of chain IDs (EVM + Solana e.g. 103)" />
        <ResponseField name="allowedTokens" type="string | string[]" description="&quot;ALL&quot; or array of token symbols" />
        <ResponseField name="captureMode" type="string" description="&quot;AUTOMATIC&quot; or &quot;MANUAL&quot;" />
        <ResponseField name="timelockDuration" type="number" description="Escrow timelock in seconds (default 604800 = 7 days)" />
        <ResponseField name="disputeStartDuration" type="number" description="Dispute window in seconds (default 86400 = 1 day)" />
        <ResponseField name="status" type="string" description="&quot;CREATED&quot; at creation" />
        <ResponseField name="authorizationMethod" type="null" description="Set when customer authorizes" />
        <ResponseField name="authorizationChainId" type="null" description="Chain used for payment" />
        <ResponseField name="authorizationTokenKey" type="null" description="Token key used (e.g. &quot;USDC-8453&quot;, &quot;SOL-103&quot;)" />
        <ResponseField name="authorizationWalletAddress" type="null" description="Customer wallet address" />
        <ResponseField name="authorizationTxHash" type="null" description="Authorization transaction hash" />
        <ResponseField name="authorizedAt" type="null" description="Timestamp when authorized" />
        <ResponseField name="cryptoAmount" type="null" description="Crypto amount in smallest unit" />
        <ResponseField name="cryptoTokenKey" type="null" description="Token key of crypto used" />
        <ResponseField name="cryptoTokenDecimals" type="null" description="Token decimals" />
        <ResponseField name="exchangeRate" type="null" description="USD-to-crypto exchange rate used" />
        <ResponseField name="captureTxHash" type="null" description="Capture transaction hash" />
        <ResponseField name="capturedAt" type="null" description="Timestamp when captured" />
        <ResponseField name="captureAttempts" type="number" description="Number of capture attempts (0)" />
        <ResponseField name="timelockEndsAt" type="null" description="When escrow timelock expires" />
        <ResponseField name="settledAt" type="null" description="Timestamp when settled" />
        <ResponseField name="refundedAt" type="null" description="Timestamp when refunded" />
        <ResponseField name="refundTxHash" type="null" description="Refund transaction hash" />
        <ResponseField name="refundReason" type="null" description="Reason for refund" />
        <ResponseField name="platformFeeBps" type="null" description="Platform fee in basis points" />
        <ResponseField name="expiresAt" type="string | null" description="ISO 8601 expiration timestamp" />
        <ResponseField name="sourceType" type="string | null" description="What created this intent (CHECKOUT_SESSION, INVOICE, etc.)" />
        <ResponseField name="sourceId" type="string | null" description="ID of the source entity" />
        <ResponseField name="successUrl" type="string | null" description="Redirect URL after payment" />
        <ResponseField name="cancelUrl" type="string | null" description="Redirect URL if cancelled" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="idempotencyKey" type="string | null" description="Idempotency key if provided" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Returns all scalar fields from <code>create()</code> above, plus three nested relations:
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="transactions" type="Transaction[]" description="On-chain transactions for this intent" />
        <ResponseField name="dispute" type="Dispute | null" description="Dispute details if one exists" />
        <ResponseField name="customerAccount" type="CustomerAccount | null" description="Customer who paid" />
      </ResponseTable>

      <ResponseTable title="Transaction (nested in transactions[])">
        <ResponseField name="id" type="string" description="Transaction record ID (UUID)" />
        <ResponseField name="paymentIntentId" type="string | null" description="Linked payment intent" />
        <ResponseField name="mtxmTxId" type="string | null" description="MTXM service transaction ID" />
        <ResponseField name="txHash" type="string | null" description="On-chain transaction hash" />
        <ResponseField name="chain" type="string" description="Chain identifier" />
        <ResponseField name="type" type="string" description="AUTHORIZE, CAPTURE, SETTLE, DISPUTE, REFUND, or PAYOUT" />
        <ResponseField name="status" type="string" description="PENDING, CONFIRMED, or FAILED" />
        <ResponseField name="blockNumber" type="number | null" description="Block number when confirmed" />
        <ResponseField name="gasUsed" type="string | null" description="Gas used for the transaction" />
        <ResponseField name="error" type="string | null" description="Error message if failed" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
        <ResponseField name="confirmedAt" type="string | null" description="When the transaction was confirmed" />
      </ResponseTable>

      <ResponseTable title="Dispute (nested in dispute)">
        <ResponseField name="id" type="string" description="Dispute ID (UUID)" />
        <ResponseField name="paymentIntentId" type="string" description="Linked payment intent" />
        <ResponseField name="reason" type="string" description="Reason for the dispute" />
        <ResponseField name="evidence" type="string | null" description="Evidence submitted" />
        <ResponseField name="status" type="string" description="OPEN, RESOLVED_MERCHANT, or RESOLVED_PAYER" />
        <ResponseField name="resolvedBy" type="string | null" description="Who resolved the dispute" />
        <ResponseField name="deadline" type="string" description="Dispute resolution deadline" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
        <ResponseField name="resolvedAt" type="string | null" description="When it was resolved" />
      </ResponseTable>

      <h3><code>list()</code> response</h3>
      <p>
        Returns an array of payment intents. Each has all scalar fields plus <code>transactions[]</code>.
        No <code>dispute</code> or <code>customerAccount</code> in list.
      </p>
      <CodeBlock
        language="json"
        title="Paginated response shape"
        code={`{
  "success": true,
  "data": [ /* PaymentIntent[] with transactions */ ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}`}
      />

      <h3><code>cancel()</code> response</h3>
      <p>
        Returns all scalar fields only (no relations). The <code>status</code> field will be <code>&quot;CANCELLED&quot;</code>.
      </p>

      <h3><code>refund()</code> response</h3>
      <p>
        Returns the updated <code>PaymentIntent</code> object (same scalar shape as <code>create()</code>):
      </p>
      <ResponseTable title="Key refund fields">
        <ResponseField name="id" type="string" description="Payment intent ID" />
        <ResponseField name="status" type="string" description="Updated payment status (typically &quot;REFUNDED&quot; once finalized)" />
        <ResponseField name="refundReason" type="string | null" description="Refund reason you provided" />
        <ResponseField name="refundTxHash" type="string | null" description="On-chain refund tx hash (when available)" />
        <ResponseField name="refundedAt" type="string | null" description="Timestamp when refund is finalized" />
      </ResponseTable>
    </>
  );
}
