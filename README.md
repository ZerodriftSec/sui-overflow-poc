# Sui Overflow — Local PoC Verification Suite

This repository contains **local `sui move test` PoCs** for confirmed findings
in Sui Overflow audit targets whose contracts are **not deployed on Sui
mainnet** (testnet-only or pre-mainnet projects).

- **13 projects, 29 findings, all reproduced.**
- **545 unit tests pass, 0 fail, 0 false positives.**
- All PoCs run against the exact audited commit (no mainnet/testnet RPC calls
  from the test path — read-only inspection of the audited source).

## Projects in this repo

| Project | Testnet package | Repo path |
|---------|-----------------|-----------|
| brisk | `0xc90ebfadb58657be143a09342d575223681587de6eb87efe006d720edc0b6a86` | `projects/brisk/` |
| dugong | `0x920cd95df840df7b51a2fc5166254c4e0d13e1ab9d26abdfdb648fd8da8f14de` | `projects/dugong/` |
| flicky | `0x5ceae1cacbba1862e0f0c4e8861280b8a1e9530ce4049317daf5d3951778582f` | `projects/flicky/` |
| fullmetal | `0x3dfbfa5254f00a0b501ebfdf449f044340e09f0629b37dfa7d834130157dfddf` | `projects/fullmetal/` |
| guardian | `0xed5f648eaac50297498883a2c4939d399959494c3981e806a10b8962b446d7fe` | `projects/guardian/` |
| noderails | (escrow + merchant_manager packages, testnet) | `projects/noderails/` |
| paystreamer | `0x48c2c4ea663d95748ae53f3945f58433cf259b42c3aedfd62ba6a13ba4f2d38c` | `projects/paystreamer/` |
| pelagos | `0x598434be38a69bf97b70490d320a698445990de38eb36e2f4c9d41dbe1ff3e45` | `projects/pelagos/` |
| pips | `0x70d13c6597c6dec3ec1898e9455640d9362727b7c3e49b7a9325b878e9f138ce` | `projects/pips/` |
| streamline | `0x67b337d6f054594cd983a4490a5f346900caf09db0e334d349b2a9babcbd2811` | `projects/streamline/` |
| suioutkit | `0x8c029c23e67a08bccec01c46dda9bb66a48eda8b72519dba3ca28504a4ddd507` | `projects/suioutkit/` |
| vive | `0x76f3e481bf63aa2ce148a46bc93038fa7153d83c1d87161876fcdeb70937916a` | `projects/vive/` |
| yosuku | `0x0e95b8ccc8171c09f556b4ce10dfb90c207b0025f794685650bd6a2e43ac8a42` | `projects/yosuku/` |

## Findings reproduced

29 findings across the 13 projects (8 critical, 11 high direct-fund-loss;
remainder are LP-vs-LP, structural, or DoS). All reproduced via `sui move test`.

## Per-project PoC test map

### brisk — `move/`
| Finding | PoC test | File |
|---------|----------|------|
| 4673 (Critical) — GiftCardConfig hijack | `attacker_self_minted_cap_hijacks_victim_config_treasury_and_fee` | `tests/audit_poc_tests.move` |

### dugong — `contracts/move/dugong/` + `contracts/move/enclave/`
| Finding | PoC test | File |
|---------|----------|------|
| 4953 (Critical) — Enclave trust-root bypass | `test_poc_4953_self_register_enclave_with_attacker_pk`, `test_poc_4953_attacker_signature_passes_verify`, `test_poc_4953_random_signature_rejected` | `enclave/tests/audit_poc_tests.move` |
| 4954 (Critical) — Infinite DUG mint + XID squat | `test_poc_4954_infinite_dug_mint_unauthenticated`, `test_poc_4954_xid_squatting_dos`, `test_poc_4954_single_call_mints_starter_dug` | `dugong/tests/audit_poc_tests.move` |

