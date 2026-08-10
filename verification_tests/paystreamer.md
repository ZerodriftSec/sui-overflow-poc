# Paystreamer — Sui Move PoC Verification

## Finding verified

- **ID:** C-01 (Database ID 4517)
- **Title:** `AccountCap` forgeable — `ac::new_account_cap` is `public` and accepts
  a caller-supplied `account_id` + `permissions`, allowing an attacker to forge a
  cap that passes both `account::withdraw` guards (`ac::account_id(cap) ==
  object::id(account)` AND `has_permission(cap, OWNER)`) and drain any victim
  subscription account.
- **Location:** `sources/ac.move:54-68` (and exploited via `sources/account.move:460-474`).

## Test file

- `move/subscriptions/tests/audit_poc_tests.move`
  - `poc_forge_account_cap_and_drain` — positive PoC: forges an OWNER cap bound
    to a real victim account_id, then calls `account::withdraw` with the forged
    cap. Asserts the call succeeds and that the attacker drains the full 1_000
    TEST_USDC (assertion `account::balance(&victim_acct) == 0`).
  - `poc_negative_control_depositor_cap_cannot_withdraw` — negative control:
    a forged cap with the DEPOSITOR bit only still aborts `withdraw` with
    `account::EUnauthorized` (0x01008). Proves the OWNER-bit check itself works;
    the bug is purely the lack of authority on `new_account_cap`.

## Final `sui move test` output (last 15 lines)

```
[ PASS    ] subscriptions::billing_tests::test_record_payment_on_paused_fails
[ PASS    ] subscriptions::registry_tests::test_register_duplicate_fails
[ PASS    ] subscriptions::billing_tests::test_resubscribe_after_cancel
[ PASS    ] subscriptions::registry_tests::test_register_then_remove_round_trip
[ PASS    ] subscriptions::registry_tests::test_rotate_admin_old_admin_loses_authority
[ PASS    ] subscriptions::registry_tests::test_rotate_admin_works
[ PASS    ] subscriptions::registry_tests::test_rotate_admin_zero_address_fails
[ PASS    ] subscriptions::registry_tests::test_unauthorized_register_fails
Test result: OK. Total tests: 62; passed: 62; failed: 0
Please report feedback on the linter warnings at https://forums.sui.io

Total number of linter warnings suppressed: 2 (unique lints: 2)
```

`audit_poc_tests::poc_forge_account_cap_and_drain` and
`audit_poc_tests::poc_negative_control_depositor_cap_cannot_withdraw` both
appear in the PASS list.

## Per-finding result

| Finding | Status |
| --- | --- |
| C-01 / 4517 — `AccountCap` forgeable | **REPRODUCED** — `withdraw` with a forged cap drained 1_000 TEST_USDC from a victim account; assertions `0xdead_0001`..`0xdead_0004` all held. |

## Findings that did NOT reproduce

None. The single finding in this package (C-01) reproduced on the first green
run.

## Notes

- Only `tests/audit_poc_tests.move` was modified. No source files were touched.
- The other package in this project (`move/stablecoin/`) was not modified per
  instructions.
