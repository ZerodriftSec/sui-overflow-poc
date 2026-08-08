# StreamLine — Work Handoff

Running log of work done in this session so another dev can continue. Newest
sections are the in-progress privacy build (Phase 1). Dates are 2026-07-15 → 07-18.

---

## 0. Critical environment facts (read first)

| Thing | Value |
|---|---|
| **Move package (v12, current)** | `0x634db89da9f926dabd83c042c2c6e7af8d6b43e8139699bd604959b4c2e30b31` |
| Move package (v11/v10/v9, prev) | `0x2a2681a9…4b0b1f7b39` / `0x2bee880e…179a281` / `0xff78b5ef…705ad3` |
| Original package (type origin / Seal namespace) | `0x9d6e7815d5e11424a68f827e26499078fead7648328f44fdbdeff6d34ed0b3a8` |
| Upgrade cap (owned by deployer wallet below) | `0x351ff70fa0639fb0c1bf61bbb5402314c4b2d853f22e7274adbec4dba7f5447e` |
| Yield vault (shared) | `0x8ae9d8805682aabbd00ff0582d93b88f2f86482bcabed194a88a6ded99a88406` |
| Mock USDC type | `0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3::mock_usdc::MOCK_USDC` |
| Mock USDC faucet treasury | `0xa7cb971f4f93e5713c5703f63f3bc17fdf0f6bf1f9795dc010ac164827715330` |
| Deployer / keeper wallet | `0x046d80ecab635be43d5e0b7b3ac896388e5e19f37829080ce2e06614e80ad5f0` |
| Indexer (Railway) | `https://streamline-production-4739.up.railway.app` |
| **Working testnet RPC** | Ankr (keyed) — set in `frontend/.env` `NEXT_PUBLIC_SUI_TESTNET_RPC`. Fallback: `https://rpc-testnet.suiscan.xyz` |

⚠️ **The public `fullnode.testnet.sui.io` endpoint is DEAD (404).** That was the
root of all the "RPC flakiness" this session. The frontend is pinned to suiscan
via `NEXT_PUBLIC_SUI_TESTNET_RPC` in `frontend/.env`. If the indexer/keeper start
failing again, check their RPC env vars point somewhere alive.

⚠️ **Grep/Bash output redacts some identifiers** (shows `n`, `ln`, `w.ln`). This
is a harness display quirk, NOT the real source. Always trust the `Read` tool /
open the file for actual identifiers.

`sui` CLI must be **≥ 1.75** (testnet protocol 129). 1.73 panics. `brew upgrade sui`.

---

## 1. Ops fixes (start of session)

- **Indexer 401 "API key disabled":** the deployed indexer's `SUI_RPC_URL` (Railway
  env, not the repo `.env`) had a dead keyed provider. Fix = rotate that env var
  (public fullnode or a fresh key). Not a code bug.
- **Keeper "Cannot find gas coin":** the keeper wallet's SUI was shredded into
  sub-budget dust coins. Fixed by faucet top-up
  (`curl -X POST https://faucet.testnet.sui.io/v2/gas -d '{"FixedAmountRequest":{"recipient":"0x046d..."}}'`).
  Recurs as coins erode; consider a keeper self-merge if it keeps happening.

## 2. yield_bps clamp bug (create_stream_v2 abort code 2 = EBadSplits)

`frontend/src/lib/use-create-stream-from-request.ts` computed `yieldBps` that could
reach 10000 (100% yield split), but the contract asserts `yield_bps < 10000`. Fixed
with `Math.min(9_999, …)`. The `splitMilestoneAmounts` helper was fine (last
milestone absorbs remainder). The phone flow already used 9999.

## 3. Pro backend wiring (was 100% localStorage mock)

The Pro workspace (`frontend/src/components/app/pro/`) was a pure client-side sim.
Wired it to real data:

- **Read overlay** in `ProWorkspaceContext.tsx`: `useStreams({ sender: address })`
  from `frontend/src/lib/indexer.ts` folds real on-chain stream state onto workers
  (matched by `freelancer === walletAddress`, else builds roster rows straight from
  chain). Real `streamedUsd`, `status`, `budget`, `pool.streamed`.
