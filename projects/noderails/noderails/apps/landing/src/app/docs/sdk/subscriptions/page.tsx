import { CodeBlock, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKSubscriptionsPage() {
  return (
    <>
      <h1>Subscriptions</h1>
      <p className="subtitle">
        Subscriptions enable recurring crypto payments. Create a product plan with a price,
        then subscribe customers to it.
      </p>

      <Callout type="info" title="Solana">
        Renewals run on <strong>EVM ERC-20</strong> today. Use <strong>Solana</strong> for one-time checkout and payment intents; see <a href="/docs/getting-started">Quick Start</a> for chain IDs.
      </Callout>

      <h2>Full flow</h2>

      <h3>Step 1: Create a product plan and price</h3>
      <p>
        A subscription requires a product plan with at least one price. Plans define what you&apos;re
        selling, and prices define how much and how often the customer is billed.
      </p>

      <CodeBlock
        language="typescript"
        title="Set up your product"
        code={`// Create a product plan
const plan = await noderails.productPlans.create({
  name: 'Pro Plan',
  description: 'Full access to all features',
  planType: 'SUBSCRIPTION',
  prices: [
    {
      amount: '29.99',
      billingInterval: 'MONTH',
      billingIntervalCount: 1,
      nickname: 'Monthly',
      isDefault: true,
    },
  ],
});

const monthlyPrice = plan.prices![0];

// Add an annual price (optional)
const annualPrice = await noderails.productPlans.createPrice(plan.id, {
  amount: '299.00',
  currency: 'USD',
  billingInterval: 'YEAR',
  billingIntervalCount: 1,
  nickname: 'Annual',
});`}
      />

      <Callout type="info" title="Product Plans">
        See the <a href="/docs/sdk/product-plans">Product Plans</a> page for full details on
        creating and managing product plans and their prices.
      </Callout>

      <h3>Step 2: Create a customer</h3>

      <CodeBlock
        language="typescript"
        title="Create a customer"
        code={`const customer = await noderails.customers.create({
  email: 'alice@example.com',
  name: 'Alice',
  walletAddress: '0x...',   // Optional: their wallet address
});`}
      />

      <h3>Step 3: Create the subscription</h3>

      <CodeBlock
        language="typescript"
        title="Subscribe the customer"
        code={`const subscription = await noderails.subscriptions.create({
  customerAccountId: customer.id,
  productPlanId: plan.id,
  productPlanPriceId: monthlyPrice.id,
});

console.log(subscription.id);              // Subscription ID
console.log(subscription.status);          // "CREATED"
console.log(subscription.currentPeriodEnd); // Next billing date`}
      />

      <h3>Step 4: Create checkout for initial authorization</h3>
      <CodeBlock
        language="typescript"
        title="Create subscription checkout"
        code={`const checkout = await noderails.subscriptions.createCheckout(subscription.id);
console.log(checkout.id); // Checkout session ID
// Redirect customer to hosted checkout:
// https://pay.noderails.com/checkout/\${checkout.id}`}
      />

      <h2>Pause a subscription</h2>
      <p>Temporarily pause billing. The customer keeps access until the current period ends.</p>

      <CodeBlock
        language="typescript"
        title="Pause"
        code={`await noderails.subscriptions.pause('sub-id');`}
      />

      <h2>Resume a subscription</h2>

      <CodeBlock
        language="typescript"
        title="Resume"
        code={`await noderails.subscriptions.resume('sub-id');`}
      />

      <h2>Cancel a subscription</h2>

      <CodeBlock
        language="typescript"
        title="Cancel"
        code={`// Cancel at end of current period (customer keeps access until then)
await noderails.subscriptions.cancel('sub-id', {
  cancelAtPeriodEnd: true,
});

// Cancel immediately
await noderails.subscriptions.cancel('sub-id', {
  cancelAtPeriodEnd: false,
});`}
      />

      <h2>List subscriptions</h2>

      <CodeBlock
        language="typescript"
        title="List and filter"
        code={`// List all active subscriptions
const subs = await noderails.subscriptions.list({ status: 'ACTIVE' });

for (const sub of subs.data) {
  console.log(sub.id, sub.status, sub.currentPeriodEnd);
}`}
      />

      <h2>Retrieve a subscription</h2>
      <p>
        When you retrieve a subscription, the response includes the last 10 invoices. Each paid
        invoice includes its full payment intent with on-chain transaction details.
      </p>

      <CodeBlock
        language="typescript"
        title="Retrieve with payment details"
        code={`const sub = await noderails.subscriptions.retrieve('sub-id');
console.log(sub.status);           // "ACTIVE" | "PAUSED" | "CANCELLED"
console.log(sub.currentPeriodEnd); // Next billing date

// Each invoice includes its payment intent
for (const invoice of sub.invoices ?? []) {
  console.log(invoice.status);                              // "PAID"
  if (invoice.paymentIntent) {
    console.log(invoice.paymentIntent.status);               // "SETTLED"
    console.log(invoice.paymentIntent.captureTxHash);        // "0x..."
    console.log(invoice.paymentIntent.authorizationTokenKey); // "USDC-8453"
  }
}`}
      />

      <h2>Webhooks</h2>
      <table>
        <thead>
          <tr><th>Event</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>subscription.created</code></td><td>Subscription was created</td></tr>
          <tr><td><code>subscription.activated</code></td><td>Subscription became active</td></tr>
          <tr><td><code>subscription.renewed</code></td><td>Recurring payment was collected</td></tr>
          <tr><td><code>subscription.cancelled</code></td><td>Subscription was cancelled</td></tr>
          <tr><td><code>subscription.paused</code></td><td>Subscription was paused</td></tr>
          <tr><td><code>subscription.resumed</code></td><td>Subscription was resumed</td></tr>
        </tbody>
      </table>

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new subscription</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a subscription by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List subscriptions with optional filters</td></tr>
          <tr><td><code>pause(id)</code></td><td>Pause billing</td></tr>
          <tr><td><code>resume(id)</code></td><td>Resume a paused subscription</td></tr>
          <tr><td><code>cancel(id, params?)</code></td><td>Cancel a subscription</td></tr>
          <tr><td><code>createCheckout(id)</code></td><td>Create a hosted checkout session for initial authorization</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  Subscription,
  SubscriptionCreateParams,
  SubscriptionListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> response</h3>
      <ResponseTable title="Subscription (create)">
        <ResponseField name="id" type="string" description="Unique subscription ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="customerAccountId" type="string" description="Customer being subscribed" />
        <ResponseField name="productPlanId" type="string" description="Product plan ID" />
        <ResponseField name="productPlanPriceId" type="string" description="Price ID" />
        <ResponseField name="status" type="string" description="&quot;CREATED&quot; or &quot;TRIALING&quot;" />
        <ResponseField name="customerWalletId" type="null" description="Set after customer authorizes" />
        <ResponseField name="authorizationMethod" type="null" description="NATIVE, PERMIT, or EIP7702" />
        <ResponseField name="authorizationChainId" type="null" description="Chain selected for payments" />
        <ResponseField name="authorizationTokenKey" type="null" description="Token selected for payments" />
        <ResponseField name="permitSignature" type="null" description="Permit signature if applicable" />
        <ResponseField name="permitDeadline" type="null" description="Permit deadline if applicable" />
        <ResponseField name="permitNonce" type="null" description="Permit nonce if applicable" />
        <ResponseField name="approvedAllowance" type="null" description="ERC-20 allowance amount" />
        <ResponseField name="currentPeriodStart" type="string" description="Current billing period start" />
        <ResponseField name="currentPeriodEnd" type="string" description="Current billing period end" />
        <ResponseField name="billingCycleAnchor" type="string" description="Anchor date for billing" />
        <ResponseField name="trialStart" type="string | null" description="Trial start date if applicable" />
        <ResponseField name="trialEnd" type="string | null" description="Trial end date if applicable" />
        <ResponseField name="cancelAt" type="null" description="Scheduled cancellation date" />
        <ResponseField name="cancelledAt" type="null" description="When the subscription was cancelled" />
        <ResponseField name="cancelAtPeriodEnd" type="boolean" description="Whether cancel is deferred to period end" />
        <ResponseField name="pausedAt" type="null" description="When the subscription was paused" />
        <ResponseField name="pastDueSince" type="null" description="When subscription entered past-due state" />
        <ResponseField name="captureRetryCount" type="number" description="Current retry count for payments" />
        <ResponseField name="maxCaptureRetries" type="number" description="Max retries before cancellation" />
        <ResponseField name="allowedChains" type="string | number[]" description="&quot;ALL&quot; or array of chain IDs" />
        <ResponseField name="allowedTokens" type="string | string[]" description="&quot;ALL&quot; or array of token keys" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="productPlan" type="ProductPlan" description="Full product plan object" />
        <ResponseField name="productPlanPrice" type="ProductPlanPrice" description="Full price object" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Returns all fields from <code>create()</code> above, plus these additional nested objects.
        This is the most complete response:
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="app" type="App" description="Full app object" />
        <ResponseField name="productPlan.taxRate" type="TaxRate | null" description="Tax rate on the plan" />
        <ResponseField name="customerAccount" type="CustomerAccount" description="Full customer object" />
        <ResponseField name="customerWallet" type="CustomerWallet | null" description="Wallet used for payments (with chain info)" />
        <ResponseField name="invoices" type="Invoice[]" description="Last 10 invoices (descending by date)" />
      </ResponseTable>

      <Callout type="info" title="Invoices are richly nested">
        Each invoice in <code>invoices[]</code> includes its own <code>taxRate</code>, <code>items[]</code> (with each item&apos;s <code>taxRate</code>),
        and <code>paymentIntent</code> (full payment intent object). This gives you complete billing
        history with on-chain tx details in a single call.
      </Callout>

      <h3><code>list()</code> response</h3>
      <p>
        Returns a lighter response than <code>retrieve()</code>. Each subscription includes
        <code>productPlan</code> (with <code>taxRate</code>), <code>productPlanPrice</code>,
        and <code>customerAccount</code>. Does not include <code>app</code>, <code>customerWallet</code>,
        or <code>invoices</code>.
      </p>
      <CodeBlock
        language="json"
        title="Paginated response shape"
        code={`{
  "success": true,
  "data": [ /* Subscription[] */ ],
  "pagination": {
    "total": 15,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}`}
      />

      <h3><code>pause()</code>, <code>resume()</code>, <code>cancel()</code> response</h3>
      <p>
        All three return the subscription with scalar fields only (no relations).
        Key fields that change:
      </p>
      <ResponseTable title="State changes per action">
        <ResponseField name="pause → status" type="string" description="&quot;PAUSED&quot;, pausedAt is set" />
        <ResponseField name="resume → status" type="string" description="&quot;ACTIVE&quot;, pausedAt is cleared, new period dates set" />
        <ResponseField name="cancel → status" type="string" description="&quot;CANCELLED&quot; (immediate) or unchanged (if cancelAtPeriodEnd=true)" />
        <ResponseField name="cancel → cancelAtPeriodEnd" type="boolean" description="true if deferred, cancelAt is set to period end" />
      </ResponseTable>
    </>
  );
}
