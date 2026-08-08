# StreamLine — Overflow requirements & prep quests

Single bench for shortlist readiness: official requirements, judging criteria, and concrete quests we can check off before presenting. Product truth lives in [`about-project.md`](./about-project.md); positioning in [`competitive-advantage.md`](./competitive-advantage.md).

---

## 1. Official shortlist requirements

Shortlisted teams must:

1. **Present live** to the judging panel  
2. **Demonstrate a working version** of the project  
3. **Answer Q&A** from judges  

Presentation must clearly communicate:

| # | Required narrative | StreamLine answer (one line) |
|---|--------------------|------------------------------|
| A | Problem, solution, value proposition | Work is continuous; pay is batched — we stream gated, optionally private USDC on Sui with Move as escrow |
| B | Technical implementation | Move streams + treasury → worker legs, Groth16/Seal privacy, Enoki gasless, indexer + keeper |
| C | Path to production & go-to-market | Testnet → mainnet stable + yield adapters; GTM via freelancers → agencies → Pro orgs; SDK for agents |
| D | Target users & product-market fit | Freelancers/contractors, clients, payroll orgs who need continuous pay + wage privacy |
| E | Monetization / sustainability + roadmap | Protocol fees / Pro SaaS / sponsored gas margin; privacy phases + mainnet adapters |
| F | Why Sui | Object escrow, PTBs, gasless rails, zkLogin, native Groth16, Seal |

### What makes a strong Overflow project

Strong projects typically:

- solve **meaningful** problems  
- have **polished UX**  
- **leverage Sui** meaningfully  
- demonstrate strong **product thinking**  
- show **long-term potential** beyond the hackathon  

Overflow rewards **meaningful products and ecosystem impact**, not just technical demos.

---

## 2. Judging criteria (weights)

Core track projects are evaluated primarily on:

| Criterion | Weight | What judges look for | Our target signal |
|-----------|--------|----------------------|-------------------|
| **Product & UX** | **20%** | Quality, usability, polish, overall UX | Tight phone/Pro demo; no broken flows; one clear path |
| **Real-world application** | **50%** | Meaningful problem, market relevance, long-term value | Work-money thesis; privacy as adoption unlock; honest mainnet path |
| **Technical implementation** | **20%** | Technical quality, reliability, meaningful Sui integration | Live testnet demo of streams + privacy + treasury hire |
| **Presentation & vision** | **10%** | Clarity, storytelling, long-term vision | “Work money, not chat money or sticker money” |

**Implication:** Half the score is real-world. Demo polish and Sui depth matter, but the pitch must sell **why this product should exist after Overflow**.

Relative scores vs Sweem / Talise / Quay: see competitive docs / judging canvas from prep — do not memorize competitor bashing; use only if asked.

---

## 3. Quest board — prepare against this

Treat each quest as **Done / Partial / Missing**. Rehearse until every Required narrative (A–F) and every Strong-project signal has a live answer.

### Quest pack 0 — Logistics (blocking)

| ID | Quest | Done? | Notes |
|----|-------|-------|-------|
| Q0.1 | Confirm shortlist slot, time, format (slides? laptop? wifi?) | ☐ | |
| Q0.2 | Working testnet RPC + faucet + funded demo wallets | ☐ | Avoid public fullnode; use known-good RPC |
| Q0.3 | Enoki sponsorship allowlist includes all demo Move targets | ☐ | Treasury hire, suspend/resume, confidential if shown |
| Q0.4 | Package IDs / env match deployed contracts | ☐ | Hire-from-treasury needs upgraded package if demoing that |
| Q0.5 | Backup: recorded screen + screenshots if wifi dies | ☐ | |
| Q0.6 | Two operators: one presents, one drives the app | ☐ | |

---

### Quest pack 1 — Narrative (requirements A, D, F + 50% real-world)

