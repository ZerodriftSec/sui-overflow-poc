import { CodeBlock, Endpoint, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function TaxRatesPage() {
  return (
    <>
      <h1>Tax Rates</h1>
      <p className="subtitle">
        Tax rates let you define reusable tax configurations that can be applied to invoices,
        payment links, and product plans. Tax is calculated and displayed to the customer at
        checkout.
      </p>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a tax rate</h2>
      <Endpoint method="POST" path="/tax-rates" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>displayName</code></td><td><code>string</code></td><td>Yes</td><td>Display name (1–100 chars, e.g. &quot;VAT&quot;)</td></tr>
          <tr><td><code>percentage</code></td><td><code>number</code></td><td>Yes</td><td>Tax percentage (0–100)</td></tr>
          <tr><td><code>inclusive</code></td><td><code>boolean</code></td><td>No</td><td>Whether tax is included in the price</td></tr>
          <tr><td><code>jurisdiction</code></td><td><code>string</code></td><td>No</td><td>Tax jurisdiction (max 50, e.g. &quot;US-CA&quot;)</td></tr>
          <tr><td><code>description</code></td><td><code>string</code></td><td>No</td><td>Description (max 500)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const taxRate = await noderails.taxRates.create({
  displayName: 'Sales Tax',
  percentage: 8.25,
  inclusive: false,
  jurisdiction: 'US-TX',
  description: 'Texas state sales tax',
});

console.log(taxRate.id); // "tax_abc123"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl -X POST https://api.noderails.com/tax-rates \\
  -H "x-api-key: nr_live_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "displayName": "Sales Tax",
    "percentage": 8.25,
    "inclusive": false,
    "jurisdiction": "US-TX"
  }'`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List tax rates</h2>
      <Endpoint method="GET" path="/tax-rates" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>includeInactive</code></td><td><code>&quot;true&quot; | &quot;false&quot;</code></td><td>Include archived/inactive tax rates</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const taxRates = await noderails.taxRates.list();

for (const rate of taxRates) {
  console.log(rate.displayName, rate.percentage + '%');
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a tax rate</h2>
      <Endpoint method="GET" path="/tax-rates/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const rate = await noderails.taxRates.retrieve('tax_abc123');
console.log(rate.displayName); // "Sales Tax"
console.log(rate.percentage);  // 8.25`}
      />

      <hr />

      {/* --- UPDATE --- */}
      <h2>Update a tax rate</h2>
      <Endpoint method="PUT" path="/tax-rates/:id" />

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>displayName</code></td><td><code>string</code></td><td>No</td><td>Updated display name</td></tr>
          <tr><td><code>percentage</code></td><td><code>number</code></td><td>No</td><td>Updated percentage</td></tr>
          <tr><td><code>inclusive</code></td><td><code>boolean</code></td><td>No</td><td>Updated inclusive flag</td></tr>
          <tr><td><code>jurisdiction</code></td><td><code>string</code></td><td>No</td><td>Updated jurisdiction</td></tr>
          <tr><td><code>description</code></td><td><code>string</code></td><td>No</td><td>Updated description</td></tr>
          <tr><td><code>isActive</code></td><td><code>boolean</code></td><td>No</td><td>Active/archived</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const updated = await noderails.taxRates.update('tax_abc123', {
  percentage: 8.5,
  description: 'Updated Texas sales tax',
});`}
      />

      <hr />

      {/* --- DELETE --- */}
      <h2>Archive a tax rate</h2>
      <Endpoint method="DELETE" path="/tax-rates/:id" />

      <p>Archives a tax rate (soft delete). Returns <code>204 No Content</code>.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.taxRates.del('tax_abc123');`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>.
        The list endpoint returns a flat array (not paginated). Delete returns <code>204 No Content</code>.
      </p>

      <CodeBlock
        language="json"
        title="TaxRate object"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "merchantId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "displayName": "Sales Tax",
    "percentage": 8.25,
    "inclusive": false,
    "jurisdiction": "US-TX",
    "description": "Texas state sales tax",
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}`}
      />

      <ResponseTable title="TaxRate fields">
        <ResponseField name="id" type="string" description="Unique tax rate UUID" />
        <ResponseField name="merchantId" type="string" description="Merchant this tax rate belongs to" />
        <ResponseField name="displayName" type="string" description="Display name (e.g. 'VAT', 'Sales Tax')" />
        <ResponseField name="percentage" type="number" description="Tax percentage (0–100)" />
        <ResponseField name="inclusive" type="boolean" description="Whether tax is included in the price" />
        <ResponseField name="jurisdiction" type="string | null" description="Tax jurisdiction (e.g. 'US-CA')" />
        <ResponseField name="description" type="string | null" description="Additional description" />
        <ResponseField name="isActive" type="boolean" description="Whether the tax rate is active" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>
    </>
  );
}
