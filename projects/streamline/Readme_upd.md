# StreamLine
## Private Programmable Payments on Sui

*Sui Overflow 2026 · DeFi & Payments Track*

---

## The One-Line Pitch

Pay someone continuously as they work — privately, gaslessly, automatically — with money that earns yield while it waits and can be borrowed against before it arrives.

---

## The Problem

Every payment system ever built shares the same shape: a lump sum, transferred at an arbitrary interval. Salaries biweekly. Freelancers monthly. Rent on the first.

This is not how value is created. Work happens continuously. Payment is discretized into chunks — because historically, transactions cost money, so you batch.

But there's a deeper problem nobody has solved: **on-chain payments are fully public**. Your employer's $6,000/month salary stream is visible to your colleagues, competitors, and anyone with a blockchain explorer. No business would run payroll on a public ledger. No freelancer wants their rates exposed. No individual wants their income history readable by anyone.

This is why crypto payments haven't crossed into real-world payroll and contracting. It's not UX. It's not gas fees. It's privacy.

---

## Why Now — Three Primitives, One Window

Three things became available on Sui in May–June 2026 that have not yet been combined into a product:

**1. Gasless stablecoin transfers (Address Balances)**
Since May 21 2026, USDC transfers on Sui cost $0.00 at the protocol level. Not a subsidy, not a relayer trick — structurally zero via `send_funds()` on allowlisted stablecoins. This makes true per-interval streaming economically viable for the first time. Every previous streaming protocol on EVM requires recipients to batch-claim accumulated balances — paying gas each time. That is not streaming. StreamLine money genuinely arrives.

**2. Confidential Transfers (MystenLabs)**
Sui's native confidential transfer primitive uses Twisted ElGamal homomorphic encryption. Transfer amounts are hidden on-chain. ZK proofs validate correctness without revealing values. Selective disclosure lets you prove your income to an accountant or bank without exposing raw data. This is the missing privacy layer — currently live on devnet.

**3. Programmable Transaction Blocks**
Atomic multi-step execution. The entire drip — receive, split, route to yield — executes as one indivisible operation. If any step fails, everything reverts. This makes split routing safe by construction.

The window for first-mover implementation is open right now.

---

## What StreamLine Is

StreamLine is a three-sided protocol:

- A **payment primitive** for clients — lock funds, define milestones, approve work
- An **income primitive** for workers — watch money arrive as you work, no invoices, no waiting
- A **financial automation layer** — incoming money automatically routes to spending, savings, and yield on every drip

And it is **private by default**. Amounts are hidden. The relationship between payer and recipient is your business, not the blockchain's.

---

## How It Works

### The Core Loop

```
LOCK → DRIP → CHECKPOINT → DRIP → CHECKPOINT → DONE
```

1. **Client locks funds** — full project or salary amount locked in a stream object at creation. On testnet: public amount, stealth recipient. On devnet: amount encrypted via Twisted ElGamal, fully confidential.

2. **Money drips continuously** — keeper service fires gasless `send_funds()` calls at the computed interval. For a $2,000/month stream, this is roughly every 90 seconds. No fees. No batching. Money genuinely arrives.

3. **Milestones are checkpoints** — at each milestone, dripping pauses. Worker raises completion on-chain (one gasless tx). Client reviews and approves. Stream resumes. No arbiters, no governance, no complexity.

4. **Auto-approve protects the worker** — if client goes silent after a milestone is raised, the keeper auto-approves after a configurable window (default 48 hours). Silence equals approval. Client cannot block payment indefinitely.

5. **Split config routes automatically** — each drip executes the worker's pre-configured split atomically via PTB. 60% to spending wallet, 30% to Scallop for yield, 10% to savings. Fires on every drip, forever, no manual action.

---

## The Two-Network Privacy Architecture

This is the honest engineering reality and also the strategic story.

Sui's two most powerful new primitives currently live on separate networks:

| Primitive | Network | Status |
|---|---|---|
| Gasless transfers via Enoki / Address Balances | Testnet + Mainnet | Production ready |
| ElGamal Confidential Transfers | Devnet only | Pre-production |

StreamLine runs on both — in parallel — today. This is not a workaround. It is tracking Sui's own roadmap. When MystenLabs ships confidential transfers to testnet and mainnet, StreamLine flips a switch and the two layers merge into a single fully private, fully gasless protocol.