### flicky — `apps/contracts/` + `apps/contracts/swap/`
| Finding | PoC test | File |
|---------|----------|------|
| 4982 (Critical) — swap LP cross-pool drain | `poc_4982_cross_pool_lp_drain` | `swap/tests/audit_poc_tests.move` |
| 4983 (Critical) — record_swipe unbounded quantity | `poc_4983_unbounded_quantity_decides_winner` | `tests/audit_poc_tests.move` |
| 4984 (Critical) — settle_card caller picks winner | `poc_4984_settle_card_accepts_attacker_price` | `tests/audit_poc_tests.move` |
| 4985 (Critical) — finalize_test_one_price dev backdoor | `poc_4985_finalize_test_one_price_steals_pot` | `tests/audit_poc_tests.move` |
| 4986 (High) — AccountWrapper not bound | `poc_4986_bogus_wrapper_zeros_victim_payout` | `tests/audit_poc_tests.move` |

### fullmetal — `contracts/`
| Finding | PoC test | File |
|---------|----------|------|
| 4696 (High) — otc im_each=0 bypasses book_size | `poc_4696_zero_im_open_bypasses_book_size_and_drains_treasury` | `tests/audit_poc_tests.move` |
| 4698 (High) — Oracle no staleness check | `poc_4698_oracle_price_has_no_staleness_check` | `tests/audit_poc_tests.move` |
| 4714 (Critical) — rehypo borrow_receipt no auth | `poc_4714_borrow_receipt_has_no_access_control` | `tests/audit_poc_tests.move` |

### guardian — `contracts/` + standalone `verification_tests/guardian_poc/`
| Finding | PoC test | File |
|---------|----------|------|
| 4542 (High) — no version field on shared objects | `registry_exposes_no_version_getter`, `fund_vault_runs_with_no_version_gate`, `record_protection_runs_with_no_version_gate` | `tests/audit_poc_tests.move` (also runnable in standalone `guardian_poc/`) |

### noderails — `noderails-sui/packages/noderails_escrow/` + `noderails_merchant_manager/`
| Finding | PoC test | File |
|---------|----------|------|
| 4715 (Critical) — EscrowConfig forgeable | `poc_4715_forge_config_and_drain_victim_wallet`, `poc_4715_negative_control_real_config_rejects_attacker_sig` | `noderails_escrow/tests/audit_poc_tests.move` |
| 4716 (High) — merchant_manager RoleRecord forgeable | `poc_4716_attacker_forges_role_and_calls_execute_payout`, `poc_4716_negative_control_bad_session_sig_aborts` | `noderails_merchant_manager/tests/audit_poc_tests.move` |

### paystreamer — `move/subscriptions/` + `move/stablecoin/`
| Finding | PoC test | File |
|---------|----------|------|
| 4517 (Critical) — AccountCap forgeable | `poc_forge_account_cap_and_drain`, `poc_negative_control_depositor_cap_cannot_withdraw` | `subscriptions/tests/audit_poc_tests.move` |
| 4518 (High) — PUSD TreasuryCap shared | `poc_attacker_mints_unauthorized`, `poc_only_zero_amount_is_checked` | `stablecoin/tests/pusd_audit_poc_tests.move` |

### pelagos — `pelagos_strategies/`
| Finding | PoC test | File |
|---------|----------|------|
| 4894 (High) — structured_note waterfall | `poc_waterfall_breaks_principal_protection` | `tests/audit_poc_tests.move` |

### pips — `contracts/predict/`
| Finding | PoC test | File |
|---------|----------|------|
| 5019 (High) — LP shares priced at stale total_mtm | `vault_value_uses_cached_total_mtm`, `supply_mints_shares_off_stale_vault_value` | `tests/audit_poc_tests.move` |

### streamline — `contracts/`
| Finding | PoC test | File |
|---------|----------|------|
| 4762 (Critical) — register accepts arbitrary commitment | `poc_4762_register_accepts_arbitrary_commitment`, `poc_4762_multiple_attackers_register_distinct_commitments` | `tests/audit_poc_tests.move` |
| 4763 (Critical) — self-transfer doubles hidden balance | `poc_4763_self_transfer_reaches_verifier_not_assertion` | `tests/audit_poc_tests.move` |
| 4765 (Critical) — collateral borrow no ownership check | `poc_4765_unauthorized_borrow_against_victim_stream`, `poc_4765_repeatable_pledge_across_pools` | `tests/audit_poc_tests.move` |

