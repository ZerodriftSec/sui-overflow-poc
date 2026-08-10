# StreamLine — About the project

---

## 1. One-liner

**StreamLine is programmable, private micropayments on Sui** — continuous, milestone-gated USDC flows that settle gaslessly, with optional confidential amounts, org payroll from a treasury pool, and DeFi composability (yield + borrow-against-stream) in place.

It is built for **work money**: freelancers, contractors, and teams who need escrow without a middleman, privacy without leaving the chain, and payroll that drips instead of batching.

Built for **Sui Overflow 2026 · DeFi & Payments**. Live today on **Sui testnet** (not mainnet).

---

## 2. The problem it attacks

Work is continuous. Payment is not — because legacy rails make every transfer expensive, slow, and reversible.

| Pain | What happens today |
|------|--------------------|
| Freelancer cash flow | Wire / invoice settles in days; earned ≠ available |
| Trust | Pay upfront (trust worker) or pay on completion (trust client) |
| Silent clients | Pay-on-completion lets a client stall forever |
| Wage privacy | On-chain payroll that shows rates and amounts is a non-starter for real orgs |
| Idle float | Org capital sits unproductive between payroll cycles |
| Yield discipline | Moving income into savings takes manual effort most people skip |

StreamLine’s bet: if settlement is **cheap, final, and programmable**, money can accrue by the second, lock rules on-chain, and hide amounts when needed — without Stripe-shaped middlemen.

---

## 3. Product surfaces

### 3.1 Worker / freelancer app (`/app`)

- Create and receive streams (public or **Private amounts**)
- Live earn counter (client-side tick + indexer correction)
- Raise milestones, approve / wait for auto-approve
- Dispute (pause → mutual propose/accept)
- Yield split on drips; borrow against a live stream
- zkLogin (Google → Sui address) + Enoki-sponsored gasless txs
- Gift cards / names flows on the consumer side of the brand

### 3.2 Pro / org workspace (`/app/pro`)

Org-facing payroll and tools on the same protocol:

| Screen | Role |
|--------|------|
| **Overview** | Runway, payroll/yield view, org pulse |
| **People** | Roster, departments/groups, status filters |
| **Streams** | Per-worker legs; pause / resume / stop; add stream |
| **Treasury** | Fund / withdraw / rebalance (idle ↔ yield) |
| **Invoices** | Create share links; customer pays on-chain |
| **Subscriptions** | Recurring share links → stream on subscribe |
| **POS** | Merchant-style tools hub (not SGQR retail POS) |
| **Reports / Compliance** | Exports / audit surface (demo path when exploring without wallet) |

**Demo mode** lets stakeholders click through Pro without a wallet; connected wallets overlay real indexer/treasury/stream state.

### 3.3 Pay links

- `/pay/invoice` — pay a Pro invoice (USDC transfer to merchant wallet)
- `/pay/subscribe` — start a subscription-shaped stream from a share payload

**Honest split:** creating an invoice or subscription is a **local share link** today; settlement happens when the customer pays/subscribes on-chain.

### 3.4 Landing + docs + SDK

- Marketing / hero at the frontend root
- Public docs site: `packages/docs` (`npm run dev:docs` → port 3001)
- `@streamline/sdk` — resolve `name@streamline`, create streams, read indexer

---

## 4. Core concepts

### 4.1 A stream is escrow with a clock

A client (or org treasury) locks funds in a Move **shared object** `Stream<T>`. Rules live in entry functions — not in a custodial processor.

Typical lifecycle:

```
LOCKED → (raise completion) → PENDING_REVIEW → (approve / auto-approve) → DRIPPING → DONE
                ↘ raise_dispute → PAUSED → mutual resolve (resume or split)
```

- **Milestones** gate when money is allowed to drip.
- **Auto-approve** (default ~48h) stops silent-client hostage situations.
- **Mutual dispute** — either party pauses; both must agree to resume or split. No unilateral seizure.
- **Cancel** (revocable streams) lets the client reclaim unstreamed funds.

Accrual math is continuous (`total × elapsed / duration`); **on-chain drips** fire only after a gasless floor (~1 USDC accrued) so gas stays a tiny fraction of value moved. The UI still ticks every ~100ms.

### 4.2 Public vs private streams