- **De-seeded** `frontend/src/lib/pro-workspace-store.ts` `loadProWorkspace` — new
  orgs start empty (was auto-seeding fake "Alex Rivera" fixtures). Demo data now
  loads only via explicit `resetDemo()`. ⚠️ Old localStorage keys (`sl-pro*`) may
  still hold the stale seed — clear them in DevTools to see real data.
- **Write path:** "Start" on a pending worker calls `createWorkerStream` →
  `buildCreateStreamV2` (org=sender, worker=freelancer, budget locked). Wired in
  `StreamsScreen.tsx` and `PhoneProWorkspace.tsx`.
- Keeper needs no changes — it drips any dripping stream generically.

## 4. On-chain Treasury (the Pro "pool") — Phases done

Contract: **`contracts/sources/treasury.move`** (in package v9). Per-org shared
`Treasury<T>`: `open` / `deposit` / `withdraw` / `invest` / `divest`, reusing
`yield_vault` for real yield (invest = deposit into vault, held as one consolidated
`VaultReceipt`). Tests: `contracts/tests/treasury_tests.move` (2 tests, full
lifecycle + owner-gating). **All 21 Move tests pass.**

Deployed via `sui client upgrade` (package v8 `0x28506598…` → v9 `0xff78b5ef…`).
`deployment.testnet.json` + `Move.toml` `published-at` + `frontend TESTNET_PACKAGE`
all updated to v9.

Frontend wiring:
- `frontend/src/lib/streamline-tx.ts`: `buildOpenTreasury/Deposit/Withdraw/Invest/Divest`.
- `frontend/src/lib/treasury.ts`: reads live `idle`/`invested` via `devInspect` on
  the `idle_value`/`invested_value` view fns; `findCreatedTreasury(digest)`.
- `ProWorkspaceContext.tsx`: `fundTreasury/withdrawTreasury/investTreasury` actions;
  `workspaceView` overlays real `pool.funded/allocation` + **real yieldEarned**
  (`invested − investedPrincipal`, principal tracked locally in workspace).
- `ProActionModals.tsx`: Fund / Withdraw / Allocate→Yield-vault sign real txs, with
  error surfacing.
- **Enoki allowlist** `frontend/src/lib/enoki-targets.ts`: added the 5 `treasury::*`
  targets. Without this the sponsor rejects with "not part of an allow-listed move
  call target" — remember to add any NEW move entry fn here or gasless calls fail.

Bugs fixed during this: a race in `ensureTreasury` (returned before
`findCreatedTreasury` resolved — `execute`'s onSuccess is fire-and-forget; now
capture digest synchronously, resolve id after await), and swallowed `onError`
(now thrown + shown in the modal).

## 5. Smaller UI

- **Mint 10,000 USDC** in the Pro wallet menu: `faucetAmount` prop threaded through
  `WalletButton → AccountMenu → FaucetButton`; enabled in `PhoneAppShell`/`AppChrome`
  with `faucetAmount={isPro ? 10000 : 1000}`.
- **Phone mockup bigger:** `frontend/src/components/landing/PhoneMockup.tsx` non-compact
  width `340→440px` (lg).
- **Phone private-stream cards now open:** `PhoneHomeView.tsx` `PrivateStreamCard`
  was a display-only div; made it a button that opens the full desktop
  `PrivateStreamsPanel only={id}` (unlock → drip hidden → raise) in a phone detail view.

---

## 6. Privacy — what's real vs mocked (audited this session)

- **Yield:** vault mechanics are REAL on-chain (deposit→shares→index accrual→redeem;
  live vault has ~56k USDC reserve, index grown past 1.0077). But the 8% APR is
  **subsidized** from a seeded buffer (a Scallop-shaped testnet stand-in), not market
  yield. Pro's displayed yield is now real (derived from the vault), not the old sim.
