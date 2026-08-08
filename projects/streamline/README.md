# StreamLine

**Programmable, _private_ micropayments on Sui — gasless, milestone-gated, confidential, composable**

StreamLine turns paying someone into a continuous, milestone-gated financial flow. Instead of lump sums on arbitrary schedules, money drips in real time — split automatically across wallets, yield, and savings — with **zero transfer fees** for the end user, and **amounts that can be hidden on-chain with zero-knowledge proofs**.

> A client locks **$800** across 4 milestones. The freelancer watches money arrive in real time as they work. When a milestone is done they raise it on-chain; the client approves (or a keeper auto-approves after 48h). They can even **borrow against the live stream** before it's fully paid out — or flip on **Private amounts** so only the two of them ever see the numbers.

Built for **Sui Overflow 2026 · DeFi & Payments track**.

### Three pillars

| 🔁 Real-time streaming | 🔒 Private by design | 🧩 Composable DeFi |
|---|---|---|
| Money accrues by the second and settles gasless, milestone-gated, on-chain — no invoice, no middleman. | **Private by default**: amount, who↔whom, and drip cadence stay inside a shielded pool + lazy settle. Deposit/withdraw edges still reveal (honest anonymity-set tradeoff). Amounts-only and public remain as compat modes. | The instant value is earned it can **auto-compound in a yield vault** or **back a loan** — in place, no bridge (on public / named streams). |
| [Why a stream →](#why-a-stream-not-a-payment--and-why-a-card-physically-cant-do-this) | [Privacy →](#privacy) | [DeFi →](#composable-defi--where-the-money-goes) |

**Privacy is a headline feature of StreamLine, not a roadmap item** — private engagements (shielded pool + lazy vest), amounts-only confidential streams, Seal/ECIES openings, and zkLogin all run on Sui testnet today. See **[Privacy](#privacy)**.

---

## The Problem

Every payment system shares the same shape: a lump sum, transferred at an arbitrary interval. Salaries are biweekly, freelancers invoice monthly, rent is due on the first. Work happens continuously; payment is discretized into chunks — because **transactions cost money, so you batch.**

- **Freelancer cash flow** — A developer in Lagos finishes work for a client in London. The wire takes 3–5 days. They've earned the money; they don't have it.
- **Trust in contracts** — Pay upfront (trust the freelancer) or pay on completion (trust the client). Every freelance platform is a middleman trying to patch this.
- **Silent clients** — Pay-on-completion lets a client stall indefinitely after the work is done.
- **Manual yield** — Moving income into savings/yield takes discipline most people never sustain.

### Scale

- **2.5B+** people underserved by traditional cross-border payroll
- **3–5 days** typical freelance settlement time
- **$0.00** — what a transfer should cost when money streams continuously

---

## The Solution

What if money could move *continuously*, for free, with the rules enforced on-chain?

StreamLine locks the full project amount up front in a **Move shared object**. Funds flow only while a milestone is approved, dripping to the recipient — and their split destinations — in gasless increments. No invoice, no chasing, no escrow middleman. The Move type system *is* the escrow.

### Capabilities

**Gasless drips** — Settlement in gasless increments (a configurable **1 USDC** floor keeps gas a negligible fraction of each drip) with no fee to either party. zkLogin users need no SUI for gas — transactions are sponsored.

**Milestone gates + auto-approve** — Money only flows after the client approves each milestone. If the client goes silent, a permissionless keeper auto-approves after a configurable window (default 48h). Neither side can be held hostage.

**Automatic splits** — Configure once: e.g. 70% spending wallet, 30% yield. Every drip routes accordingly, atomically, in one PTB.

**Borrow against a stream** — A live stream has a present value. Mint a non-transferable `CollateralReceipt` and borrow against future income without selling or waiting.

**Seedless onboarding** — Sign in with Google via **zkLogin/Enoki** → a real Sui address, no seed phrase, no wallet install.

**Live earn counter** — The recipient watches earnings tick every 100ms via client-side math; the indexer's WebSocket feed corrects the base on each confirmed drip.

**Confidential streaming** — Toggle *Private amounts* on any stream and the amounts never touch the chain in the clear. Balances and drip sizes become **Poseidon commitments**; every drip is justified by a **Groth16 zero-knowledge proof**; the freelancer decrypts their own figures locally via **Seal**. See [Privacy](#privacy).

**Auto-yield + borrow** — Route a slice of every drip straight into a yield vault (it compounds the moment it's earned), and borrow cash against a live stream's future income. The money works the instant it's paid. See [Composable DeFi](#composable-defi--where-the-money-goes).

**Mutual dispute resolution** — Either party can pause a stream; both then agree on-chain to resume it or split the remainder. No funds can be locked hostage and no single party can unilaterally seize them. See [Dispute resolution](#dispute-resolution).

---

## Why a stream, not a payment — and why a card *physically can't* do this

The core insight is that **work is continuous but payment is discrete, and the discreteness is an artifact of cost, not desire.** You'd pay someone the instant they earned a cent if a transfer cost nothing and cleared instantly. It doesn't on legacy rails, so we batch into salaries, invoices, and net-30 terms — and every batch boundary is where trust, float, and disputes live.

A stream removes the boundary. Money accrues by the **second** (`total × elapsed / duration`), settles in gasless increments, and the rules — milestones, approvals, splits — are enforced by the chain instead of a middleman.

### Why card / bank rails can't be retrofitted into this

This isn't a UX gap that a nicer app fixes — it's structural to how Web2 money moves:

| Property | Card / ACH / wire | StreamLine on Sui |
|---|---|---|
| **Settlement** | Deferred & batched (auth now, funds T+1 to T+3; wires hours–days; cross-border 3–5 days) | Real-time, per-interval finality on every drip |
| **Per-transfer cost** | 1.5–3.5% + fixed fee — so micro-settlement is economically impossible | Gasless for users (sponsored); only a tiny on-chain gas the protocol amortizes |
| **Reversibility** | Chargebacks for ~120 days → merchants can't trust "paid" | Final on settlement; disputes are explicit, mutual, on-chain |
| **Custody** | Funds sit with banks/processors (Stripe, Visa, ACH operator) between parties | Funds locked in a Move object only the rules can move — no intermediary holds them |
| **Programmability** | None at the rail; "split this payment 70/30 into a yield account" is not a primitive | Native: one atomic PTB pays, splits, and invests |
| **Composability** | A card payment can't *become* collateral or yield without leaving the rail | The same locked value is borrowable and investable in place |
| **Identity / onboarding** | KYC, bank account, card issuance — excludes billions | Google sign-in → a real account, no bank, no seed phrase |

Card networks were built to **move a fixed amount, once, with a reversal window** — the opposite of a continuous, final, programmable flow. You cannot "stream" a Visa transaction by sending thousands of tiny authorizations: the fees, batch windows, and chargeback model make it both unaffordable and untrustworthy. Streaming is only possible on a settlement layer where a transfer is **cheap, final, and programmable** — which is what a blockchain is, and (per [Why Sui](#why-sui)) what Sui is *especially* good at.

### And why "just continuous" still has a floor

Even on-chain, every settlement tick costs *some* computation gas, so truly per-second on-chain payment would be absurd. StreamLine resolves this with a **gasless floor**: a drip fires only once ~1 USDC has accrued (configurable), so gas stays a negligible fraction of value moved while the recipient's *displayed* balance still ticks every 100ms (client-side math, corrected by each confirmed drip). You get the feel of continuous pay with the economics of batched settlement — the best of both.

---

## Privacy

Privacy in StreamLine isn't a separate mode bolted on the side — it's a per-stream toggle woven into the normal create/approve/drip flow. It attacks the things a payment leaks, each with a primitive that is **live on Sui testnet** (no devnet-only crypto):

| Layer | What it hides | How |
|-------|---------------|-----|
| **Identity** | *who* is paying/getting paid | zkLogin / Enoki — Google sign-in maps to a fresh Sui address, no linkable wallet |
| **Gasless** | the gas-payer's footprint | Enoki sponsorship — the user never submits a gas coin |
| **Amounts** | balances, rate, drip sizes | **Groth16 zk-SNARKs** (`sui::groth16`, BN254) over **Poseidon** commitments — with **Seal** privately delivering the secret openings to the two parties (see below) |
| **Metadata** | milestone terms & deliverables (files) | **Seal** encryption + **Walrus** blob storage, gated by the same `seal_approve` policy — *roadmap* |

Identity, gasless, and amounts (including Seal for the secret openings) are **live on testnet**; the metadata/deliverables layer (encrypted files in Walrus) is the one **roadmap** piece.

### What it aims to solve

A public stream is a glass wallet. Anyone reading the chain sees **how much** a freelancer earns, the client's **rate card**, the **size of the deal**, and **when** money moves — competitive and personal information that traditional invoicing keeps private. For real payroll and client work that transparency is a non-starter. StreamLine's goal: **the same trustless, milestone-gated, gasless stream — but the numbers are visible only to the two parties.**

### Why this was hard (and how we got around it)

The obvious tool for confidential balances on Sui is the `contra`/confidential-transfers design built on **Bulletproofs + ristretto255** — but those natives are **devnet-only**. We re-implement the same confidential-balance idea with a **Groth16 proof backend** instead, because `sui::groth16::verify_groth16_proof` (BN254) is enabled on **testnet and mainnet**. That single substitution is what makes end-to-end confidential amounts possible on a public network today.

### How confidential amounts work

1. **Commitments, not values.** A `ConfidentialStream<T>` keeps a *public* USDC reserve (the locked pool) but stores `remaining` and `earned` as **Poseidon commitments** — `commit(value, blinding)`. The chain sees a hash, never the amount.
2. **Every drip carries a proof.** `confidential_drip` accepts a **Groth16 transfer proof** showing the new commitments are a valid debit/credit of the old ones *and* that the moved amount sits in a **64-bit range** (`v ∈ [0, 2⁶⁴)`), so nobody can over-withdraw — all without revealing a single number. The Move verifier (`verify_wrap` / `verify_transfer` / `verify_unwrap`, embedded verifying keys) checks it natively.
3. **Wrap → stream → unwrap.** A `ConfidentialPool<T>` lets value enter (`wrap`), move between commitments (`confidential_transfer`), and exit (`unwrap`) — homomorphic add/sub on commitments, each gated by a range proof.
4. **The two parties can read their own balance.** The secret openings (values + blinding factors) are **Seal-encrypted to both wallets** and decrypted locally — see [Seal](#how-seal--walrus-fit) below.
5. **Milestone state stays public.** Which milestone is active, approvals, and auto-approve timing remain on-chain in the clear — only the *amounts* are hidden — so the trust/escrow guarantees are unchanged.

Proofs are generated in-browser with **circom 2.2.3 + snarkjs** (Poseidon via circomlibjs). The circuits — `wrap`, `transfer`, `unwrap` — are validated both in `sui move test` (Groth16 verifies on-chain) and against the Rust arkworks serializer to guarantee the JS-produced bytes are byte-identical to what the Move verifier expects.

### How Seal & Walrus fit

**Seal** is threshold identity-based encryption with **on-chain access control**: you encrypt data *to a wallet identity*, and Seal's key servers release the decryption key only if an on-chain Move policy (`seal_approve`) confirms the requester is that identity (1-of-N threshold — no single server can decrypt or censor). **Walrus** is decentralized blob storage for larger files. They play different roles in the two stream types:

**Confidential streams — Seal carries the ZK secrets (shipped).**
The chain only stores Poseidon *commitments*, but the two parties still need the real values + blindings — the freelancer to see their balance, and whoever drips to generate the next Groth16 proof. Those secrets can't be on-chain in the clear and can't be re-derived, so Seal is the private channel for them:
- At creation, the payload `{ total, remaining, earned, blindings… }` is Seal-encrypted **twice** — to the client and to the freelancer — and packed into one envelope `{ s, f }`.
- The envelope is stored **on-chain** as a dynamic field on the `ConfidentialStream` (it's a few hundred bytes — small enough that it doesn't need Walrus yet).
- To read, a party asks Seal's key servers, which run `seal_approve(id)` (asserts `id == sender`) so only the encrypted-to wallet gets the key; decryption happens in the browser and **never leaves the device**.
- Each drip changes the blindings, so the envelope is rotated via `update_confidential_secrets`.

**Public streams — Seal + Walrus for deliverables (roadmap).**
Public-stream *amounts* are plaintext by design, so Seal isn't needed for the money. The remaining leak is **metadata** — the brief, the terms, and the actual **deliverables** (designs, code), which shouldn't be on-chain at all. The intended pattern: Seal-encrypt the file to both parties, store the ciphertext in **Walrus**, and gate access with the same `seal_approve` policy — so a stream can have **visible amounts but a confidential work product**. This applies to confidential streams too, and is **not yet wired** (Walrus integration is a roadmap item).

### Honest limitations

- **Trusted setup.** Groth16 needs a per-circuit setup; for the hackathon it's a disclosed single-party ceremony.
- **Browser proving** is heavier than Bulletproofs (seconds, not milliseconds) but workable.
- **Cashing out reveals** the unwrapped amount unless it's spent confidentially onward.
- **Composability gap.** Scallop/NAVI can't read encrypted balances, so yield and stream-backed lending need a plaintext path — confidential streams trade those features for privacy.

---

## Why Sui

| Primitive | What it unlocks |
|-----------|-----------------|
| **Address Balances** | Protocol-level gasless stablecoin transfers — true per-interval streaming at any size. On EVM every drip costs gas. |
| **PTBs** | The split (pay + save + invest) executes atomically. If the yield leg fails, the whole drip reverts. |
| **Move object ownership** | Funds are physically locked inside a shared object, reachable only via entry functions. No reentrancy, no approval games. |
| **zkLogin** | Google OAuth → a Sui address directly. Onboarding with no seed phrase. |
| **`sui::groth16` native** | On-chain zk-SNARK verification (BN254), enabled on testnet/mainnet — the basis for **confidential amounts**. No devnet-only crypto required. |
| **Seal** | Threshold encryption with an **on-chain** `seal_approve` access policy — delivers the confidential-stream secrets only to the two parties (Walrus blob storage for deliverables is roadmap). |

### Why Sui specifically (not "just any chain")

A payment stream is plausible on several chains, but each property StreamLine needs lines up with something Sui does natively that others bolt on or can't do:

- **Gasless at the protocol, not the app.** Sui's **Address Balances** make stablecoin transfers gasless at the rail, and **Enoki sponsorship** covers the rest — so a user with *zero* SUI streams money. On EVM, "gasless" means meta-transactions/relayers and a paymaster you operate; every drip still burns gas someone pays for, and per-interval settlement is cost-prohibitive on L1.
- **The object model is the escrow.** Funds live *inside* a `Stream` shared object reachable only through its entry functions. There's no allowance to over-approve, no balance mapping to reenter, no `transferFrom` foot-gun — a whole class of EVM payment-contract exploits simply doesn't exist. On Solana, the account model is fast but you hand-roll the same guarantees with PDAs and manual checks.
- **PTBs give atomic composability for free.** Pay + split + deposit-to-yield is **one transaction that all-or-nothing reverts**. On EVM you'd write a bespoke router contract and pray about reentrancy across the legs; on Sui it's a Programmable Transaction Block composing existing modules.
- **zkLogin removes the wallet.** Google → a real Sui address with no seed phrase, native to the chain — the single biggest onboarding unlock for the 2.5B people who'll never install a wallet extension.
- **On-chain Groth16 is enabled on mainnet.** Confidential amounts verify a real zk-SNARK *on-chain* today. The comparable confidential-balance path (Bulletproofs/ristretto255) is devnet-only; Sui's `groth16` native is the production escape hatch.

The throughline: Sui makes the **cheap, final, programmable, gasless** settlement that streaming requires the *default*, where other chains make it a project.

---

## Composable DeFi — where the money goes

Streaming income is only half the story. The instant value is earned it should be able to **work** — and because StreamLine locks value in a Move object and settles via PTBs, the same dollars are investable and borrowable *in place*, with no bridge or withdrawal. (Scallop — Sui's largest lending protocol — is **mainnet-only**, so on testnet we ship interface-compatible stand-ins that swap 1:1 to the real thing on mainnet.)

### 1. Yield vault — `streamline::yield_vault`
A Scallop-shaped lending pool: deposit the streamed token, receive a share **`VaultReceipt`**, and watch it appreciate via a continuously-compounding `apr_bps` index; redeem for principal + interest. Maps 1:1 to Scallop's `mint`/`redeem` (`Coin<MarketCoin<T>>`).

### 2. Auto-yield — `create_stream_v2` + `drip_with_yield`
The headline: a stream created with a yield split (e.g. **70% cash / 30% yield**) auto-invests on **every drip**. The keeper calls `drip_with_yield`, which deposits the yield-flagged slice straight into the vault and hands the freelancer a `VaultReceipt` — so income compounds the moment it's earned, with zero extra clicks. *This is the thing a card payment fundamentally cannot do: a card can't deposit a fraction of itself into a money market as it settles.*

### 3. Borrow against a stream — `streamline::collateral`
A `DRIPPING` stream is guaranteed future income, so its **present value** (remaining × 90%) can back a loan today. The `LendingPool<T>` funds it: borrow up to PV, receive cash now + a `LoanReceipt`, and repay principal + borrow-APR interest later. Lender yield comes from borrower interest — a complete, if minimal, money market over stream cash flows.

All three are gasless (Enoki-sponsored) and surfaced as **Yield** and **Collateral** tabs in the app.

---

## Dispute resolution

Pay-on-completion lets a client stall; pay-upfront lets a freelancer vanish. StreamLine's milestone gate + 48h auto-approve handles the *silent* cases, and **mutual resolution** handles genuine disputes:

1. Either party calls `raise_dispute` → the stream `PAUSED`, drips stop.
2. One party **proposes** a resolution — `resume` (back to dripping) or a **split** of the remaining balance (`freelancer_bps` to the freelancer, the rest refunded to the client).
3. The **other** party must `accept` identical terms — neither side can settle alone.

The proposal lives in a dynamic field (no struct-layout change, upgrade-safe). Resume returns to `DRIPPING`; a split pays both out and closes the stream. Result: **funds can never be locked hostage, and no single party can unilaterally seize them.** (`cancel` remains the client-only escape for revocable streams to reclaim unstreamed funds.)

---

## Technical Architecture

### Core Technologies

| Technology | Purpose |
|------------|---------|
| **Sui Move 2024** | `Stream` / `StreamCap` shared objects; state machine, drip math, dispute resolution. |
| **`ConfidentialStream` + `ConfidentialPool`** | Poseidon-committed balances; Groth16-verified confidential drips; Seal-sealed secrets. |
| **`YieldVault` + `LendingPool`** | Compounding yield vault + borrow-against-stream pool; auto-yield via `drip_with_yield`. |
| **circom 2.2.3 + snarkjs** | `wrap` / `transfer` / `unwrap` zk circuits; in-browser proving (Poseidon via circomlibjs). |
| **PTBs + Address Balances** | Atomic multi-step settlement; gasless transfers. |
| **Rust + Tokio + Axum + sqlx** | Off-chain indexer (REST + WebSocket) and settlement keeper. |
| **PostgreSQL** | Cached stream state and drip history. |
| **Next.js 15 + React 19** | App Router frontend. |
| **@mysten/dapp-kit + Enoki** | Wallet connection, zkLogin, sponsored (gasless) transactions. |
| **three.js + Tailwind v4** | Bayer-dither hero and the live UI. |

### System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                            USER LAYER                               │
│   Google sign-in (zkLogin/Enoki) ──► Next.js app ──► sponsored tx   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │ reads (cached)        │ writes (PTB)
                                 ▼                       ▼
┌──────────────────────────┐        ┌──────────────────────────────────┐
│   INDEXER (Rust · Axum)  │        │         SUI (testnet)             │
│   REST + WebSocket :PORT │◄──────►│                                   │
│   Postgres cache         │ events │   streamline::stream              │
└──────────────────────────┘        │     Stream<T> (shared object)     │
            ▲                        │     StreamCap (client cap)        │
            │ shares DB              │   streamline::collateral          │
            ▼                        │     CollateralReceipt             │
┌──────────────────────────┐        │   mock_usdc::mock_usdc (test)     │
│   KEEPER (Rust)          │───────►│                                   │
│   drip() once accrued    │  PTBs  │   0x2::clock, Coin<USDC>          │
│   auto_approve() at 48h  │        │                                   │
│   earns 1 bps tip        │        └──────────────────────────────────┘
└──────────────────────────┘
```

The **Move layer is the only source of truth.** The keeper and indexer are stateless services that read events and submit PTBs; the frontend reads from the indexer (fast) and writes via the user's wallet (direct to chain).

### State machine

```
LOCKED ──raise_completion──▶ PENDING_REVIEW ──approve / auto_approve──▶ DRIPPING
  ▲                                │                                       │
  └──────── milestone exhausted ───┴──────── raise_dispute ──▶ PAUSED      │
                                                                 │          │
                                  propose_resolution + accept ───┤          │
                                    ├─ resume ──────────────────▶ DRIPPING  │
                                    └─ split ───────────────────▶ DONE      │
                                                                            ▼
                                                all milestones exhausted ─▶ DONE
```

States: `LOCKED` (0) · `PENDING_REVIEW` (1) · `DRIPPING` (2) · `PAUSED` (3) · `DONE` (4). The client may also `cancel` a *revocable* stream from any non-done state to reclaim the unstreamed balance.

---

## Project Structure

```
StreamLine/
│
├── contracts/                  # Move package `streamline` (Sui Move 2024)
│   ├── sources/
│   │   ├── stream.move         #   Stream<T> + ConfidentialStream<T>, StreamCap, state machine,
│   │   │                       #     drip / drip_with_yield, create_stream_v2, dispute resolution,
│   │   │                       #     confidential_drip, seal_approve policy
│   │   ├── confidential_balance.move  # ConfidentialPool<T>, Groth16 verify_wrap/transfer/unwrap
│   │   ├── yield_vault.move    #   Scallop-shaped YieldVault<T> (deposit/redeem, compounding index)
│   │   └── collateral.move     #   present value, CollateralReceipt, LendingPool<T> (borrow/repay)
│   └── tests/                  #   State machine, accrual, dispute, yield, lending, ZK proofs (19)
│
├── circuits/                   # zk-SNARK circuits (confidential amounts)
│   ├── src/                    #   wrap / transfer / unwrap (circom) + lib/commitment (Poseidon)
│   ├── prover/                 #   snarkjs proving + arkworks-compatible serializer
│   ├── converter/              #   Rust arkworks vk/proof → Sui byte format (parity check)
│   └── move/                   #   Groth16 on-chain verification tests
│
├── mock-usdc/                  # Mintable test USDC (testnet faucet)
│   └── sources/mock_usdc.move  #   6-decimal USDC clone, shared TreasuryCap
│
├── backend/                    # Rust workspace (off-chain services)
│   └── crates/
│       ├── core/               #   Shared types, drip math, thin Sui JSON-RPC client
│       ├── indexer/            #   Events → Postgres; REST + WebSocket API
│       └── keeper/             #   Permissionless drip() + auto_approve() worker
│
├── frontend/                   # Next.js 15 app (App Router, React 19)
│   └── src/
│       ├── app/                #   Routes + Enoki sponsorship API (/api/sponsor)
│       ├── components/         #   landing/, app/ dashboards, hero/ (dither), wallet/
│       └── lib/                #   networks, streamline-tx (PTBs), stream-math, indexer
│
├── packages/
│   ├── sdk/                    #   @streamline/sdk — pay by handle, create stream, indexer reads
│   └── docs/                   #   Fumadocs site (npm run dev:docs → :3001)
│
├── docs/                       # Engineering plans (privacy, Seal) — not the public docs site
└── .gitignore
```

Each top-level package has its own README: **[contracts](contracts/README.md)** · **[backend](backend/README.md)** · **[frontend](frontend/README.md)** · **[sdk](packages/sdk/README.md)** · **[docs site](packages/docs/README.md)** · **[mock-usdc](mock-usdc/README.md)**. Privacy build details live in [`docs/complete-privacy-build.md`](docs/complete-privacy-build.md), [`docs/confidential-streaming-plan.md`](docs/confidential-streaming-plan.md), and [`docs/privacy-seal-plan.md`](docs/privacy-seal-plan.md).

---

## Smart Contracts

Deployed on **Sui testnet**. Full details in [`contracts/README.md`](contracts/README.md).

| Package / Object | ID | Description |
|------------------|----|-------------|
| **streamline** (original / type-origin) | [`0x9d6e78…b3a8`](https://suiscan.xyz/testnet/object/0x9d6e7815d5e11424a68f827e26499078fead7648328f44fdbdeff6d34ed0b3a8) | `stream` (+ `ConfidentialStream`), `confidential_balance`, `collateral`. Object types stay pinned here across upgrades. |
| **streamline** (latest, v8) | [`0x285065…d0a2`](https://suiscan.xyz/testnet/object/0x28506598eccbbde36bbfef6401936c1d907c21a7e8db77c56390b6b291fad0a2) | Package the frontend + keeper call. Adds, by version: v5 dispute resolution · v6 `yield_vault` · v7 lending pool · v8 auto-yield (`create_stream_v2`, `drip_with_yield`). |
| **YieldVault** (shared) | [`0x8ae9d8…8406`](https://suiscan.xyz/testnet/object/0x8ae9d8805682aabbd00ff0582d93b88f2f86482bcabed194a88a6ded99a88406) | Mock-USDC yield vault, 8% APR, seeded buffer. |
| **LendingPool** (shared) | [`0x0518d5…2ea2`](https://suiscan.xyz/testnet/object/0x0518d5d77a3069ebab9df5b46e60fed4589c16dc6e48cd694a02c9350f312ea2) | Borrow-against-stream pool, 12% APR, seeded liquidity. |
| **mock_usdc** (package) | [`0xf6ce32…2ed3`](https://suiscan.xyz/testnet/object/0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3) | Mintable test USDC (6 decimals). |
| **USDC TreasuryCap** (shared) | [`0xa7cb97…5330`](https://suiscan.xyz/testnet/object/0xa7cb971f4f93e5713c5703f63f3bc17fdf0f6bf1f9795dc010ac164827715330) | Permissionless faucet. |

> **Upgrade-safety note.** Sui pins each struct's type to the package version that *introduced* it. So the indexer filters events by `MoveEventModule` on the original `0x9d6e78…b3a8`, and the app queries `VaultReceipt`/`LoanReceipt` by their defining packages (v6 / v7) — never the latest — to keep catching objects across upgrades.

---

## Key Flows

### Create a stream

```
Client: "$800, 14 days, 4 milestones, 70% wallet / 30% yield"
  → mint/approve USDC (gasless faucet on testnet)
  → create_stream<USDC>(payment, freelancer, names, amounts, duration, window, revocable, clock)
  → full amount locked in a shared Stream<USDC>; client receives a StreamCap
  → StreamCreated event → indexer caches it
```

### Settlement (keeper drip)

```
Stream is DRIPPING; enough time elapses to accrue the drip floor
  → keeper computes accrued = total * elapsed / duration
  → accrued ≥ 1 USDC (configurable floor) → drip<USDC>(stream, clock)
  → split across destinations, minus 1 bps keeper tip
  → StreamDripped event → frontend counter base updates
  → milestone exhausted → relock (LOCKED) or finish (DONE)
```

### Auto-yield settlement (keeper drip_with_yield)

```
Stream created with create_stream_v2(…, yield_bps = 3000)  // 30% auto-yield
Stream is DRIPPING; keeper calls drip_with_yield(stream, vault, clock)
  → 70% leg → cash to the freelancer
  → 30% (yield_flag) → yield_vault::deposit → VaultReceipt to the freelancer
  → the receipt compounds at the vault APR from that second on
```

### Borrow against a stream

```
Stream is DRIPPING
  → present_value = remaining * 90%
  → collateral::borrow<USDC>(pool, stream, principal ≤ PV, clock)
  → cash sent now + LoanReceipt minted
  → later: collateral::repay(pool, loan, principal + borrow-APR interest)
```

---

## Roadmap — the future of StreamLine

StreamLine is built and verified end-to-end on **testnet**; the path to mainnet is mostly swapping testnet stand-ins for the production primitives that already exist on Sui mainnet.

### Mainnet deployment
- **Real Address Balances + USDC.** Replace mock-USDC with native/bridged **USDC** and settle drips over mainnet **Address Balances** for true protocol-level gasless transfers (live on Sui mainnet since May 2026).
- **Real Scallop / NAVI.** Swap `yield_vault` and the `LendingPool` for **Scallop**'s `mint`/`redeem` and lending markets (mainnet-only today) — the interfaces were built to map 1:1, so it's a call-site change, not a redesign.
- **Walrus deliverables.** Store milestone deliverables (designs, code, files) as **Walrus** blobs, Seal-encrypted, with the on-chain `seal_approve` policy gating access — turning StreamLine into the escrow *and* the handoff.
- **Production trusted setup.** Replace the single-party Groth16 ceremony with a multi-party (perpetual-powers-of-tau) setup for the confidential-amount circuits.

### Protocol hardening
- **Decentralized keeper network.** Today one permissionless keeper drips and auto-approves; mainnet wants a competitive keeper set (anyone can drip for the 1 bps tip) so settlement has no single operator.
- **Arbiter-backed disputes.** Add an optional staked arbiter as a fallback to mutual resolution, plus keeper-enforced timeout defaults so a stream can never sit `PAUSED` forever.
- **Auto-repay from drips.** Wire the keeper to route a borrower's drips to their loan, so stream-backed loans self-repay (the `auto_repay` flag is recorded today; enforcement is the next step).

### Product surface
- **Payroll & subscriptions.** The same primitive is recurring payroll, SaaS subscriptions, vesting, and grants — milestones become pay periods or unlock cliffs.
- **Mobile + zkLogin everywhere.** Push the Google-sign-in, no-wallet flow to a mobile app for the cross-border payroll users who are the core market.
- **Confidential composability.** Today confidential streams trade away yield/lending (encrypted balances aren't readable by Scallop). A future direction is zk-attested deposits so private streams can earn too.

---

## Quick Start

### Prerequisites

- **Sui CLI** (configured with a funded testnet address)
- **Rust** (stable) + **PostgreSQL 14+** — for the indexer/keeper
- **Node.js 18+** — for the frontend

### 1. Contracts

```bash
cd contracts
sui move build
sui move test                                  # state machine + drip math
sui client publish --gas-budget 200000000      # publish to the active env
```

### 2. Backend (indexer + keeper)

```bash
cd backend
createdb streamline
cp .env.example .env          # set DATABASE_URL, SUI_RPC_URL, STREAMLINE_PACKAGE_ID

cargo run -p streamline-indexer       # REST + WebSocket, schema auto-applied
cargo run -p streamline-keeper        # permissionless settlement (start with KEEPER_DRY_RUN=true)
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                            # http://localhost:3000
```

The testnet package ID and test-USDC type are baked into `frontend/src/lib/constants.ts` — the app works against the live testnet deployment out of the box.

---

## Security

- **Type-enforced escrow** — funds live inside a shared `Stream` object; no `require()` to bypass, no reentrancy.
- **Capability auth** — `approve_milestone` / `cancel` require the client's `StreamCap`, tied to one stream by ID.
- **State guards** — every entry function asserts its state; illegal transitions abort the whole transaction.
- **Non-custodial keeper** — the keeper only *triggers* permissionless functions; it never holds user funds. Its gas is reimbursed by the 1 bps tip, so users stay gasless.
- **Server-side secrets** — the Enoki sponsor key lives only in the Next.js route handler; the browser never sees it.
- **Confidential amounts** — balances/drips are Poseidon commitments; `confidential_drip` verifies a Groth16 transfer + 64-bit range proof on-chain, so a hidden amount can't exceed the committed balance. See [Privacy](#privacy).
- **Seal-gated secrets** — a confidential stream's secret openings are Seal-encrypted to the two parties and released only to a wallet that passes the on-chain `seal_approve` policy; decryption happens client-side. (Seal + Walrus for encrypted *deliverables* is a roadmap extension.)
- **Mutual-only dispute settlement** — a `PAUSED` stream exits only when *both* parties accept the same proposal (`accept_resolution` asserts the accepter ≠ proposer), so neither can unilaterally seize funds and nothing locks forever.
- **LTV-capped borrowing** — `borrow` asserts `principal ≤ present_value` (90% of remaining) and `≤ pool liquidity`, so a loan can't exceed the stream backing it.

---

## Built With

| Partner / Framework | Integration |
|---------------------|-------------|
| **Sui** | Move 2024, shared objects, PTBs, Address Balances, on-chain Clock, `groth16` zk verifier |
| **Mysten dApp Kit** | Wallet connection + transaction building |
| **Enoki** | zkLogin (Google sign-in) + sponsored gasless transactions |
| **Seal** | Threshold-encrypts the confidential-stream secrets to both parties; on-chain `seal_approve` policy (shipped). **Walrus** blob storage for encrypted deliverables (roadmap) |
| **circom + snarkjs** | zk-SNARK circuits (`wrap`/`transfer`/`unwrap`) + in-browser proving for confidential amounts |
| **Scallop / NAVI** | Yield vault + stream-backed lending — interface-compatible stand-ins on testnet (`yield_vault`, `LendingPool`), 1:1 swap to real Scallop on mainnet |

---

## License

[MIT](LICENSE)

---

Built for **Sui Overflow 2026** — money that pays as you work. No fees, no seed phrase, no waiting.