### suioutkit — `contracts/suioutkit/`
| Finding | PoC test | File |
|---------|----------|------|
| 4915 (Critical) — settle_fiat no auth | `poc_4915_settle_fiat_no_auth_drains_treasury` | `tests/audit_poc_tests.move` |
| 4916 (High) — mint_suioutkit_receipt forged fields | `poc_4916_mint_receipt_with_forged_fields` | `tests/audit_poc_tests.move` |

### vive — `move/content_vault/`
| Finding | PoC test | File |
|---------|----------|------|
| 4822 (High) — remove_file missing project binding | `test_poc_4822_remove_file_cross_project_auth_bypass`, `test_poc_4822_negative_control_owner_can_remove`, `test_poc_4822_create_file_enforces_project_binding` | `tests/audit_poc_tests.move` |

### yosuku — `contracts/core/` + `contracts/leverage-pkg/` + `contracts/parlay624-pkg/`
| Finding | PoC test | File |
|---------|----------|------|
| 4417 (Critical) — vault idle drain (ticket not by-value) | `poc_4417_double_spend_one_ticket`, `poc_4417_unbounded_replay_one_ticket` | `core/tests/audit_poc_4417_tests.move` |
| 4418 (Critical) — leverage drain lending_pool | `poc_4418_one_cycle_drains_borrowed_amount`, `poc_4418_repeated_cycle_drains_pool_to_zero` | `leverage-pkg/tests/audit_poc_4418_tests.move` |
| 4419 (Critical) — MarketAdminCap public mint | `poc_4419_transferred_cap_drains_stranger_listing_fees`, `poc_4419_public_create_market_then_drain` | `core/tests/audit_poc_4419_tests.move` |
| 4421 (High) — book_payout no auth | `poc_4421_dust_book_payout_force_closes_leg_and_trips_breaker`, `poc_4421_donated_proceeds_inflates_nav` | `core/tests/audit_poc_4421_tests.move` |
| 4425 (High) — parlay self-reported prob | `poc_4425_self_reported_low_prob_yields_near_min_floor`, `poc_4425_chain_records_opener_supplied_combined_prob_unchanged` | `parlay624-pkg/tests/audit_poc_4425_tests.move` |

## Run all PoCs

```sh
for d in \
  brisk/move \
  dugong/contracts/move/dugong \
  dugong/contracts/move/enclave \
  flicky/apps/contracts \
  flicky/apps/contracts/swap \
  fullmetal/contracts \
  guardian/contracts \
  noderails/noderails/noderails-sui/packages/noderails_escrow \
  noderails/noderails/noderails-sui/packages/noderails_merchant_manager \
  paystreamer/move/subscriptions \
  paystreamer/move/stablecoin \
  pelagos/pelagos_strategies \
  pips/contracts/predict \
  streamline/contracts \
  suioutkit/contracts/suioutkit \
  vive/move/content_vault \
  yosuku/contracts/core \
  yosuku/contracts/leverage-pkg \
  yosuku/contracts/parlay624-pkg
do
  (cd "projects/$d" && sui move test 2>&1 | tail -3)
done
```

`sui` CLI 1.76.0.

## Layout

```
projects/<project>/...          # Source code at the audited commit (read-only)
  └── tests/audit_poc_*.move    # PoC test file(s) — one or more per package
verification_tests/
  ├── MATRIX.md                 # Per-finding matrix + run commands
  ├── guardian_poc/             # Standalone package for guardian (see guardian.md)
  └── <project>.md              # 13 per-project detailed reports
```

## Methodology

Each PoC falls into one of three categories:

1. **Runtime exploit (most findings)** — a `#[test]` that exercises the buggy
   entry function from an attacker address and asserts the exploit side-effect.
2. **Negative control (several findings)** — a paired `#[expected_failure]`
   test that proves the only thing stopping the exploit is the missing check.
3. **Structural proof (1 version-field finding — guardian)** — a `#[test]`
   that walks the public getter surface of the shared objects and confirms
   no `version` field exists.
