# useSubscribe

The `useSubscribe` hook abstracts the complexity of building Programmable Transaction Blocks (PTBs) for subscriptions. It handles:
1. Fetching the user's PUSD coin objects if a deposit is required.
2. Structuring the correct Move calls (`create_account`, `deposit`, `create_subscription`, `share_account`).
3. Routing the transaction through your backend sponsor if configured.

## Usage

```tsx
import { useSubscribe } from "@paystreamer/sdk/react";

function CustomSubscribeButton() {
  const { subscribe, isLoading, error, recommendedDeposit, hasAccount } = useSubscribe({
    platformId: "0xYOUR_PLATFORM",
    tierIndex: 1,
    tierAmount: 50000000000n,
    tierFrequencyMs: 2592000000n, // 30 days
    maxAttempts: 3,
  });

  const handleSubscribe = async () => {
    // Optionally pass an initial deposit amount (in MIST)
    const txDigest = await subscribe(recommendedDeposit);
    
    if (txDigest) {
      console.log("Success!", txDigest);
    }
  };

  if (error) return <p>Error: {error}</p>;

  return (
    <button onClick={handleSubscribe} disabled={isLoading}>
      {isLoading ? "Processing..." : "Subscribe Now"}
    </button>
  );
}
```

## Parameters

You must pass an object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `platformId` | `string` | The target platform object ID. |
| `tierIndex` | `number \| bigint` | The tier index on the platform to subscribe to. |
| `tierAmount` | `bigint` | The cost of the tier per cycle (in MIST). |
| `tierFrequencyMs` | `bigint` | The duration of the billing cycle (in MS). |
| `maxAttempts` | `number` | Optional. The maximum number of retry attempts the scheduler should make for a failed payment. Defaults to 3. |
| `accountId?` | `string` | Optional. The ID of the user's existing PayStreamer Account. |
| `accountCapId?` | `string` | Optional. The ID of the user's existing Account Capability. |

## Returns

An object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `subscribe` | `(depositAmount?: bigint) => Promise<string \| null>` | The function to initiate the transaction. Returns the digest string on success. |
| `isLoading` | `boolean` | True while the transaction is being built, signed, or executed. |
| `error` | `string \| null` | Error message if the transaction fails. |
| `recommendedDeposit` | `bigint` | Helper value suggesting a 3-cycle buffer based on `tierAmount` and `tierFrequencyMs`. |
| `hasAccount` | `boolean` | Helper boolean based on whether both `accountId` and `accountCapId` were provided. |
