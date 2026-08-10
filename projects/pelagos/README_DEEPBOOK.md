# Pelagos × DeepBook Predict

> Structured products on Sui, settled on DeepBook Predict.
> Hackathon track: **DeepBook Predict (DeepSurge)**. Network: **Sui testnet** (chain `4c78adac`).
> Status: **live end-to-end on testnet** — real wallet-signed mints, real settlement, real MM pricing. No invented numbers anywhere in the pricing path.

---

## 1. What Pelagos is

Pelagos turns a trader's **continuous view of where an asset lands** into a basket of real on-chain
options, priced and settled by the protocol — not a simulated AMM.

DeepBook Predict gives you two primitives over a BTC SVI vol-surface oracle:

- **Binary** — pays `$1`/contract if `settlement` is above (UP) or at/below (DOWN) a single strike.
- **Range (vertical)** — `RangeKey{oracle_id, expiry, lower_strike, higher_strike}` pays `$1`/contract
  iff `settlement ∈ (lower, higher]`. `fair_range = up(lower) − up(higher)`.

A binary lets you bet on **one** strike. Pelagos's insight: a strip of adjacent Predict **ranges**,
weighted by a Normal(μ, σ) mass, *is* a payoff that mirrors your whole distributional view. Drag μ
(direction) and σ (conviction/width) and you mint exactly the basket of real range-options that
expresses it — in **one signature**.

Every Pelagos product is the **same range-strip engine** with a different parameterization.

### Product families and how each maps to Predict primitives

| Product | What the user expresses | Predict mapping | Collateral |
|---|---|---|---|
| **Distribution (range-ladder)** | "BTC lands around μ with width σ" | `previewStrip` → `n` on-grid `mint_range` buckets weighted by Normal mass; settle via `redeem_range` (live) / `redeem_permissionless` (after settlement) | dUSDC |
| **Tranches (Risk Slices)** | senior / mezz / junior risk appetite | the *same* strip at **0.5σ / 1.0σ / 2.0σ** width — narrow ATM = high hit-rate / low multiple; wide = convex / low hit-rate / high multiple | dUSDC |
| **Range Strips** | "shape my terminal BTC view" | live multi-band `mint_range` / `redeem_range` recipes, with bid, ask, slippage, and payout by band | dUSDC or isolated mUSDC |
| **Earn Yield** | "be the range-trade counterparty" | `predict::supply` for transferable PLP shares, optionally composed with live long range hedges in one PTB | dUSDC; isolated reference payoff on mUSDC |
| **Structured Notes** | "fund a lower-risk terminal or autocall payoff" | dUSDC splits into PLP reserve + live range strip + manager buffer; mUSDC uses a server-locked terminal schedule or a three-observation first-hit lifecycle | dUSDC / mUSDC (autocall mUSDC only) |
| **DeepBook baskets** | curated one-click recipes | three named μ/σ presets (`BTC Pin` 0.3%σ·n4, `BTC Spread` 0.6%σ·n6, `BTC Wide` 1.0%σ·n8) over the live oracle; each is a strip | dUSDC |

The fourth product **replaces the old ~50% coin-flip Polymarket basket** with DeepBook BTC structured
baskets. The uncorrelated-event Polymarket baskets remain on Pelagos's own market/vault (mock USDC),
kept distinct from the Predict-backed suite.

Code map:
- `backend/src/services/predict/structured.ts` — strip math + non-custodial PLP/strip PTB builders.
- `backend/src/services/deepbook-yield.ts` — live PLP accounting, hedge allocations, and isolated counterparty payoff math.
- `backend/src/services/notes-allocation.ts` — funded terminal notes and three-observation autocall terms.
- `backend/src/services/structured-payoffs.ts` — exhaustive terminal-band composition, PLP stress identities, and autocall resolution.
- `backend/src/routes/{deepbook,notes,sim}.ts` — canonical quote-id open and lifecycle routes.
- Frontend pages: `app/app/deepbook` and `app/app/portfolio`.

---

## 2. Architecture

