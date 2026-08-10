# Pelagos — Products, Mechanics & Settlement

How each product is **built**, **priced**, and **settled**, end to end. This is the
architecture-level reference; for the precise on-chain IDs see
[`DEPLOYMENT.md`](DEPLOYMENT.md), and for the DeepBook integration internals see
[`README_DEEPBOOK.md`](README_DEEPBOOK.md) and [`MARKET_FILTER.md`](MARKET_FILTER.md).

---

## The one model behind everything

Every Pelagos product is a **priced payoff over a settlement price**, expressed as a
partition of bands `{lower, higher, payout}` and settled on one of two rails. Products
differ only in *how the bands and their prices are computed*; custody and settlement are
shared.

```
 DATA                          PRICING                          SETTLEMENT
 ────                          ───────                          ──────────
 Polymarket CLOB odds   ┐                                 ┌─ mUSDC (sim): Vault<MOCK_USDC>,
 DeepBook Predict (SVI) ├──►  band payoff + a price  ───► │   deposit premium → mint realized payoff
 Sui-DeFi spot / vol    ┘     per band                    └─ dUSDC (real): DeepBook Predict
                                                              mint_range / redeem on-chain
            both rails reuse one primitive — pelagos_vault::vault, a generic Vault<T>
```

**Pricing is real, not modeled.** Wherever a product trades a DeepBook Predict range
(options, volatility, range strips, the distribution range-strip, the protected-note
upside), the **premium is the protocol's own live bid/ask** — read from
`get_range_trade_amounts` via `devInspect`, already including AMM spread and post-trade
slippage. Black–Scholes-style math appears only to render **greeks** and the **IV column**,
never to set a premium. Where a product is not a DeepBook range (baskets, tranches), pricing
is a transparent weighted-probability NAV or a normal-model fair value. Nothing in the
pricing path is invented.

---

## The two settlement rails

Both rails price off the same engine; they differ only in custody/settlement, chosen per
order by a currency toggle.

| | **mUSDC — simulation** | **dUSDC — real** |
|---|---|---|
| Collateral | `MOCK_USDC`, freely mintable via a shared `Faucet` | `DUSDC`, faucet-gated (Mysten's TreasuryCap) |
| Venue | Pelagos' own `Vault<MOCK_USDC>` + a protocol-controlled mint | Real DeepBook Predict order book |
| Payoff | Backend computes the realized band payoff and **mints exactly that** | The Predict protocol computes + pays it on-chain |
| Why | Unlimited test supply so demos never bottleneck on the dUSDC faucet | The genuine, scarce, judge-credible settlement |

**mUSDC mechanics** (`backend/src/services/sim-settlement.ts`): the premium is deposited via a
real `vault::deposit` (the user keeps a transferable `VaultShare` receipt); at settlement the
realized payoff is the single band the settlement price lands in, and exactly that much mUSDC
is minted to the holder. The share is **not** redeemed, so net P&L = payoff − premium models
wins *and* losses. There is **no peg or swap** between the two rails.

**The vault** (`pelagos_vault::vault`): an ERC-4626-style generic `Vault<T>` — deposits become
house float, shares price at `assets / total_shares`, fees are separated and capped. The same
package is instantiated as `Vault<MOCK_USDC>` and `Vault<DUSDC>`.

---

## Distribution Markets

**What:** a live BTC **options chain** plus a **μ/σ distribution builder** — express a single
strike, or your whole view of *where* BTC settles.

**Build:** `app/app/distribution` → `/api/options/chain` (chain) + `/api/predict/strip/*`
(distribution). A binary call @K is a DeepBook range `[K, far]`; a put @K is `[floor, K]`.
Strikes are laid on a volatility-scaled grid around the live forward and snapped to the
oracle's on-chain tick grid; per-strike IV comes from the live SVI smile. The distribution
builder slices the trader's Normal view into contiguous on-grid bands (each weighted by the
normal probability mass it covers).

**Price:** each band's cost is the **real DeepBook Predict range price** (`get_range_trade_amounts`,
bid + ask + slippage). The band chain is **arbitrage-free by construction** — each range price is
a difference of two points on the protocol's single monotone binary-price curve, so adjacent
bands can't overlap or sum past $1. Greeks are **digital (cash-or-nothing) sensitivities** off
the SVI IV, computed for display. A `[2%, 98%]` mintable filter hides bands that would abort
on mint.

**Settle:** dUSDC (real `mint_range`/`redeem`) or mUSDC (sim). Whole contracts only; orders are
**depth-capped** (a slippage cap + a max-fraction-of-pool cap).

> Note: the *continuous* μ/σ AMM variant (`distribution-continuous.ts`) is a constant-function
> distribution market — the trader's Normal view is traded against the market's Normal, sized so
> the position's worst case equals the posted collateral ("collateral at risk"); it settles on
> mUSDC via the treasury. Pool depth sets how sharp a distribution the AMM will quote.

