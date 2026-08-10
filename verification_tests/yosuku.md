# Yosuku — Sui Move PoC Verification Report

Workspace: `projects/yosuku/contracts/`
Tool: `sui 1.76.0-6effb4523834`
Date: 2026-08-07

## Summary

All 5 findings reproduce under `sui move test`. Every PoC test in every package
compiles and passes against the unmodified source. Total: **8 PoC test functions
across 3 packages, 5/5 findings confirmed.**

| Finding | Severity | Package | PoC file | Result |
|---|---|---|---|---|
| DB-4417 | Critical | core | `tests/audit_poc_4417_tests.move` | PASS (2 fns) |
| DB-4418 | Critical | leverage-pkg | `tests/audit_poc_4418_tests.move` | PASS (2 fns) |
| DB-4419 | Critical | core | `tests/audit_poc_4419_tests.move` | PASS (2 fns) |
| DB-4421 | High | core | `tests/audit_poc_4421_tests.move` | PASS (2 fns) |
| DB-4425 | High | parlay624-pkg | `tests/audit_poc_4425_tests.move` | PASS (2 fns) |

---

## DB-4417 — `vault::withdraw_for_allocation` accepts `&AllocationTicket` (replayable)

- **Source**: `contracts/core/sources/vault.move:274-281` (`withdraw_for_allocation(_vault, ticket: &AllocationTicket, ...)`).
- **Test**: `contracts/core/tests/audit_poc_4417_tests.move`
  - `poc_4417_double_spend_one_ticket` — same `&ticket` spent twice → both succeed, `idle_value` debited 2× while `total_deployed` credited only 1× on `confirm_allocation`.
  - `poc_4417_unbounded_replay_one_ticket` — same `&ticket` spent three times; bug is unbounded, not a 2× edge case.
- **Observed**: PASS. Confirms the parameter is `&AllocationTicket`, not by-value, so one captured agent attestation yields N× the withdrawal in a single PTB.

## DB-4418 — `leverage::open` returns notional to PTB; `liquidate(proceeds=zero)` clears the loan

- **Source**: `contracts/leverage-pkg/sources/leverage.move:136-160` (returns `margin + borrowed` as Coin<T>), `:194-235` (no sender check, `repay_lossy` on `pv=0` clears debt).
- **Test**: `contracts/leverage-pkg/tests/audit_poc_4418_tests.move`
  - `poc_4418_one_cycle_drains_borrowed_amount` — M=10_000, B=20_000 → attacker keeps 30_000 notional, calls `liquidate(proceeds=coin::zero)`, pool reserve drops by 20_000, `total_borrowed == 0`.
  - `poc_4418_repeated_cycle_drains_pool_to_zero` — 4 cycles of (M=2_500, B=5_000) → LP `current_value_of` drops 20_000, attacker nets +20_000 outside.
- **Observed**: PASS. The `debt * maintenance_bps > pv * 10_000` eligibility check is trivially satisfied when `pv=0`, so the loan is wiped for free; the borrowed funds were already in the attacker's PTB.

## DB-4419 — `strategy_market::MarketAdminCap` not market-bound; `create_market` public; `withdraw_fees` ignores cap

- **Source**: `contracts/core/sources/strategy_market.move:47` (`MarketAdminCap has key, store { id: UID }`, no `market` field), `:107-112` (`create_market` public + permissionless), `:251-254` (`set_fee_bps(_cap, ...)`), `:267-270` (`withdraw_fees(_cap, &mut listing, ...)`).
- **Test**: `contracts/core/tests/audit_poc_4419_tests.move`
  - `poc_4419_transferred_cap_drains_stranger_listing_fees` — STRATEGIST transfers init-minted cap to ATTACKER (cap has `store`); ATTACKER drains `1_250_000` of fees from a listing they never touched; second call returns 0.
  - `poc_4419_public_create_market_then_drain` — proves the same bug from a different angle (any cap works on any listing because there is no market-binding field).
- **Observed**: PASS. The cap is `has store` and unbound, and `withdraw_fees` ignores its `&MarketAdminCap` argument.

## DB-4421 — `yosuku_vault::book_payout` is public, no admin check, no proceeds lower bound

