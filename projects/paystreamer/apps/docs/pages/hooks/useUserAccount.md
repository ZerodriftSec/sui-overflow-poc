# useUserAccount

The `useUserAccount` hook scans the user's connected wallet for a PayStreamer `AccountCap` and retrieves the associated account details, subscription balances, and platform info from the blockchain.

## Usage

```tsx
import { useUserAccount } from "@paystreamer/sdk/react";

function UserProfile() {
  const { userAccount, isLoading, error } = useUserAccount();

  if (isLoading) return <p>Scanning wallet...</p>;
  if (error) return <p>Error scanning wallet: {error.message}</p>;
  if (!userAccount) return <p>No PayStreamer account found. Set one up to get started!</p>;

  return (
    <div>
      <p>Account ID: {userAccount.accountId}</p>
      <p>Account Cap ID: {userAccount.accountCapId}</p>
      <p>Current Balance: {Number(userAccount.balance) / 1e9} PUSD</p>
    </div>
  );
}
```

## Returns

An object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `userAccount` | `UserAccount \| null` | The active user account info. Null if no AccountCap is owned by the user. |
| `isLoading` | `boolean` | True if currently querying the wallet objects or details on-chain. |
| `error` | `Error \| null` | Error object if wallet scanning or fetching fails. |

### UserAccount Schema

```typescript
export interface UserAccount {
  accountId: string;     // The ID of the shared PayStreamer Account object
  accountCapId: string;  // The ID of the address-owned AccountCap object
  balance: bigint;       // The user's active PUSD subscription balance
}
```
