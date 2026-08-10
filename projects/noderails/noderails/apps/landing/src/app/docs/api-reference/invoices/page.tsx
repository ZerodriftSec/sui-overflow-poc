import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function InvoicesPage() {
  return (
    <>
      <h1>Invoices</h1>
      <p className="subtitle">
        Invoices allow you to bill customers for goods or services. Create an invoice with line
        items, send it via email, and track payment status automatically.
      </p>

      <h2>Invoice lifecycle</h2>
      <CodeBlock
        language="text"
        title="Status flow"
        code={`DRAFT → OPEN → PAID
        ↘ VOID`}
      />

      <hr />

      {/* --- CREATE --- */}
      <h2>Create an invoice</h2>
      <Endpoint method="POST" path="/invoices" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>customerAccountId</code></td><td><code>string</code></td><td>Yes</td><td>Customer UUID to bill</td></tr>
          <tr><td><code>items</code></td><td><code>InvoiceItem[]</code></td><td>Yes</td><td>Line items (min 1)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Currency code (default: &quot;USD&quot;)</td></tr>
          <tr><td><code>dueDate</code></td><td><code>string</code></td><td>No</td><td>Due date (ISO 8601)</td></tr>
          <tr><td><code>memo</code></td><td><code>string</code></td><td>No</td><td>Memo or notes (max 2000)</td></tr>
          <tr><td><code>taxRateId</code></td><td><code>string</code></td><td>No</td><td>Apply a tax rate</td></tr>
          <tr><td><code>allowedChains</code></td><td><code>&quot;ALL&quot; | number[]</code></td><td>No</td><td>Allowed blockchain chain IDs</td></tr>
          <tr><td><code>allowedTokens</code></td><td><code>&quot;ALL&quot; | string[]</code></td><td>No</td><td>Allowed token identifiers</td></tr>
          <tr><td><code>subscriptionId</code></td><td><code>string</code></td><td>No</td><td>Link to a subscription</td></tr>
          <tr><td><code>periodStart</code></td><td><code>string</code></td><td>No</td><td>Billing period start (ISO 8601)</td></tr>
          <tr><td><code>periodEnd</code></td><td><code>string</code></td><td>No</td><td>Billing period end (ISO 8601)</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <h4>InvoiceItem</h4>
      <table>
        <thead>
          <tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>description</code></td><td><code>string</code></td><td>Yes</td><td>Line item description (1–500 chars)</td></tr>
          <tr><td><code>amount</code></td><td><code>string</code></td><td>Yes</td><td>Price per unit (decimal string)</td></tr>
          <tr><td><code>quantity</code></td><td><code>number</code></td><td>No</td><td>Quantity (default: 1)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Item currency (max 10)</td></tr>
          <tr><td><code>productPlanId</code></td><td><code>string</code></td><td>No</td><td>Link to product plan</td></tr>
          <tr><td><code>productPlanPriceId</code></td><td><code>string</code></td><td>No</td><td>Specific price option</td></tr>
          <tr><td><code>taxRateId</code></td><td><code>string</code></td><td>No</td><td>Per-item tax rate</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const invoice = await noderails.invoices.create({
  customerAccountId: 'cust_abc123',
  currency: 'USD',
  dueDate: '2025-02-01',
  memo: 'January 2025 services',
  items: [
    {
      description: 'API usage — 10,000 requests',
      amount: '49.99',
      quantity: 1,
    },
    {
      description: 'Premium support',
      amount: '19.99',
      quantity: 1,
    },
  ],
});

console.log(invoice.id);     // "inv_abc123"
console.log(invoice.status); // "DRAFT"`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List invoices</h2>
      <Endpoint method="GET" path="/invoices" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>status</code></td><td><code>string</code></td><td>Filter by status (DRAFT, OPEN, PAID, VOID)</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (max 100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.invoices.list({
  status: 'OPEN',
  page: 1,
});

for (const inv of result.data) {
  console.log(inv.id, inv.totalAmount, inv.status);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve an invoice</h2>
      <Endpoint method="GET" path="/invoices/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const invoice = await noderails.invoices.retrieve('inv_abc123');
console.log(invoice.items);      // InvoiceItem[]
console.log(invoice.totalAmount); // "69.98"`}
      />

      <hr />

      {/* --- OPEN --- */}
      <h2>Open an invoice</h2>
      <Endpoint method="POST" path="/invoices/:id/open" />

      <p>Transitions a draft invoice to <code>OPEN</code> status, making it payable by the customer.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const opened = await noderails.invoices.open('inv_abc123');
console.log(opened.status); // "OPEN"`}
      />

      <hr />

      {/* --- VOID --- */}
      <h2>Void an invoice</h2>
      <Endpoint method="POST" path="/invoices/:id/void" />

      <p>Voids an invoice, preventing it from being paid.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const voided = await noderails.invoices.void('inv_abc123');
    console.log(voided.status); // "VOID"`}
      />

      <hr />

      {/* --- SEND --- */}
      <h2>Send an invoice</h2>
      <Endpoint method="POST" path="/invoices/:id/send" />

      <p>Sends the invoice to the customer via email. The email includes a link to the hosted payment page.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.invoices.send('inv_abc123');
      console.log(result.sent); // true`}
      />

      <Callout type="info" title="Auto-open on send">
        Sending a DRAFT invoice will automatically transition it to OPEN status.
      </Callout>

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code>.
      </p>

      <CodeBlock
        language="json"
        title="Invoice object (create)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "customerAccountId": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "subscriptionId": null,
    "paymentIntentId": null,
    "invoiceNumber": "INV-0001",
    "status": "DRAFT",
    "subtotal": "69.98",
    "taxAmount": "0",
    "total": "69.98",
    "currency": "USD",
    "taxRateId": null,
    "dueDate": "2025-02-01T00:00:00.000Z",
    "paidAt": null,
    "voidedAt": null,
    "periodStart": null,
    "periodEnd": null,
    "allowedChains": "ALL",
    "allowedTokens": "ALL",
    "memo": "January 2025 services",
    "metadata": {},
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "items": [
      {
        "id": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
        "invoiceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "productPlanId": null,
        "productPlanPriceId": null,
        "taxRateId": null,
        "description": "API usage — 10,000 requests",
        "amount": "49.99",
        "currency": "USD",
        "quantity": 1,
        "taxAmount": "0",
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "customerAccount": {
      "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
      "email": "alice@example.com",
      "name": "Alice Johnson"
    },
    "taxRate": null
  }
}`}
      />

      <ResponseTable title="Invoice fields">
        <ResponseField name="id" type="string" description="Unique invoice UUID" />
        <ResponseField name="appId" type="string" description="App this invoice belongs to" />
        <ResponseField name="customerAccountId" type="string" description="Customer being billed" />
        <ResponseField name="subscriptionId" type="string | null" description="Linked subscription UUID (for recurring invoices)" />
        <ResponseField name="paymentIntentId" type="string | null" description="Associated payment intent once payment starts" />
        <ResponseField name="invoiceNumber" type="string" description="Auto-generated invoice number (e.g. INV-0001)" />
        <ResponseField name="status" type="string" description="DRAFT, OPEN, PAID, or VOID" />
        <ResponseField name="subtotal" type="string" description="Total before tax as decimal string" />
        <ResponseField name="taxAmount" type="string" description="Calculated tax amount" />
        <ResponseField name="total" type="string" description="Final total (subtotal + tax)" />
        <ResponseField name="currency" type="string" description="Currency code" />
        <ResponseField name="taxRateId" type="string | null" description="Applied tax rate UUID" />
        <ResponseField name="dueDate" type="string | null" description="ISO 8601 due date" />
        <ResponseField name="paidAt" type="string | null" description="ISO 8601 payment timestamp" />
        <ResponseField name="voidedAt" type="string | null" description="ISO 8601 void timestamp" />
        <ResponseField name="periodStart" type="string | null" description="Billing period start (for subscriptions)" />
        <ResponseField name="periodEnd" type="string | null" description="Billing period end (for subscriptions)" />
        <ResponseField name="allowedChains" type="'ALL' | number[]" description="Permitted blockchain chain IDs" />
        <ResponseField name="allowedTokens" type="'ALL' | string[]" description="Permitted token identifiers" />
        <ResponseField name="memo" type="string | null" description="Invoice notes or memo" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>

      <ResponseTable title="InvoiceItem fields">
        <ResponseField name="id" type="string" description="Item UUID" />
        <ResponseField name="invoiceId" type="string" description="Parent invoice UUID" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan UUID" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price UUID" />
        <ResponseField name="taxRateId" type="string | null" description="Per-item tax rate UUID" />
        <ResponseField name="description" type="string" description="Line item description" />
        <ResponseField name="amount" type="string" description="Price per unit as decimal string" />
        <ResponseField name="currency" type="string" description="Currency code" />
        <ResponseField name="quantity" type="number" description="Item quantity" />
        <ResponseField name="taxAmount" type="string" description="Calculated tax for this item" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
      </ResponseTable>

      <Callout type="info" title="Endpoint variations">
        <strong>Create</strong> includes <code>items</code>, <code>customerAccount</code>, and <code>taxRate</code>.{' '}
        <strong>Retrieve</strong> adds <code>app</code>, <code>paymentIntent</code> (with <code>transactions</code>),
        and each item&apos;s <code>taxRate</code>.{' '}
        <strong>List</strong> includes all retrieve relations except <code>app</code>.{' '}
        <strong>Open/void</strong> include <code>items</code> only.{' '}
        <strong>Send</strong> returns <code>{'{ "sent": true }'}</code>.
      </Callout>
    </>
  );
}
