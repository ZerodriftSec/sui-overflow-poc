import Link from 'next/link';
import { CodeBlock, Callout } from '@/components/docs/ui';

export default function SDKPage() {
  return (
    <>
      <h1>Installation &amp; Configuration</h1>
      <p className="subtitle">
        The official Node.js SDK for integrating NodeRails crypto payments. Zero runtime
        dependencies, full TypeScript support, and cross-runtime compatibility.
      </p>

      <h2>Installation</h2>
      <CodeBlock language="bash" title="Install" code={`npm install @noderails/sdk`} />

      <h3>Requirements</h3>
      <ul>
        <li>Node.js 18+ (uses native <code>fetch</code>)</li>
        <li>Also works in Deno and Bun</li>
        <li>TypeScript 5+ recommended (full type inference)</li>
      </ul>

      <h2 id="configuration">Configuration</h2>

      <CodeBlock
        language="typescript"
        title="Initialize the client"
        code={`import { NodeRails } from '@noderails/sdk';

const noderails = new NodeRails({
  appId: 'your-app-id',          // Required: your app UUID
  apiKey: 'nr_live_sk_...',      // Required: secret API key
  baseUrl: 'https://api.noderails.com', // Optional: override API URL
  timeout: 30000,                // Optional: request timeout in ms
  apiVersion: '2026-03-07',      // Optional: pin to a specific API version
});`}
      />

      <table>
        <thead>
          <tr><th>Option</th><th>Type</th><th>Default</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>appId</code></td><td><code>string</code></td><td></td><td>Your app UUID from the dashboard</td></tr>
          <tr><td><code>apiKey</code></td><td><code>string</code></td><td></td><td>Secret API key (<code>nr_*_sk_*</code>)</td></tr>
          <tr><td><code>baseUrl</code></td><td><code>string</code></td><td><code>https://api.noderails.com</code></td><td>Override the API base URL</td></tr>
          <tr><td><code>timeout</code></td><td><code>number</code></td><td><code>30000</code></td><td>Request timeout in milliseconds</td></tr>
          <tr><td><code>apiVersion</code></td><td><code>string</code></td><td>Latest</td><td>Pin requests to a specific API version</td></tr>
        </tbody>
      </table>

      <Callout type="warning" title="Secret keys only">
        The SDK requires a secret key (<code>sk</code>). Public keys cannot be used as they are
        for client-side operations only.
      </Callout>

      <h2>Common patterns</h2>

      <h3>Pagination</h3>
      <p>
        All list endpoints return a <code>PaginatedResult</code> with <code>data</code> and <code>pagination</code>:
      </p>

      <CodeBlock
        language="typescript"
        title="Paginated results"
        code={`const result = await noderails.paymentIntents.list({
  page: 1,
  pageSize: 50,
  status: 'CAPTURED',
});

console.log(result.data);              // PaymentIntent[]
console.log(result.pagination.total);  // Total count
console.log(result.pagination.totalPages); // Total number of pages`}
      />

      <h3>Idempotency keys</h3>
      <p>
        For safe retries, pass an idempotency key on any mutating request. If you send the same
        key twice, you&apos;ll get back the same response without creating a duplicate.
      </p>

      <CodeBlock
        language="typescript"
        title="Idempotent requests"
        code={`const intent = await noderails.paymentIntents.create(
  {
    amount: '100.00',
    currency: 'USD',
  },
  { idempotencyKey: 'order_456' },
);`}
      />

      <h3>Authentication header</h3>
      <p>
        The SDK automatically sends your API key using the <code>x-api-key</code> header. Manually, the headers look like:
      </p>

      <CodeBlock
        language="text"
        title="HTTP headers"
        code={`x-api-key: nr_live_sk_abc123...
    Content-Type: application/json`}
      />

      <h3>Response format</h3>
      <p>
        API responses use a standard envelope. The SDK unwraps this automatically so you always
        get the <code>data</code> directly:
      </p>

      <CodeBlock
        language="json"
        title="Raw API response (unwrapped by SDK)"
        code={`{
  "success": true,
  "data": {
    "id": "abc123...",
    "status": "OPEN",
    ...
  }
}`}
      />

      <h2>TypeScript support</h2>
      <p>
        All request parameters and response types are fully typed. Import types directly from the SDK:
      </p>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  CheckoutSession,
  CheckoutSessionCreateParams,
  PaymentIntent,
  PaymentIntentCreateParams,
  Invoice,
  Subscription,
  PaginatedResult,
} from '@noderails/sdk';`}
      />

      <hr />

      <h2>Resources</h2>
      <p>Each resource has its own page with full usage examples, method references, and TypeScript types:</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 not-prose">
        <Link
          href="/docs/sdk/checkout-sessions"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Checkout Sessions →</div>
          <p className="text-sm text-slate-500 mt-1">Create hosted checkout pages. Full flow: create → redirect → webhook → status.</p>
        </Link>
        <Link
          href="/docs/sdk/payment-intents"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Payment Intents →</div>
          <p className="text-sm text-slate-500 mt-1">Core payment object. Create, authorize, capture, settle, cancel, refund.</p>
        </Link>
        <Link
          href="/docs/sdk/invoices"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Invoices →</div>
          <p className="text-sm text-slate-500 mt-1">Bill customers with line items. Create → open → send → paid.</p>
        </Link>
        <Link
          href="/docs/sdk/subscriptions"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Subscriptions →</div>
          <p className="text-sm text-slate-500 mt-1">Recurring payments. Create plans, subscribe customers, pause/resume/cancel.</p>
        </Link>
        <Link
          href="/docs/sdk/customers"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Customers →</div>
          <p className="text-sm text-slate-500 mt-1">Manage customers and their wallets.</p>
        </Link>
        <Link
          href="/docs/sdk/payment-links"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Payment Links →</div>
          <p className="text-sm text-slate-500 mt-1">Shareable payment URLs. No integration needed.</p>
        </Link>
        <Link
          href="/docs/sdk/product-plans"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Product Plans →</div>
          <p className="text-sm text-slate-500 mt-1">Define products with multiple pricing tiers for subscriptions.</p>
        </Link>
        <Link
          href="/docs/sdk/webhook-endpoints"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Webhook Endpoints →</div>
          <p className="text-sm text-slate-500 mt-1">Register endpoints, rotate secrets, verify signatures.</p>
        </Link>
        <Link
          href="/docs/sdk/tax-rates"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Tax Rates →</div>
          <p className="text-sm text-slate-500 mt-1">Create and manage tax rates for invoices.</p>
        </Link>
        <Link
          href="/docs/sdk/prices"
          className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">Prices →</div>
          <p className="text-sm text-slate-500 mt-1">Real-time USD ↔ crypto conversion.</p>
        </Link>
      </div>
    </>
  );
}
