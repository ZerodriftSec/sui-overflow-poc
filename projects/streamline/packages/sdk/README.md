# @streamline/sdk

Narrow TypeScript SDK for StreamLine: **resolve handles**, **create streams**, **read the indexer**.

```ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient } from "@mysten/sui/client";
import {
  StreamLine,
  createKeypairSigner,
  resolveNetworkConfig,
} from "@streamline/sdk";

const config = resolveNetworkConfig("testnet");
const client = new SuiClient({ url: config.fullnodeUrl });
const keypair = Ed25519Keypair.fromSecretKey(/* … */);

const sl = new StreamLine({
  network: "testnet",
  signer: createKeypairSigner({ keypair, client }),
  client,
});

const { digest, streamId } = await sl.stream.to("alice@streamline", {
  amountUsdc: 100,
  durationDays: 14,
  milestones: [{ name: "Delivery", amountUsdc: 100 }],
});

const status = await sl.streams.get(streamId!);
```

## Install

From the monorepo root (workspace):

```bash
npm install
npm run build -w @streamline/sdk
```

## Env (optional)

| Variable | Purpose |
|----------|---------|
| `STREAMLINE_PACKAGE_ID_TESTNET` / `NEXT_PUBLIC_PACKAGE_ID_TESTNET` | Move package |
| `STREAMLINE_INDEXER_URL` / `NEXT_PUBLIC_INDEXER_URL` | Indexer REST |
| `STREAMLINE_SUINS_DOMAIN` / `NEXT_PUBLIC_SUINS_DOMAIN` | Parent domain (`streamline.sui`) |
| `STREAMLINE_SUI_TESTNET_RPC` / `NEXT_PUBLIC_SUI_TESTNET_RPC` | Fullnode |

## Gasless agents

Point `createSponsoredKeypairSigner` at your app’s Enoki proxy (`POST /api/sponsor` + `/execute`). The SDK never holds Enoki private keys.

## Example

```bash
# From packages/sdk
SUI_PRIVATE_KEY=suiprivkey… RECIPIENT=alice@streamline npm run example:pay
```

See [`examples/pay-by-name.ts`](examples/pay-by-name.ts).

## Scope (v1)

**In:** `resolve`, `stream.to` (create_stream_v2), `streams.get` / `list`  
**Out:** claim handle, raise/approve, vault/treasury, privacy, React hooks