- **Privacy:** REAL cryptography across three product modes:
  - **Default private engagement** (`private_stream` + `shielded_pool` + `private_settle`):
    hides **amount + who↔whom + drip cadence** inside the pool. Deposit/withdraw
    still reveal amount + address at the anonymity-set edge. Note openings use
    **ECIES** (`publish_note`), not Seal. **Personal create only** — not Pro hire.
  - **Amounts-only** (`ConfidentialStream`): Poseidon + Groth16 + **Seal** openings.
    **Still leaks** `sender`/`freelancer` and drip/milestone timestamps.
  - **Public** `Stream`: cleartext; required for borrow / yield splits / **Pro treasury hire**.
  Trusted setup is a hackathon ceremony (fine for testnet; needs MPC for mainnet).
  **Deploy:** upgrade the package so `private_stream` is on-chain before relying on
  the app’s default Private create path.
  **Privacy relayer:** set `PRIVACY_RELAYER_SUI_PRIVATE_KEY` (suiprivkey…) and fund
  that address with SUI + USDC. Hides **tx origin** for spend/settle/withdraw;
  deposit/open is two-step (user→relayer transfer, then relayer deposits). Amounts
  at the edge and two-tx timing still leak. `GET /api/relayer` → `{ enabled, address }`.
  **Overfund + private split (default):** deposits/open round up to the next $50 USDC
  bucket, then immediately `spend` into work(desired) + change so the public edge
  amount ≠ the economic note. See `frontend/src/lib/overfund-split.ts`.
  **Payroll:** Pro defaults to private engagement hire + Seal-sealed roster
  (`pro-roster-seal.ts`). Public treasury hire remains an explicit escape hatch
  for compliance / on-chain HR.

## 7. Privacy roadmap (the "build this fully" plan, testnet-targeted)

Threat-model priority for payroll: hide **graph > rate > amount**.

**Status (2026-07-19):** personal create **and Pro Start** default to **private engagement**
with overfund/split + optional relayer. Roster Seal at rest. Public treasury hire is
opt-in. Next: treasury → pool unlinkable debit + private on-chain HR.

Phases below are historical roadmap context:

- **Phase 1 — Lazy private stream** — DONE (`lazy_stream`; folded into private settle).
- **Phase 2 — Graph hiding** — DONE at pool layer; integrated via `private_stream`.
- **Phase 2b — Private Pro hire** — DONE (default); treasury accounting bridge NOT DONE.
- **Phase 3 — Dual yield** — pool can invest idle reserve (see §9 / vault).
- **Phase 4 — Selective disclosure** — Seal auditor packs for compliance payloads;
  note-level re-encrypt still productize.

---

## 8. Phase 1 status — CONTRACT + CRYPTO + PLUMBING DONE; only UI + live test left

Goal: a confidential stream that vests linearly and settles lazily (one proof, no
per-drip txs, no keeper). Deployed on-chain in package **v10**.

### DONE ✅ (all tested)
- **Circuit** `circuits/src/lazydrip.circom` — extends `transfer.circom` with the
  vesting bound `earned_new ≤ min(cap, rate·(nowSec − start))`, schedule pinned by
  public `ParamsCommitment = Poseidon(rate, start, cap, blinding)`. 3531 constraints.
  Rebuild: `cd circuits && POT_POWER=15 ./scripts/build.sh lazydrip`. Sound: valid
  claim verifies, over-claim fails, `nowSec` is public (clock-bound).
  Signal order: `[cRemOld, cRemNew, cEarnedOld, cEarnedNew, cParams, nowSec]`.
- **VK on-chain** — `LAZYDRIP_VK` + `verify_lazydrip(...)` in
  `contracts/sources/confidential_balance.move` (converter output validated: the
  proof verifies via Sui native groth16 — see `circuits/move/tests/lazydrip_tests.move`,
  green). Converter run: `cargo run --manifest-path circuits/converter/Cargo.toml
  --release -- <dir-with verification_key.json/proof.json/public.json>`.
- **Contract** `contracts/sources/lazy_stream.move` — `create` / `settle` / `claim`.
  `settle` verifies the lazydrip proof + updates commitments; `claim` unwraps earned
  to cash and resets earned to the canonical `ZERO_COMMITMENT = Poseidon(0,0)`.
  Tests `contracts/tests/lazy_stream_tests.move`: real-proof settle passes; wrong
  clock (now_sec 51 vs 50) → `EProofInvalid`. **Full suite 23/23 green.**
