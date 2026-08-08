# useMintTestPusd

The `useMintTestPusd` hook allows you to mint testnet PUSD tokens for testing your integration. It automatically handles submitting a sponsored transaction to interact with the PUSD treasury cap on Devnet or Testnet.

## Usage

```tsx
import { useMintTestPusd } from "@paystreamer/sdk/react";

function MintButton() {
  const { mint, isLoading, error } = useMintTestPusd();

  const handleMint = async () => {
    // Mints 100 PUSD by default
    const digest = await mint();
    if (digest) {
      console.log("Successfully minted test PUSD:", digest);
    }
  };

  return (
    <div>
      <button onClick={handleMint} disabled={isLoading}>
        {isLoading ? "Minting..." : "Mint Test PUSD"}
      </button>
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

## API

### Returns

An object containing:

| Property | Type | Description |
|----------|------|-------------|
| `mint` | `(amountMist?: bigint) => Promise<string \| null>` | Function to trigger the minting transaction. Returns the transaction digest if successful, or `null` if it fails. |
| `isLoading` | `boolean` | `true` while the transaction is being prepared, signed, and executed. |
| `error` | `string \| null` | Any error message caught during the minting process. |
