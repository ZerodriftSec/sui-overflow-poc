import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function CustomersPage() {
  return (
    <>
      <h1>Customers</h1>
      <p className="subtitle">
        Customers represent your end-users. Create customer records to track payments, link
        wallets, and manage subscriptions across your apps.
      </p>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a customer</h2>
      <Endpoint method="POST" path="/customers" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Yes</td><td>Your app UUID</td></tr>
          <tr><td><code>email</code></td><td><code>string</code></td><td>No</td><td>Customer email (max 255)</td></tr>
          <tr><td><code>name</code></td><td><code>string</code></td><td>No</td><td>Customer name (max 255)</td></tr>
          <tr><td><code>externalId</code></td><td><code>string</code></td><td>No</td><td>Your system&apos;s user ID (max 255)</td></tr>
          <tr><td><code>address</code></td><td><code>string</code></td><td>No</td><td>Street address (max 500)</td></tr>
          <tr><td><code>city</code></td><td><code>string</code></td><td>No</td><td>City (max 255)</td></tr>
          <tr><td><code>state</code></td><td><code>string</code></td><td>No</td><td>State/Province (max 255)</td></tr>
          <tr><td><code>country</code></td><td><code>string</code></td><td>No</td><td>Country (max 255)</td></tr>
          <tr><td><code>postalCode</code></td><td><code>string</code></td><td>No</td><td>Postal/zip code (max 50)</td></tr>
          <tr><td><code>metadata</code></td><td><code>object</code></td><td>No</td><td>Arbitrary key-value metadata</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const customer = await noderails.customers.create({
  email: 'alice@example.com',
  name: 'Alice Johnson',
  metadata: { plan: 'pro' },
});

console.log(customer.id); // "cust_abc123"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl -X POST https://api.noderails.com/customers \\
  -H "x-api-key: nr_live_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "your-app-id",
    "email": "alice@example.com",
    "name": "Alice Johnson"
  }'`}
      />

      <hr />

      {/* --- LIST --- */}
      <h2>List customers</h2>
      <Endpoint method="GET" path="/customers" />

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td>Filter by app UUID</td></tr>
          <tr><td><code>search</code></td><td><code>string</code></td><td>Search by name or email (max 255)</td></tr>
          <tr><td><code>page</code></td><td><code>number</code></td><td>Page number (default: 1)</td></tr>
          <tr><td><code>pageSize</code></td><td><code>number</code></td><td>Items per page (max 100)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const result = await noderails.customers.list({
  search: 'alice',
  page: 1,
  pageSize: 25,
});

for (const customer of result.data) {
  console.log(customer.name, customer.email);
}`}
      />

      <hr />

      {/* --- RETRIEVE --- */}
      <h2>Retrieve a customer</h2>
      <Endpoint method="GET" path="/customers/:id" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const customer = await noderails.customers.retrieve('cust_abc123');
console.log(customer.email);   // "alice@example.com"
console.log(customer.wallets); // [{ chainId: 1, address: "0x..." }]`}
      />

      <hr />

      {/* --- UPDATE --- */}
      <h2>Update a customer</h2>
      <Endpoint method="PUT" path="/customers/:id" />

      <p>Updates customer fields. Only the provided fields are changed. Omitted fields are left unchanged.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const updated = await noderails.customers.update('cust_abc123', {
  name: 'Alice J.',
  metadata: { plan: 'enterprise' },
});`}
      />

      <hr />

      {/* --- ADD WALLET --- */}
      <h2>Add a wallet</h2>
      <Endpoint method="POST" path="/customers/:id/wallets" />

      <p>Links a blockchain wallet address to a customer.</p>

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>chainId</code></td><td><code>number</code></td><td>Yes</td><td>Blockchain chain ID (e.g. 1 for Ethereum)</td></tr>
          <tr><td><code>walletAddress</code></td><td><code>string</code></td><td>Yes</td><td>Wallet address (0x-prefixed, 40 hex chars)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.customers.addWallet('cust_abc123', {
  chainId: 1,
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
});`}
      />

      <hr />

      {/* --- REMOVE WALLET --- */}
      <h2>Remove a wallet</h2>
      <Endpoint method="DELETE" path="/customers/:customerId/wallets/:walletId" />

      <p>Unlinks a wallet from a customer. Returns <code>204 No Content</code>.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.customers.removeWallet('cust_abc123', 'wallet_xyz');`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>. List
        endpoints add <code>pagination</code>.
      </p>

      <CodeBlock
        language="json"
        title="Customer object (create / update)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "appId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "externalId": "user_42",
    "email": "alice@example.com",
    "name": "Alice Johnson",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "country": "US",
    "postalCode": "94105",
    "metadata": { "plan": "pro" },
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z",
    "wallets": [
      {
        "id": "c3d4e5f6-a7b8-9012-cdef-345678901234",
        "customerAccountId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "chainId": 1,
        "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
        "hasActiveAuthorization": false,
        "authorizationType": null,
        "authorizationTxHash": null,
        "authorizedAt": null,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  }
}`}
      />

      <ResponseTable title="CustomerAccount fields">
        <ResponseField name="id" type="string" description="Unique customer UUID" />
        <ResponseField name="appId" type="string" description="App this customer belongs to" />
        <ResponseField name="externalId" type="string | null" description="Your system's user ID" />
        <ResponseField name="email" type="string | null" description="Customer email" />
        <ResponseField name="name" type="string | null" description="Customer name" />
        <ResponseField name="address" type="string | null" description="Street address" />
        <ResponseField name="city" type="string | null" description="City" />
        <ResponseField name="state" type="string | null" description="State or province" />
        <ResponseField name="country" type="string | null" description="Country" />
        <ResponseField name="postalCode" type="string | null" description="Postal or zip code" />
        <ResponseField name="metadata" type="object" description="Arbitrary key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
        <ResponseField name="wallets" type="CustomerWallet[]" description="Linked blockchain wallets" />
      </ResponseTable>

      <ResponseTable title="CustomerWallet fields">
        <ResponseField name="id" type="string" description="Wallet UUID" />
        <ResponseField name="customerAccountId" type="string" description="Parent customer UUID" />
        <ResponseField name="chainId" type="number" description="Blockchain chain ID (e.g. 1 for Ethereum)" />
        <ResponseField name="walletAddress" type="string" description="On-chain wallet address" />
        <ResponseField name="hasActiveAuthorization" type="boolean" description="Whether this wallet has an active spending authorization" />
        <ResponseField name="authorizationType" type="string | null" description="PERMIT or APPROVAL" />
        <ResponseField name="authorizationTxHash" type="string | null" description="Authorization transaction hash" />
        <ResponseField name="authorizedAt" type="string | null" description="ISO 8601 authorization timestamp" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp" />
      </ResponseTable>

      <Callout type="info" title="Endpoint variations">
        <strong>Create/update</strong> include <code>wallets</code>.{' '}
        <strong>Retrieve</strong> is richest: includes <code>app</code>,{' '}
        <code>wallets</code> (with <code>chain</code> info), the last 50{' '}
        <code>paymentIntents</code> (selected fields), and last 50 <code>invoices</code> (selected fields).{' '}
        <strong>List</strong> includes <code>wallets</code> plus <code>_count</code> aggregates
        for <code>paymentIntents</code>, <code>subscriptions</code>, and <code>invoices</code>.{' '}
        <strong>Add wallet</strong> returns the wallet with <code>chain</code> info.{' '}
        <strong>Remove wallet</strong> returns <code>204 No Content</code>.
      </Callout>
    </>
  );
}
