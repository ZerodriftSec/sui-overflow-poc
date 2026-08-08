# StreamLine — Technical documentation

Living tech reference for architecture, on-chain modules, off-chain services, privacy crypto, and integration points. Use this as the home for implementation detail you may need in decks, Q&A, or handoffs.

| Companion | Role |
|-----------|------|
| [`about-project.md`](./about-project.md) | Product what / why |
| [`competitive-advantage.md`](./competitive-advantage.md) | Positioning |
| [`requirements.md`](./requirements.md) | Overflow prep quests |
| [`HANDOFF.md`](../HANDOFF.md) | **Live package IDs, RPC, ops** (source of truth for deploy state) |
| [`contracts/README.md`](../contracts/README.md) | Move package detail |
| Privacy plans | [`complete-privacy-build.md`](./complete-privacy-build.md), [`confidential-streaming-plan.md`](./confidential-streaming-plan.md), [`privacy-seal-plan.md`](./privacy-seal-plan.md) |

> **IDs drift.** Prefer `HANDOFF.md` + `contracts/deployment.testnet.json` + `frontend/src/lib/constants.ts` over copying addresses into slides.

---

## 1. System overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│ USER LAYER                                                                │
│  Browser (Next.js 15) · zkLogin / wallet · circom/snarkjs proving         │
│  Writes: Enoki-sponsored PTBs → Sui                                       │
│  Reads:  Indexer REST/WS (fast) + occasional RPC/devInspect               │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌──────────────┐  ┌─────────────────────────────┐
│ INDEXER         │  │ KEEPER       │  │ SUI TESTNET                 │
│ Rust · Axum     │  │ Rust         │  │ streamline Move package     │
│ Postgres        │  │ drip()       │  │ mock_usdc                   │
│ REST + WS       │  │ auto_approve │  │ Shared objects: streams,    │
│ event → cache   │  │ permissionless│ │ treasury, vault, pools      │
└─────────────────┘  └──────────────┘  └─────────────────────────────┘
```

**Invariant:** Move shared objects are the source of truth. Indexer/keeper never hold user funds. Frontend never invents balances — it displays chain + indexer state (Pro may overlay local org metadata).

### Repo map

```
streamlineOG/
├── contracts/           # Move package `streamline`
├── circuits/            # circom wrap / transfer / unwrap + prover tooling
├── mock-usdc/           # Testnet faucet USDC
├── backend/crates/      # core · indexer · keeper
├── frontend/            # Next.js app + Enoki sponsor API
├── packages/sdk/        # @streamline/sdk
├── packages/docs/       # Public Fumadocs site
└── docs/                # Engineering + product notes (this folder)
```

---

## 2. Why these Sui primitives

| Primitive | How we use it |
|-----------|----------------|
| **Shared objects** | `Stream`, `Treasury`, `YieldVault`, `LendingPool`, `ConfidentialPool` — funds locked in objects, moved only via entry fns |
| **PTBs** | Atomic drip + split + vault deposit; hire = ensure_idle + create stream |
| **Address Balances / gasless path** | Micropayment economics; Enoki sponsors allow-listed calls |
| **zkLogin + Enoki** | Google → Sui address; no seed phrase for demo users |
| **`sui::groth16` (BN254)** | On-chain verify of confidential drip proofs (testnet/mainnet capable) |
| **Seal** | Threshold decrypt of commitment openings to sender + freelancer only |
| **UpgradeCap** | Package upgrades; type-origin package stays stable for event filters / type queries |

---

## 3. On-chain architecture (Move)

### 3.1 Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| `streamline::stream` | `contracts/sources/stream.move` | `Stream` / `ConfidentialStream`, milestones, drip / drip_with_yield, dispute, payroll suspend/resume/stop, create from treasury, Seal policy |
| `streamline::confidential_balance` | `confidential_balance.move` | `ConfidentialPool`; Groth16 verify wrap / transfer / unwrap |
| `streamline::treasury` | `treasury.move` | Org `Treasury<T>`: open, deposit, withdraw, invest, divest, ensure_idle |
| `streamline::yield_vault` | `yield_vault.move` | Scallop-shaped vault; `VaultReceipt`; compounding index |
| `streamline::protocol_registry` | `protocol_registry.move` | Allow-list for yield adapters (native vault now; Scallop/Navi/… later) |
| `streamline::collateral` | `collateral.move` | Present value, `CollateralReceipt`, `LendingPool` borrow/repay |
| `streamline::giftcard` | `giftcard.move` | Prepaid transferable gift cards |
| `streamline::lazy_stream` | `lazy_stream.move` | Legacy lazy private accrual / settle (parties still public) |
| `streamline::shielded_pool` | `shielded_pool.move` | Note/nullifier pool (graph privacy primitive) |
| `streamline::private_stream` | `private_stream.move` | **Default private engagement** — open/settle/claim over pool + `private_settle` circuit |
| `streamline::merkle_tree` | `merkle_tree.move` | Merkle helpers for shielded path |

### 3.2 Public stream state machine

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

| State | Code | Meaning |
|-------|------|---------|
| LOCKED | 0 | Waiting for milestone raise |
| PENDING_REVIEW | 1 | Freelancer raised; client (or keeper) must approve |
| DRIPPING | 2 | Accruing; keeper may drip |
| PAUSED | 3 | Dispute active — mutual resolve |
| DONE | 4 | Closed |
| Suspended (payroll) | 5 | HR suspend — distinct from dispute pause (indexer) |

**Accrual:** continuous time math. **Settlement:** drip when accrued ≥ floor (~1 USDC) so gas stays negligible vs value.

**Auto-approve:** permissionless after configurable window (default ~48h) — prevents silent-client deadlock.

**Dispute:** either party pauses; both must accept identical resume or split terms.

### 3.3 Payroll model (treasury → streams)

```
Org wallet ──deposit──▶ Treasury<T> ──invest──▶ YieldVault (optional)
                              │
                              │ create_stream_from_treasury_v2
                              │ (ensure_idle if needed)
                              ▼
                    Stream<T> per worker ──drip──▶ worker (+ optional yield split)
                              │
                    suspend / resume / stop
                    stop ──refund remainder──▶ Treasury