| Mode | Amount | Who↔whom | Drip cadence | Notes |
|------|--------|----------|--------------|-------|
| **Private (default)** | Hidden | Hidden inside pool | None (lazy settle) | `private_stream` + `shielded_pool` + `private_settle`; overfund + split by default |
| **Amounts-only (compat)** | Hidden | Public parties | Public timestamps | `ConfidentialStream` — milestones / dispute |
| **Public** | Cleartext | Public | Public | Classic `Stream` — borrow / yield splits / **Pro hire today** |

**Default personal create** opens a **private engagement**: fund a note in the shared shielded pool (often **overfunded**, then privately split to the work amount), pin a vesting schedule commitment (no `sender`/`freelancer` fields), settle with a Groth16 proof that is both a shielded spend and a lazy vest bound. Worker openings travel via encrypted notes (ECIES). Optional **privacy relayer** hides tx origin. Deposit/withdraw still reveal an amount at the anonymity-set boundary.

### 4.3 Treasury = payroll capital pool; Stream / engagement = worker leg

StreamLine **does not** put all employees inside one Sweem-style `StreamPool` table.

| Layer | Job |
|-------|-----|
| **`Treasury<T>`** | Org capital: deposit, withdraw, invest/divest into yield |
| **Private engagement (Pro default)** | Shielded pool hire — amount/graph hidden |
| **`Stream<T>` (Pro public mode)** | Cleartext legs with milestones, disputes, on-chain HR pause/stop |

**Pro hire** defaults to **private engagement** (org wallet → shielded pool + overfund/split + optional relayer). Explicit **Public** mode still uses `create_stream_from_treasury_v2` when you want on-chain HR pause/stop and cleartext compliance trails. Roster PII is **Seal-encrypted** at rest to the org wallet (`pro-roster-seal.ts`).

Hire path (public escape hatch): `create_stream_from_treasury_v2` withdraws from treasury, locks into a stream that starts **DRIPPING**. Private default does **not** debit the on-chain treasury.

HR controls:

- `suspend_payroll` / `resume_payroll` / `stop_payroll` — **public streams only**  
- Private Pro legs: local roster pause/stop until private HR ships  
- Distinct from dispute `PAUSED` (mutual resolve)

`treasury::ensure_idle` can divest yield when a public hire needs more liquid float.


### 4.4 Yield and borrow

- **`yield_vault`** — Scallop-shaped share vault (testnet stand-in with subsidized APR; mainnet → real adapters behind `protocol_registry`)
- **Auto-yield** — stream yield_bps split; keeper `drip_with_yield` deposits the yield slice
- **`collateral` / `LendingPool`** — worker borrows against **their** live stream’s present value (salary advance), not the company borrowing the org pool

### 4.5 Gift cards

On-chain gift card module for prepaid transferable value (consumer / promo surface alongside streams).

---

## 5. Privacy stack (what’s real)

Privacy is layered:

| Layer | Hides | Status |
|-------|--------|--------|
| **zkLogin / Enoki** | Wallet seed / gas footprint | Live |
| **Groth16 + Poseidon** | Balances, drip / settle sizes | Live on testnet |
| **Seal** | ConfidentialStream openings (amounts-only path) | Live |
| **ECIES note publish** | Shielded / private-engagement openings | Live |
| **Shielded pool + private settle** | Who↔whom + cadence inside the set | Live (personal + **Pro default hire**) |
| **Overfund + private split** | Exact wage ≠ public edge amount | Live (default on deposit/open) |
| **Privacy relayer** | Tx origin (not edge amounts) | Live when env key set |
| **Pro roster Seal** | Alias / wallet / salary at rest | Live (org wallet encrypt) |
| **Seal + Walrus deliverables** | Briefs / files | Roadmap |

**Honest today:**

- **Private personal create** and **Pro private hire (default)** hide amount + graph + drip cadence *inside* the pool; edges still reveal a (often overfunded) amount; relayer can hide sender.  
- **Pro roster** is Seal-encrypted at rest to the org wallet.  
- **Pro public hire** (explicit) remains cleartext + indexer `/payroll`.  
- **Amounts-only compat** still leaks parties and milestone timing.  
- Privacy strength scales with anonymity-set size. Trusted setup is a disclosed hackathon ceremony — needs a proper MPC for mainnet.

See public privacy docs under `packages/docs/content/docs/privacy/` (engagements, payroll, amounts).

---

## 6. How the system works (architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER LAYER                                                      │
│  zkLogin / wallet → Next.js app → Enoki-sponsored PTBs           │
└────────────────────────────┬────────────────────────────────────┘
                             │ reads (fast)          │ writes
                             ▼                       ▼
