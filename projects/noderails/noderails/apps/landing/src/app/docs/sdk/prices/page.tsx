import { CodeBlock, ResponseTable, ResponseField } from '@/components/docs/ui';

export default function SDKPricesPage() {
  return (
    <>
      <h1>Prices</h1>
      <p className="subtitle">
        Convert between fiat and crypto amounts in real time. This is a public API,
        no authentication required.
      </p>

      <h2>Convert fiat to crypto</h2>

      <CodeBlock
        language="typescript"
        title="Fiat to crypto"
        code={`const quote = await noderails.prices.convert({
  symbol: 'ETH',
        currency: 'USD',
        amountFiat: 100,
});

console.log(quote.tokenAmount); // "0.0421"
      console.log(quote.priceFiat);   // "2374.12"
      console.log(quote.currency);    // "USD"
console.log(quote.cachedAt);    // ISO timestamp`}
      />

        <h2>Convert crypto to fiat</h2>

      <CodeBlock
        language="typescript"
        title="Crypto to USD"
        code={`const reverse = await noderails.prices.convert({
  symbol: 'USDC',
  currency: 'USD',
  tokenAmount: 500,
});

console.log(reverse.amountFiat); // "500.00"
console.log(reverse.currency);   // "USD"`}
      />

      <h2>Get token price</h2>

      <CodeBlock
        language="typescript"
        title="Get current price"
        code={`const ethPrice = await noderails.prices.getPrice('ETH', 'EUR');
console.log(ethPrice.priceFiat); // "2190.44"
console.log(ethPrice.currency);  // "EUR"`}
      />

      <h2>Methods reference</h2>
      <table>
        <thead>
          <tr><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>convert(params)</code></td><td>Convert between fiat and crypto amounts</td></tr>
          <tr><td><code>getPrice(symbol, currency?)</code></td><td>Get the current token price in a fiat currency (default USD)</td></tr>
        </tbody>
      </table>

      <h2>TypeScript types</h2>

      <CodeBlock
        language="typescript"
        title="Type imports"
        code={`import type {
  PriceConversion,
  PriceConvertParams,
} from '@noderails/sdk';`}
      />

      <h2>Response body reference</h2>
      <p>
        All responses are wrapped in <code>{`{ success: true, data: ... }`}</code>. The fields below describe what&apos;s inside <code>data</code>.
      </p>

      <h3><code>getPrice()</code> response</h3>
      <ResponseTable title="Token Price">
        <ResponseField name="symbol" type="string" description='Token symbol (uppercased), e.g. "ETH"' />
        <ResponseField name="currency" type="string" description='Fiat currency code, e.g. "USD" or "EUR"' />
        <ResponseField name="priceFiat" type="string" description="Current token price in the selected fiat currency" />
        <ResponseField name="cachedAt" type="string" description="ISO 8601 timestamp of when the price was cached" />
      </ResponseTable>

      <h3><code>convert()</code> with <code>amountFiat</code></h3>
      <ResponseTable title="Fiat → Crypto">
        <ResponseField name="symbol" type="string" description="Token symbol" />
        <ResponseField name="currency" type="string" description="Fiat currency code" />
        <ResponseField name="priceFiat" type="string" description="Current token price in selected fiat" />
        <ResponseField name="cachedAt" type="string" description="ISO 8601 cache timestamp" />
        <ResponseField name="amountFiat" type="number" description="Fiat amount you provided" />
        <ResponseField name="tokenAmount" type="string" description='Crypto amount (18-decimal string, e.g. "0.030810000000000000")' />
      </ResponseTable>

      <h3><code>convert()</code> with <code>tokenAmount</code></h3>
      <ResponseTable title="Crypto → Fiat">
        <ResponseField name="symbol" type="string" description="Token symbol" />
        <ResponseField name="currency" type="string" description="Fiat currency code" />
        <ResponseField name="priceFiat" type="string" description="Current token price in selected fiat" />
        <ResponseField name="cachedAt" type="string" description="ISO 8601 cache timestamp" />
        <ResponseField name="tokenAmount" type="number" description="Token amount you provided" />
        <ResponseField name="amountFiat" type="string" description='Fiat value (8-decimal string, e.g. "4868.50500000")' />
      </ResponseTable>
    </>
  );
}
