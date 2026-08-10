# mock_usdc — Test USDC for StreamLine

A minimal, mintable USDC clone for demoing StreamLine on **Sui testnet**. Six decimals, symbol `USDC`. The `TreasuryCap` is **shared** on publish, so the faucet is permissionless — anyone can mint test tokens to fund a stream.

> ⚠️ **Testnet only.** No rate limit, no bridge, no real value. Do not deploy on mainnet — on mainnet StreamLine streams Circle's real USDC.

- **Edition:** Sui Move `2024.beta`
- **Module:** `mock_usdc::mock_usdc`
- **Coin type:** `<package>::mock_usdc::MOCK_USDC` (6 decimals)

## Layout

```
mock-usdc/
├── sources/
│   └── mock_usdc.move        # MOCK_USDC currency; init shares the TreasuryCap;
│                             #   faucet (mint to caller) + composable mint (returns the Coin)
├── Move.toml                 # package manifest
├── Move.lock
├── Published.toml            # published id per network
└── deployment.testnet.json   # machine-readable deploy record
```

## Deployment (testnet)

| Item | ID |
|------|----|
| Package | [`0xf6ce32…2ed3`](https://suiscan.xyz/testnet/object/0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3) |
| Shared `TreasuryCap` | [`0xa7cb97…5330`](https://suiscan.xyz/testnet/object/0xa7cb971f4f93e5713c5703f63f3bc17fdf0f6bf1f9795dc010ac164827715330) |
| Coin type | `0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3::mock_usdc::MOCK_USDC` |

These are referenced by the frontend in [`frontend/src/lib/constants.ts`](../frontend/src/lib/constants.ts) (`TEST_USDC`), where the in-app faucet button mints from the shared treasury.

## Functions

| Function | Description |
|----------|-------------|
| `faucet(treasury, amount, ctx)` | Mint `amount` base units (`1_000_000` = 1 USDC) to the caller. |
| `mint(treasury, amount, ctx) -> Coin<MOCK_USDC>` | Composable mint that **returns** the coin, for use inside a PTB (e.g. mint → `create_stream` in one transaction). |

On publish, `init` creates the currency, **freezes** the metadata, and **shares** the `TreasuryCap` so minting needs no special authority.

## Build, test, publish

```bash
sui move build
sui move test
sui client publish --gas-budget 100000000
```

After publishing, copy the new package ID and the shared `TreasuryCap` object ID into `frontend/src/lib/constants.ts` (`TEST_USDC`).

## Mint from the CLI

```bash
# Mint 100 test USDC (100 * 1_000_000 base units) to your active address
sui client call \
  --package 0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3 \
  --module mock_usdc --function faucet \
  --args 0xa7cb971f4f93e5713c5703f63f3bc17fdf0f6bf1f9795dc010ac164827715330 100000000 \
  --gas-budget 10000000
```
