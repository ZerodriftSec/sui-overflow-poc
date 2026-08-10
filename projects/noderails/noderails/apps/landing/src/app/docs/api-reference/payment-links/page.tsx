import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function PaymentLinksPage() {
  return (
    <>
      <h1>Payment Links</h1>
      <p className="subtitle">
        Payment links are shareable URLs that let you accept crypto payments without writing any
        code. Create a link, share it with your customer, and get paid.
      </p>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a payment link</h2>
      <Endpoint method="POST" path="/payment-links" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>name</code></td><td><code>string</code></td><td>Yes</td><td>Link name (1–255 chars)</td></tr>
          <tr><td><code>slug</code></td><td><code>string</code></td><td>Yes</td><td>URL slug (lowercase, alphanumeric + hyphens, 1–100)</td></tr>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>No</td><td>Fixed amount (decimal string)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Currency code (max 10)</td></tr>
          <tr><td><code>description</code></td><td><code>string</code></td><td>No</td><td>Link description (max 2000)</td></tr>
          <tr><td><code>productPlanId</code></td><td><code>string</code></td><td>No</td><td>Link to a product plan</td></tr>
          <tr><td><code>productPlanPriceId</code></td><td><code>string</code></td><td>No</td><td>Specific price option</td></tr>
          <tr><td><code>allowedChains</code></td><td><code>&quot;ALL&quot; | number[]</code></td><td>No</td><td>Allowed chain IDs (EVM + Solana clusters e.g. 103)</td></tr>
          <tr><td><code>allowedTokens</code></td><td><code>&quot;ALL&quot; | string[]</code></td><td>No</td><td>Allowed token identifiers</td></tr>
          <tr><td><code>successUrl</code></td><td><code>string</code></td><td>No</td><td>Redirect on success</td></tr>
          <tr><td><code>cancelUrl</code></td><td><code>string</code></td><td>No</td><td>Redirect on cancel</td></tr>
          <tr><td><code>requireBillingDetails</code></td><td><code>boolean</code></td><td>No</td><td>Require billing info at checkout</td></tr>
          <tr><td><code>taxRateId</code></td><td><code>string</code></td><td>No</td><td>Apply a tax rate</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const link = await noderails.paymentLinks.create({
  name: 'Pro Plan',
  slug: 'pro-plan',
  amount: '49.99',
  currency: 'USD',
  description: 'Subscribe to our Pro Plan',
  successUrl: 'https://example.com/success',
});

console.log(link.paymentUrl); // "https://pay.noderails.com/link/pro-plan"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl -X POST https://api.noderails.com/payment-links \\
  -H "x-api-key: nr_live_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "your-app-id",
    "name": "Pro Plan",
    "slug": "pro-plan",
    "amount": "49.99",
    "currency": "USD"
  }'`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List payment links</h2>
      <Endpoint method="GET" path="/payment-links" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>isActive</code></td><td><code>&quot;true&quot; | &quot;false&quot;</code></td><td>Filter by active status</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (max 100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.paymentLinks.list({
  isActive: 'true',
  page: 1,
});

for (const link of result.data) {
  console.log(link.name, link.paymentUrl);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a payment link</h2>
      <Endpoint method="GET" path="/payment-links/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const link = await noderails.paymentLinks.retrieve('pl_abc123');
console.log(link.slug);       // "pro-plan"
console.log(link.paymentUrl); // "https://pay.noderails.com/link/pro-plan"`}
      />

      <hr />

      {/* --- UPDATE --- */}
      <h2>Update a payment link</h2>
      <Endpoint method="PUT" path="/payment-links/:id" />

      <p>Updates payment link fields. Only the provided fields are changed.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const updated = await noderails.paymentLinks.update('pl_abc123', {
  name: 'Pro Plan (Updated)',
  amount: '59.99',
  isActive: false, // Deactivate the link
});`}
      />

      <hr />

      {/* --- DELETE --- */}
      <h2>Delete a payment link</h2>
      <Endpoint method="DELETE" path="/payment-links/:id" />

      <p>Permanently deletes a payment link.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.paymentLinks.del('pl_abc123');`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code>. Delete returns <code>204 No Content</code>.
      </p>

      <CodeBlock
        language="json"
        title="PaymentLink object (create / update / list)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "name": "Pro Plan",
    "description": "Subscribe to our Pro Plan",
    "slug": "pro-plan",
    "amount": "49.99",
    "currency": "USD",
    "productPlanId": null,
    "productPlanPriceId": null,
    "taxRateId": null,
    "allowedChains": "ALL",
    "allowedTokens": "ALL",
    "successUrl": "https://example.com/success",
    "cancelUrl": null,
    "requireBillingDetails": false,
    "isActive": true,
    "usageCount": 0,
    "metadata": {},
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "paymentUrl": "https://pay.noderails.com/link/pro-plan",
    "app": { "name": "My Store" },
    "productPlan": null,
    "productPlanPrice": null,
    "taxRate": null
  }
}`}
      />

      <ResponseTable title="PaymentLink fields">
        <ResponseField name="id" type="string" description="Unique payment link UUID" />
        <ResponseField name="appId" type="string" description="App this link belongs to" />
        <ResponseField name="name" type="string" description="Link display name" />
        <ResponseField name="description" type="string | null" description="Link description" />
        <ResponseField name="slug" type="string" description="URL slug (used in paymentUrl)" />
        <ResponseField name="amount" type="string | null" description="Fixed amount as decimal string" />
        <ResponseField name="currency" type="string | null" description="Currency code" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan UUID" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price UUID" />
        <ResponseField name="taxRateId" type="string | null" description="Applied tax rate UUID" />
        <ResponseField name="allowedChains" type="'ALL' | number[]" description="Permitted chain IDs (EVM and Solana, e.g. 103)" />
        <ResponseField name="allowedTokens" type="'ALL' | string[]" description="Permitted token identifiers" />
        <ResponseField name="successUrl" type="string | null" description="Redirect URL after payment" />
        <ResponseField name="cancelUrl" type="string | null" description="Redirect URL on cancel" />
        <ResponseField name="requireBillingDetails" type="boolean" description="Whether billing details are required" />
        <ResponseField name="isActive" type="boolean" description="Whether the link accepts payments" />
        <ResponseField name="usageCount" type="number" description="Number of completed checkouts" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
        <ResponseField name="paymentUrl" type="string" description="Full shareable payment URL (computed server-side)" />
        <ResponseField name="app" type="object" description="App name (retrieve also includes merchantId)" />
        <ResponseField name="productPlan" type="object | null" description="Linked plan (selected fields)" />
        <ResponseField name="productPlanPrice" type="object | null" description="Linked price (selected fields)" />
        <ResponseField name="taxRate" type="object | null" description="Applied tax rate (id, displayName, percentage, inclusive)" />
      </ResponseTable>

      <Callout type="info" title="Retrieve returns richer data">
        The <strong>retrieve</strong> endpoint selects additional fields from relations:{' '}
        <code>app.merchantId</code>, <code>productPlan.description</code>,{' '}
        <code>productPlan.imageUrl</code>, and <code>productPlanPrice.billingIntervalCount</code>.
      </Callout>
    </>
  );
}