- **Deployed** as package v10 (`sui client upgrade`, cost ~0.17 SUI). Records updated.
- **Enoki allowlist** — `lazy_stream::create/settle/claim` added to `enoki-targets.ts`.
- **Frontend plumbing** — `frontend/src/lib/confidential.ts`: `proveLazyDrip`,
  `commitParams` (Poseidon(4)), `lazyNewCommitments`, and builders
  `buildCreateLazyStream` / `buildSettleLazy` / `buildClaimLazy`. Circuit artifacts
  copied to `frontend/public/circuits/lazydrip.{wasm,zkey,vkey.json}`. Typecheck green.

### DONE ✅ (UI, in v11)
- **Timing fix (important):** `settle`'s exact-clock `now_sec` raced proof-gen vs
  execution and could never succeed live. Added `settle_at(…, now_sec, clock)` — the
  prover supplies `now_sec` (bound into the proof), the contract only checks it's
  `≤ clock` (`EFutureTime`). Old `settle` kept for upgrade compat (signature freeze).
  Tests updated (3/3: valid, wrong-now → proof reject, future → EFutureTime).
- **UI** `frontend/src/components/app/LazyStreamPanel.tsx` + route
  `frontend/src/app/app/lazy/page.tsx` (**http://localhost:3000/app/lazy**): create
  (amount + duration → rate, wrap proof, commitments) / settle (proveLazyDrip →
  settle_at) / claim (proveUnwrap → claim). Secrets in
  `frontend/src/lib/lazy-stream-store.ts` (localStorage; each settle mutates
  remaining/earned + rotates blindings).
- **Validated headlessly:** frontend `proveLazyDrip` input mapping generates a valid
  witness+proof against `public/circuits/lazydrip.*` (node test), and a real proof
  verifies on-chain via `settle_at` (Move test). Typecheck green.

### TODO — remaining
1. **Live browser click-through:** create → settle → claim at `/app/lazy`, gasless
   (needs a connected wallet with mock USDC). Every layer is validated headlessly but
   the full wallet loop hasn't been driven in-browser yet.
2. **Cross-party secrets:** `LazyStreamPanel` stores openings locally (works when
   creator == settler, e.g. the sender settling on the freelancer's behalf — settle is
   permissionless). For a different-wallet freelancer to settle/claim, Seal-encrypt the
   openings on create (reuse `encryptSecrets` in `seal.ts`) and decrypt on their side,
   like the existing `ConfidentialStream` flow. `create` already acceptsc
  and will race/fail in practice; it only exists for upgrade compat.
- Changing a `public fun` signature breaks upgrade compat (that's why `settle_at` is a
  new fn, not a changed `settle`). Add new fns instead.
- Every new move entry fn must be added to `enoki-targets.ts`.

---

## Build / run quick ref
- Frontend dev: `cd frontend && npm run dev` (localhost:3000; Pro at `/app/pro`).
- Typecheck: `cd frontend && npx tsc --noEmit`.
- Move tests: `cd contracts && sui move test`.
- Circuit build: `cd circuits && POT_POWER=15 ./scripts/build.sh <name>`.
- Deploy upgrade: `cd contracts && sui client upgrade --upgrade-capability 0x351ff70f… --gas-budget 500000000` (keeper wallet must hold a ≥0.5 SUI coin; faucet if needed).

---

## 9. Phase 2 (graph hiding) — COMPLETE at contract layer, deployed (v13)

Full shielded pool (UTXO/note + nullifier + on-chain Merkle tree) that hides the
payment graph. `sui::poseidon` == circomlib Poseidon (verified), so the on-chain
tree roots match circuit-proven roots.

Circuits (`circuits/src/`, built with `POT_POWER=15 ./scripts/build.sh <name>`):
- `shielded.circom` — spend 1 note → 2 (membership + nullifier + conservation), 13445 constraints.
- `deposit.circom` — bind a note to a public deposited amount, 605 constraints.
- `withdraw.circom` — spend → reveal public amount + change note, 12840 constraints.
- ⚠️ snarkjs `groth16.fullProve` HANGS here — use `wtns.calculate` + `groth16.prove`.

Contract:
- `merkle_tree.move` — incremental Merkle tree (Tornado-style, `sui::poseidon`), 30-root history.
- `shielded_pool.move` — `deposit` (value in, bound) / `spend` (graph-hiding transfer) /
  `withdraw` (value out, reveals only the amount). Double-spend + unknown-root guarded.
- VKs `SHIELDED_VK`/`DEPOSIT_VK`/`WITHDRAW_VK` + `verify_*` in `confidential_balance.move`.
- Tests `shielded_pool_tests.move` + `merkle_tree_tests.move`: real-proof deposit/spend/
  withdraw, binding enforced (999≠1000 rejects), double-spend, unknown-root, on-chain
  root == circuit root. **Full suite 32/32.**

## 10. Phase 3 (dual yield) — DONE at contract layer

`shielded_pool::invest`/`divest` (Phase 3) put the pool's idle reserve into the
`yield_vault` (position held in a dynamic field, so no upgrade-breaking struct change).
Value never leaves the vault during a `spend`, so both ends of a transfer keep earning —
yield → yield. Test `pooled_capital_earns_yield`: invest 100k → ~110k after a year → divest. ✅
Note: this is *pool-level* yield (the backing capital earns). Per-note yield attribution to
hidden notes (share-denominated notes) is the harder open problem — the deposit-index race
(§ earlier design notes) makes it non-trivial; left as future work.

## 11. Phase 4 (selective disclosure) — contract hook DONE

`shielded_pool::publish_note(pool, commitment, ciphertext)` emits an `EncryptedNote` event:
a Seal ciphertext of a note's opening (value, pk, rho), tagged by commitment. Recipients scan
these, trial-decrypt via Seal (only theirs opens), and recover the note to spend. Selective
disclosure = the owner re-encrypts an opening to a chosen auditor identity — nothing public.
Called in the same PTB as `spend`/`deposit`. Seal primitives already exist (`seal.ts`,
`seal_approve`).

## 12. Shielded-pool FRONTEND — BUILT ✅

Full Phase 2 frontend, wired to the live pool
`0x746dc6e668995b336e4a51ddc7c36673177983821dcff875149462014d73eccb` (const
`SHIELDED_POOL.testnet` in `constants.ts`). Typecheck green.
- **`frontend/src/lib/shielded.ts`** — note crypto (`pk`/`noteCommit`/`nullifier`),
  Merkle reconstruction (`fetchCommitments` replays events in leaf order →
  `merklePath` folds the tree exactly like `merkle_tree.move`), provers
  (`proveDeposit`/`proveShielded`/`proveWithdraw` via `confidential.prove`), and PTB
  builders (`buildDeposit`/`buildSpend`/`buildWithdraw`, u256 args + `vector<u8>` proof).
  Public-signal orders: deposit `[cm, value]`, shielded `[root,nf,cm1,cm2]`,
  withdraw `[root,nf,amount,cm_change]`.
- **`frontend/src/lib/shielded-store.ts`** — per-wallet spend key + local note openings
  (`getSpendKey`/`loadNotes`/`addNote`/`markSpent`). Keys `sl-shielded-{sk,notes}:<addr>`.
- **`frontend/src/components/app/ShieldedPanel.tsx`** + route
  `frontend/src/app/app/shielded/page.tsx` (**/app/shielded**): deposit / private
  transfer (split note; recipient pk optional) / withdraw (to any address). Gasless via
  `useGaslessExecute`. Linked from `AppLauncher` (Shield card; Lazy card also added).
- **`confidential.ts`** extended: `CircuitName` += shielded/deposit/withdraw; exports
  `poseidon`, `feToLeBytes`. **`enoki-targets.ts`** += `shielded_pool::{deposit,spend,withdraw,publish_note}`.
- **Validated (no chain writes needed):** frontend Merkle reconstruction === live
  on-chain empty root (RPC read), and for a non-empty 7-leaf tree the fold ===
  on-chain incremental `insert`, with every `merklePath` recomputing the tree root
  (matches `shielded.circom` MerkleProof). Scripts in the session scratchpad.

### Cross-party private payments — BUILT ✅

A note sent to someone else needs its opening `(value, rho)` delivered privately. We do
it on-chain via the existing `publish_note` hook — no Seal key servers, no access policy,
no side channel:
- **`frontend/src/lib/shielded-address.ts`** — a self-contained ECIES sealed box:
  x25519 ECDH → HKDF-SHA256 → AES-GCM (native WebCrypto). Zero new deps (`@noble/curves`
  + `@noble/hashes` already vendored by `@mysten/*`). A **shielded address** (`sl1…`,
  base64 of `pk‖x25519-pub`) bundles both keys the sender needs; both derive
  deterministically from the wallet `sk`, so nothing extra is stored.
- **Send:** transfer takes the recipient's `sl1…` address → sets `pk1 = their pk`,
  encrypts `(v1, rho1)` to their x25519 pubkey, and `buildSpend` appends
  `publish_note(cm1, ciphertext)` in the same (gasless) PTB.
- **Receive:** `scanIncoming` (in `shielded.ts`) walks `EncryptedNote` events, AES-GCM
  trial-decrypts each (wrong-key ⇒ tag mismatch ⇒ skip), recomputes the commitment to
  confirm it's really theirs, and adds the note locally. Wired to a **"Scan for incoming"**
  button; the receive address is shown + copyable in the balance card.
- **Validated headlessly:** sealed box round-trips and a wrong recipient decrypts to
  `null` (scratchpad `validate-crypto.mjs`). `publish_note` was already in
  `enoki-targets.ts`.
- **Ceiling (ponytail):** scan doesn't check whether a received note was already spent by
  its sender before you scanned (no nullifier lookup); it's marked spent only when *you*
  spend it. Fine for the demo; add a `pool.nullifiers` check on scan if it matters.

### Remaining (genuinely manual)
- Live browser click-through of deposit→transfer→(scan)→withdraw with a funded wallet.
  All crypto/Merkle/serialization is validated headlessly and proving reuses the same
  in-browser `confidential.prove` the working lazy flow uses; the click-through itself
  needs a human + wallet. If `fullProve` ever hangs in-browser, switch `prove` to the
  split `wtns.calculate`+`groth16.prove` path (as the node test scripts do).
- Optional "pool yield" readout from `invested_value` (Phase 3) in the panel.

---

## 11. Payroll pool (Treasury → worker streams) — 2026-07-18

Verdict vs Sweem: **don't** copy `StreamPool` table-of-employees. **Do** make
Treasury the capital pool and fund per-worker `Stream` legs from it.

### On-chain (`contracts/sources/`)
- `stream::create_stream_from_treasury_v2` — withdraw from treasury, lock into a
  stream that **starts DRIPPING**, tags stream with treasury id (DF).
- `stream::suspend_payroll` / `resume_payroll` / `stop_payroll` (+ `stop_stream`
  for wallet-funded). Suspend settles accrued first; stop refunds remainder to
  treasury. Distinct from dispute `STATE_PAUSED` (mutual resolve).
- Confidential twins: `create_confidential_stream_from_treasury_v2`,
  `conf_suspend_payroll` / `conf_resume_payroll` /
  `conf_refund_remainder_to_treasury` (unwrap proof — privacy preserved).
- `treasury::ensure_idle` — divest yield if hire needs more liquid float.
- `protocol_registry` — allow-list for yield adapters; `yield_vault` remains the
  native/testnet adapter (`native_vault`). Real Scallop/Navi adapters = mainnet
  follow-up behind the same registry.
- Test: `contracts/tests/payroll_pool_tests.move` (needs `sui` CLI).

### Frontend / SDK / indexer
- Pro hire: `buildCreateStreamFromTreasuryV2` (ensure_idle + create).
- Pause/resume/stop call on-chain when `worker.streamId` is set.
- Enoki allowlist updated for new entry fns.
- Indexer: `StreamSuspended` / `StreamResumed` / `StreamStopped`; state code `5`.

### Deploy note
Package upgrade required before Pro hire-from-treasury works on testnet. After
upgrade, refresh `published-at`, `TESTNET_PACKAGE`, Enoki allowlist on the
sponsor, and re-deploy indexer.
