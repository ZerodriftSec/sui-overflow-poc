import { CodeBlock, Callout, Endpoint } from '@/components/docs/ui';

export default function WebhooksGuidePage() {
  return (
    <>
      <h1>Webhooks</h1>
      <p className="subtitle">
        Receive real-time notifications when events happen in your NodeRails account: payments
        captured, invoices paid, subscriptions created, and more.
      </p>

      <h2>How webhooks work</h2>
      <ol>
        <li>You register a webhook endpoint URL and choose which events to listen to.</li>
        <li>When an event occurs, NodeRails sends an HTTP POST to your endpoint with a JSON payload.</li>
        <li>Your server verifies the signature, processes the event, and responds with <code>2xx</code>.</li>
        <li>If delivery fails, NodeRails retries with exponential backoff.</li>
      </ol>

      <h2>Supported events</h2>
      <table>
        <thead>
          <tr><th>Event</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>payment_intent.created</code></td><td>A payment intent was created</td></tr>
          <tr><td><code>payment_intent.authorized</code></td><td>Customer gave approval to pull money from their wallet</td></tr>
          <tr><td><code>payment_intent.captured</code></td><td>Funds taken from wallet, locked in escrow, and confirmed on-chain</td></tr>
          <tr><td><code>payment_intent.settled</code></td><td>Escrowed payment settled to merchant</td></tr>
          <tr><td><code>payment_intent.cancelled</code></td><td>Payment intent was cancelled</td></tr>
          <tr><td><code>payment_intent.refunded</code></td><td>Payment was refunded</td></tr>
          <tr><td><code>payment_intent.failed</code></td><td>Payment attempt failed</td></tr>
          <tr><td><code>checkout_session.completed</code></td><td>Checkout session completed</td></tr>
          <tr><td><code>checkout_session.expired</code></td><td>Checkout session expired</td></tr>
          <tr><td><code>invoice.paid</code></td><td>Invoice was paid</td></tr>
          <tr><td><code>invoice.voided</code></td><td>Invoice was voided</td></tr>
          <tr><td><code>subscription.created</code></td><td>A subscription was created</td></tr>
          <tr><td><code>subscription.paused</code></td><td>Subscription was paused</td></tr>
          <tr><td><code>subscription.resumed</code></td><td>Subscription was resumed</td></tr>
          <tr><td><code>subscription.cancelled</code></td><td>Subscription was cancelled</td></tr>
          <tr><td><code>subscription.renewed</code></td><td>Subscription period renewed</td></tr>
        </tbody>
      </table>

      <h2>Webhook payload</h2>
      <p>Every webhook delivery sends a JSON object with the following structure:</p>

      <CodeBlock
        language="json"
        title="Webhook payload"
        code={`{
  "id": "evt_abc123",
  "type": "payment_intent.captured",
  "data": {
    "id": "pi_xyz789",
    "status": "CAPTURED",
    "amount": "99.99",
    "currency": "USD",
    "chainId": 1,
    "tokenAddress": "0x...",
    "txHash": "0x...",
    ...
  },
  "createdAt": "2025-01-15T10:30:00.000Z"
}`}
      />

      <h2>Signature verification</h2>
      <p>
        Every webhook request includes a signature header so you can verify the payload originated
        from NodeRails and wasn't tampered with.
      </p>

      <table>
        <thead>
          <tr><th>Header</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>x-noderails-signature</code></td><td>HMAC-SHA256 hex digest of the raw body</td></tr>
          <tr><td><code>x-noderails-timestamp</code></td><td>Unix timestamp (ms) when the payload was signed</td></tr>
        </tbody>
      </table>

      <h3>Using the SDK</h3>
      <p>
        The easiest way to verify signatures is with the SDK&apos;s <code>webhooks</code> helper:
      </p>

      <CodeBlock
        language="typescript"
        title="Express webhook handler"
        code={`import express from 'express';
import { NodeRails } from '@noderails/sdk';

const app = express();
const noderails = new NodeRails({
  appId: 'your-app-id',
  apiKey: 'nr_live_sk_...',
});

const WEBHOOK_SECRET = 'whsec_...'; // From your dashboard

// Important: use raw body for signature verification
app.post(
  '/webhooks/noderails',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-noderails-signature'] as string;

    try {
      const event = noderails.webhooks.constructEvent(
        req.body,         // Raw body (Buffer or string)
        signature,        // Signature header value
        WEBHOOK_SECRET,   // Your webhook signing secret
      );

      // Handle the event
      switch (event.type) {
        case 'payment_intent.captured':
          console.log('Payment captured:', event.data.id);
          break;
        case 'invoice.paid':
          console.log('Invoice paid:', event.data.id);
          break;
        default:
          console.log('Unhandled event:', event.type);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      res.status(400).send('Invalid signature');
    }
  }
);`}
      />

      <h3>Manual verification</h3>
      <p>
        If you&apos;re not using the SDK, you can verify the HMAC-SHA256 signature manually:
      </p>

      <CodeBlock
        language="typescript"
        title="Manual HMAC verification"
        code={`import crypto from 'crypto';

function verifyWebhook(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}`}
      />

      <Callout type="warning" title="Use the raw body">
        Always use the raw, unparsed request body for signature verification. Parsing JSON and
        re-stringifying can change whitespace or key order, causing the signature check to fail.
      </Callout>

      <h2>Retry behavior</h2>
      <p>
        If your endpoint returns a non-<code>2xx</code> status code or doesn&apos;t respond within 15
        seconds, NodeRails will retry the delivery:
      </p>
      <ul>
        <li>Up to <strong>5 retries</strong> with exponential backoff</li>
        <li>Retry delays: 1 min, 5 min, 30 min, 2 hours, 24 hours</li>
        <li>After all retries are exhausted, the delivery is marked as failed</li>
      </ul>

      <h2>Best practices</h2>
      <ul>
        <li>
          <strong>Return 2xx quickly.</strong> Process events asynchronously using a queue.
          Acknowledge receipt immediately to avoid timeouts and retries.
        </li>
        <li>
          <strong>Handle duplicates.</strong> Use the event <code>id</code> field to deduplicate.
          The same event may be delivered more than once during retries.
        </li>
        <li>
          <strong>Verify signatures.</strong> Always verify the webhook signature before processing.
          Never trust unverified payloads.
        </li>
        <li>
          <strong>Use HTTPS.</strong> Webhook endpoints must use HTTPS in production for security.
        </li>
      </ul>

      <h2>Testing webhooks</h2>
      <p>
        You can send a test ping from the dashboard or via the API to verify your endpoint is
        reachable:
      </p>

      <CodeBlock
        language="typescript"
        title="Send a test ping"
        code={`// Via SDK
await noderails.webhookEndpoints.testPing('webhook-endpoint-id');`}
      />

      <p>
        You can also view recent deliveries and their status in the dashboard or via the API:
      </p>

      <CodeBlock
        language="typescript"
        title="List deliveries"
        code={`const deliveries = await noderails.webhookEndpoints.listDeliveries(
  'webhook-endpoint-id',
  { limit: 20 }
);

for (const delivery of deliveries.data) {
  console.log(delivery.status, delivery.responseCode);
}`}
      />
    </>
  );
}