```
┌──────────────────────────────┐     prepare / sign / confirm     ┌──────────────────────────────────┐
│  Frontend (Next.js / app)    │  ─────────────────────────────►  │  Backend (Express engine)        │
│  - dapp-kit wallet adapter   │                                  │  /api/predict/* routes           │
│  - distribution/tranche/ppn/ │  ◄─────────────────────────────  │  services/predict/{structured,   │
│    basket/predict/portfolio  │     unsigned tx_bytes + dry-run   │   products,index,ptb,server,...} │
│  - μ/σ sliders + payoff strip│     live prices (devInspect)      └───────────────┬──────────────────┘
└──────────────┬───────────────┘                                                   │
               │ wallet signs the tx_bytes                                         │ devInspect (reads, no funds)
               │ (non-custodial: user owns the PredictManager)                     │ PTB build/dry-run/confirm
               ▼                                                                   ▼
        ┌──────────────────────────────────────────────────────────────────────────────────┐
        │  Sui testnet                                                                        │
        │  ┌─────────────────────────────┐   ┌────────────────────────────────────────────┐  │
        │  │ DeepBook Predict            │   │ Pelagos packages (ours)                    │  │
        │  │ (official Mysten source,    │   │                                            │  │
        │  │  Pelagos-operated deploy)   │   │                                            │  │
        │  │  predict / predict_manager  │   │  pelagos_sui: mock_usdc + prediction_market│  │
        │  │  PLP vault, OracleSVI, dUSDC│   │  pelagos_vault: generic Vault<T>           │  │
        │  └─────────────────────────────┘   └────────────────────────────────────────────┘  │
        └──────────────────────────────────────────────────────────────────────────────────┘
```

**Custody is non-custodial.** The backend never holds keys for the structured-product path: it builds
an **unsigned** `tx.toJSON()`, dry-runs a throwaway copy for a gas/feasibility estimate, and returns
`{ tx_bytes, sender, dry_run }`. The **user's wallet** signs and executes, and the user's wallet
**owns the `PredictManager`** (the `owner` field gates mint/redeem/deposit/withdraw). The frontend then
posts the digest to `/confirm` for on-chain verification. (`buildAndDryRun` + `prepareDusdc` in
`structured.ts` mirror the proven vault prepare/sign/confirm pattern.)

A separate **custodial / backend-signed** path also exists (`/api/predict/{manager,deposit,mint,redeem,range/mint,range/redeem,supply,withdraw}`, driven by `services/predict/index.ts`) — used for the binary single-strike tab and for scripted E2E. It requires a configured server signer (`PREDICT_SIGNER_PRIVATE_KEY` / `SUI_KEYSTORE_PATH`).

Pelagos deploys the exact official Mysten Predict testnet source and operates its authorized BTC oracle
feed. This replaces the unavailable Mysten public server/oracles without changing the Predict contract
logic. The vendored source and upstream commit are recorded in `contracts/UPSTREAM.md`.

---

## 3. Real MM pricing + slippage (both ways)

This is the heart of the integration: **no number on the pricing path is invented or linearly
interpolated.** Every bucket price comes from the protocol's own `get_range_trade_amounts` via
`devInspect` (no funds, no signer required).

### How `previewStrip` prices a strip at the *actual* quantity

`backend/src/services/predict/structured.ts`:

1. **Build buckets** — `buildStripBuckets` slices `Normal(μ, σ)` (in 1e9 strike units) into `n`
   contiguous **on-grid, non-overlapping** buckets spanning `±spanSigma·σ`. Each bucket's `weight`
   is its Normal mass `Φ((higher−μ)/σ) − Φ((lower−μ)/σ)` (standard-normal CDF via Abramowitz & Stegun 7.1.26).
2. **Marginal ask** — one `previewRange` per bucket at `quantity = 1 contract` (`get_range_trade_amounts`)
   gives the protocol's per-contract ask probability with no size impact (the sizing/slippage reference).
3. **Size ∝ Normal weight** — quantities are allocated so payout mirrors the view and `Σ(marginal cost) ≈ budget`.
4. **Re-price at the actual quantity** — `priceAtQuantities` calls `get_range_trade_amounts` **again at
   each bucket's real quantity**. Because the protocol prices **against post-trade vault state**, the
   returned cost already includes the **MM spread + the slippage from the liability the order adds**.
   This is what makes the price *real at size*, not a marginal estimate scaled up.
