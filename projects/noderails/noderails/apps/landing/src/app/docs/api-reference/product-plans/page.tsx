import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function ProductPlansPage() {
  return (
    <>
      <h1>Product Plans</h1>
      <p className="subtitle">
        Product plans define what you sell, both one-time purchases and recurring subscriptions.
        Each plan can have multiple price options with different billing intervals.
      </p>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a product plan</h2>
      <Endpoint method="POST" path="/product-plans" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>name</code></td><td><code>string</code></td><td>Yes</td><td>Plan name (1–255 chars)</td></tr>
          <tr><td><code>prices</code></td><td><code>Price[]</code></td><td>Yes</td><td>Price options (min 1)</td></tr>
          <tr><td><code>description</code></td><td><code>string</code></td><td>No</td><td>Plan description (max 2000)</td></tr>
          <tr><td><code>imageUrl</code></td><td><code>string</code></td><td>No</td><td>Product image URL</td></tr>
          <tr><td><code>planType</code></td><td><code>&quot;ONE_TIME&quot; | &quot;SUBSCRIPTION&quot;</code></td><td>No</td><td>Plan type</td></tr>
          <tr><td><code>taxRateId</code></td><td><code>string</code></td><td>No</td><td>Default tax rate</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <h4>Price</h4>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>Yes</td><td>Price amount (decimal string)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Currency code (max 10, default: USD)</td></tr>
          <tr><td><code>billingInterval</code></td><td><code>string</code></td><td>No</td><td>MINUTE | DAY | WEEK | MONTH | YEAR</td></tr>
          <tr><td><code>billingIntervalCount</code></td><td><code>number</code></td><td>No</td><td>Interval multiplier (e.g. 3 for quarterly)</td></tr>
          <tr><td><code>trialPeriodDays</code></td><td><code>number</code></td><td>No</td><td>Free trial length in days</td></tr>
          <tr><td><code>nickname</code></td><td><code>string</code></td><td>No</td><td>Price label (max 100, e.g. &quot;Monthly&quot;)</td></tr>
          <tr><td><code>sortOrder</code></td><td><code>number</code></td><td>No</td><td>Display ordering</td></tr>
          <tr><td><code>isDefault</code></td><td><code>boolean</code></td><td>No</td><td>Default price selection</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Price-level metadata</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const plan = await noderails.productPlans.create({
  name: 'Pro Plan',
  description: 'Full access to all features',
  planType: 'SUBSCRIPTION',
  prices: [
    {
      amount: '9.99',
      currency: 'USD',
      billingInterval: 'MONTH',
      billingIntervalCount: 1,
      nickname: 'Monthly',
      isDefault: true,
    },
    {
      amount: '99.99',
      currency: 'USD',
      billingInterval: 'YEAR',
      billingIntervalCount: 1,
      nickname: 'Annual (save 17%)',
    },
  ],
});

console.log(plan.id);     // "plan_abc123"
console.log(plan.prices); // Price[]`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List product plans</h2>
      <Endpoint method="GET" path="/product-plans" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>planType</code></td><td><code>&quot;ONE_TIME&quot; | &quot;SUBSCRIPTION&quot;</code></td><td>Filter by plan type</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (max 100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.productPlans.list({
  planType: 'SUBSCRIPTION',
  page: 1,
});

for (const plan of result.data) {
  console.log(plan.name, plan.prices.length);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a product plan</h2>
      <Endpoint method="GET" path="/product-plans/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const plan = await noderails.productPlans.retrieve('plan_abc123');
console.log(plan.name);   // "Pro Plan"
console.log(plan.prices); // [{ amount: "9.99", ... }, { amount: "99.99", ... }]`}
      />

      <hr />

      {/* --- UPDATE --- */}
      <h2>Update a product plan</h2>
      <Endpoint method="PUT" path="/product-plans/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const updated = await noderails.productPlans.update('plan_abc123', {
  name: 'Pro Plan (v2)',
  description: 'Updated description',
  isActive: true,
});`}
      />

      <hr />

      {/* --- ADD PRICE --- */}
      <h2>Add a price</h2>
      <Endpoint method="POST" path="/product-plans/:id/prices" />

      <p>Adds a new price option to an existing product plan.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const price = await noderails.productPlans.addPrice('plan_abc123', {
  amount: '49.99',
  currency: 'USD',
  billingInterval: 'MONTH',
  billingIntervalCount: 6,
  nickname: 'Semi-Annual',
});`}
      />

      <hr />

      {/* --- UPDATE PRICE --- */}
      <h2>Update a price</h2>
      <Endpoint method="PUT" path="/product-plans/:planId/prices/:priceId" />

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>No</td><td>Updated price amount</td></tr>
          <tr><td><code>nickname</code></td><td><code>string</code></td><td>No</td><td>Updated label</td></tr>
          <tr><td><code>sortOrder</code></td><td><code>number</code></td><td>No</td><td>Display order</td></tr>
          <tr><td><code>isDefault</code></td><td><code>boolean</code></td><td>No</td><td>Set as default</td></tr>
          <tr><td><code>isActive</code></td><td><code>boolean</code></td><td>No</td><td>Active/inactive</td></tr>
          <tr><td><code>trialPeriodDays</code></td><td><code>number</code></td><td>No</td><td>Trial days</td></tr>
        </tbody>
      </table>

      <hr />

      {/* --- DEACTIVATE PRICE --- */}
      <h2>Deactivate a price</h2>
      <Endpoint method="DELETE" path="/product-plans/:planId/prices/:priceId" />

      <p>Deactivates a price option (soft delete). Returns <code>{"{ deactivated: true }"}</code>.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.productPlans.deactivatePrice('plan_abc123', 'price_xyz');`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code>.
      </p>

      <CodeBlock
        language="json"
        title="ProductPlan object (create / update / list)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "name": "Pro Plan",
    "description": "Full access to all features",
    "imageUrl": null,
    "planType": "SUBSCRIPTION",
    "taxRateId": null,
    "isActive": true,
    "metadata": {},
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "prices": [
      {
        "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
        "productPlanId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
        "amount": "9.99",
        "currency": "USD",
        "billingInterval": "MONTH",
        "billingIntervalCount": 1,
        "trialPeriodDays": 0,
        "nickname": "Monthly",
        "sortOrder": 0,
        "isDefault": true,
        "isActive": true,
        "metadata": {},
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "taxRate": null
  }
}`}
      />

      <ResponseTable title="ProductPlan fields">
        <ResponseField name="id" type="string" description="Unique plan UUID" />
        <ResponseField name="appId" type="string" description="App this plan belongs to" />
        <ResponseField name="name" type="string" description="Plan display name" />
        <ResponseField name="description" type="string | null" description="Plan description" />
        <ResponseField name="imageUrl" type="string | null" description="Product image URL" />
        <ResponseField name="planType" type="string" description="ONE_TIME or SUBSCRIPTION" />
        <ResponseField name="taxRateId" type="string | null" description="Default tax rate UUID" />
        <ResponseField name="isActive" type="boolean" description="Whether the plan is active" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
        <ResponseField name="prices" type="ProductPlanPrice[]" description="Price options, sorted by sortOrder ascending" />
        <ResponseField name="taxRate" type="TaxRate | null" description="Full tax rate object when linked" />
      </ResponseTable>

      <ResponseTable title="ProductPlanPrice fields">
        <ResponseField name="id" type="string" description="Price UUID" />
        <ResponseField name="productPlanId" type="string" description="Parent plan UUID" />
        <ResponseField name="appId" type="string" description="App UUID" />
        <ResponseField name="amount" type="string" description="Price amount as decimal string" />
        <ResponseField name="currency" type="string" description="Currency code" />
        <ResponseField name="billingInterval" type="string | null" description="MINUTE, DAY, WEEK, MONTH, or YEAR" />
        <ResponseField name="billingIntervalCount" type="number | null" description="Interval multiplier (e.g. 3 for quarterly)" />
        <ResponseField name="trialPeriodDays" type="number" description="Free trial length in days" />
        <ResponseField name="nickname" type="string | null" description="Price label (e.g. 'Monthly')" />
        <ResponseField name="sortOrder" type="number" description="Display ordering (ascending)" />
        <ResponseField name="isDefault" type="boolean" description="Whether this is the default price" />
        <ResponseField name="isActive" type="boolean" description="Whether the price is active" />
        <ResponseField name="metadata" type="object" description="Price-level metadata" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>

      <Callout type="info" title="Endpoint variations">
        <strong>Retrieve</strong> additionally includes the <code>app</code> object.{' '}
        <strong>Add price / update price</strong> return bare <code>ProductPlanPrice</code> scalars (no relations).{' '}
        <strong>Deactivate price</strong> returns <code>{'{ "deactivated": true }'}</code>.
      </Callout>
    </>
  );
}
