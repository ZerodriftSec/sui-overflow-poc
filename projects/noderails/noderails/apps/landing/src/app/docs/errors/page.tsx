import { CodeBlock, Callout } from '@/components/docs/ui';

export default function ErrorsPage() {
  return (
    <>
      <h1>Error Handling</h1>
      <p className="subtitle">
        The NodeRails SDK throws typed errors that map to HTTP status codes and API error
        responses. All errors extend the base <code>ApiError</code> class.
      </p>

      <h2>Error hierarchy</h2>

      <CodeBlock
        language="text"
        title="Error class hierarchy"
        code={`Error
└── ApiError                    — Base: any API / HTTP error
    ├── AuthenticationError     — 401 Unauthorized
    ├── NotFoundError           — 404 Not Found
    ├── ValidationError         — 400 Bad Request
    └── RateLimitError          — 429 Too Many Requests

Error
├── ConnectionError             — Network / DNS failure
├── TimeoutError                — Request timed out
└── SignatureVerificationError  — Webhook HMAC mismatch`}
      />

      <hr />

      <h2>ApiError</h2>
      <p>Base class for all HTTP errors returned by the API.</p>

      <table>
        <thead>
          <tr><th>Property</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>message</code></td><td><code>string</code></td><td>Human-readable error description</td></tr>
          <tr><td><code>status</code></td><td><code>number</code></td><td>HTTP status code (e.g. 400, 401, 404)</td></tr>
          <tr><td><code>code</code></td><td><code>string | undefined</code></td><td>Machine-readable error code</td></tr>
        </tbody>
      </table>

      <CodeBlock
        language="typescript"
        title="Catching API errors"
        code={`import { ApiError } from '@noderails/sdk';

try {
  const session = await noderails.checkoutSessions.create(params);
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.message);  // "Validation failed"
    console.error(error.status);   // 400
    console.error(error.code);     // "VALIDATION_ERROR"
  }
}`}
      />

      <hr />

      <h2>AuthenticationError</h2>
      <p>
        Thrown when the API key is missing, invalid, or expired. Extends <code>ApiError</code>{' '}
        with <code>status: 401</code>.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle auth errors"
        code={`import { AuthenticationError } from '@noderails/sdk';

try {
  const customers = await noderails.customers.list();
} catch (error) {
  if (error instanceof AuthenticationError) {
    // API key is invalid — check your configuration
    console.error('Auth failed:', error.message);
  }
}`}
      />

      <Callout type="info" title="Common causes">
        <ul>
          <li>Using a public key (<code>pk</code>) instead of a secret key (<code>sk</code>)</li>
          <li>API key was rotated or invalidated</li>
          <li>Wrong environment (test key on live, or vice-versa)</li>
        </ul>
      </Callout>

      <hr />

      <h2>NotFoundError</h2>
      <p>
        Thrown when the requested resource does not exist. Extends <code>ApiError</code> with{' '}
        <code>status: 404</code>.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle not found"
        code={`import { NotFoundError } from '@noderails/sdk';

try {
  const intent = await noderails.paymentIntents.retrieve('non-existent-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Resource not found');
  }
}`}
      />

      <hr />

      <h2>ValidationError</h2>
      <p>
        Thrown when request parameters fail server-side validation. Extends <code>ApiError</code>{' '}
        with <code>status: 400</code>.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle validation errors"
        code={`import { ValidationError } from '@noderails/sdk';

try {
  const session = await noderails.checkoutSessions.create({
    // missing required fields
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid params:', error.message);
  }
}`}
      />

      <hr />

      <h2>RateLimitError</h2>
      <p>
        Thrown when you exceed the API rate limit. Extends <code>ApiError</code> with{' '}
        <code>status: 429</code>.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle rate limiting"
        code={`import { RateLimitError } from '@noderails/sdk';

try {
  const result = await noderails.paymentIntents.list();
} catch (error) {
  if (error instanceof RateLimitError) {
    // Back off and retry after a delay
    console.error('Rate limited — retry later');
  }
}`}
      />

      <hr />

      <h2>ConnectionError</h2>
      <p>
        Thrown when the SDK cannot reach the API server due to a network failure (DNS,
        connectivity, etc.). This is <strong>not</strong> an HTTP error, no response was received.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle connection errors"
        code={`import { ConnectionError } from '@noderails/sdk';

try {
  const prices = await noderails.prices.convert({ from: 'USD', to: 'ETH', amount: '100' });
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Network error:', error.message);
  }
}`}
      />

      <hr />

      <h2>TimeoutError</h2>
      <p>
        Thrown when the request exceeds the configured <code>timeout</code> (default 30 s).
      </p>

      <CodeBlock
        language="typescript"
        title="Handle timeouts"
        code={`import { TimeoutError } from '@noderails/sdk';

try {
  const session = await noderails.checkoutSessions.create(params);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Request timed out');
  }
}`}
      />

      <hr />

      <h2>SignatureVerificationError</h2>
      <p>
        Thrown by <code>noderails.webhooks.constructEvent()</code> when the webhook signature does
        not match the expected HMAC-SHA256 hash.
      </p>

      <CodeBlock
        language="typescript"
        title="Handle signature errors"
        code={`import { SignatureVerificationError } from '@noderails/sdk';

try {
  const event = noderails.webhooks.constructEvent(body, signature, secret);
} catch (error) {
  if (error instanceof SignatureVerificationError) {
    console.error('Invalid webhook signature');
    return res.status(400).send('Invalid signature');
  }
}`}
      />

      <Callout type="danger" title="Security">
        Never ignore <code>SignatureVerificationError</code> in production. An invalid signature
        means the request may not have originated from NodeRails.
      </Callout>

      <hr />

      <h2>Best practices</h2>

      <CodeBlock
        language="typescript"
        title="Comprehensive error handling"
        code={`import {
  ApiError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ConnectionError,
  TimeoutError,
} from '@noderails/sdk';

async function createCheckout(params) {
  try {
    return await noderails.checkoutSessions.create(params);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      // Log and alert — this is a config issue
      logger.fatal('API key invalid', error);
    } else if (error instanceof ValidationError) {
      // Return field errors to caller
      throw new BadRequestError(error.message);
    } else if (error instanceof NotFoundError) {
      throw new NotFoundError('Resource not found');
    } else if (error instanceof RateLimitError) {
      // Retry with exponential backoff
      return retry(() => noderails.checkoutSessions.create(params));
    } else if (error instanceof TimeoutError) {
      // Retry once
      return noderails.checkoutSessions.create(params);
    } else if (error instanceof ConnectionError) {
      // Network issue — retry or queue
      logger.error('Network failure', error);
    } else if (error instanceof ApiError) {
      // Catch-all for other HTTP errors
      logger.error(\`API error \${error.status}: \${error.message}\`);
    }
    throw error;
  }
}`}
      />
    </>
  );
}