┌──────────────────────┐          ┌────────────────────────────────┐
│ INDEXER (Rust/Axum)  │◄────────►│ SUI TESTNET                     │
│ REST + WebSocket     │  events  │ streamline::stream              │
│ Postgres cache       │          │   Stream / ConfidentialStream   │
└──────────▲───────────┘          │ streamline::private_stream      │
           │                      │ streamline::shielded_pool       │
┌──────────┴───────────┐          │ streamline::treasury / yield…   │
│ KEEPER (Rust)        │── PTBs ─►│ streamline::collateral          │
│ drip / auto_approve  │          │ streamline::giftcard            │
└──────────────────────┘          │ protocol_registry               │
                                  └────────────────────────────────┘
```

**Move is source of truth.** Indexer and keeper are off-chain helpers: cache events, drip when accrued, auto-approve when the window expires. Frontend reads indexer, writes via the user’s wallet.

### Move modules (high level)

| Module | Responsibility |
|--------|----------------|
| `stream` | Streams, caps, milestones, disputes, payroll suspend/resume/stop, treasury-funded create, Seal policy hooks |
| `confidential_balance` | ConfidentialPool, Groth16 verify wrap/transfer/unwrap |
| `treasury` | Org pool: open/deposit/withdraw/invest/divest/ensure_idle |
| `yield_vault` | Native/testnet yield adapter |
| `protocol_registry` | Allow-list for future mainnet adapters |
| `collateral` | PV, CollateralReceipt, LendingPool |
| `giftcard` | Prepaid cards |
| `lazy_stream` / `shielded_pool` / `merkle_tree` / `private_stream` | Privacy stack — default personal engagements |

### Frontend stack

Next.js 15 · React 19 · Tailwind · `@mysten/dapp-kit` · Enoki · circom/snarkjs in-browser proving · three.js landing hero.

### Backend

Rust workspace: `indexer` (events → Postgres, REST/WS), `keeper` (permissionless drip + auto_approve).

### SDK

`@streamline/sdk`: resolve handles, `stream.to(...)`, indexer reads. Sponsored agent path via app Enoki proxy. v1 scope does not yet wrap full treasury/privacy/React hooks.

---

## 7. Settlement asset & networks

| Item | Today |
|------|--------|
| Network | **Sui testnet** |
| Asset | Mock USDC (6 decimals) + faucet in-app |
| Gas | Enoki sponsorship for allow-listed Move targets |
| Mainnet | Not deployed; vault/adapters designed to swap to Scallop/Navi/Suilend-class protocols |

---

## 8. What “done” looks like in the product (capabilities checklist)

**Shipped (testnet / product):**

- [x] Milestone-gated public streams + auto-approve + mutual dispute  
- [x] Confidential amounts (ZK + Seal openings)  
- [x] Gasless zkLogin UX  
- [x] Yield vault + drip-with-yield path  
- [x] Borrow against stream (worker advance)  
- [x] Org treasury + invest/divest  
- [x] Hire / stream from treasury + payroll pause/resume/stop (contracts + Pro wiring; **public streams**; package upgrade required on deployed testnet for new entrypoints)  
- [x] Pro People / Streams / Treasury / Overview UX  
- [x] Invoices & subscriptions share → pay/subscribe flows  
- [x] Indexer + keeper  
- [x] SDK pay-by-handle  
- [x] Private engagement create (personal + **Pro default hire**) + overfund/split + optional relayer  
- [x] Pro roster Seal-encrypted at rest (org wallet)  

**Partial / demo / roadmap:**

- [ ] Mainnet + real USDC / USDsui  
- [ ] Live multi-protocol yield (registry ready; adapters not live)  
- [ ] Walrus encrypted deliverables  
- [ ] Treasury → shielded unlinkable funding + private on-chain HR controls  
- [ ] Quay-depth SGQR / UEN / KYB retail POS (intentionally out of scope)  
- [ ] Native iOS app  

---

## 9. Mental model for newcomers

1. **Consumer send** (chat money) → not our primary job; see Talise-class wallets.  
2. **Retail sticker POS** → not our primary job; see Quay.  
3. **Org payroll as one shared employee table** → we reject that shape.  
4. **Our shape:** lock work money in a private engagement when wage privacy matters · fund **public** Pro stream legs from treasury today · later: treasury → shielded hire · let money earn and be borrowed against · give orgs Pro tools on the same rails.

If you only remember one sentence: **StreamLine is the work-money protocol on Sui — continuous, gated, private-by-default for personal pay, org-ready with honest public hire today and private payroll on the roadmap.**

