# usePusdBalance

The `usePusdBalance` hook retrieves the connected user's wallet balance of PUSD (PayStreamer USD) tokens. This is used to warn or prevent users from depositing more than their wallet contains.

## Usage

```tsx
import { usePusdBalance } from "@paystreamer/sdk/react";

function WalletBalanceDisplay() {
  const { data: balance, isLoading, error } = usePusdBalance();

  if (isLoading) return <span>Loading...</span>;
  if (error) return <span>Error</span>;

  const usdBalance = balance ? Number(balance) / 1e9 : 0;

  return (
    <div>
      <span>Wallet Balance: {usdBalance.toFixed(2)} PUSD</span>
    </div>
  );
}
```

## Returns

An object matching the React Query result structure:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `bigint \| undefined` | The current PUSD balance in the user's wallet (in MIST units). |
| `isLoading` | `boolean` | True if the balance is currently fetching. |
| `error` | `Error \| null` | Error object if the query fails. |