```

**Design rule:** Treasury = capital pool. Stream = worker leg. Do **not** encode all employees inside one Sweem-style `StreamPool` table — preserves milestones, disputes, privacy modes, and object parallelism.

Key entrypoints (names):

- `create_stream_from_treasury_v2` — **Pro hire today (public `Stream`)**  
- `create_confidential_stream_from_treasury_v2` — Move twin; **not wired in Pro UI**  
- `suspend_payroll` / `resume_payroll` / `stop_payroll` (+ wallet-funded `stop_stream`) — public streams only  
- `treasury::ensure_idle` — divest yield when hire needs liquid float  

**Wage privacy:** Pro **defaults** to private engagement hire (wallet → pool). Explicit public mode uses treasury `Stream` for compliance / on-chain HR. Roster sealed with Seal at rest.

### 3.4 Privacy modes

**Default (personal) — private engagement** (`private_stream` + `shielded_pool` + `private_settle`):

```
USDC ──overfund deposit──▶ note + PrivateEngagement { params_cm = desired cap }
                         │
              private spend → work(desired) + change
                         │
              settle_vested(private_settle proof)  ← spend + vest bound
                         │
              worker note + change  (no parties / amounts on event)
                         │
              withdraw ──▶ clear USDC (reveals amount at exit)
```

| Piece | Tech |
|-------|------|
| Notes | `cm = Poseidon(value, pk, rho)`; nullifier `Poseidon(sk, rho)` |
| Proof | `private_settle.circom` (membership + conservation + `paid ≤ vested`) |
| Openings | ECIES via `publish_note` (not Seal) |
| Edge softening | `overfund-split.ts` — round $50 buckets + immediate spend |
| Origin hiding | Optional privacy relayer (`PRIVACY_RELAYER_SUI_PRIVATE_KEY`) |

**Compat — amounts-only** (`ConfidentialStream`):

```
USDC ──wrap──▶ commitments on ConfidentialStream (parties public)
                    │
         confidential_drip(proof)  ← Groth16 transfer + range
                    │
         Seal envelope  ← openings for both parties
