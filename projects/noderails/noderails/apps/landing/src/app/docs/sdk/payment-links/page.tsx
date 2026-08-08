import { CodeBlock, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKPaymentLinksPage() {
  return (
    <>
      <h1>Payment Links</h1>
      <p className="subtitle">
        Payment links are shareable URLs that open a payment page. No integration needed.
        Share them via email, social media, or embed as QR codes.
      </p>

      <h2>Create a payment link</h2>

      <CodeBlock
        language="typescript"
        title="Create"
        code={`const link = await noderails.paymentLinks.create({
  name: 'Donate',
  slug: 'donate',
  amount: '25.00',
  currency: 'USD',
  description: 'Support our project',
});

console.log(link.id);   // Payment link ID
console.log(link.slug); // "donate"

// The payment URL is: https://pay.noderails.com/link/donate`}
      />

      <h2>Retrieve a payment link</h2>

      <CodeBlock
        language="typescript"
        title="Retrieve"
        code={`const link = await noderails.paymentLinks.retrieve('link-id');
console.log(link.name, link.amount, link.slug);`}
      />

      <h2>Update a payment link</h2>

      <CodeBlock
        language="typescript"
        title="Update"
        code={`const updated = await noderails.paymentLinks.update('link-id', {
  amount: '50.00',
  description: 'Updated donation amount',
});`}
      />

      <h2>List payment links</h2>

      <CodeBlock
        language="typescript"
        title="List"
        code={`const links = await noderails.paymentLinks.list();

for (const link of links.data) {
  console.log(link.name, link.slug, link.amount);
}`}
      />

      <h2>Delete a payment link</h2>

      <CodeBlock
        language="typescript"
        title="Delete"
        code={`await noderails.paymentLinks.delete('link-id');`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new payment link</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a payment link by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List all payment links</td></tr>
          <tr><td><code>update(id, params)</code></td><td>Update a payment link</td></tr>
          <tr><td><code>delete(id)</code></td><td>Delete a payment link</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  PaymentLink,
  PaymentLinkCreateParams,
  PaymentLinkUpdateParams,
  PaymentLinkListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code>, <code>update()</code>, and <code>list()</code> response</h3>
      <ResponseTable title="PaymentLink">
        <ResponseField name="id" type="string" description="Unique payment link ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="name" type="string" description="Link display name" />
        <ResponseField name="description" type="string | null" description="Link description" />
        <ResponseField name="slug" type="string" description="URL slug (used in payment URL)" />
        <ResponseField name="amount" type="string | null" description="Fixed amount (Decimal as string), null if customer chooses" />
        <ResponseField name="currency" type="string" description="Currency code, default &quot;USD&quot;" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan ID" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price ID" />
        <ResponseField name="taxRateId" type="string | null" description="Applied tax rate ID" />
        <ResponseField name="allowedChains" type="string | number[]" description="&quot;ALL&quot; or array of chain IDs" />
        <ResponseField name="allowedTokens" type="string | string[]" description="&quot;ALL&quot; or array of token keys" />
        <ResponseField name="successUrl" type="string | null" description="Redirect after payment" />
        <ResponseField name="cancelUrl" type="string | null" description="Redirect if cancelled" />
        <ResponseField name="requireBillingDetails" type="boolean" description="Whether billing details are required" />
        <ResponseField name="isActive" type="boolean" description="Whether the link is active" />
        <ResponseField name="usageCount" type="number" description="Number of times the link has been used" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="paymentUrl" type="string" description="Full payment URL (e.g. https://pay.noderails.com/link/donate)" />
        <ResponseField name="app" type="{ name }" description="App name only" />
        <ResponseField name="productPlan" type="{ id, name } | null" description="Plan name, if linked" />
        <ResponseField name="productPlanPrice" type="object | null" description="{ id, amount, currency, billingInterval, nickname }" />
        <ResponseField name="taxRate" type="object | null" description="{ id, displayName, percentage, inclusive }" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Same as above but with richer nested data:
      </p>
      <ResponseTable title="Extra fields on retrieve">
        <ResponseField name="app.merchantId" type="string" description="Also included on retrieve" />
        <ResponseField name="productPlan.description" type="string | null" description="Plan description" />
        <ResponseField name="productPlan.imageUrl" type="string | null" description="Plan image URL" />
        <ResponseField name="productPlanPrice.billingIntervalCount" type="number" description="Also included on retrieve" />
      </ResponseTable>

      <h3><code>delete()</code> response</h3>
      <p>Returns <code>204 No Content</code> (no response body).</p>
    </>
  );
}
