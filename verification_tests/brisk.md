# Brisk — Verification Summary

## Finding verified
- **DB-4673** — `GiftCardConfig` 权限可被任意地址劫持 (GiftCardConfig permission hijack via unbound admin cap)

## Test file
`projects/brisk/move/tests/audit_poc_tests.move`

Single `#[test]`:
`brisk::audit_poc_tests::attacker_self_minted_cap_hijacks_victim_config_treasury_and_fee`

## Reproduction chain
1. Deployer (`@0xD`) calls `gift_card::init_for_testing` → `create_config(300, DEPLOYER, _)`. This shares the canonical `GiftCardConfig` (treasury=DEPLOYER, fee_bps=300) and transfers the legit `GiftCardAdminCap` to the deployer.
2. Attacker (`@0xE`) calls the public `create_config(0, ATTACKER, _)` and receives their own, completely independent `GiftCardAdminCap`. The cap struct is `key, store { id: UID }` only — no `config: ID` binding.
3. Attacker calls `gift_card::set_treasury(&attacker_cap, &mut victim_config, ATTACKER)`. `set_treasury` takes `_admin: &GiftCardAdminCap` and never verifies the cap belongs to the supplied config, so the call succeeds and overwrites the victim's `treasury` field. `assert!(treasury(&victim_config) == ATTACKER, 200)` passes → bug confirmed.
4. Attacker calls `gift_card::set_fee(&attacker_cap, &mut victim_config, 10000)` against the same victim config. `assert!(fee_bps(&victim_config) == 10000, 201)` passes → bug confirmed again (now 100% fee skim).

## Final `sui move test` output (last 15 lines)
```
[ PASS    ] brisk::mock_lender_tests::set_apy_is_forward_only
[ PASS    ] brisk::gift_card_tests::regift_by_non_recipient_aborts
[ PASS    ] brisk::mock_lender_tests::supply_into_adds_shares_at_current_rate
[ PASS    ] brisk::mock_lender_tests::supply_mints_shares_and_value_compounds
[ PASS    ] brisk::gift_card_tests::regift_lets_a_new_recipient_claim_and_redeem
[ PASS    ] brisk::merchant_registry_tests::register_returns_bound_merchant_and_cap
[ PASS    ] brisk::payment_receipt_tests::pay_aborts_when_funds_below_amount
[ PASS    ] brisk::payment_receipt_tests::pay_exact_amount_leaves_no_change
[ PASS    ] brisk::payment_receipt_tests::pay_links_merchant_mints_authentic_receipt_and_returns_change
[ PASS    ] brisk::payment_receipt_tests::refund_with_controlling_cap_pays_the_customer
[ PASS    ] brisk::payment_receipt_tests::refund_with_foreign_cap_aborts
Test result: OK. Total tests: 35; passed: 35; failed: 0
Please report feedback on the linter warnings at https://forums.sui.io

Total number of linter warnings suppressed: 2 (unique lints: 1)
```

The PoC test (`brisk::audit_poc_tests::attacker_self_minted_cap_hijacks_victim_config_treasury_and_fee`) appears in the full PASS list. All 35 tests (1 new PoC + 34 pre-existing) are green.

## Per-finding result
| Finding | Result | Notes |
| --- | --- | --- |
| DB-4673 — GiftCardConfig hijack | **REPRODUCED** | Both `set_treasury` (treasury → attacker) and `set_fee` (fee → 10000 bps = 100%) succeed when called with an attacker-self-minted cap against the victim's shared config. Confirms the cap is unbound and `create_config` is open to any caller. |

## Notes
- The PoC was designed to demonstrate the attack end-to-end against a *specific* victim `GiftCardConfig` (identified as the one with `treasury == DEPLOYER`). In production, the on-chain "canonical" config is identified by the deployer off-chain; the test faithfully reproduces the same model (any caller can mint a cap, and any cap mutates any config).
- No source files outside `tests/` were modified.
- Recommended fixes (informational, not applied): bind the cap to its config (add `config: ID` to `GiftCardAdminCap` and assert equality in `set_fee`/`set_treasury`), gate `create_config` behind an explicit one-time deployer cap or `init`, or make `set_fee`/`set_treasury` private entry functions gated by the package's `UpgradeCap`.
