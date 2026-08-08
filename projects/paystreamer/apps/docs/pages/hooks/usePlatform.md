# usePlatform

The `usePlatform` hook retrieves a PayStreamer platform's metadata and list of active tiers from the blockchain, leveraging `@tanstack/react-query` and the SDK's configured `graphqlClient`.

## Usage

```tsx
import { usePlatform } from "@paystreamer/sdk/react";

function PlatformDetails({ platformId }: { platformId: string }) {
  const { data: platform, isLoading, error } = usePlatform(platformId);

  if (isLoading) return <p>Loading platform...</p>;
  if (error) return <p>Error loading platform: {error.message}</p>;
  if (!platform) return <p>Platform not found.</p>;

  return (
    <div>
      <h2>{platform.name}</h2>
      <ul>
        {platform.tiers.map((tier, index) => (
          <li key={index}>
            <strong>{tier.name}</strong>: {Number(tier.amount) / 1e9} PUSD every {Number(tier.frequency) / (24 * 60 * 60 * 1000)} days
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `platformId` | `string` | The object ID of the deployed PayStreamer platform to fetch. |

## Returns

An object matching the React Query result structure:

| Property | Type | Description |
|----------|------|-------------|
| `data` | `Platform \| undefined` | The parsed platform data containing name and array of tiers. |
| `isLoading` | `boolean` | True if the platform data query is currently fetching. |
| `error` | `Error \| null` | Error object if the GraphQL query fails. |

### Platform Schema

```typescript
export interface Platform {
  id: string;
  name: string;
  tiers: PlatformTier[];
}

export interface PlatformTier {
  name: string;
  amount: string; // Mist bigint as string
  frequency: string; // Milliseconds bigint as string
  subscriber_count: number;
  is_active: boolean;
}
```
