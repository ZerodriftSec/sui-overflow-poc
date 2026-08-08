# Pelagos — Architecture

Pelagos packages prediction-market outcomes into structured products on **Sui testnet**, priced off
real on-chain liquidity (DeepBook Predict + Polymarket CLOB) and minted via **wallet-signed**
programmable transaction blocks. The backend is a pricing/orchestration layer that builds *unsigned*
transactions — it never custodies user funds.

## Topology

```text
Next.js frontend  :13100   (forked Next.js; app dir = app/app/)
      │  wallet-signed PTBs (@mysten/dapp-kit)
      ▼
Express API       :13101   ── builds UNSIGNED tx_bytes; non-custodial
      ├── Pelagos-operated DeepBook Predict ── range pricing · PLP · native settlement
      ├── Deribit public market data          ── authorized BTC price + SVI oracle feed
      ├── Polymarket Gamma + CLOB           ── basket markets + midpoint pricing
      ├── DeFiLlama                         ── live Sui USDC lending reference rates
      ├── Coinbase                          ── BTC spot (CEX price reference)
      ├── Supabase                          ── persistence (bundles, positions)
      ├── Sui GraphQL                       ── manager event discovery
      └── Sui RPC                           ── object reads, devInspect, wallet PTBs
      │
      └── Monitor   :13102   ── process / API / on-chain / market-filter metrics
```

## On-chain packages (Sui testnet · chain `4c78adac`)

| Package | Modules | Role |
|---|---|---|
| `pelagos_sui` | `mock_usdc`, `prediction_market` | freely-mintable test collateral + binary markets |
| `pelagos_vault` | `vault` | generic `Vault<T>` (NAV share-price); baskets + Predict-backed wrappers |
| `pelagos_strategies` | `structured_note` | earlier structured-note primitive; not the live Range Strips note rail |
| DeepBook Predict (official Mysten source, Pelagos-operated) | Predict, PLP, oracle, manager, range positions | live pricing, pooled counterparty liquidity, and dUSDC settlement |

Deployed IDs and immutable upstream provenance live in **`DEPLOYMENT.md`** and
`backend/config/predict-managed.testnet.json`. Pelagos vendors the official Predict testnet source,
operates four authorized BTC oracles, and reads protocol state directly from Sui. Pricing uses the
protocol's own `get_range_trade_amounts` (real MM bid/ask + slippage); a mintable-band filter
([2%, 98%]) keeps every surfaced bucket actually mintable. dUSDC settlement is native to Predict
(oracle settles → permissionless `redeem_range`).

## Why Sui (architectural dependencies)

The design leans on Sui-specific primitives — it is not chain-agnostic:

- **DeepBook Predict** (official Mysten source, Sui-native) is the pricing + settlement venue for
  every dUSDC option, vol, range-strip, PLP-yield, and funded terminal-note leg. Pelagos operates the
  testnet deployment because the public Predict indexer/oracle path is not a runtime dependency.
- **Programmable Transaction Blocks** make each multi-leg product a *single* wallet signature — e.g. a
  funded note that splits dUSDC into PLP shares, manager collateral, and N live range legs atomically,
  or the combined mUSDC+dUSDC+SUI faucet PTB.
- **`devInspect`** prices every strip band against live vault state (real MM bid/ask + slippage) with
  zero gas and no write — the source of all pre-trade quotes.
- **Object model** — positions are owned objects (`VaultShare<T>`, simulation receipts, minted ranges),
  transferable and composable rather than ledger rows.
- **Parallel execution + shared objects** (Vault, Predict root, Faucet) give the responsive,
  low-gas, wallet-signed UX; **Sui DeFi** (Bluefin / DeepBook CLOB / Pyth) supplies additional BTC
  mark and hedge references.

## Backend engines (`backend/src/services`)

- **`options-chain`** — the BTC options chain: each strike priced off DeepBook Predict range liquidity,
  IV from the live SVI smile, depth/risk caps per strike.
- **`predict/`** — SVI surface, implied density, range-strip pricing + mint PTBs (the shared core under
  Distribution Markets, Volatility, and Range Strips), plus direct on-chain reads, the authorized
  oracle feed, manager discovery, PLP deposits/withdrawals, range exits, and idle-collateral reclaim.
- **`volatility`** — prebuilt vol structures + greeks.
- **`custom-basket` / `baskets` / `market-filter` / `nlp`** — Polymarket discovery → 5-stage NLP quality
  filter → correlation-decorrelated weighting → tranching.
- **`deepbook-yield`** — pooled PLP counterparty strategies, live hedge construction, exact capital
  reconciliation, account marks, and stress scenarios.
- **`notes-allocation` / `structured-payoffs`** — funded terminal participation, range coupon,
  expiry knock-in/out, two-way buffer, and three-observation autocall schedules with exhaustive band
  composition and authoritative settlement.
- **`sim-settlement` / `state-dir`** — durable, atomic mUSDC receipt lifecycle with replay protection,
  terminal-band validation, and no fallback settlement price.
- **`vault/` · `sui` · `pelagos-chain`** — on-chain moveCall / PTB builders.

The live API surface is ~30 route groups mounted under `/api/*` (see `backend/src/index.ts`).

## Frontend (`app/app`)

Forked Next.js (App Router; routes under `app/app/` — see `AGENTS.md`). A global **Basic/Advanced**
mode (`_lib/mode.tsx`) and **light/dark** theme (`_lib/theme.tsx`) reskin every product; both support a
`?mode=` / `?theme=` deep-link override. One product page per tab, with typed backend clients in
`app/app/_lib/`.

## Verify

```bash
npm run lint
npm run build
(cd backend && npm run build)
(cd backend && npm run test:structured)
(cd backend && npm run test:yield-notes)
(cd contracts/predict && sui move test)
(cd contracts/deepbook && sui move test)
curl http://localhost:13101/api/health
curl http://localhost:13102/data
```
