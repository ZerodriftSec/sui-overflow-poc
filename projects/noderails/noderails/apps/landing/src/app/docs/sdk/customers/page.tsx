import { CodeBlock, ResponseTable, ResponseField, Callout } from '@/components/docs/ui';

export default function SDKCustomersPage() {
  return (
    <>
      <h1>Customers</h1>
      <p className="subtitle">
        Customers represent the people paying you. Link payments, subscriptions, and invoices
        to a customer for tracking and management.
      </p>

      <h2>Create a customer</h2>

      <CodeBlock
        language="typescript"
        title="Create"
        code={`const customer = await noderails.customers.create({
  email: 'bob@example.com',
  name: 'Bob',
  metadata: { plan: 'enterprise' },
});

console.log(customer.id);    // Customer ID
console.log(customer.email); // "bob@example.com"`}
      />

      <h2>Retrieve a customer</h2>

      <CodeBlock
        language="typescript"
        title="Retrieve"
        code={`const customer = await noderails.customers.retrieve('customer-id');
console.log(customer.name, customer.email);`}
      />

      <h2>Update a customer</h2>

      <CodeBlock
        language="typescript"
        title="Update"
        code={`const updated = await noderails.customers.update('customer-id', {
  name: 'Robert',
  metadata: { plan: 'pro' },
});`}
      />

      <h2>List customers</h2>

      <CodeBlock
        language="typescript"
        title="List"
        code={`const customers = await noderails.customers.list({
  page: 1,
  pageSize: 50,
});

for (const c of customers.data) {
  console.log(c.id, c.name, c.email);
}`}
      />

      <h2>Manage wallets</h2>
      <p>
        Customers can have multiple wallets across different chains. Add and remove wallets
        to track which addresses belong to a customer. Use an EVM <code>0x…</code> address with an EVM <code>chainId</code>;
        use a Solana base58 public key with a Solana cluster id (e.g. <code>103</code>).
      </p>

      <Callout type="info" title="Solana">
        <code>walletAddress</code> for Solana is base58-encoded, not <code>0x</code>-prefixed.
      </Callout>

      <CodeBlock
        language="typescript"
        title="Add and remove wallets"
        code={`// Add an EVM wallet
const evmWallet = await noderails.customers.addWallet('customer-id', {
  walletAddress: '0xdef...',
  chainId: 1,
});

// Add a Solana wallet (base58 public key, Solana mainnet cluster id in NodeRails)
const solWallet = await noderails.customers.addWallet('customer-id', {
  walletAddress: 'SoLanaBase58Pubkey...',
  chainId: 103,
});

console.log(evmWallet.walletAddress, solWallet.walletAddress);

// Remove a wallet
await noderails.customers.removeWallet('customer-id', evmWallet.id);`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new customer</td></tr>
          <tr><td><code>retrieve(id)</code></td><td>Retrieve a customer with wallets and history</td></tr>
          <tr><td><code>list(params?)</code></td><td>List customers with pagination</td></tr>
          <tr><td><code>update(id, params)</code></td><td>Update customer details</td></tr>
          <tr><td><code>addWallet(customerId, params)</code></td><td>Add a wallet to a customer</td></tr>
          <tr><td><code>removeWallet(customerId, walletId)</code></td><td>Remove a wallet</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  Customer,
  CustomerCreateParams,
  CustomerUpdateParams,
  CustomerListParams,
  CustomerWallet,
  CustomerAddWalletParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> and <code>update()</code> response</h3>
      <ResponseTable title="Customer">
        <ResponseField name="id" type="string" description="Unique customer ID (UUID)" />
        <ResponseField name="appId" type="string" description="Your app ID" />
        <ResponseField name="externalId" type="string | null" description="Your external customer ID" />
        <ResponseField name="email" type="string | null" description="Customer email" />
        <ResponseField name="name" type="string | null" description="Customer name" />
        <ResponseField name="address" type="string | null" description="Street address" />
        <ResponseField name="city" type="string | null" description="City" />
        <ResponseField name="state" type="string | null" description="State or province" />
        <ResponseField name="country" type="string | null" description="Country" />
        <ResponseField name="postalCode" type="string | null" description="Postal/ZIP code" />
        <ResponseField name="metadata" type="object" description="Your metadata key-value pairs" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
        <ResponseField name="wallets" type="CustomerWallet[]" description="All wallets linked to this customer" />
      </ResponseTable>

      <ResponseTable title="CustomerWallet (nested in wallets[])">
        <ResponseField name="id" type="string" description="Wallet record ID (UUID)" />
        <ResponseField name="customerAccountId" type="string" description="Parent customer ID" />
        <ResponseField name="chainId" type="number" description="Chain ID (EVM e.g. 1, 137, 8453; Solana e.g. 103, 102, 101)" />
        <ResponseField name="walletAddress" type="string" description="EVM address lowercased, or Solana base58" />
        <ResponseField name="hasActiveAuthorization" type="boolean" description="Whether the wallet has an active authorization" />
        <ResponseField name="authorizationType" type="string | null" description="Type of authorization (PERMIT, NATIVE, etc.)" />
        <ResponseField name="authorizationTxHash" type="string | null" description="Authorization transaction hash" />
        <ResponseField name="authorizedAt" type="string | null" description="When authorization was granted" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 timestamp" />
      </ResponseTable>

      <h3><code>retrieve()</code> response</h3>
      <p>
        Returns all customer fields above, plus rich nested data:
      </p>
      <ResponseTable title="Additional fields on retrieve">
        <ResponseField name="app" type="App" description="Full app object" />
        <ResponseField name="wallets[].chain" type="{ chainId, name }" description="Chain info on each wallet" />
        <ResponseField name="paymentIntents" type="PaymentIntent[]" description="Last 50 payment intents (selected fields: id, status, amount, currency, cryptoAmount, cryptoTokenKey, authorizationChainId, createdAt, capturedAt)" />
        <ResponseField name="invoices" type="Invoice[]" description="Last 50 invoices (selected fields: id, invoiceNumber, status, total, currency, dueDate, paidAt, createdAt)" />
      </ResponseTable>

      <h3><code>list()</code> response</h3>
      <p>
        Returns paginated customers. Each includes <code>wallets[]</code> plus counts:
      </p>
      <ResponseTable title="Additional fields on list">
        <ResponseField name="_count.paymentIntents" type="number" description="Total number of payment intents" />
        <ResponseField name="_count.subscriptions" type="number" description="Total number of subscriptions" />
        <ResponseField name="_count.invoices" type="number" description="Total number of invoices" />
      </ResponseTable>

      <h3><code>addWallet()</code> response</h3>
      <p>Returns the new wallet with chain info:</p>
      <ResponseTable title="Wallet response">
        <ResponseField name="id" type="string" description="Wallet ID (UUID)" />
        <ResponseField name="customerAccountId" type="string" description="Parent customer ID" />
        <ResponseField name="chainId" type="number" description="Chain ID (EVM or Solana cluster id)" />
        <ResponseField name="walletAddress" type="string" description="EVM address (lowercased) or Solana base58" />
        <ResponseField name="chain" type="{ chainId, name }" description="Chain metadata" />
      </ResponseTable>

      <h3><code>removeWallet()</code> response</h3>
      <p>Returns <code>204 No Content</code> (no response body).</p>
    </>
  );
}