### Testnet — The Payment Layer (live demo)

- Gasless USDC via Enoki sponsored transactions
- zkLogin — Google OAuth onboarding, no seed phrase
- Full milestone state machine
- Stealth addresses for identity privacy (who is hidden)
- Yield routing via Scallop
- Collateral borrowing against active streams
- Live earn counter, real USDC moving

### Devnet — The Confidential Layer (technical demo)

- ElGamal confidential transfers — amounts fully hidden on-chain
- ZK proofs validate every drip without revealing value
- Viewing keys for selective disclosure
- Same stream logic, same state machine — private amounts
- Audit trail: cryptographically provable income history

### What stealth addresses add on testnet

While confidential transfers are devnet-only, stealth addresses provide meaningful identity privacy on testnet today. The client computes a one-time stealth address from the worker's published meta-address. All drips flow to that address. On-chain observers cannot link the payment stream to the worker's identity. The worker's wallet scans silently and claims. Combined with zkLogin — where wallet addresses are not persistently linked to real identity — the payer-payee relationship is practically private even without ElGamal amount hiding.

---

## The Privacy Model

**On testnet (stealth addresses):**
- ✅ Who is being paid — hidden
- ✅ Payer-payee relationship — hidden
- ❌ Amounts — visible on-chain
- ✅ Identity link to real person — broken via zkLogin

**On devnet (ElGamal confidential transfers):**
- ✅ Who is being paid — hidden (stealth)
- ✅ Amounts on every drip — hidden
- ✅ Total stream value — hidden
- ✅ Accumulated earnings — hidden
- ⚠️ Wrap/unwrap boundary — visible (see tradeoffs)

**Selective disclosure — the audit trail:**
The worker holds viewing keys for their own stream history. At any time they can:
- Share viewing keys with an accountant for tax purposes
- Generate a proof of total earnings for a bank loan application
- Prove a specific payment was received to a client
- Rotate auditor access without affecting stream operation

No PDFs. No screenshots. Cryptographically verifiable income history, fully controlled by the recipient.

---

## Yield on Locked Funds

The client locks $5,000 for a 3-week engagement. That money doesn't sit dead — it earns yield from the moment it's locked.

The unstreamed portion of the locked balance routes to Scallop (or NAVI) automatically. As drips fire, principal reduces and yield accrues back into the stream. Both client and worker benefit — idle capital works.

The split between spending and yield destinations is the worker's configuration, set once, fires on every drip forever.

---

## Collateral — Borrow Against Your Stream

A live income stream is an asset with calculable present value. StreamLine makes it usable as collateral.

A worker with a 4-week, $4,000 stream active can borrow against future income right now. The protocol computes stream present value, applies an LTV ratio from Scallop or NAVI, and issues a USDC loan immediately.

The health factor behaves inversely to standard DeFi: as time passes and the loan is repaid automatically from drips, the position improves. A position at 1.2x health factor on day one reaches 2.0x halfway through. Stream-backed loans are structurally safer than volatile asset collateral — the collateral doesn't crash, it drains predictably.

Auto-repay routes a portion of each drip to the lender before the split fires. No manual payments. No liquidation risk from market volatility.

---

## State Machine

| State | Meaning | Who transitions |
|---|---|---|
| LOCKED | Milestone pending, no drip | — |
| PENDING_REVIEW | Worker raised completion | Client (approve) or Keeper (auto-approve after 48h) |
| DRIPPING | Approved, money flowing | Protocol (milestone exhausted → LOCKED) |
| PAUSED | Dispute raised | Arbiter |
| DONE | All milestones exhausted | Protocol |

Every state transition is enforced by Move's type system — not a `require()` that can be bypassed, a structural impossibility to transition incorrectly. No partial execution. No side effects on abort.

---

## Consumer UX

StreamLine is built for people who have never used a crypto wallet.

**zkLogin onboarding** — sign in with Google. No seed phrase, no wallet install, no MetaMask. A worker anywhere signs up with Gmail and immediately has a Sui address that can receive streams.

**Plain language** — not "PTBs" and "Address Balances." Just: *"You're earning $0.000023 per second. Milestone 2 of 4. $340 earned so far."*

**Live earn counter** — ticks every 100ms via client-side math. No chain reads for the animation. The indexer WebSocket updates the base on each confirmed drip.

