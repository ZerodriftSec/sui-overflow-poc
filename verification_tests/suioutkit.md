# SuiOutKit — Local PoC Verification

Project: `suioutkit`
Package root: `projects/suioutkit/contracts/suioutkit/`
sui CLI: `/Users/chris/.local/bin/sui` (1.76.0-6effb4523834)

## Findings verified

| DB ID   | Severity | Title                                                                  | Status |
|---------|----------|------------------------------------------------------------------------|--------|
| 4915    | Critical | `checkout::settle_fiat<T>` has no caller auth — anyone drains operator Treasury | REPRODUCED |
| 4916    | High     | `checkout::mint_suioutkit_receipt` ignores the consumed `PaymentReceipt`, mints forged `SuiOutKitReceipt` from caller-supplied fields | REPRODUCED |

## Test file

`projects/suioutkit/contracts/suioutkit/tests/audit_poc_tests.move`

Two `#[test]` functions:

- `poc_4915_settle_fiat_no_auth_drains_treasury`
  - Bootstraps the shared `Treasury` (via `treasury::init_for_testing`) and the payment_kit `Namespace`, then OPERATOR funds the Treasury with 1_000 SUI (1_000_000_000 MIST) via the legitimate `treasury::deposit` path using `TreasuryAdminCap`.
  - OPERATOR creates the fiat `PaymentRegistry` via `suioutkit::setup::create_fiat_registry`.
  - ATTACKER (`@0xDEAD` — no caps, no role, never the deployer) then issues a tx that references the shared `Treasury` and `PaymentRegistry` and calls the public `checkout::settle_fiat<SUI>(&mut treasury, &mut registry, 1_000_000_000, ATTACKER, "attacker-poc-nonce-4915", "walrus-fake-blob-4915", &clock, ctx)`.
  - Assertions:
    - pre-balance == 1_000_000_000
    - post-balance == 0 (Treasury fully drained)
    - on a follow-up ATTACKER tx, the `Coin<SUI>` of value 1_000_000_000 is taken from ATTACKER's inventory and burned
    - forged `SuiOutKitReceipt.merchant == ATTACKER`, `amount == 1_000_000_000`
  - Demonstrates: a `public` entrypoint with only `merchant != @0x0`, `amount > 0`, and `walrus_blob_id != ""` guards plus a `public(package)` `treasury::release` reachable through it = full vault drain by any address.

- `poc_4916_mint_receipt_with_forged_fields`
  - Mints a legitimate `PaymentReceipt` via `payment_kit::process_ephemeral_payment<SUI>` encoding `nonce="real-nonce"`, `payment_amount=1_000_000`, `receiver=MERCHANT`, `coin_type=0x2::sui::SUI`.
  - Feeds that real receipt into `checkout::mint_suioutkit_receipt` along with completely fabricated fields: `merchant=VICTIM_MERCHANT (@0xFACE)`, `amount=999_999_999_999`, `nonce="completely-fabricated-nonce"`, `method="sui_native"`, `walrus_blob_id="walrus-fake-blob-4916"`.
  - Asserts every field of the resulting `SuiOutKitReceipt` reflects the forged values, not the consumed receipt's values.
  - Demonstrates: the `_payment_receipt` parameter is structurally dropped (underscore prefix in `sources/checkout.move:145`); every receipt field is caller-supplied and the emitted `PaymentSettled` event carries the forged values.

## Final `sui move test` output (last 15 lines)

```
Running Move unit tests
[ PASS    ] suioutkit::checkout_tests::test_mint_suioutkit_receipt_success
[ PASS    ] suioutkit::audit_poc_tests::poc_4915_settle_fiat_no_auth_drains_treasury
[ PASS    ] suioutkit::audit_poc_tests::poc_4916_mint_receipt_with_forged_fields
[ PASS    ] suioutkit::checkout_tests::test_settle_fiat_success
[ PASS    ] suioutkit::checkout_tests::test_setup_helpers
[ PASS    ] suioutkit::checkout_tests::test_setup_registries_success
[ PASS    ] suioutkit::checkout_tests::test_treasury_deposit_and_balance
[ PASS    ] suioutkit::checkout_tests::test_treasury_insufficient_aborts
[ PASS    ] suioutkit::checkout_tests::test_treasury_withdraw
Test result: OK. Total tests: 9; passed: 9; failed: 0
Total number of linter warnings suppressed: 4 (unique lints: 1)
```

9/9 tests pass (7 pre-existing + 2 new PoCs).

## Notes / environment

- The package manifest originally declared the payment_kit dependency via `r.mvr = "@mysten/payment-kit"`, which requires the Move Version Resolver (`mvr`) CLI. The `mvr` resolver is not bundled with `sui` 1.76.0 in this environment and could not be installed (cargo's `mvr` crate is an unrelated "Move Refactoring" tool). To make `sui move test` runnable locally, the dependency was rewritten to a pinned git source using the rev already recorded in `Move.lock` (`fb114ae4be27fb712354c1a3056795209c2c4017`). Only `Move.toml` and `tests/audit_poc_tests.move` were modified — no production source files were touched.
- Both findings reproduce cleanly with no source modification required.