| ID | Quest | Must be able to say in &lt;30s | Done? |
|----|-------|-------------------------------|-------|
| Q1.1 | **Problem** | Work continuous → pay discrete; trust, float, 3–5 day settlement, public on-chain wages kill adoption | ☐ |
| Q1.2 | **Solution** | Lock USDC in Move stream; drip on milestones; optional private amounts; org treasury funds worker legs | ☐ |
| Q1.3 | **Value prop** | Continuous pay without middleman; privacy when needed; money can earn / be borrowed against in place | ☐ |
| Q1.4 | **Target users** | (1) Freelancers/contractors (2) Clients (3) Pro orgs / payroll (4) Agents via SDK | ☐ |
| Q1.5 | **Why adopt** | Cash flow + escrow rules on-chain + wage privacy + gasless Google login — cards/wires can’t do this | ☐ |
| Q1.6 | **Why not Talise / Sweem / Quay** | Chat money / StreamPool payroll / SGQR POS — we are **work money** (treasury → streams + privacy) | ☐ |
| Q1.7 | **Why Sui** | Shared-object escrow, PTBs, gasless, zkLogin, `sui::groth16`, Seal — streaming needs cheap final programmable settlement | ☐ |

**Script skeleton (90 seconds):** Problem → Solution → Who → Why Sui → Demo tease.

---

### Quest pack 2 — Live demo (requirement: working version + Product/Tech scores)

**Golden path (aim &lt; 2 minutes):**

1. Sign in (zkLogin)  
2. Create or open a stream → show live earn tick  
3. Raise / approve milestone (or show DRIPPING)  
4. Toggle / open **Private amounts** (or show confidential stream)  
5. Pro: treasury fund → hire / stream from treasury → **pause** worker  

| ID | Quest | Done? | Fallback if fail |
|----|-------|-------|------------------|
| Q2.1 | Golden path rehearsed cold (no notes) | ☐ | Cut to private OR treasury only |
| Q2.2 | Public stream create + drip visible | ☐ | Pre-created stream IDs |
| Q2.3 | Confidential path unlock + balance visible to party | ☐ | Screenshots + “crypto verified in tests” |
| Q2.4 | Pro treasury fund + hire-from-treasury | ☐ | Wallet-funded stream + explain architecture |
| Q2.5 | Pause / resume / stop on a worker stream | ☐ | Explain on-chain verbs even if UI-only |
| Q2.6 | Show yield or borrow **once** (don’t tour every tab) | ☐ | Skip if time |
| Q2.7 | Invoice or subscribe pay link (optional spice) | ☐ | Skip — not core story |
| Q2.8 | Demo does **not** open every Pro tool | ☐ | Tools = “same rails,” not the pitch |

**Demo rule:** Depth over breadth. One arc &gt; feature zoo.

---

### Quest pack 3 — Technical story (requirement B + 20% technical)

Be ready to draw or list on a slide:

| ID | Quest | Talking points | Done? |
|----|--------|----------------|-------|
| Q3.1 | Architecture one-slide | User → Next.js → Enoki PTBs → Move; Indexer+Keeper off-chain | ☐ |
| Q3.2 | Stream state machine | LOCKED → PENDING_REVIEW → DRIPPING → DONE; PAUSED dispute | ☐ |
| Q3.3 | Treasury ≠ StreamPool | Capital pool funds per-worker `Stream` legs (vs Sweem table) | ☐ |
| Q3.4 | Privacy stack | Private engagement (Poseidon notes + `private_settle` + ECIES); amounts-only (Groth16 + Seal); overfund/relayer | ☐ |
| Q3.5 | Honest privacy limits | Personal private hides graph+amount inside pool; edges leak; **Pro hire is public**; ceremony = hackathon | ☐ |
| Q3.6 | DeFi | yield_vault (testnet stand-in) + borrow-against-**worker**-stream | ☐ |
| Q3.7 | Sui primitives used | Objects, PTBs, zkLogin, Enoki, groth16, Seal | ☐ |

---