**One-click milestone** — worker clicks "Mark complete." One gasless transaction. Client gets a notification. Client clicks "Approve." Counter resumes.

**Private by default** — no configuration needed. Every stream uses stealth addressing. Confidential amounts on devnet, coming to mainnet when Sui ships it.

---

## Architecture

| Layer | Components | Network | Role |
|---|---|---|---|
| Move (on-chain) | Stream, SplitConfig, StreamCap | Testnet + Devnet | State machine, fund locking, split rules |
| Privacy layer | Stealth addresses | Testnet | Identity privacy today |
| Confidential layer | ElGamal ciphertexts, ZK proofs, viewing keys | Devnet | Amount privacy, audit trail |
| PTB layer | create_stream, raise_completion, approve_milestone, drip | Both | Four operations that mutate state |
| Keeper | Scheduler, PTB builder, auto-approver | Off-chain | Trigger drips, protect worker |
| Indexer | Postgres, REST, WebSocket, zkLogin | Off-chain | Cache state, feed live UI, onboarding |
| Frontend | Stream creator, dashboard, worker view, collateral panel | React | Consumer interface |

---

## Competitive Position

| Protocol | Chain | Gasless | Private | Milestones | Yield | Collateral |
|---|---|---|---|---|---|---|
| Sablier | Ethereum | No | No | No | No | No |
| Superfluid | Ethereum/L2 | No | No | No | No | No |
| LlamaPay | Multi-EVM | No | No | No | No | No |
| **StreamLine** | **Sui** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

Every existing streaming protocol requires recipients to periodically claim accumulated balance — a gas-paying action. StreamLine is the first streaming protocol where money genuinely arrives continuously, privately, with no action required from the recipient and no fee for either party.

---

## Honest Tradeoffs

**Wrap/unwrap boundary is visible.** The initial fund lock and final withdrawal cross the public coin layer — amounts visible at those two moments. Everything between is private. Acceptable for payroll and contracting where total compensation is agreed upfront.

**Timing pattern is visible.** Regular drip intervals reveal a streaming relationship even when amounts are hidden. Behavioral privacy is not guaranteed. Amount and identity privacy are.

**Two networks today, one tomorrow.** Gasless UX lives on testnet. Confidential amounts live on devnet. They are currently mutually exclusive. This merges when Sui ships confidential transfers to testnet/mainnet — which is on MystenLabs' active roadmap. StreamLine is built for that moment.

**Confidential transfers SDK is pre-production.** MystenLabs' repo is explicitly unaudited. The devnet demo acknowledges this. Production deployment waits for MystenLabs' production release.

---

## The Demo

Two screens. Both real. Nothing mocked.

**Screen 1 — Testnet (90 seconds)**
- Sign in with Google. Wallet created. No seed phrase.
- Create a stream: $1,200 / 3 weeks / 3 milestones. Split: 70% wallet, 30% Scallop. Stealth address generated automatically.
- Switch to worker view. Counter ticking. *"$0.000014 per second."*
- Raise milestone 1 complete. Client approves. Counter resumes.
- Open collateral panel. Stream PV: $890. Borrow $400. USDC arrives. Auto-repay on.

**Screen 2 — Devnet (30 seconds)**
- Same stream. Same UI. Amounts replaced with encrypted ciphertexts on-chain.
- Worker view shows balance. Chain explorer shows nothing readable.
- Share viewing key. Accountant view decrypts full history.
- *"Same product. Private amounts. One network upgrade away from merging."*

**Closing line:** *"Zero fees. Private by default. Pays as you work. We're not waiting for privacy to be solved — we built on both sides of the gap."*

---

## Build Stack

- **Move contracts** — Stream, SplitConfig, StreamCap, stealth address logic (testnet + devnet)
- **Confidential layer** — MystenLabs confidential-transfers SDK, ElGamal, viewing keys (devnet)
- **Keeper** — TypeScript, @mysten/sui SDK, SuiGrpcClient (gRPC required for gasless auto-detection)
- **Indexer** — Postgres, event listener, REST + WebSocket
- **Frontend** — React, Sui dApp Kit, zkLogin, Enoki
- **Yield** — Scallop SDK (primary), NAVI (alternative)
- **Assets** — USDC (Circle), USDsui

---

*StreamLine — Private programmable payments on Sui*
*Address Balances · Confidential Transfers · Stealth Addresses · PTBs · zkLogin*
*Sui Overflow 2026*