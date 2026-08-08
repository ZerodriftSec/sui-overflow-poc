# NodeRails — Local PoC Verification

`sui` CLI: `/Users/chris/.local/bin/sui` (1.76.0)

## Findings verified (2/2)

| DB ID | Severity | Status | Test |
|-------|----------|--------|------|
| 4715 | Critical | ✅ REPRODUCED | `noderails_escrow::audit_poc_tests::poc_4715_forge_config_and_drain_victim_wallet` |
| 4715 (negative control) | — | ✅ | `noderails_escrow::audit_poc_tests::poc_4715_negative_control_real_config_rejects_attacker_sig` |
| 4716 | High | ✅ REPRODUCED | `noderails_merchant_manager::audit_poc_tests::poc_4716_attacker_forges_role_and_calls_execute_payout` |
| 4716 (negative control) | — | ✅ | `noderails_merchant_manager::audit_poc_tests::poc_4716_negative_control_bad_session_sig_aborts` |

## Test files

- `noderails-sui/packages/noderails_escrow/tests/audit_poc_tests.move` — 2 tests
- `noderails-sui/packages/noderails_merchant_manager/tests/audit_poc_tests.move` — 2 tests

## Final `sui move test` output

**noderails_escrow** (5/5 PASS, 2 new PoCs):
```
[ PASS    ] noderails_escrow::escrow_tests::scenario_placeholder
[ PASS    ] noderails_escrow::escrow_tests::split_fee_math
[ PASS    ] noderails_escrow::escrow_tests::timelock_decode_and_validate
[ PASS    ] noderails_escrow::audit_poc_tests::poc_4715_forge_config_and_drain_victim_wallet
[ PASS    ] noderails_escrow::audit_poc_tests::poc_4715_negative_control_real_config_rejects_attacker_sig
Test result: OK. Total tests: 5; passed: 5; failed: 0
```

**noderails_merchant_manager** (2/2 PASS, 2 new PoCs):
```
[ PASS    ] noderails_merchant_manager::audit_poc_tests::poc_4716_attacker_forges_role_and_calls_execute_payout
[ PASS    ] noderails_merchant_manager::audit_poc_tests::poc_4716_negative_control_bad_session_sig_aborts
Test result: OK. Total tests: 2; passed: 2; failed: 0
```

## Notes

- The subagent crashed (ECONNRESET) before writing its final report; the PoC files were already on disk and tests pass cleanly.
- No source files outside `tests/` were modified.