### Quest pack 4 — Production, GTM, money, roadmap (requirements C, E)

| ID | Quest | Draft answer | Done? |
|----|--------|--------------|-------|
| Q4.1 | **Path to production** | (1) Mainnet package + real USDC/USDsui (2) MPC ceremony for circuits (3) Scallop/Navi/Suilend adapters behind `protocol_registry` (4) Graph-privacy phases | ☐ |
| Q4.2 | **Go-to-market** | Beachhead: crypto-native freelancers & agencies on Sui → Pro for studios/DAOs → SDK for agent payroll → later fiat on-ramps via partners | ☐ |
| Q4.3 | **Why users switch** | Faster cash flow than invoices; programmable escrow; optional wage privacy; gasless onboarding | ☐ |
| Q4.4 | **Monetization** | Mix: small protocol take on drip/create; Pro subscription (compliance, seats, tools); optional sponsored-gas margin; never tax the worker’s privacy mode unfairly | ☐ |
| Q4.5 | **Sustainability** | Open protocol + Pro SaaS; keeper tips already exist (bps); ecosystem grants → usage fees | ☐ |
| Q4.6 | **Roadmap (3 horizons)** | **Now:** testnet polish, privacy honesty (Pro ≠ private). **Next:** mainnet + adapters. **Later:** private treasury hire, Walrus deliverables, selective disclosure | ☐ |
| Q4.7 | **Beyond hackathon** | Same contracts become production payroll rail — Overflow is the wedge, not the product | ☐ |

---

### Quest pack 5 — Presentation & vision (10%)

| ID | Quest | Done? |
|----|--------|-------|
| Q5.1 | Opening line memorized (problem in one breath) | ☐ |
| Q5.2 | Closing line memorized (vision + ask) | ☐ |
| Q5.3 | Slide deck ≤ ~8 slides (or zero slides + live only) | ☐ |
| Q5.4 | No competitor dunking unless asked | ☐ |
| Q5.5 | Never claim mainnet / live Scallop yield / private Pro payroll / invisible wages | ☐ |
| Q5.6 | Timing: narrative ≤ 2 min, demo ≤ 2–3 min, buffer for Q&A | ☐ |

**Suggested slide outline (if slides allowed):**

1. Problem  
2. Solution / value prop  
3. Who & why adopt  
4. Live demo (or “demo now”)  
5. How it works on Sui  
6. Path to production + roadmap  
7. Business model  
8. Vision / why Overflow matters for Sui payments  

---

### Quest pack 6 — Q&A armor (judge questions)

Prepare crisp answers. Mark ☐ when rehearsed out loud.

#### Product & market

| ID | Likely question | Answer seed | ☐ |
|----|-----------------|-------------|---|
| Q6.1 | Who pays you? | Orgs / Pro SaaS + small protocol fee; workers aren’t the piggy bank | ☐ |
| Q6.2 | Why not just use USDC streaming on EVM? | Gas kills micro-drips; no native object escrow / zkLogin / groth16 story like Sui | ☐ |
| Q6.3 | Why not Talise? | They’re send/chat money; we do gated continuous work pay + privacy + Pro payroll | ☐ |
| Q6.4 | Why not Sweem? | We took pool capital ops, rejected StreamPool; privacy + milestones stay first-class | ☐ |
| Q6.5 | Is POS real? | Commerce tools on our rails; not SGQR retail — Quay owns that wedge | ☐ |
| Q6.6 | Who is the beachhead customer? | Crypto-native freelancer ↔ client pairs, then agencies running Pro | ☐ |

#### Technical

