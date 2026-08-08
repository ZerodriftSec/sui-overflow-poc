# Sui Overflow (Non-mainnet) — Local Verification Matrix

Live status of `sui move test` PoCs for every human-confirmed finding on a
contract that is NOT deployed to Sui mainnet (testnet-only or pre-deployment).

## Summary

| Status | Count |
|--------|-------|
| ✅ Verified (PoC passes) | **29** |
| ⏳ In progress | 0 |
| ❌ Disproved | 0 |
| **Total non-mainnet findings** | **29 (across 13 projects)** |

## Per-finding matrix

| Project | DB ID | Severity | Status | PoC test |
|---------|-------|----------|--------|----------|
| brisk | 4673 | Critical | ✅ | `attacker_self_minted_cap_hijacks_victim_config_treasury_and_fee` |
| dugong | 4953 | Critical | ✅ | `test_poc_4953_self_register_enclave_with_attacker_pk` + 2 more |
| dugong | 4954 | Critical | ✅ | `test_poc_4954_infinite_dug_mint_unauthenticated` + XID squat test |
| flicky | 4982 | Critical | ✅ | `swap::poc_4982_cross_pool_lp_drain` |
| flicky | 4983 | Critical | ✅ | `poc_4983_unbounded_quantity_decides_winner` |
| flicky | 4984 | Critical | ✅ | `poc_4984_settle_card_accepts_attacker_price` |
| flicky | 4985 | Critical | ✅ | `poc_4985_finalize_test_one_price_steals_pot` |
| flicky | 4986 | High | ✅ | `poc_4986_bogus_wrapper_zeros_victim_payout` |
| fullmetal | 4696 | High | ✅ | `poc_4696_zero_im_open_bypasses_book_size_and_drains_treasury` |
| fullmetal | 4698 | High | ✅ | `poc_4698_oracle_price_has_no_staleness_check` |
| fullmetal | 4714 | Critical | ✅ | `poc_4714_borrow_receipt_has_no_access_control` |
| guardian | 4542 | High | ✅ (structural) | `registry_exposes_no_version_getter` + 2 mutators |
| noderails | 4715 | Critical | ✅ | `poc_4715_forge_config_and_drain_victim_wallet` |
| noderails | 4716 | High | ✅ | `poc_4716_attacker_forges_role_and_calls_execute_payout` |
| paystreamer | 4517 | Critical | ✅ | `poc_forge_account_cap_and_drain` |
| paystreamer | 4518 | High | ✅ | `poc_attacker_mints_unauthorized` |
| pelagos | 4894 | High | ✅ | `poc_waterfall_breaks_principal_protection` |
| pips | 5019 | High | ✅ | `supply_mints_shares_off_stale_vault_value` |
| streamline | 4762 | Critical | ✅ | `poc_4762_register_accepts_arbitrary_commitment` |
| streamline | 4763 | Critical | ✅ | `poc_4763_self_transfer_reaches_verifier_not_assertion` |
| streamline | 4765 | Critical | ✅ | `poc_4765_unauthorized_borrow_against_victim_stream` |
| suioutkit | 4915 | Critical | ✅ | `poc_4915_settle_fiat_no_auth_drains_treasury` |
| suioutkit | 4916 | High | ✅ | `poc_4916_mint_receipt_with_forged_fields` |
| vive | 4822 | High | ✅ | `test_poc_4822_remove_file_cross_project_auth_bypass` |
| yosuku | 4417 | Critical | ✅ | `poc_4417_double_spend_one_ticket` + replay test |
| yosuku | 4418 | Critical | ✅ | `poc_4418_one_cycle_drains_borrowed_amount` |
| yosuku | 4419 | Critical | ✅ | `poc_4419_public_create_market_then_drain` |
| yosuku | 4421 | High | ✅ | `poc_4421_dust_book_payout_force_closes_leg_and_trips_breaker` |
| yosuku | 4425 | High | ✅ | `poc_4425_self_reported_low_prob_yields_near_min_floor` |

## Per-project test runs

| Project | Package | Tests | Pass | Fail |
|---------|---------|-------|------|------|
| brisk | `move/` | 35 | 35 | 0 |
| dugong | `contracts/move/dugong/` | 22 | 22 | 0 |
| dugong | `contracts/move/enclave/` | 4 | 4 | 0 |
| flicky | `apps/contracts/` (main) | 33 | 33 | 0 |
| flicky | `apps/contracts/swap/` | 1 | 1 | 0 |
| fullmetal | `contracts/` | 46 | 46 | 0 |
| guardian | `verification_tests/guardian_poc/` (standalone) | 3 | 3 | 0 |
| noderails | `noderails_escrow/` | 5 | 5 | 0 |
| noderails | `noderails_merchant_manager/` | 2 | 2 | 0 |
| paystreamer | `move/subscriptions/` | 62 | 62 | 0 |
| paystreamer | `move/stablecoin/` | 6 | 6 | 0 |
| pelagos | `pelagos_strategies/` | 4 | 4 | 0 |
| pips | `contracts/predict/` | 36 | 36 | 0 |
| streamline | `contracts/` | 51 | 51 | 0 |
| suioutkit | `contracts/suioutkit/` | 9 | 9 | 0 |
| vive | `move/content_vault/` | 14 | 14 | 0 |
| yosuku | `contracts/core/` | 41 | 41 | 0 |
| yosuku | `contracts/leverage-pkg/` | 63 | 63 | 0 |
| yosuku | `contracts/parlay624-pkg/` | 8 | 8 | 0 |
| **TOTALS** | | **445** | **445** | **0** |

## Severity breakdown (29 non-mainnet findings)

| Severity | Count | Reproduced |
|----------|-------|------------|
| Critical | 17 | 17 ✅ |
| High | 12 | 12 ✅ |

## How to reproduce any PoC

Each PoC lives inside the corresponding project's `tests/` directory under
`projects/<project>/...`. To run all PoCs for a single project:

```sh
cd projects/<project>/<path-to-package>
/Users/chris/.local/bin/sui move test
```

## Environment adjustments (no production source modified)

- **vive**: `Move.toml` framework rev pinned to `framework/testnet` was incompatible with `sui` 1.76.0; changed to `framework/mainnet`. Affects only manifest, no `.move` source files.
- **guardian**: in-tree `Move.toml` declares missing local vendor deps (`deepbookv3`). A verbatim copy of `registry.move` was placed in `verification_tests/guardian_poc/` so the test can run end-to-end against only the Sui stdlib.
- **suioutkit**: `Move.toml` used MVR CLI (`@mysten/payment-kit`), unavailable in sandbox; manifest dep line rewritten to a pinned git source using the rev already recorded in `Move.lock`.
- **fullmetal**: tests require the same `deepbook-strip` workaround as the project's `run-tests.sh`.
- **flicky**: one compile-time fix in PoC test (`scenario.return_to_address` → `ts::return_to_address`).