- **Source**: `contracts/core/sources/yosuku_vault.move:279-317`. Unlike the admin functions at `:322/331/339/345` which `assert_admin`, `book_payout` removes the leg, joins caller-supplied `proceeds` to idle, and records `cost_basis - proceeds` as a loss with no source check.
- **Test**: `contracts/core/tests/audit_poc_4421_tests.move`
  - `poc_4421_dust_book_payout_force_closes_leg_and_trips_breaker` — ATTACKER mints 1 dust of TUSD, calls public `book_payout` on the agent's open leg; leg force-removed, `total_open_cost` debited in full, `realized_loss_today == 479_999` > daily-loss-limit (100_000) → vault auto-pauses.
  - `poc_4421_donated_proceeds_inflates_nav` — ATTACKER donates 5_000_000 proceeds; NAV jumps by `5_000_000 - COST`; a follow-on VICTIM deposit of 1 unit mints 0 shares via `mul_div` round-down.
- **Observed**: PASS. Function compiles as `public fun book_payout(...)`, executes from a stranger's address, and both exploit paths land exactly as predicted.

## DB-4425 — `parlay624::open_parlay` floor stake derived from caller-supplied `prob_bps[]`

- **Source**: `contracts/parlay624-pkg/sources/parlay624.move:372-395`. The floor stake is `ceil(max_payout · combined_bps · (1 + margin) / 10_000)` where `combined_bps` is the opener-supplied product of `prob_bps[]`. No Pricer / quote / oracle cross-check.
- **Test**: `contracts/parlay624-pkg/tests/audit_poc_4425_tests.move`
  - `poc_4425_self_reported_low_prob_yields_near_min_floor` — HONEST opener reports 45% + 60% → combined 27%, floor ≈ 302_400_000. ATTACKER reports 10% + 10% on the SAME legs → combined 1% (= `min_combined_prob_bps`), floor ≈ 11_200_000. Attacker EV/max_payout ratio is ≥25× more favorable for the identical event.
  - `poc_4425_chain_records_opener_supplied_combined_prob_unchanged` — on-chain `Parlay.combined_prob_bps` is exactly the opener-supplied 100 (1%), with full `max_payout`. The chain has no independent price source.
- **Observed**: PASS. `expected_floor` helper mirrors `mul_div_ceil` and matches the on-chain calculation.

---

## Final consolidated test runs

```
# core (4417, 4419, 4421)
Test result: OK. Total tests: 41; passed: 41; failed: 0
  [ PASS ] suioverflow::audit_poc_4417_tests::poc_4417_double_spend_one_ticket
  [ PASS ] suioverflow::audit_poc_4417_tests::poc_4417_unbounded_replay_one_ticket
  [ PASS ] suioverflow::audit_poc_4419_tests::poc_4419_public_create_market_then_drain
  [ PASS ] suioverflow::audit_poc_4419_tests::poc_4419_transferred_cap_drains_stranger_listing_fees
  [ PASS ] suioverflow::audit_poc_4421_tests::poc_4421_donated_proceeds_inflates_nav
  [ PASS ] suioverflow::audit_poc_4421_tests::poc_4421_dust_book_payout_force_closes_leg_and_trips_breaker

# leverage-pkg (4418)
Test result: OK. Total tests: 63; passed: 63; failed: 0
  [ PASS ] yolev::audit_poc_4418_tests::poc_4418_one_cycle_drains_borrowed_amount
  [ PASS ] yolev::audit_poc_4418_tests::poc_4418_repeated_cycle_drains_pool_to_zero

# parlay624-pkg (4425)
Test result: OK. Total tests: 8; passed: 8; failed: 0
  [ PASS ] parlay624::audit_poc_4425_tests::poc_4425_chain_records_opener_supplied_combined_prob_unchanged
  [ PASS ] parlay624::audit_poc_4425_tests::poc_4425_self_reported_low_prob_yields_near_min_floor
```

## Reproduce commands

```
cd projects/yosuku/contracts/core          && sui move test
cd projects/yosuku/contracts/leverage-pkg  && sui move test
cd projects/yosuku/contracts/parlay624-pkg && sui move test
```

## Findings NOT reproduced

None. All 5 findings reproduce cleanly. The only reviewer-supplied caveat
("一二存在，三不存在" for DB-4417) was respected: the 4417 PoC targets only the
`&AllocationTicket` replay issue, not the unrelated "third" sub-claim.
