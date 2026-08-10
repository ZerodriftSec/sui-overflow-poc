import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SubscriptionsPage() {
  return (
    <>
      <h1>Subscriptions</h1>
      <p className="subtitle">
        Subscriptions enable recurring crypto payments. Create a subscription tied to a product
        plan and price, then manage its lifecycle through pause, resume, and cancel actions.
      </p>

      <Callout type="info" title="Solana and subscriptions">
        Subscription renewals use <strong>EVM ERC-20</strong> pulls (approve / permit). <strong>Solana</strong> is supported
        for <strong>one-time</strong> payments (checkout sessions, payment links, payment intents)—see the <a href="/docs/getting-started">Quick Start</a> chain list.
      </Callout>

      <h2>Subscription lifecycle</h2>
      <CodeBlock
        language="text"
        title="Status flow"
        code={`PENDING → ACTIVE → PAUSED → ACTIVE (resume)
                   ↘ CANCELLED
                   ↘ PAST_DUE → CANCELLED`}
      />

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a subscription</h2>
      <Endpoint method="POST" path="/subscriptions" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>customerAccountId</code></td><td><code>string</code></td><td>Yes</td><td>Customer UUID</td></tr>
          <tr><td><code>productPlanId</code></td><td><code>string</code></td><td>Yes</td><td>Product plan UUID</td></tr>
          <tr><td><code>productPlanPriceId</code></td><td><code>string</code></td><td>Yes</td><td>Specific price UUID</td></tr>
          <tr><td><code>allowedChains</code></td><td><code>&quot;ALL&quot; | number[]</code></td><td>No</td><td>Allowed EVM chain IDs (subscriptions are ERC-20 based)</td></tr>
          <tr><td><code>allowedTokens</code></td><td><code>&quot;ALL&quot; | string[]</code></td><td>No</td><td>Allowed token identifiers</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const subscription = await noderails.subscriptions.create({
  customerAccountId: 'cust_abc123',
  productPlanId: 'plan_xyz',
  productPlanPriceId: 'price_monthly',
  allowedChains: [1, 137],
});

console.log(subscription.id);     // "sub_abc123"
console.log(subscription.status); // "PENDING"`}
      />

      <Callout type="info" title="Initial payment">
        After creating a subscription, use the <strong>Create checkout</strong> endpoint to
        generate a payment page for the first billing period.
      </Callout>

      <hr />

      {/* --- CREATE CHECKOUT --- */}
      <h2>Create subscription checkout</h2>
      <Endpoint method="POST" path="/subscriptions/:id/checkout" />

      <p>
        Creates a checkout session for the subscription&apos;s initial payment. The customer pays
        through the hosted checkout, and the subscription moves to <code>ACTIVE</code> on success.
      </p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const checkout = await noderails.subscriptions.createCheckout('sub_abc123');
console.log(checkout.url); // Redirect customer here`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List subscriptions</h2>
      <Endpoint method="GET" path="/subscriptions" />

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
        code={`const result = await noderails.subscriptions.list({
  status: 'ACTIVE',
  page: 1,
});

for (const sub of result.data) {
  console.log(sub.id, sub.status, sub.currentPeriodEnd);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a subscription</h2>
      <Endpoint method="GET" path="/subscriptions/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const sub = await noderails.subscriptions.retrieve('sub_abc123');
console.log(sub.productPlan);    // { name: "Pro Plan", ... }
console.log(sub.currentPeriodEnd); // "2025-02-15T00:00:00.000Z"`}
      />

      <hr />

      {/* --- PAUSE --- */}
      <h2>Pause a subscription</h2>
      <Endpoint method="POST" path="/subscriptions/:id/pause" />

      <p>Pauses an active subscription. No further invoices are generated until resumed.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const paused = await noderails.subscriptions.pause('sub_abc123');
console.log(paused.status); // "PAUSED"`}
      />

      <hr />

      {/* --- RESUME --- */}
      <h2>Resume a subscription</h2>
      <Endpoint method="POST" path="/subscriptions/:id/resume" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const resumed = await noderails.subscriptions.resume('sub_abc123');
console.log(resumed.status); // "ACTIVE"`}
      />

      <hr />

      {/* --- CANCEL --- */}
      <h2>Cancel a subscription</h2>
      <Endpoint method="POST" path="/subscriptions/:id/cancel" />

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>cancelAtPeriodEnd</code></td><td><code>boolean</code></td><td>No</td><td>If true, cancel at end of current period (default: false = immediate)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`// Cancel at end of billing period
const cancelled = await noderails.subscriptions.cancel('sub_abc123', {
  cancelAtPeriodEnd: true,
});

// Cancel immediately
const cancelled2 = await noderails.subscriptions.cancel('sub_abc123');`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code>.
      </p>

      <CodeBlock
        language="json"
        title="Subscription object (create)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "customerAccountId": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "productPlanId": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
    "productPlanPriceId": "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b",
    "status": "PENDING",
    "customerWalletId": null,
    "authorizationMethod": null,
    "authorizationChainId": null,
    "authorizationTokenKey": null,
    "permitSignature": null,
    "permitDeadline": null,
    "permitNonce": null,
    "approvedAllowance": null,
    "currentPeriodStart": null,
    "currentPeriodEnd": null,
    "billingCycleAnchor": null,
    "trialStart": null,
    "trialEnd": null,
    "cancelAt": null,
    "cancelledAt": null,
    "cancelAtPeriodEnd": false,
    "pausedAt": null,
    "pastDueSince": null,
    "captureRetryCount": 0,
    "maxCaptureRetries": 3,
    "pendingJobId": null,
    "allowedChains": [1, 137],
    "allowedTokens": "ALL",
    "metadata": {},
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "productPlan": {
      "id": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
      "name": "Pro Plan",
      "planType": "SUBSCRIPTION"
    },
    "productPlanPrice": {
      "id": "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b",
      "amount": "9.99",
      "currency": "USD",
      "billingInterval": "MONTH",
      "billingIntervalCount": 1,
      "nickname": "Monthly"
    }
  }
}`}
      />

      <ResponseTable title="Subscription fields">
        <ResponseField name="id" type="string" description="Unique subscription UUID" />
        <ResponseField name="appId" type="string" description="App this subscription belongs to" />
        <ResponseField name="customerAccountId" type="string" description="Customer UUID" />
        <ResponseField name="productPlanId" type="string" description="Product plan UUID" />
        <ResponseField name="productPlanPriceId" type="string" description="Selected price UUID" />
        <ResponseField name="status" type="string" description="PENDING, ACTIVE, PAUSED, CANCELLED, or PAST_DUE" />
        <ResponseField name="customerWalletId" type="string | null" description="Wallet used for payments" />
        <ResponseField name="authorizationMethod" type="string | null" description="DIRECT, PERMIT, or APPROVAL" />
        <ResponseField name="authorizationChainId" type="number | null" description="Chain ID for recurring charges" />
        <ResponseField name="authorizationTokenKey" type="string | null" description="Token key for recurring charges" />
        <ResponseField name="permitSignature" type="string | null" description="EIP-2612 permit signature" />
        <ResponseField name="permitDeadline" type="string | null" description="Permit expiration timestamp" />
        <ResponseField name="permitNonce" type="string | null" description="Permit nonce" />
        <ResponseField name="approvedAllowance" type="string | null" description="ERC-20 approved allowance amount" />
        <ResponseField name="currentPeriodStart" type="string | null" description="ISO 8601 current billing period start" />
        <ResponseField name="currentPeriodEnd" type="string | null" description="ISO 8601 current billing period end" />
        <ResponseField name="billingCycleAnchor" type="string | null" description="ISO 8601 anchor date for billing cycles" />
        <ResponseField name="trialStart" type="string | null" description="ISO 8601 trial start" />
        <ResponseField name="trialEnd" type="string | null" description="ISO 8601 trial end" />
        <ResponseField name="cancelAt" type="string | null" description="ISO 8601 scheduled cancellation date" />
        <ResponseField name="cancelledAt" type="string | null" description="ISO 8601 actual cancellation timestamp" />
        <ResponseField name="cancelAtPeriodEnd" type="boolean" description="Whether to cancel at end of current period" />
        <ResponseField name="pausedAt" type="string | null" description="ISO 8601 pause timestamp" />
        <ResponseField name="pastDueSince" type="string | null" description="ISO 8601 timestamp when subscription became past due" />
        <ResponseField name="captureRetryCount" type="number" description="Number of failed capture attempts this cycle" />
        <ResponseField name="maxCaptureRetries" type="number" description="Maximum capture retries before marking past due" />
        <ResponseField name="pendingJobId" type="string | null" description="Internal scheduler job ID" />
        <ResponseField name="allowedChains" type="'ALL' | number[]" description="Permitted EVM chain IDs for subscription billing" />
        <ResponseField name="allowedTokens" type="'ALL' | string[]" description="Permitted token identifiers" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>

      <Callout type="info" title="Endpoint variations">
        <strong>Create</strong> includes <code>productPlan</code> and <code>productPlanPrice</code>.{' '}
        <strong>List</strong> adds <code>customerAccount</code> and <code>productPlan.taxRate</code>.{' '}
        <strong>Retrieve</strong> is the richest: includes <code>app</code>, <code>customerAccount</code>,{' '}
        <code>customerWallet</code>, <code>productPlan.taxRate</code>, and the last 10{' '}
        <code>invoices</code> (with items, taxRate, and paymentIntent).{' '}
        <strong>Pause/resume/cancel</strong> return scalar fields only (no relations).
      </Callout>
    </>
  );
}
