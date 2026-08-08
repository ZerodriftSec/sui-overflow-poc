# Pelagos Verification Report

## Finding verified: DB-4894 (High) — structured_note waterfall payout breaks principal protection

- **Source location:** `sources/structured_note.move:253-262` (`redeem` payout calculation + per-call pool clamp).
- **Root cause:** `redeem` computes `payout = max(floor_out, settled_out)` and then unconditionally clamps to the live pool balance (`if (payout > pool) payout = pool`). `settle` records a payout ratio but performs no solvency check and no pro-rata shortfall distribution. An early redeemer pulls the full nominal settled amount and the residual holder absorbs the entire shortfall — even when `floor_bps = 10_000` (a 100% principal-protection promise).

## Test file
`/Users/chris/Documents/Codex/2026-08-07/https-audit-zerodrift-xyz-sessions-https/outputs/sui-overflow-local-verification/projects/pelagos/pelagos_strategies/tests/audit_poc_tests.move`

Test: `pelagos_strategies::audit_poc_tests::poc_waterfall_breaks_principal_protection`

## Scenario (matches finding verbatim)
1. `create_note<TESTCOIN>(10_000, ...)` — 100% floor.
2. Alice deposits 100, Bob deposits 100 → pool 200, total_shares 200.
3. Admin funds 20 of reserve → pool 220.
4. Admin `settle(140, 100)` → each 100-share position's `settled_out` = 140.
5. Alice redeems: `max(100, 140) = 140`, clamped to 220 → **receives 140**. Pool → 80. (assert 6, 8)
6. Bob redeems: `max(100, 140) = 140`, clamped to 80 → **receives 80**. (assert 10)
   Bob loses 20 of "100% protected" principal despite never defaulting — the early redeemer extracted it.

## Final `sui move test` output (last 15 lines)
```
[ PASS    ] pelagos_strategies::audit_poc_tests::poc_waterfall_breaks_principal_protection
[ PASS    ] pelagos_strategies::structured_note_tests::at_risk_basket_loss
[ PASS    ] pelagos_strategies::structured_note_tests::early_exit_at_par
[ PASS    ] pelagos_strategies::structured_note_tests::ppn_with_upside
Test result: OK. Total tests: 4; passed: 4; failed: 0
Please report feedback on the linter warnings at https://forums.sui.io
```

## Pass / fail per finding
- DB-4894 — **REPRODUCED (High).** Test passes because it asserts the *buggy* outcome (Bob receives 80, not the floor-guaranteed 100). Fixing the source so Bob receives >= 100 would make this test fail, demonstrating the bug. No false positive.

## Notes
- The PoC test intentionally asserts the buggy behaviour (`coin::value(&c) == 80` for Bob). A green run here is the positive confirmation that the vulnerability exists.
- Only files under `tests/` were added; no source modifications.
