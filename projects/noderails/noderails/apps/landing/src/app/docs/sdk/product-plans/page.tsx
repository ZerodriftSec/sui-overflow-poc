import { CodeBlock, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKProductPlansPage() {
  return (
    <>
      <h1>Product Plans</h1>
      <p className="subtitle">
        Product plans define what you sell and how you bill for it. Each plan can have
        multiple prices (e.g., monthly and annual billing). Plans are used with subscriptions.
      </p>

      <h2>Create a product plan</h2>

      <CodeBlock
        language="typescript"
        title="Create plan"
        code={`const plan = await noderails.productPlans.create({
  name: 'Pro Plan',
  description: 'Full access to all features',
  planType: 'SUBSCRIPTION',
  prices: [
    {
      amount: '29.99',
      currency: 'USD',
      billingInterval: 'MONTH',
      billingIntervalCount: 1,
      nickname: 'Monthly',
      isDefault: true,
    },
  ],
});

console.log(plan.id);   // Plan ID
console.log(plan.name); // "Pro Plan"`}
      />

      <h2>Add prices to a plan</h2>
      <p>
        Each price defines an amount, currency, and billing interval. A plan can have multiple
        prices so customers can choose between monthly, annual, etc.
      </p>

      <CodeBlock
        language="typescript"
        title="Create prices"
        code={`// Monthly price
const monthly = await noderails.productPlans.createPrice(plan.id, {
  amount: '29.99',
  currency: 'USD',
  billingInterval: 'MONTH',
  billingIntervalCount: 1,
  nickname: 'Monthly',
});

// Annual price
const annual = await noderails.productPlans.createPrice(plan.id, {
  amount: '299.00',
  currency: 'USD',
  billingInterval: 'YEAR',
  billingIntervalCount: 1,
  nickname: 'Annual',
});`}
      />

      <h2>Retrieve a plan</h2>

      <CodeBlock
        language="typescript"
        title="Retrieve"
        code={`const plan = await noderails.productPlans.retrieve('plan-id');
console.log(plan.name, plan.prices);`}
      />

      <h2>Update a plan</h2>

      <CodeBlock
        language="typescript"
        title="Update plan"
        code={`await noderails.productPlans.update('plan-id', {
  name: 'Pro Plan v2',
  description: 'Updated features',
});`}
      />

      <h2>Update a price</h2>

      <CodeBlock
        language="typescript"
        title="Update price"
        code={`await noderails.productPlans.updatePrice('plan-id', 'price-id', {
  nickname: 'Monthly (updated)',
});`}
      />

      <h2>Delete a price</h2>

      <CodeBlock
        language="typescript"
        title="Delete price"
        code={`await noderails.productPlans.deletePrice('plan-id', 'price-id');`}
      />

      <h2>List plans</h2>

      <CodeBlock
        language="typescript"
        title="List"
        code={`const plans = await noderails.productPlans.list();

for (const plan of plans.data) {
  console.log(plan.id, plan.name, plan.prices.length, 'prices');
}`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new product plan</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a plan with prices</td></tr>
          <tr><td><code>list(params?)</code></td><td>List all plans</td></tr>
          <tr><td><code>update(id, params)</code></td><td>Update a plan</td></tr>
          <tr><td><code>createPrice(planId, params)</code></td><td>Add a price to a plan</td></tr>
          <tr><td><code>updatePrice(planId, priceId, params)</code></td><td>Update a price</td></tr>
          <tr><td><code>deletePrice(planId, priceId)</code></td><td>Remove a price</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  ProductPlan,
  ProductPlanCreateParams,
  ProductPlanPrice,
  PriceCreateParams,
  PriceUpdateParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code>, <code>update()</code>, and <code>list()</code> response</h3>
      <ResponseTable title="ProductPlan">
        <ResponseField name="id" type="string" description="Unique plan ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="name" type="string" description="Plan name" />
        <ResponseField name="description" type="string | null" description="Plan description" />
        <ResponseField name="imageUrl" type="string | null" description="Plan image URL" />
        <ResponseField name="planType" type="string" description="&quot;ONE_TIME&quot; or &quot;SUBSCRIPTION&quot;" />
        <ResponseField name="taxRateId" type="string | null" description="Default tax rate ID" />
        <ResponseField name="isActive" type="boolean" description="Whether the plan is active" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="prices" type="ProductPlanPrice[]" description="All prices for this plan (sorted by sortOrder)" />
        <ResponseField name="taxRate" type="TaxRate | null" description="Full tax rate object, if linked" />
      </ResponseTable>

      <ResponseTable title="ProductPlanPrice (nested in prices[])">
        <ResponseField name="id" type="string" description="Unique price ID (UUID)" />
        <ResponseField name="productPlanId" type="string" description="Parent plan ID" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="amount" type="string" description="Price amount (Decimal as string, e.g. &quot;29.99&quot;)" />
        <ResponseField name="currency" type="string" description="Currency code, default &quot;USD&quot;" />
        <ResponseField name="billingInterval" type="string | null" description="MONTH, YEAR, WEEK, or DAY" />
        <ResponseField name="billingIntervalCount" type="number" description="Intervals between charges (e.g. 1 for monthly)" />
        <ResponseField name="trialPeriodDays" type="number" description="Free trial days (default 0)" />
        <ResponseField name="nickname" type="string | null" description="Display name, e.g. &quot;Monthly&quot;" />
        <ResponseField name="sortOrder" type="number" description="Display order" />
        <ResponseField name="isDefault" type="boolean" description="Whether this is the default price" />
        <ResponseField name="isActive" type="boolean" description="Whether price is active" />
        <ResponseField name="metadata" type="object" description="Price-level metadata" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 timestamp" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Same as above plus the full <code>app</code> object.
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="app" type="App" description="Full app object (id, name, environment, etc.)" />
      </ResponseTable>

      <h3><code>createPrice()</code> and <code>updatePrice()</code> response</h3>
      <p>
        Returns the single <code>ProductPlanPrice</code> object (no nested plan or tax rate).
      </p>

      <h3><code>deletePrice()</code> response</h3>
      <p>
        Returns <code>204 No Content</code> (no response body).
      </p>
    </>
  );
}
