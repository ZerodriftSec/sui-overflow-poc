import { CodeBlock, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKWebhookEndpointsPage() {
  return (
    <>
      <h1>Webhook Endpoints</h1>
      <p className="subtitle">
        Register webhook endpoints to receive real-time notifications for payment events.
        Manage endpoints, rotate secrets, and verify signatures programmatically.
      </p>

      <h2>Create a webhook endpoint</h2>

      <CodeBlock
        language="typescript"
        title="Create endpoint"
        code={`const endpoint = await noderails.webhookEndpoints.create({
  url: 'https://yoursite.com/webhooks/noderails',
  events: [
    'payment.captured',
    'payment.settled',
    'subscription.created',
  ],
});

// Save the signing secret (only returned on creation)
console.log(endpoint.id);     // Endpoint ID
console.log(endpoint.secret); // "whsec_..." — store this securely`}
      />

      <Callout type="warning" title="Save the secret">
        The signing secret is only returned when you create the endpoint or rotate the secret.
        Store it securely in your environment variables.
      </Callout>

      <h2>List endpoints</h2>

      <CodeBlock
        language="typescript"
        title="List"
        code={`const endpoints = await noderails.webhookEndpoints.list();

for (const ep of endpoints) {
  console.log(ep.id, ep.url, ep.events);
}`}
      />

      <h2>Send a test ping</h2>

      <CodeBlock
        language="typescript"
        title="Test endpoint delivery"
        code={`await noderails.webhookEndpoints.testPing('endpoint-id');`}
      />

      <h2>List webhook deliveries</h2>

      <CodeBlock
        language="typescript"
        title="List deliveries"
        code={`const result = await noderails.webhookEndpoints.listDeliveries('endpoint-id', {
  limit: 20,
  status: 'FAILED',
});

console.log(result.items);
console.log(result.nextCursor);`}
      />

      <h2>Update events</h2>

      <CodeBlock
        language="typescript"
        title="Update"
        code={`await noderails.webhookEndpoints.update('endpoint-id', {
  events: ['payment.captured', 'payment.settled'],
});`}
      />

      <h2>Rotate the signing secret</h2>
      <p>
        Rotate the secret if you suspect it has been compromised. This invalidates the old
        secret immediately.
      </p>

      <CodeBlock
        language="typescript"
        title="Rotate secret"
        code={`const rotated = await noderails.webhookEndpoints.rotateSecret('endpoint-id');
console.log(rotated.secret); // New "whsec_..." value`}
      />

      <h2>Delete an endpoint</h2>

      <CodeBlock
        language="typescript"
        title="Delete"
        code={`await noderails.webhookEndpoints.delete('endpoint-id');`}
      />

      <h2>Verifying webhook signatures</h2>
      <p>
        When you receive a webhook, verify its signature before processing. The <code>constructEvent</code> method
        is a static utility that works without initializing the SDK client.
      </p>

      <CodeBlock
        language="typescript"
        title="Express handler with verification"
        code={`import { NodeRails } from '@noderails/sdk';

app.post('/webhooks/noderails', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = NodeRails.webhooks.constructEvent(
      req.body,                                        // Raw body (Buffer or string)
      req.headers['x-noderails-signature'] as string,  // Signature header
      req.headers['x-noderails-timestamp'] as string,  // Timestamp header
      process.env.WEBHOOK_SECRET!,                     // Your signing secret
    );

    // event is now verified and parsed
    console.log(event.event); // e.g., "payment.captured"
    console.log(event.data);  // The payment intent / subscription object

    res.sendStatus(200);
  } catch (err) {
    // Signature invalid or timestamp too old
    console.error('Webhook verification failed:', err);
    res.sendStatus(400);
  }
});`}
      />

      <Callout type="warning" title="Always verify signatures">
        Never process a webhook without verifying its signature first. The <code>constructEvent</code> method
        throws a <code>SignatureVerificationError</code> if the signature is invalid or the timestamp
        is too old (5 minute tolerance).
      </Callout>

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>create(params)</code></td><td>Create a new webhook endpoint</td></tr>
          <tr><td><code>list()</code></td><td>List all endpoints</td></tr>
          <tr><td><code>update(id, params)</code></td><td>Update endpoint configuration</td></tr>
          <tr><td><code>delete(id)</code></td><td>Delete an endpoint</td></tr>
          <tr><td><code>rotateSecret(id)</code></td><td>Rotate the signing secret</td></tr>
          <tr><td><code>testPing(id)</code></td><td>Send a test webhook delivery</td></tr>
          <tr><td><code>listDeliveries(id, params?)</code></td><td>List webhook deliveries with cursor pagination</td></tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr><th>Static Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>NodeRails.webhooks.constructEvent(...)</code></td><td>Verify signature and parse webhook payload</td></tr>
        </tbody>
      </table>

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>create()</code> response</h3>
      <ResponseTable title="WebhookEndpoint (create)">
        <ResponseField name="id" type="string" description="Unique endpoint ID (UUID)" />
        <ResponseField name="url" type="string" description="Your webhook URL" />
        <ResponseField name="events" type="string[]" description="Array of event types subscribed to" />
        <ResponseField name="active" type="boolean" description="Whether the endpoint is active" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="secret" type="string" description="Signing secret (only returned on create and rotateSecret)" />
      </ResponseTable>

      <Callout type="warning" title="Secret is only returned once">
        The <code>secret</code> field is only included when you create the endpoint or rotate its secret.
        It is never returned in <code>list()</code> or <code>update()</code> responses.
      </Callout>

      <h3><code>list()</code> response</h3>
      <ResponseTable title="WebhookEndpoint (list)">
        <ResponseField name="id" type="string" description="Endpoint ID" />
        <ResponseField name="url" type="string" description="Webhook URL" />
        <ResponseField name="events" type="string[]" description="Subscribed event types" />
        <ResponseField name="active" type="boolean" description="Whether active" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
      </ResponseTable>

      <h3><code>update()</code> response</h3>
      <ResponseTable title="WebhookEndpoint (update)">
        <ResponseField name="id" type="string" description="Endpoint ID" />
        <ResponseField name="url" type="string" description="Webhook URL" />
        <ResponseField name="events" type="string[]" description="Updated event types" />
        <ResponseField name="active" type="boolean" description="Whether active" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last update timestamp" />
      </ResponseTable>

      <h3><code>rotateSecret()</code> response</h3>
      <ResponseTable title="Rotate secret">
        <ResponseField name="secret" type="string" description="New 64-character hex signing secret" />
      </ResponseTable>

      <h3><code>delete()</code> response</h3>
      <p>Returns <code>204 No Content</code> (no response body).</p>
    </>
  );
}
