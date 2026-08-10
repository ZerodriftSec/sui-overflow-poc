import { CodeBlock, Endpoint, Callout, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function PricesPage() {
  return (
    <>
      <h1>Prices</h1>
      <p className="subtitle">
        The Prices API provides real-time cryptocurrency price data and conversion between fiat
        and crypto amounts. This is a <strong>public API</strong>, no authentication required.
      </p>

      <hr />

      {/* --- CONVERT --- */}
      <h2>Convert currency</h2>
      <Endpoint method="GET" path="/prices/convert" />

      <p>
        Convert between fiat and a cryptocurrency token amount. Provide either{' '}
        <code>amountFiat</code> (fiat → crypto) or <code>tokenAmount</code> (crypto → fiat).
      </p>

      <h3>Query parameters</h3>
      <table>
        <thead>
          <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>symbol</code></td><td><code>string</code></td><td>Yes</td><td>Token symbol (e.g. &quot;ETH&quot;, &quot;USDC&quot;)</td></tr>
          <tr><td><code>currency</code></td><td><code>string</code></td><td>No</td><td>Fiat currency code (default: &quot;USD&quot;)</td></tr>
          <tr><td><code>amountFiat</code></td><td><code>number</code></td><td>One of</td><td>Fiat amount to convert to crypto</td></tr>
          <tr><td><code>tokenAmount</code></td><td><code>number</code></td><td>One of</td><td>Token amount to convert to USD</td></tr>
        </tbody>
      </table>

      <Callout type="info" title="One of two">
        Provide either <code>amountFiat</code> or <code>tokenAmount</code>, not both. The API
        will calculate the other direction. <code>amountUsd</code> is still accepted for backward compatibility.
      </Callout>

      <CodeBlock
        language="typescript"
        title="Fiat to crypto"
        code={`const result = await noderails.prices.convert({
  symbol: 'ETH',
      currency: 'USD',
      amountFiat: 100,
});

console.log(result.tokenAmount); // "0.0421"
    console.log(result.priceFiat);   // "2374.12"
    console.log(result.currency);    // "USD"`}
      />

      <CodeBlock
        language="typescript"
        title="Crypto to USD"
        code={`const result = await noderails.prices.convert({
  symbol: 'ETH',
  currency: 'USD',
  tokenAmount: 1,
});

console.log(result.amountFiat); // "2374.12"
console.log(result.priceFiat);  // "2374.12"
console.log(result.currency);   // "USD"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`# USD to ETH
      curl "https://api.noderails.com/prices/convert?symbol=ETH&currency=USD&amountFiat=100"

# 1 ETH to USD
      curl "https://api.noderails.com/prices/convert?symbol=ETH&currency=USD&tokenAmount=1"`}
      />

      <h3>Response</h3>
      <CodeBlock
        language="json"
        title="Convert response (fiat → crypto)"
        code={`{
  "success": true,
  "data": {
    "symbol": "ETH",
    "currency": "USD",
    "priceFiat": "2374.12",
    "cachedAt": "2025-01-15T10:30:00.000Z",
    "amountFiat": "100",
    "tokenAmount": "0.042131926460541800"
  }
}`}
      />

      <CodeBlock
        language="json"
        title="Convert response (crypto → USD)"
        code={`{
  "success": true,
  "data": {
    "symbol": "ETH",
    "currency": "USD",
    "priceFiat": "2374.12",
    "cachedAt": "2025-01-15T10:30:00.000Z",
    "tokenAmount": "1",
    "amountFiat": "2374.12000000"
  }
}`}
      />

      <ResponseTable title="Convert response fields">
        <ResponseField name="symbol" type="string" description="Token symbol (e.g. ETH, USDC)" />
        <ResponseField name="currency" type="string" description="Fiat currency for conversion (e.g. USD, EUR)" />
        <ResponseField name="priceFiat" type="string" description="Current token price in the selected fiat currency" />
        <ResponseField name="cachedAt" type="string" description="ISO 8601 timestamp when the price was cached" />
        <ResponseField name="amountFiat" type="string" description="Fiat amount (input or computed, 8-decimal string when computed)" />
        <ResponseField name="tokenAmount" type="string" description="Token amount (input or computed, 18-decimal string when computed)" />
      </ResponseTable>

      <hr />

      {/* --- GET PRICE --- */}
      <h2>Get token price</h2>
      <Endpoint method="GET" path="/prices/:symbol" />

      <p>Returns the current price of a token in the requested fiat currency (default: USD).</p>

      <CodeBlock
        language="typescript"
        title="SDK example"
        code={`const price = await noderails.prices.getPrice('ETH', 'EUR');
console.log(price.priceFiat); // "2190.44"
console.log(price.currency);  // "EUR"`}
      />

      <CodeBlock
        language="bash"
        title="cURL"
        code={`curl "https://api.noderails.com/prices/ETH?currency=EUR"`}
      />

      <h3>Response</h3>
      <CodeBlock
        language="json"
        title="Price response"
        code={`{
  "success": true,
  "data": {
    "symbol": "ETH",
    "currency": "EUR",
    "priceFiat": "2190.44",
    "cachedAt": "2025-01-15T10:30:00.000Z"
  }
}`}
      />

      <ResponseTable title="Get price response fields">
        <ResponseField name="symbol" type="string" description="Token symbol" />
        <ResponseField name="currency" type="string" description="Fiat currency for the quote" />
        <ResponseField name="priceFiat" type="string" description="Current price in the selected fiat currency" />
        <ResponseField name="cachedAt" type="string" description="ISO 8601 timestamp when the price was last fetched" />
      </ResponseTable>
    </>
  );
}
