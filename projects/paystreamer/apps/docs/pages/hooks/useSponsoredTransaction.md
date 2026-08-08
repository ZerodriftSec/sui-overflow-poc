# useSponsoredTransaction

The `useSponsoredTransaction` hook is a low-level utility that seamlessly wraps the Sui programmable transaction building process. It intelligently decides whether to route the transaction through your backend sponsor API or execute it locally using the user's SUI balance for gas.

## Usage

```tsx
import { useSponsoredTransaction } from "@paystreamer/sdk/react";
import { Transaction } from "@mysten/sui/transactions";

function CustomAction() {
  const { executeSponsored } = useSponsoredTransaction();

  const handleAction = async () => {
    const tx = new Transaction();
    // ... add moveCall or other commands ...

    const result = await executeSponsored(tx);
    
    if (result.status === "success") {
      console.log("Success! Digest:", result.digest);
    } else {
      console.error("Failed:", result.error);
    }
  };

  return <button onClick={handleAction}>Execute Action</button>;
}
```

## API

### Returns

An object containing:

| Property | Type | Description |
|----------|------|-------------|
| `executeSponsored` | `(tx: Transaction) => Promise<ExecuteSponsoredResult>` | Executes the provided transaction block, attempting sponsorship first if configured, or falling back to local execution. |