---

## Volatility

**What:** an institutional vol desk — trade implied-vs-realized vol with prebuilt structures
(straddle / strangle / butterfly / iron condor), a live payoff diagram + greeks, an optional
delta-hedge sleeve, and (Advanced) a 3D SVI surface + smile/term-structure analytics + a
free-form multi-leg sculptor.

**Build:** `app/app/volatility` → `/api/vol/*`. Each structure maps to a gamma profile — a
weight vector over a Normal(forward, σ) measure (long-vol = wing-heavy barbell, short-vol =
center pin). The **IV surface** is the protocol's own raw-SVI parameters decoded from the
Predict indexer (not back-implied from marks); the desk also reports realized vol (from
Sui/CEX candles) and the implied-minus-realized vol-risk-premium.

**Price:** the strip is priced through the **same real DeepBook MM path** as the options chain
(`previewStrip` → `get_range_trade_amounts`). Strip greeks are computed on the synthesized
payout under Normal(forward, σ) for display.

**Delta hedge:** the position's BTC delta is offset by a perp leg sized at `|delta| × mark`. The
BTC mark is sourced **Sui-DeFi-first** (Bluefin perp → DeepBook XBTC/USDC CLOB → Pyth on Sui →
CEX reference → Predict forward); funding is real (Bluefin or Hyperliquid). The hedge re-sizes
live off gamma as the mark moves. **Routing is simulated** (real mark/funding/size; no perp
order is submitted) — labeled as such.

**Settle:** dUSDC (real) or mUSDC (sim).

---

## Range Strips

**What:** one DeepBook workspace with three execution surfaces:

1. **Buy Strips** — prebuilt terminal BTC views such as Pin the Forward, Rally Above, Fade Lower,
   Hold the Range, and Break the Range.
2. **Earn Yield** — become the pooled counterparty through **Core Market Maker**, or pair PLP
   exposure with live **Downside Guard**, **Two-Way Guard**, or **Center Rebate** range hedges.
3. **Protected Notes** — lower-risk funded terminal schedules and an mUSDC-only discrete autocall,
   with risk and settlement terms stated explicitly rather than promising guaranteed principal.

**Buy-strip build / price / settle:** `app/app/deepbook` → `deepbook-strategies.ts` maps each
recipe to a band-weight vector and prices it through `previewStrip` →
`get_range_trade_amounts`. dUSDC creates real Predict range positions; mUSDC creates an isolated
testnet payoff receipt over the same quoted bands.

**Yield build / price / settle:** `deepbook-yield.ts` reconciles every capital stack exactly as
`PLP + live hedge premium + manager buffer = capital`. dUSDC deposits into the real PLP and, when
applicable, opens all hedge legs in one wallet-signed PTB. Position value is the sum of PLP NAV,
live range exit bids, and manager idle dUSDC. mUSDC is a separate, isolated terminal schedule; it
does not create PLP ownership or dUSDC rights. No fixed or annualized APY is presented.

---

## Baskets

**What:** diversified baskets of uncorrelated event markets, tiered by conviction
(HIGH ≈ 95% / LOW ≈ 5%) and horizon (short / medium / long).

**Build** (`backend/src/services/baskets.ts`): pull the live Polymarket universe → emit a YES
*and* a NO leg per market (so a long-shot can power a HIGH basket via its NO side) → bucket by
probability tier + days-to-resolution → fill with heavy **de-correlation** so the legs are
genuinely independent, not 30 variants of one bet: a global per-underlier claim, event/topic
dedupe, an entity-theme cap, and a TF-IDF cosine-similarity rejection (the 5-stage filter is
documented in [`MARKET_FILTER.md`](MARKET_FILTER.md)). Selected legs are re-priced off the
Polymarket **CLOB midpoint**.

**Price:** **NAV is a weight × live-probability aggregate** of the legs (clamped to [0,1]).
Weights are an index-fund base (scaled by volume/liquidity) re-centered toward the tier's
target conviction so a HIGH basket reads ≈ 0.95 and a LOW basket ≈ 0.05 without faking any leg
price. Issue price tracks fair value. There is no stored price series — NAV is recomputed from
live odds each request (sparkline history is cosmetic and labeled).

**Tranches (Advanced):** the basket's outcome distribution is approximated as Normal from the
legs' independent-outcome moments; attach/detach points are placed at distribution percentiles
to slice **senior / mezzanine / junior**. Each slice's fair value is a normalized normal-model
call-spread on that distribution; the offered price applies a risk-tiered yield-target discount
(senior cheap-and-safe, junior rich-and-tail-heavy), and order size is capped by a
live-liquidity hedgeability model so a tail slice is never quoted for size the market can't
absorb.

