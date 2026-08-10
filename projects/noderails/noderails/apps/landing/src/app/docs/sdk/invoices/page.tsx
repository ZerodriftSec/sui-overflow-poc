import { CodeBlock, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKInvoicesPage() {
  return (
    <>
      <h1>Invoices</h1>
      <p className="subtitle">
        Invoices let you bill specific customers with line items, tax, and a one-click payment link.
        The customer receives an email with a pay button that opens the hosted checkout.
      </p>

      <h2>Full flow</h2>
      <p>
        An invoice follows this lifecycle: <code>DRAFT</code> → <code>OPEN</code> → <code>PAID</code>.
        You can also <code>VOID</code> an unpaid invoice at any time.
      </p>

      <h3>Step 1: Create an invoice</h3>

      <CodeBlock
        language="typescript"
        title="Create invoice"
        code={`const invoice = await noderails.invoices.create({
  customerAccountId: 'customer-id',
  currency: 'USD',
  dueDate: '2026-04-01T00:00:00Z',
  memo: 'March consulting services',
  items: [
    { description: 'Strategy consulting (10 hrs)', amount: '1500.00', quantity: 1 },
    { description: 'Implementation support', amount: '750.00', quantity: 1 },
  ],
});

console.log(invoice.id);     // Invoice ID
console.log(invoice.status); // "DRAFT"`}
      />

      <h3>Step 2: Open the invoice</h3>
      <p>
        Transition the invoice from <code>DRAFT</code> to <code>OPEN</code>. Once open, the
        invoice is finalized and can be paid.
      </p>

      <CodeBlock
        language="typescript"
        title="Open invoice"
        code={`await noderails.invoices.open(invoice.id);`}
      />

      <h3>Step 3: Send to customer</h3>
      <p>
        Send the invoice via email. The customer receives an email with the invoice details
        and a pay button that opens the hosted checkout.
      </p>

      <CodeBlock
        language="typescript"
        title="Send invoice"
        code={`const result = await noderails.invoices.send(invoice.id);
console.log(result.sent); // true`}
      />

      <Callout type="info" title="One step">
        You can call <code>open</code> and <code>send</code> separately, or just call <code>send</code> which
        will automatically open a draft invoice before sending.
      </Callout>

      <h3>Step 4: Check status</h3>

      <CodeBlock
        language="typescript"
        title="Check invoice status"
        code={`const invoice = await noderails.invoices.retrieve(invoice.id);
console.log(invoice.status); // "DRAFT" | "OPEN" | "PAID" | "VOID"

// Once paid, the full payment intent is included automatically
if (invoice.paymentIntent) {
  console.log(invoice.paymentIntent.status);              // "CAPTURED"
  console.log(invoice.paymentIntent.captureTxHash);       // "0x..." (on-chain tx hash)
  console.log(invoice.paymentIntent.cryptoAmount);        // "2250000000" (in token's smallest unit)
  console.log(invoice.paymentIntent.authorizationChainId); // 8453 (chain used)
  console.log(invoice.paymentIntent.authorizationTokenKey); // "USDC-8453" (token used)
}`}
      />

      <Callout type="info" title="No extra calls needed">
        When you retrieve an invoice, the full <code>paymentIntent</code> object is automatically
        included once the customer has paid. You don&apos;t need to make a separate call
        to <code>paymentIntents.retrieve()</code>.
      </Callout>

      <h2>List invoices</h2>

      <CodeBlock
        language="typescript"
        title="List and filter"
        code={`// List all open invoices
const invoices = await noderails.invoices.list({ status: 'OPEN' });

for (const inv of invoices.data) {
  console.log(inv.id, inv.status, inv.amount);
}`}
      />

      <h2>Void an invoice</h2>
      <p>
        Void an unpaid invoice. This marks it as cancelled and prevents the customer from paying.
      </p>

      <CodeBlock
        language="typescript"
        title="Void invoice"
        code={`await noderails.invoices.void('invoice-id');`}
      />

      <h2>Webhooks</h2>
      <table>
        <thead>
          <tr><th>Event</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>invoice.created</code></td><td>Invoice was created</td></tr>
          <tr><td><code>invoice.sent</code></td><td>Invoice was emailed to customer</td></tr>
          <tr><td><code>invoice.paid</code></td><td>Customer paid the invoice</td></tr>
          <tr><td><code>invoice.voided</code></td><td>Invoice was voided</td></tr>
        </tbody>
      </table>

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new invoice</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve an invoice by ID</td></tr>
          <tr><td><code>list(params?)</code></td><td>List invoices with optional filters</td></tr>
          <tr><td><code>open(id)</code></td><td>Transition from DRAFT to OPEN</td></tr>
          <tr><td><code>send(id)</code></td><td>Send the invoice via email</td></tr>
          <tr><td><code>void(id)</code></td><td>Void an unpaid invoice</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  Invoice,
  InvoiceCreateParams,
  InvoiceListParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> response</h3>
      <ResponseTable title="Invoice (create)">
        <ResponseField name="id" type="string" description="Unique invoice ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="customerAccountId" type="string" description="Customer being billed" />
        <ResponseField name="subscriptionId" type="string | null" description="Linked subscription, if auto-generated" />
        <ResponseField name="paymentIntentId" type="null" description="Always null at creation (set when paid)" />
        <ResponseField name="invoiceNumber" type="string" description="Sequential number, e.g. &quot;INV-00001&quot;" />
        <ResponseField name="status" type="string" description="&quot;DRAFT&quot; at creation" />
        <ResponseField name="subtotal" type="string" description="Pre-tax total (Decimal as string)" />
        <ResponseField name="taxAmount" type="string" description="Tax portion (Decimal as string)" />
        <ResponseField name="total" type="string" description="Final total including tax" />
        <ResponseField name="currency" type="string" description="Currency code, default &quot;USD&quot;" />
        <ResponseField name="taxRateId" type="string | null" description="Applied tax rate ID" />
        <ResponseField name="dueDate" type="string | null" description="ISO 8601 due date" />
        <ResponseField name="paidAt" type="null" description="Set when invoice is paid" />
        <ResponseField name="voidedAt" type="null" description="Set when invoice is voided" />
        <ResponseField name="periodStart" type="string | null" description="Billing period start (subscriptions)" />
        <ResponseField name="periodEnd" type="string | null" description="Billing period end (subscriptions)" />
        <ResponseField name="allowedChains" type="string | number[]" description="&quot;ALL&quot; or array of chain IDs" />
        <ResponseField name="allowedTokens" type="string | string[]" description="&quot;ALL&quot; or array of token keys" />
        <ResponseField name="memo" type="string | null" description="Note to customer" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="items" type="InvoiceItem[]" description="Line items (see below)" />
        <ResponseField name="customerAccount" type="CustomerAccount" description="Full customer object" />
        <ResponseField name="taxRate" type="TaxRate | null" description="Full tax rate object, if applied" />
      </ResponseTable>

      <ResponseTable title="InvoiceItem (nested in items[])">
        <ResponseField name="id" type="string" description="Item ID (UUID)" />
        <ResponseField name="invoiceId" type="string" description="Parent invoice ID" />
        <ResponseField name="productPlanId" type="string | null" description="Linked product plan" />
        <ResponseField name="productPlanPriceId" type="string | null" description="Linked price" />
        <ResponseField name="taxRateId" type="string | null" description="Item-level tax rate" />
        <ResponseField name="description" type="string" description="Item description" />
        <ResponseField name="amount" type="string" description="Item amount (Decimal as string)" />
        <ResponseField name="currency" type="string" description="Item currency" />
        <ResponseField name="quantity" type="number" description="Item quantity" />
        <ResponseField name="taxAmount" type="string" description="Tax for this item" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Returns all fields from <code>create()</code> above, plus these additional nested objects:
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="app" type="App" description="Full app object (id, name, environment, etc.)" />
        <ResponseField name="paymentIntent" type="PaymentIntent | null" description="Full payment intent with nested transactions[], once paid" />
        <ResponseField name="items[].taxRate" type="TaxRate | null" description="Tax rate on each individual item" />
      </ResponseTable>

      <Callout type="info" title="retrieve() includes transactions">
        The <code>paymentIntent</code> on retrieve also includes its <code>transactions[]</code> array,
        so you can see all on-chain tx hashes, statuses, and block numbers.
      </Callout>

      <h3><code>list()</code> response</h3>
      <p>
        Same as <code>retrieve()</code> but without the <code>app</code> relation. Includes <code>items</code> (with nested <code>taxRate</code>),
        <code>customerAccount</code>, <code>taxRate</code>, and <code>paymentIntent</code> (with <code>transactions</code>).
      </p>
      <CodeBlock
        language="json"
        title="Paginated response shape"
        code={`{
  "success": true,
  "data": [ /* Invoice[] */ ],
  "pagination": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}`}
      />

      <h3><code>open()</code> and <code>void()</code> response</h3>
      <p>
        Both return the invoice with <code>items[]</code> only (no customer, no tax rate, no payment intent).
        The <code>status</code> will be <code>&quot;OPEN&quot;</code> or <code>&quot;VOID&quot;</code> respectively.
      </p>

      <h3><code>send()</code> response</h3>
      <p>
        Returns a simple confirmation:
      </p>
      <CodeBlock
        language="json"
        title="Send response"
        code={`{ "success": true, "data": { "sent": true } }`}
      />
    </>
  );
}
