import { CodeBlock, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKTaxRatesPage() {
  return (
    <>
      <h1>Tax Rates</h1>
      <p className="subtitle">
        Create and manage tax rates to apply to invoices and checkout sessions.
      </p>

      <h2>Create a tax rate</h2>

      <CodeBlock
        language="typescript"
        title="Create"
        code={`const taxRate = await noderails.taxRates.create({
        displayName: 'VAT',
  percentage: 20,
  description: 'Value Added Tax',
  inclusive: false,
});

console.log(taxRate.id);         // Tax rate ID
console.log(taxRate.percentage); // 20`}
      />

      <h2>Retrieve a tax rate</h2>

      <CodeBlock
        language="typescript"
        title="Retrieve"
        code={`const taxRate = await noderails.taxRates.retrieve('tax-rate-id');
    console.log(taxRate.displayName, taxRate.percentage);`}
      />

      <h2>Update a tax rate</h2>

      <CodeBlock
        language="typescript"
        title="Update"
        code={`await noderails.taxRates.update('tax-rate-id', {
  description: 'Updated VAT rate',
});`}
      />

      <h2>List tax rates</h2>

      <CodeBlock
        language="typescript"
        title="List"
        code={`const taxRates = await noderails.taxRates.list();

for (const rate of taxRates) {
          console.log(rate.displayName, rate.percentage + '%');
}`}
      />

      <h2>Delete a tax rate</h2>

      <CodeBlock
        language="typescript"
        title="Delete"
        code={`await noderails.taxRates.delete('tax-rate-id');`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new tax rate</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a tax rate by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List all tax rates</td></tr>
          <tr><td><code>update(id, params)</code></td><td>Update a tax rate</td></tr>
          <tr><td><code>delete(id)</code></td><td>Delete a tax rate</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  TaxRate,
  TaxRateCreateParams,
  TaxRateUpdateParams,
  TaxRateListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3>All endpoints return the same shape</h3>
      <p>
        <code>create()</code>, <code>retrieve()</code>, <code>update()</code>, and each item in <code>list()</code>
        all return the full TaxRate object:
      </p>
      <ResponseTable title="TaxRate">
        <ResponseField name="id" type="string" description="Unique tax rate ID (UUID)" />
        <ResponseField name="merchantId" type="string" description="Your merchant ID" />
        <ResponseField name="displayName" type="string" description='Display name, e.g. "VAT" or "GST"' />
        <ResponseField name="percentage" type="string" description='Tax percentage (Decimal as string, e.g. "20.00")' />
        <ResponseField name="inclusive" type="boolean" description="Whether tax is included in the price (true) or added on top (false)" />
        <ResponseField name="jurisdiction" type="string | null" description='Tax jurisdiction, e.g. "US-CA"' />
        <ResponseField name="description" type="string | null" description="Additional description" />
        <ResponseField name="isActive" type="boolean" description="Whether the tax rate is active" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
      </ResponseTable>

      <h3><code>list()</code> response</h3>
      <p>
        Returns a flat array (not paginated): <code>{`{ success: true, data: TaxRate[] }`}</code>
      </p>

      <h3><code>delete()</code> response</h3>
      <p>Returns <code>204 No Content</code> (no response body).</p>
    </>
  );
}