| ID | Likely question | Answer seed | ☐ |
|----|-----------------|-------------|---|
| Q6.7 | Is privacy real? | **Personal** default: yes — amount + graph + cadence inside the pool (Groth16 + notes); edges + Pro hire still public; ceremony temporary | ☐ |
| Q6.8 | What if the keeper dies? | Permissionless — anyone can drip/auto-approve; we run one for UX | ☐ |
| Q6.9 | Funds custody? | Locked in Move shared object; rules are entry functions — no StreamLine custodial wallet | ☐ |
| Q6.10 | Yield APR real? | Vault mechanics real; testnet APR subsidized stand-in; mainnet → protocol adapters | ☐ |
| Q6.11 | Borrow — who borrows? | **Worker** against their stream PV — not the company borrowing the treasury | ☐ |
| Q6.12 | Invoice on-chain? | Create = share link today; pay/subscribe settles on-chain | ☐ |

#### Vision & risk

| ID | Likely question | Answer seed | ☐ |
|----|-----------------|-------------|---|
| Q6.13 | Mainnet when? | After Overflow: real stable + ceremony + adapter wiring; architecture already upgrade-shaped | ☐ |
| Q6.14 | Regulatory / payroll compliance? | Pro compliance exports for **public** legs; full KYB/tax is partner territory — we’re the rail | ☐ |
| Q6.15 | What fails the product? | No *usable* wage privacy → orgs won’t put real wages on-chain; personal private path is live, **private Pro hire is next** | ☐ |
| Q6.17 | Is Pro hire private? | **Default yes** — private engagement + Seal roster. Explicit Public treasury mode is cleartext. Edges still leak round amounts. | ☐ |
| Q6.16 | Ecosystem impact for Sui? | Sticky USDC velocity + zkLogin users + Seal/Groth16 showcase + SDK for agents | ☐ |

---

## 4. Mapping: requirements → quests → criteria

| Official ask | Quest packs | Criteria hit |
|--------------|-------------|--------------|
| Live present | Q1, Q5 | Presentation 10%, Real-world 50% |
| Working demo | Q0, Q2 | Product 20%, Technical 20% |
| Q&A | Q6 | All |
| Problem / solution / value | Q1 | Real-world 50% |
| Technical implementation | Q3 | Technical 20% |
| Path to production / GTM | Q4 | Real-world 50% |
| Users / PMF | Q1, Q4, Q6 | Real-world 50% |
| Monetization / roadmap | Q4 | Real-world + Presentation |
| Why Sui | Q1.7, Q3.7 | Technical + Presentation |
| Strong project signals | Q2 polish, Q1 meaning, Q3 Sui, Q4 long-term | All weights |

---

## 5. Day-of checklist (print this)

- [ ] Wallets funded (SUI dust + mock USDC)  
- [ ] Golden path works on venue wifi (or hotspot)  
- [ ] Backup recording ready  
- [ ] Opening + closing lines cold  
- [ ] Honest limits ready (testnet, Pro hire public, edge leaks, subsidized APR)  
- [ ] Demo stops at pause — don’t tour Tools  
- [ ] One sentence on monetization  
- [ ] One sentence on why Sui  

---

## 6. Anti-goals (what loses points)

- Feature tour of every Pro screen  
- Claiming mainnet / live multi-protocol yield / private org payroll on Pro  
- Positioning as “Sui Venmo” (Talise’s fight) or “SGQR POS” (Quay’s fight)  
- Hiding that Move is the product and UI is the demo vehicle  
- Skipping path-to-production (50% real-world cares)  

---

## 7. Related docs

| Doc | Use in prep |
|-----|-------------|
| [`about-project.md`](./about-project.md) | Deep product / architecture facts |
| [`tech.md`](./tech.md) | Technical depth + slide bullets + scratch notes |
| [`competitive-advantage.md`](./competitive-advantage.md) | Positioning vs Sweem / Talise / Quay |
| Root [`README.md`](../README.md) | Public pitch language |
| [`HANDOFF.md`](../HANDOFF.md) | Deploy IDs, RPC, ops landmines |
| Privacy plans in this folder | Honest answers for Q6.7 / roadmap |

---

*Living prep sheet — update Done? columns as the team rehearses. Last updated: 2026-07-18.*