**Settle:** the basket/tranche position is a labeled `pelagos_vault::vault` deposit (mUSDC or
dUSDC); the senior/mezz/junior waterfall is applied off-chain against the resolved NAV so the
audited Move program stays untouched.

---

## Protected Notes

**What:** six explicit structured-payoff presets: **Capital Guard**, **Range Coupon**,
**Expiry KO Coupon**, **Expiry KI Buffer**, **Two-Way Buffer**, and **Autocall 3**. The first five
are terminal schedules. Barriers are observed only at expiry. Autocall 3 has exactly three ordered
observations, 100%/97.5%/95% step-down call barriers, time-accrued coupons funded from a live
final-expiry DeepBook premium, and a 70% final knock-in with one-for-one BTC downside below it.

**Build / price:** `notes-allocation.ts` selects the nearest actual live expiry and reconciles
every terminal dUSDC note exactly as `PLP reserve + live strip premium + manager buffer = principal`.
`structured-payoffs.ts` composes non-overlapping bands over the full `(0, $1bn]` domain, derives the
exact schedule minimum/maximum, validates PLP pro-rata stress identities, and resolves autocalls at
the first authoritative observation hit.

**Settle:** dUSDC terminal notes atomically acquire real PLP shares plus Predict range positions.
Their theoretical minimum is therefore $0 because PLP is pooled market-making exposure, not cash or
guaranteed principal. mUSDC terminal notes are isolated testnet receipts whose displayed schedule is
canonical and whose minimum is the exact schedule minimum. Autocall 3 is mUSDC-only. Settlement
requires an authoritative on-chain oracle value; the opening forward is never used as a fallback.

---

## Lending

**What / how:** a market-anchored rate surface and indicative borrow calculator. The **anchor
is real** — the live TVL-weighted Sui USDC supply APY (DeFiLlama: Suilend / Navi / Scallop /
Kai) drives a kinked borrow/supply curve; collateral LTVs are fixed Pelagos risk parameters.
The pool itself is in-memory (a **labeled demo** — there is no on-chain Pelagos lending
contract, so lend/borrow/repay don't move funds). Clearly distinguished in the UI from the
products that do settle on-chain.

---

## What's real vs simulated

| Component | Real | Simulated / labeled |
|---|---|---|
| Polymarket odds, volumes, CLOB mids | ✅ | — |
| Basket NAV / de-correlation | ✅ | sparkline history (cosmetic, labeled) |
| Option / vol / strip premia | ✅ real DeepBook MM bid/ask | — |
| IV surface | ✅ protocol SVI params | — |
| BTC mark / funding / realized vol | ✅ Bluefin / DeepBook / Pyth / CEX | — |
| Greeks | ✅ computed | display-only (never price) |
| dUSDC settlement | ✅ real DeepBook Predict | — |
| mUSDC settlement | ✅ real on-chain custody + mint | "simulation," labeled |
| PLP yield | ✅ real pooled dUSDC PLP shares + optional range hedges | mUSDC is an isolated reference payoff |
| Structured terminal notes | ✅ PLP + live dUSDC range positions | mUSDC uses a locked exhaustive payout schedule |
| Autocall observations | — | mUSDC-only, authoritative three-observation lifecycle |
| Delta hedge | ✅ real size / mark / funding | **routing simulated** |
| Lending | ✅ real anchor APY | **pool in-memory, labeled demo** |

---

## Where it lives (code map)

| Concern | Path |
|---|---|
| Basket build + NAV | `backend/src/services/baskets.ts`, `nav.ts` |
| Market-quality / de-correlation filter | `backend/src/services/market-filter*`, `nlp*` ([`MARKET_FILTER.md`](MARKET_FILTER.md)) |
| Tranching | `backend/src/services/tranching.ts`, `app/app/tranche/` |
| DeepBook range pricing + mint PTBs | `backend/src/services/predict/` (`structured.ts`, `ptb.ts`, `vol.ts`, `density.ts`) |
| Options chain + depth caps | `backend/src/services/options-chain.ts` |
| Volatility structures + greeks | `backend/src/services/predict/volatility.ts` |
| Range-strip strategies | `backend/src/services/deepbook-strategies.ts` |
| PLP yield strategies + account marks | `backend/src/services/deepbook-yield.ts` |
| Continuous μ/σ AMM | `backend/src/services/distribution-continuous.ts` |
| Funded notes + autocall terms | `backend/src/services/notes-allocation.ts` |
| Terminal schedules + PLP/autocall math | `backend/src/services/structured-payoffs.ts` |
| BTC mark + hedge | `backend/src/services/bluefin.ts` |
| mUSDC receipt settlement | `backend/src/services/sim-settlement.ts` |
| Vault deposit/redeem PTBs | `backend/src/services/vault/index.ts` |
| Lending rate surface | `backend/src/services/lending.ts` |
| Move packages | `pelagos_sui/`, `pelagos_vault/`, `pelagos_strategies/` |