5. **One budget correction** — if real total cost drifts >5% from the budget (slippage shifts it off the
   marginal estimate), quantities are scaled once and re-priced.

### Both sides surfaced — ask and bid

For every bucket `get_range_trade_amounts` returns **`(mint_cost, redeem_payout)`** — the **ask** (what
you pay to mint at this size) and the **bid** (what you'd receive redeeming this size *now*). Pelagos
surfaces both, plus derived deltas, per bucket and as strip totals (`PricedBucket` / `StripQuote`):

- `mint_cost_raw` — ASK at quantity (spread + slippage included).
- `redeem_value_raw` — BID at quantity (the redeem-now payout).
- `slippage_raw` — `mint_cost − unit_price·quantity`: the convexity/slippage over the marginal price.
- `spread_raw` — `mint_cost − redeem_value`: the round-trip MM spread at this size.
- `avg_price` — effective fill probability `mint_cost / quantity`.
- Strip totals: `total_cost_raw`, `total_redeem_value_raw`, `total_max_payout_raw`,
  `total_slippage_raw`, `round_trip_spread_raw`, `expected_value_raw` (EV under the user's own Normal view).

### The `[2%, 98%]` mintable-band filter

`get_range_trade_amounts` will happily **price** bands that lie outside the protocol's mint bounds
(`[min_ask, max_ask] ≈ [1%, 99%]`), so they *look* tradeable — but `mint_range` then aborts in
`assert_mintable_ask`. To guarantee that **every bucket Pelagos surfaces as tradeable will actually
mint**, `previewStrip` flags a bucket `tradeable` only when its marginal ask probability sits inside
**`[MIN_MINTABLE_PRICE = 0.02, MAX_MINTABLE_PRICE = 0.98]`** — a deliberate safety margin inside the
protocol's `[1%, 99%]` so post-trade slippage can't push a surfaced bucket out of bounds. Out-of-band
and devInspect-failing buckets are resiliently skipped (`tradeable: false`, `quantity: 0`), never
faked.

**Proven live (DEPLOYMENT.md):** "Predict range pricing + strip MM pricing/slippage verified live via
devInspect (no funds)." Binary previews (`previewTrade` on a live ATM oracle) returned UP `$0.509` /
DOWN `$0.508`, summing to `$1.017` — the spread the PLP earns.

### Scales (enforced in one place)

- strikes / spot / forward / **probabilities** = **1e9** fixed-point (`PRICE_SCALE`)
- dUSDC cash = **1e6** micro-dUSDC (`dusdcDecimals = 6`)
- **quantity `1_000_000` = 1 contract = `$1` payout** (`CONTRACT_UNIT`)

---

## 4. Collateral model

Two assets, by design:

- **dUSDC** — the **only** asset DeepBook Predict accepts (registering a quote asset requires the
  protocol AdminCap). It collateralizes **everything that touches Predict**: distribution range strips,
  tranches, yield PLP shares, structured-note PLP reserves and range strips, and DeepBook baskets. dUSDC is **faucet-gated**
  (manual Tally form: <https://tally.so/r/Xx102L>) and finite. The managed PLP vault is seeded with
  500 dUSDC, while `prepareDusdc` raises a clear funding error when a wallet is short.
- **MOCK_USDC** — Pelagos's own freely-mintable testnet collateral (6 dp), minted via the **shared
  `Faucet`** (`faucet` / `mint`, ≤ 1,000,000 per call). Used for **Pelagos's own contracts** — the
  Polymarket uncorrelated-event baskets and vault flows — so testing/demos are never bottlenecked on
  the dUSDC faucet. It **cannot** be a Predict quote.

This split means: the Predict-backed suite is honestly collateralized in the protocol's real asset,
while the non-Predict surfaces stay frictionlessly testable.

---

## 5. Live testnet addresses + verified E2E

All values copied verbatim from `DEPLOYMENT.md` (managed Predict deploy date **2026-07-18**, chain `4c78adac`).

### Deployer / operator wallet
- `0xcad0f800f44a48360c01e9fa2d21e779bd829cb60e7220227ed16bb74d4d73e5`

### Pelagos packages (ours)
| Thing | ID |
|---|---|
| `pelagos_sui` package (mock_usdc + prediction_market) | `0x598434be38a69bf97b70490d320a698445990de38eb36e2f4c9d41dbe1ff3e45` |
| `mock_usdc::Faucet` (shared, permissionless mint) | `0xd1f67a0ec1d4b26631fcd1810f16bbc0fdf88a83cfe04c26ad400566528a07f0` |
| `MOCK_USDC` type (6 dp) | `0x598434be…3e45::mock_usdc::MOCK_USDC` |
| `prediction_market::AdminCap` | `0x0c14a699335427625eb7317cd16e758f201b8a0413d58fd0592b20e761597c4b` |
| `pelagos_vault` package | `0xcaff49f849bdf83b2df754ffc7d43c07b19ee33c2395255185607b55802e2b19` |
| `Vault<MOCK_USDC>` (shared) — baskets / freely-testable | `0x5fdc7d7a94d1dc7ae459b2e3f6760cb3b6745e6c3e4f2eed511da54bd0042d2d` |
| `VaultAdminCap` (MOCK_USDC vault) | `0x177582ae9cb44b119835d224d4b8d2f14aac0157d41f0931b55ebef0f66ef348` |
| `Vault<dUSDC>` (shared) — Predict-backed PPN/tranche wrappers | `0x9110df6651807391a65f060a5c1fb0cfecf3163ecb11d879e1aa552f1868c54a` |
| `VaultAdminCap` (dUSDC vault) | `0xeecb761376a03d5d875846886905af59ebd418150666666102806e54fe7f843f` |

### DeepBook Predict (Pelagos-operated deployment of official Mysten code)
| Thing | ID |
|---|---|
| Predict package | `0xf5716c88594bb34e89350717bc5938b0879f63262eedcb8cb1064d512563cb34` |
| Predict object (market root) | `0xc075248dc9e51527229564e37416d816e01df046ba77ce167151362a74fa9794` |
| Registry | `0xee273bfcfe17308125be540999d9a96348d5c6a7d62c93403342814ffdebba2c` |
| Oracle operator cap | `0xc98d88f907b50886eb2cd1fdf4ebe86273ac5071e970d800cba450e828247bf3` |
| dUSDC type (Predict quote, faucet-gated) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |
| Contract source | `MystenLabs/deepbookv3`, `predict-testnet-4-16` @ `b63a565c6f867103553557912f87ef35574eef42` |
| Reads | Direct Sui gRPC object reads + `devInspect` |
| Oracle market data | Deribit public API → Pelagos `OracleSVICap` → Sui |
| dUSDC faucet (manual) | <https://tally.so/r/Xx102L> |
| Clock object | `0x6` |

The Mysten public Predict server and its original stale BTC oracles are not runtime dependencies.

### Verified on-chain this deploy
- `pelagos_sui` + `pelagos_vault` published; both `sui move test` green (2/2 each).
- mock_usdc `faucet` minted 1,000,000 mUSDC (CLI) + backend service minted +12,345 (digest
  `Gi1JgvinJLRi2tGNfi9UQx6zH82AmXF9zriDmuVMyGh4`) → balance 1,012,345 mUSDC.
- `Vault<MOCK_USDC>` + `Vault<dUSDC>` created and shared.
- Predict range pricing + strip MM pricing/slippage verified live via devInspect (no funds).

### Managed Predict E2E — VERIFIED on-chain (2026-07-18)
Operator manager: `0x922267855cf2d90278f4373cc23c6d69a1fb53129fe5daa322c647707aa72251`

| Step | Status | Digest |
|---|---|---|
| `create_manager` | ✅ | `GjZ4Uad7UxcFrSrRg6nznj99UWsRKNxxUewpBB67FVpf` |
| **binary mint** | ✅ | `EpBWyMNjPb85NjZkixgo98PMJJ4mxfUwLuUzeHP8gN59` |
| **binary redeem** | ✅ | `B8Sc97CQGaJ6KpgsKqbBHpJZg5jRH7o9VcMcxYzwNRix` |
| **four-bucket range strip open** (HTTP prepare/execute path) | ✅ | `8fL7AogF5gMxrtvMhf5SohHepXb8zbWuMpiB1jibp2DQ` |
| **four-bucket range strip redeem** | ✅ | `HVJcwpi2F7ovQAY7p13j1uEmEW2QrkWY2AfLGMt3bRzb` |

Direct Sui object reads confirmed the exact four opened quantities and then zero quantity in every leg
after redemption. Pricing throughout uses real MM ask/bid + slippage from
`get_(range_)trade_amounts`; the `[2%, 98%]` mintable-band and vault-capacity guards keep every
surfaced order executable against the finite pool.

> Explorer: `https://suiscan.xyz/testnet/tx/<digest>`.

---

## 6. The full `/api/predict` route list

Mounted at `app.use('/api/predict', predictRoutes)` (`backend/src/index.ts`). All paths below are
relative to `/api/predict`.

### Reads (no signer, no funds — `devInspect` + direct Sui gRPC)
| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | config + signer state + managed oracle-feed health |
| GET | `/config` | active Predict config snapshot (package / object / dUSDC type / decimals) |
| GET | `/oracles` | all oracles (`?active=true`, `?underlying=BTC` filters) |
| GET | `/oracles/active` | soonest-expiry active oracle (`?underlying=`) |
| GET | `/oracles/:id/state` | oracle state read directly from Sui |
| GET | `/vault/summary` | live PLP vault summary (NAV / share price / utilization) |
| GET | `/managers` | all managers, or `?owner=0x...` for one wallet |
| GET | `/managers/:id/summary` | manager summary |
| GET | `/managers/:id/positions` | manager position/range summary |
| POST | `/preview` | binary `get_trade_amounts` preview (devInspect) |
| GET | `/quote` | one-call binary sim: find oracle → snap strike → price (`?asset=&quantity=&is_up=`) |

### Simulations (devInspect, no signer)
| Method | Path | Purpose |
|---|---|---|
| POST | `/simulate/manager` | dry-run `create_manager` |
| POST | `/simulate/mint` | dry-run a binary mint (optionally with in-PTB deposit) |

### Writes — custodial / backend-signed (require a server signer)
| Method | Path | Purpose |
|---|---|---|
| POST | `/manager` | create the signer's `PredictManager` |
| POST | `/deposit` | deposit dUSDC into a manager |
| POST | `/mint` | mint a binary position |
| POST | `/redeem` | redeem a binary (`permissionless: true` when settled) |
| POST | `/range/mint` | mint a vertical range |
| POST | `/range/redeem` | redeem a vertical range |
| POST | `/supply` | supply dUSDC to the PLP vault |
| POST | `/withdraw` | burn PLP for dUSDC |

### Structured products — NON-CUSTODIAL (returns unsigned `tx_bytes` for the wallet)
| Method | Path | Purpose |
|---|---|---|
| POST | `/strip/preview` | μ/σ view → N on-grid range buckets, **live MM-priced** (the core preview) |
| POST | `/manager/prepare` | first-open: unsigned `create_manager` tx |
| POST | `/strip/open/prepare` | unsigned `deposit + N×mint_range` (one signature) |
| POST | `/range/redeem/prepare` | unsigned `redeem_range` (live or permissionless) |
| POST | `/lp/supply/prepare` | unsigned PLP counterparty-liquidity supply |
| POST | `/lp/withdraw/prepare` | unsigned PLP withdraw |
| POST | `/confirm` | verify a wallet-executed digest on-chain; surfaces events + created manager id |

### Products
| Method | Path | Purpose |
|---|---|---|
| POST | `/ppn/quote` | Legacy PPN quote: PLP reserve target + range-strip upside (`floor_pct`, default 0.8) |
| POST | `/ppn/open/prepare` | unsigned single-PTB PPN open (split → PLP supply + deposit + range strip) |
| POST | `/tranche/quote` | senior/mezz/junior quotes (strip at 0.5σ / 1σ / 2σ) |
| GET | `/baskets` | list the DeepBook structured baskets |
| POST | `/basket/quote` | quote a named basket (`basket_id`) |

> Request bodies accept either raw or human amounts: `*_raw` (u64 string, 6dp) or `*_ui`
> (`amount_ui`, `budget_usd`, `mu_usd`, `sigma_usd`, …). The server resolves a valid on-grid oracle by
> `oracle_id` or by `asset` (default `BTC`) and reads the live forward.

---

## 7. How to run

### Prereqs
- Node ≥ 18, `sui` CLI, a funded Sui **testnet** wallet (gas).
- For **live Predict writes**, dUSDC for the signing wallet: request at <https://tally.so/r/Xx102L>
  (manual). Pricing, previews, simulations, and the binary `/quote` need **no funds**.

> Note: the frontend (`app/`) is a **non-standard Next.js fork** — read `AGENTS.md` /
> `node_modules/next/dist/docs/` before changing frontend code. Defaults: backend `PORT=13101`,
> frontend `13100` (`FRONTEND_URL=http://localhost:13100`).

### Environment
`backend/.env` (see `backend/.env.example`):

```bash
PORT=13101
FRONTEND_URL=http://localhost:13100
STATE_DIR=./state
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# Backend signer (faucet/admin mint + custodial Predict writes). Bech32 suiprivkey1...
SUI_PRIVATE_KEY=suiprivkey1...
SUI_ACTIVE_ADDRESS=0x...

# Pelagos-operated DeepBook Predict (manifest is canonical; env overrides win)
PREDICT_MODE=managed
PREDICT_NETWORK=testnet
PREDICT_DEPLOYMENT_MANIFEST=./config/predict-managed.testnet.json
PREDICT_SERVER_URL=direct+sui://testnet
PREDICT_PACKAGE_ID=0xf5716c88594bb34e89350717bc5938b0879f63262eedcb8cb1064d512563cb34
PREDICT_OBJECT_ID=0xc075248dc9e51527229564e37416d816e01df046ba77ce167151362a74fa9794
PREDICT_DUSDC_TYPE=0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC
PREDICT_FEED_ENABLED=true
PREDICT_FEED_INTERVAL_MS=10000
# PREDICT_SIGNER_PRIVATE_KEY=  # optional; falls back to SUI_KEYSTORE_PATH / SUI_PRIVATE_KEY

# Pelagos own packages (mock USDC + vault) — from DEPLOYMENT.md
MOCK_USDC_TYPE=0x598434be38a69bf97b70490d320a698445990de38eb36e2f4c9d41dbe1ff3e45::mock_usdc::MOCK_USDC
MOCK_USDC_FAUCET_ID=0xd1f67a0ec1d4b26631fcd1810f16bbc0fdf88a83cfe04c26ad400566528a07f0
VAULT_PACKAGE_ID=0xcaff49f849bdf83b2df754ffc7d43c07b19ee33c2395255185607b55802e2b19
VAULT_OBJECT_ID=0x5fdc7d7a94d1dc7ae459b2e3f6760cb3b6745e6c3e4f2eed511da54bd0042d2d
VAULT_DUSDC_OBJECT_ID=0x9110df6651807391a65f060a5c1fb0cfecf3163ecb11d879e1aa552f1868c54a
```

`app/.env.local` — point the frontend at the backend (e.g. `NEXT_PUBLIC_API_URL=http://localhost:13101`)
and surface the public IDs as needed.

### Run
```bash
# Backend (hot-reload dev server on :13101)
cd backend && npm install && npm run dev

# Frontend (Next dev on :13100) — in a second shell
cd app && npm install && npm run dev
```

### Faucets
- **dUSDC** (Predict collateral, manual): <https://tally.so/r/Xx102L>.
- **mock USDC** (Pelagos's own, instant): `POST /api/sui/mock-usdc/mint` `{ "recipient": "0x...", "amount_ui": 10000 }`
  — mints via the shared `Faucet` / TreasuryCap (≤ 1,000,000 per call). Also `POST /api/dev/...` and the CLI.

### Smoke checks
```bash
curl 'http://localhost:13101/api/predict/status'
curl 'http://localhost:13101/api/predict/quote?asset=BTC&quantity=1000000&is_up=true'   # live binary price, no funds
curl -s 'http://localhost:13101/api/predict/strip/preview' \
  -H 'content-type: application/json' \
  -d '{"asset":"BTC","budget_usd":50,"n":6}'                                            # live strip MM prices, no funds
```

Scripts: `npm run verify:predict` (devInspect proof of life), `npm run audit:predict-managed`
(live HTTP-bound open/redeem proof, needs dUSDC), and `npm run feed:predict` (one oracle push).

---

## 8. How the hackathon minimum requirements are met

The DeepBook Predict track requires: **integrate the Predict contract on testnet, work end-to-end, and
provide proper simulation results for a vault strategy.**

1. **Integrate the Predict contract on testnet** — ✅ Pelagos deploys the exact official Mysten
   `predict-testnet-4-16` source at package `0xf5716c88…cb34` / object `0xc075248d…9794` and calls it
   directly via hand-rolled PTBs (`ptb.ts`): `create_manager`,
   `deposit`, `mint`/`redeem`, `mint_range`/`redeem_range`, `supply`/`withdraw`, and the
   `get_trade_amounts` / `get_range_trade_amounts` previews. All against dUSDC, the protocol's quote asset.

2. **Works end-to-end** — ✅ live on-chain, **wallet-signed, non-custodial** (the user owns the
   `PredictManager`). Current managed-deployment proofs include binary mint/redeem
   (`EpBWyM…8gN59` / `B8Sc97…wNRix`) and an HTTP-bound four-leg strip open/redeem
   (`8fL7Ao…ibp2DQ` / `HVJcwp…bRzb`). Direct object reads confirm exact quantities and zero residual
   positions after redemption.

3. **Proper simulation results** — ✅ all pricing is **real MM pricing + slippage straight from
   `get_range_trade_amounts`**, priced **at the actual order quantity against post-trade vault state**
   (no linear/invented numbers). Both sides are surfaced (ask + bid + per-bucket slippage + round-trip
   spread + EV), and the `[2%, 98%]` mintable-band filter guarantees every surfaced bucket actually
   mints. Live binary sim returned UP `$0.509` / DOWN `$0.508` (≈`$1.017` = the PLP spread). The PLP
   vault `supply` path is the "vault strategy" — capital deposited as the protocol counterparty
   ("be the house"), NAV readable live via `/vault/summary`.

4. **Beyond the minimum** — Pelagos ships a **full structured-product suite** (Distribution, Tranches,
   Range Strips, PLP yield strategies, funded notes, and DeepBook baskets) on one shared real-priced strip engine, a clean non-custodial
   prepare/sign/confirm flow, and a two-asset collateral model (dUSDC for Predict, freely-mintable mock
   USDC for the rest) so the demo is never faucet-blocked.

---

### Appendix — key source files
- `backend/src/services/predict/config.ts` — env-overridable Predict deployment config + `predictTarget`.
- `backend/src/services/predict/ptb.ts` — low-level Predict PTB builders.
- `backend/src/services/predict/index.ts` — custodial writes + `previewTrade`/`previewRange`/simulations.
- `backend/src/services/predict/server.ts` — Predict read facade; managed mode routes to direct Sui reads.
- `backend/src/services/predict/onchain-server.ts` — direct gRPC object adapter matching the legacy API shapes.
- `backend/src/services/predict/feed.ts` — Deribit-backed oracle updates, settlement, compaction, and rollover.
- `backend/config/predict-managed.testnet.json` — canonical managed deployment manifest and provenance.
- `backend/src/services/predict/structured.ts` — strip math, `previewStrip` (real MM pricing/slippage), non-custodial PTBs.
- `backend/src/services/deepbook-yield.ts` — PLP yield allocations and counterparty payoff modeling.
- `backend/src/services/notes-allocation.ts` — funded terminal notes and autocall terms.
- `backend/src/services/structured-payoffs.ts` — shared terminal payoff and PLP stress math.
- `backend/src/routes/predict.ts` — the `/api/predict` HTTP surface.
- `DEPLOYMENT.md` — canonical live testnet addresses + verified digests.
- `ARCHITECTURE.md` — topology, backend engines, and data sources.