```

| Piece | Tech |
|-------|------|
| Commitment | Poseidon `commit(value, blinding)` |
| Proofs | `wrap` / `transfer` / `unwrap` |
| Secrets | Seal + `seal_approve` |

**Honest limitations (do not omit in tech Q&A):**

- **Private engagement (personal default):** amount + who + cadence hidden *inside* the pool; **deposit/withdraw edges** still reveal a public amount (+ address unless relayed); **overfund + private split** makes the edge a round bucket ≠ the work note  
- **Pro treasury hire:** **default is private engagement**; explicit **Public** mode is fully cleartext + indexer `/payroll`  
- **Pro roster:** Seal-encrypted at rest to org wallet (`pro-roster-seal.ts`); plaintext only after unlock  
- **Amounts-only compat (`ConfidentialStream`):** parties + milestone timing still plaintext; reserve size often recoverable  
- Groth16 trusted setup is hackathon-grade until MPC ceremony  
- Cashing out (unwrap / withdraw) reveals amount  
- DeFi adapters can’t read encrypted balances → borrow/yield need named public streams  
- **Deploy note:** `private_stream` must be on-chain before testnet private create succeeds  
- **Privacy relayer:** hides tx origin for spend/settle/withdraw; two-step deposit hides funder as deposit sender (fund transfer + edge amount + timing still linkable); phone create lacks relayer wiring  
- Openings / spend keys live in **browser localStorage** — device compromise = wage + fund loss  

### 3.5 Yield & lending

| Component | Behavior | Honesty |
|-----------|----------|---------|
| `YieldVault` | Deposit → shares → index accrual → redeem | Testnet APR often **subsidized** stand-in (Scallop-shaped API) |
| `drip_with_yield` | Yield_bps slice of drip → vault | Real PTB path |
| `protocol_registry` | Adapter allow-list | Mainnet Scallop/Navi/Suilend = follow-up |
| `LendingPool` | Borrow up to ~90% PV of dripping stream | **Worker** borrows against **their** stream, not org treasury |

### 3.6 Gift cards

`giftcard.move` — prepaid on-chain cards (create / claim / transfer semantics). Secondary to streams; useful for consumer promo demos.

---

## 4. Circuits & proving

```
circuits/
├── src/           # circom: wrap, transfer, unwrap, lazydrip, shielded, private_settle
├── prover/        # snarkjs proving + arkworks-compatible serialization
├── converter/     # Rust: VK/proof bytes ↔ Sui format parity
└── move/          # on-chain verify tests
```

**Flow:** user action → JS loads zkey/wasm → `fullProve` → serialize proof for Move → PTB calls confidential entry → chain verifies.

**Perf:** browser proving is seconds-scale (not Bulletproofs-ms). Acceptable for demo; optimize / worker-thread later.

---

## 5. Off-chain services

### 5.1 Indexer (`backend/crates/indexer`)

- Ingests Move events from Sui  
- Stores stream snapshots + drip history in **Postgres**  
- Exposes **REST + WebSocket** for frontend / SDK  
- Filters by **original (type-origin) package** for stable event module identity across upgrades  

### 5.2 Keeper (`backend/crates/keeper`)

- Permissionless worker: calls `drip` / `drip_with_yield` when accrued ≥ floor  
- Calls `auto_approve` when review window elapsed  
- Earns small tip (bps) — economic nudge to run keepers  
- Must hold gas; coin fragmentation can stall it (ops: merge / faucet)  

### 5.3 Core (`backend/crates/core`)

Shared types, drip math helpers, thin Sui JSON-RPC client.

---

## 6. Frontend & gas sponsorship

| Area | Location / stack |
|------|------------------|
| App | `frontend/` — Next.js 15 App Router, React 19, Tailwind |
| Tx builders | `frontend/src/lib/streamline-tx.ts` (+ treasury helpers) |
| Indexer client | `frontend/src/lib/indexer.ts` |
| Networks / IDs | `frontend/src/lib/constants.ts`, `networks.ts` |
| Enoki allowlist | `frontend/src/lib/enoki-targets.ts` — **must list every sponsored Move target** |
| Sponsor API | `frontend/src/app/api/sponsor` (+ execute) |
| Pro workspace | `frontend/src/components/app/pro/` |
| Confidential UX | Private stream panels + Seal unlock |

**Rule:** New Move entry function → add to Enoki allowlist or gasless demo fails with “not allow-listed.”

**Pro data model:** org roster / departments may be local; streams/treasury overlay from chain + indexer when wallet connected. Demo mode explores UI without wallet.

**Invoices / subscriptions:** create = client-side share payload; `/pay/invoice` and `/pay/subscribe` settle on-chain.

---

## 7. SDK

Package: `@streamline/sdk` (`packages/sdk`)

| In v1 | Out of v1 (for now) |
|-------|---------------------|
| Resolve `name@streamline` | Claim handle UI |
| `stream.to(...)` create | Full raise/approve surface |
| Indexer `get` / `list` | Treasury / privacy / React hooks |
| Sponsored signer via app proxy | Holding Enoki secrets in SDK |

---

## 8. Assets & networks

| | Testnet (current) | Mainnet (planned) |
|--|-------------------|-------------------|
| Package | Deployed / upgraded over time | Not deployed |
| Stable | Mock USDC (6 decimals) + faucet | Real USDC / USDsui (TBD) |
| Yield | Native vault stand-in | Registry → Scallop / Navi / Suilend-class |
| Privacy ceremony | Single-party disclosed | MPC ceremony |

---

## 9. Security & trust model (short)

| Trust | Assumption |
|-------|------------|
| Custody | No StreamLine custodial wallet; funds in Move objects |
| Dispute | Mutual accept — no unilateral seize |
| Cancel | Client may cancel **revocable** streams (unstreamed refund) |
| Keeper | Liveness helper, not authority — anyone can drip/approve |
| Seal key servers | Threshold; policy gates release |
| Groth16 setup | Toxic waste risk until proper ceremony |
| Indexer | Cache only — verify critical actions on-chain if needed |

---

## 10. Testing

| Layer | How |
|-------|-----|
| Move | `sui move test` under `contracts/tests/` (stream, confidential, vault, lending, payroll pool, …) |
| Circuits | Circom + snarkjs + arkworks serializer parity |
| Frontend | Manual / wallet click-through on testnet |
| Backend | Indexer/keeper against live RPC |

---

## 11. Ops landmines (fill as you hit them)

| Symptom | Likely cause | Fix pointer |
|---------|--------------|-------------|
| RPC 404 / flaky | Dead public fullnode | Set `NEXT_PUBLIC_SUI_TESTNET_RPC` to known-good (see HANDOFF) |
| Sponsor reject | Missing Enoki target | `enoki-targets.ts` |
| Hire-from-treasury abort | Package not upgraded | Upgrade + refresh published-at / frontend package id |
| Keeper no gas | Dust coins | Faucet + merge |
| Indexer empty | Wrong package filter / RPC key | Railway env + original package id |
| Confidential prove hang | Browser `fullProve` | Split wtns + prove path (see HANDOFF) |

_Add rows here as the team finds new failure modes._

---

## 12. Slide-ready technical bullets

Copy/adapt for Overflow technical slide:

1. **Escrow = Move shared object** — state machine enforced in entry functions  
2. **Settlement** — continuous accrual, gasless floor drips via permissionless keeper  
3. **Privacy** — Poseidon commitments + Groth16 verify on-chain + Seal openings  
4. **Payroll** — `Treasury` capital pool funds per-worker `Stream` legs (not a StreamPool blob)  
5. **DeFi** — drip-to-vault + borrow against worker stream PV  
6. **Stack** — Sui Move · Next.js · Rust indexer/keeper · circom · Enoki/zkLogin · `@streamline/sdk`  

---

## 13. Scratch / fill-in (team notes)

Use this section freely during prep — paste diagrams, tx digests, demo wallet addresses, timing measurements.

### Demo wallets

| Role | Address | Notes |
|------|---------|-------|
| Client / org | | |
| Freelancer | | |
| Keeper | | see HANDOFF |

### Useful digests / object IDs for live demo

| What | ID |
|------|-----|
| Pre-funded treasury | |
| Pre-created public stream | |
| Pre-created confidential stream | |

### Timing measurements

| Step | Target | Measured |
|------|--------|----------|
| Create stream | &lt; 15s | |
| Confidential prove | &lt; 30s | |
| Treasury hire | &lt; 20s | |

### Open technical risks before pitch

- [ ]  
- [ ]  
- [ ]  

---

## 14. Changelog (tech doc)

| Date | Note |
|------|------|
| 2026-07-19 | Pro private hire default + Seal roster; overfund/relayer on personal + Pro path |
| 2026-07-19 | Privacy modes: default `private_stream` engagement; amounts-only vs graph honesty |
| 2026-07-18 | Initial tech doc: architecture, modules, privacy, payroll pool, ops |

---

*When in doubt about deploy IDs or “is X live,” trust `HANDOFF.md` and chain explorers over this file.*
