import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function WebhookEndpointsPage() {
  return (
    <>
      <h1>Webhook Endpoints</h1>
      <p className="subtitle">
        Manage your webhook endpoint registrations. Create endpoints, configure which events
        they receive, rotate signing secrets, and inspect delivery history.
      </p>

      <Callout type="info" title="Base path">
        Webhook endpoints are scoped to an app:{' '}
        <code>/apps/:appId/webhooks</code>. The SDK handles this automatically using the{' '}
        <code>appId</code> from your client configuration.
      </Callout>

      <hr />

      {/* --- CREATE --- */}
      <h2>Create a webhook endpoint</h2>
      <Endpoint method="POST" path="/apps/:appId/webhooks" />

      <h3>Request body</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>url</code></td><td><code>string</code></td><td>Yes</td><td>HTTPS URL to receive events</td></tr>
          <tr><td><code>events</code></td><td><code>string[]</code></td><td>Yes</td><td>Events to subscribe to (min 1)</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const endpoint = await noderails.webhookEndpoints.create({
  url: 'https://example.com/webhooks/noderails',
  events: [
    'payment_intent.captured',
    'payment_intent.refunded',
    'invoice.paid',
    'subscription.cancelled',
  ],
});

console.log(endpoint.id);     // "we_abc123"
console.log(endpoint.secret); // "whsec_..." — save this!`}
      />

      <Callout type="warning" title="Save the secret">
        The webhook signing secret is only returned once, when the endpoint is first created.
        Store it securely. You&apos;ll need it to verify webhook signatures.
      </Callout>

      <hr />

      {/* --- LIST --- */}
      <h2>List webhook endpoints</h2>
      <Endpoint method="GET" path="/apps/:appId/webhooks" />

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const endpoints = await noderails.webhookEndpoints.list();

for (const ep of endpoints) {
  console.log(ep.url, ep.events, ep.active);
}`}
      />

      <hr />

      {/* --- UPDATE --- */}
      <h2>Update a webhook endpoint</h2>
      <Endpoint method="PUT" path="/apps/:appId/webhooks/:webhookId" />

      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>url</code></td><td><code>string</code></td><td>No</td><td>Updated endpoint URL</td></tr>
          <tr><td><code>events</code></td><td><code>string[]</code></td><td>No</td><td>Updated event list</td></tr>
          <tr><td><code>active</code></td><td><code>boolean</code></td><td>No</td><td>Enable/disable endpoint</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const updated = await noderails.webhookEndpoints.update('we_abc123', {
  events: ['payment_intent.captured', 'payment_intent.settled'],
  active: true,
});`}
      />

      <hr />

      {/* --- DELETE --- */}
      <h2>Delete a webhook endpoint</h2>
      <Endpoint method="DELETE" path="/apps/:appId/webhooks/:webhookId" />

      <p>Permanently deletes a webhook endpoint. Returns <code>204 No Content</code>.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.webhookEndpoints.del('we_abc123');`}
      />

      <hr />

      {/* --- ROTATE SECRET --- */}
      <h2>Rotate signing secret</h2>
      <Endpoint method="POST" path="/apps/:appId/webhooks/:webhookId/rotate-secret" />

      <p>Generates a new signing secret for the endpoint. The old secret is immediately invalidated.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const rotated = await noderails.webhookEndpoints.rotateSecret('we_abc123');
console.log(rotated.secret); // "whsec_..." — new secret`}
      />

      <hr />

      {/* --- TEST PING --- */}
      <h2>Send a test ping</h2>
      <Endpoint method="POST" path="/apps/:appId/webhooks/:webhookId/test-ping" />

      <p>Sends a test event to the endpoint to verify connectivity.</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`await noderails.webhookEndpoints.testPing('we_abc123');`}
      />

      <hr />

      {/* --- DELIVERIES --- */}
      <h2>List deliveries</h2>
      <Endpoint method="GET" path="/apps/:appId/webhooks/:webhookId/deliveries" />

      <p>Retrieves the delivery history for a webhook endpoint (cursor-based pagination).</p>

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>status</code></td><td><code>string</code></td><td>Filter by delivery status</td></tr>
          <tr><td><code>cursor</code></td><td><code>string</code></td><td>Cursor for pagination</td></tr>
          <tr><td><code>limit</code></td><td><code>number</code></td><td>Number of results to return</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const deliveries = await noderails.webhookEndpoints.listDeliveries(
  'we_abc123',
  { limit: 20 },
);

for (const d of deliveries.data) {
  console.log(d.eventType, d.status, d.responseCode);
}`}
      />

      <hr />

      <h2>Response object</h2>
      <p>
        All responses are wrapped in <code>{'{ "success": true, "data": ... }'}</code>.
        Delete returns <code>204 No Content</code>.
      </p>

      <CodeBlock
        language="json"
        title="WebhookEndpoint object (create)"
        code={`{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "url": "https://example.com/webhooks/noderails",
    "events": [
      "payment_intent.captured",
      "payment_intent.refunded",
      "invoice.paid"
    ],
    "active": true,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "secret": "whsec_a1b2c3d4e5f6..."
  }
}`}
      />

      <ResponseTable title="WebhookEndpoint fields">
        <ResponseField name="id" type="string" description="Unique webhook endpoint UUID" />
        <ResponseField name="url" type="string" description="HTTPS URL that receives events" />
        <ResponseField name="events" type="string[]" description="Subscribed event types" />
        <ResponseField name="active" type="boolean" description="Whether the endpoint is enabled" />
        <ResponseField name="createdAt" type="string" description="ISO 8601 creation timestamp (create and list only)" />
        <ResponseField name="updatedAt" type="string" description="ISO 8601 last-update timestamp (list and update only)" />
        <ResponseField name="secret" type="string" description="Webhook signing secret (only returned on create)" />
      </ResponseTable>

      <Callout type="warning" title="Field availability varies by endpoint">
        <strong>Create</strong> returns <code>id</code>, <code>url</code>, <code>events</code>,{' '}
        <code>active</code>, <code>createdAt</code>, and <code>secret</code>.{' '}
        <strong>List</strong> returns the same except <code>secret</code> and adds <code>updatedAt</code>.{' '}
        <strong>Update</strong> returns <code>id</code>, <code>url</code>, <code>events</code>,{' '}
        <code>active</code>, <code>updatedAt</code> (no <code>createdAt</code> or <code>secret</code>).{' '}
        <strong>Rotate secret</strong> returns only <code>{'{ "secret": "whsec_..." }'}</code>.
      </Callout>

      <h3>Test ping response</h3>
      <CodeBlock
        language="json"
        title="Test ping result"
        code={`{
  "success": true,
  "data": {
    "success": true,
    "statusCode": 200,
    "responseBody": "OK",
    "error": null
  }
}`}
      />

      <h3>Delivery history</h3>
      <p>Deliveries use cursor-based pagination:</p>
      <CodeBlock
        language="json"
        title="Deliveries response"
        code={`{
  "success": true,
  "data": {
    "items": [
      {
        "id": "del-uuid",
        "event": "payment_intent.captured",
        "status": "DELIVERED",
        "responseStatus": 200,
        "attempts": 1,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "deliveredAt": "2025-01-15T10:30:01.000Z",
        "nextRetryAt": null
      }
    ],
    "nextCursor": null
  }
}`}
      />
    </>
  );
}
