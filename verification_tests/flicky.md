# Flicky — Local PoC Verification

`sui` CLI: `/Users/chris/.local/bin/sui` (1.76.0)

## Findings verified (5/5)

| DB ID | Severity | Status | Test |
|-------|----------|--------|------|
| 4982 | Critical | ✅ REPRODUCED | `swap::audit_poc_tests::poc_4982_cross_pool_lp_drain` |
| 4983 | Critical | ✅ REPRODUCED | `flicky::audit_poc_tests::poc_4983_unbounded_quantity_decides_winner` |
| 4984 | Critical | ✅ REPRODUCED | `flicky::audit_poc_tests::poc_4984_settle_card_accepts_attacker_price` |
| 4985 | Critical | ✅ REPRODUCED | `flicky::audit_poc_tests::poc_4985_finalize_test_one_price_steals_pot` |
| 4986 | High     | ✅ REPRODUCED | `flicky::audit_poc_tests::poc_4986_bogus_wrapper_zeros_victim_payout` |

## Test files

- `apps/contracts/swap/tests/audit_poc_tests.move` — 1 test (4982)
- `apps/contracts/tests/audit_poc_tests.move` — 4 tests (4983-4986)

## Final `sui move test` output

**swap package** (1/1 PASS):
```
[ PASS    ] swap::audit_poc_tests::poc_4982_cross_pool_lp_drain
Test result: OK. Total tests: 1; passed: 1; failed: 0
```

**flicky main package** (33/33 PASS, 4 new PoCs):
```
[ PASS    ] flicky::audit_poc_tests::poc_4983_unbounded_quantity_decides_winner
[ PASS    ] flicky::audit_poc_tests::poc_4984_settle_card_accepts_attacker_price
[ PASS    ] flicky::audit_poc_tests::poc_4985_finalize_test_one_price_steals_pot
[ PASS    ] flicky::audit_poc_tests::poc_4986_bogus_wrapper_zeros_victim_payout
...
Test result: OK. Total tests: 33; passed: 33; failed: 0
```

## Notes

- The subagent crashed (ECONNRESET) before writing its final report; the PoC files were already on disk.
- One compile-time issue was fixed: `scenario.return_to_address(player, coin)` → `ts::return_to_address(player, coin)` (test_scenario API is a free function, not a method).
- No source files outside `tests/` were modified.
