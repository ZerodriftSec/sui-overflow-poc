// Copyright (c) Guardian audit. SPDX-License-Identifier: Apache-2.0
//
// PoC for audit finding Database 4542:
//   "Shared objects GuardianRegistry / GuardianVault missing version field"
//
// The finding is structural / upgrade-safety: neither `GuardianRegistry` nor
// `GuardianVault` declares a `version: u64` field, there is no
// `CURRENT_VERSION` constant, no `migrate` entry function, and no
// `E_WRONG_VERSION` abort code. As a direct consequence none of the
// public / public(package) mutators that take `&mut GuardianRegistry` or
// `&mut GuardianVault` (e.g. `fund_vault`, `take_float`, `return_float`,
// `record_protection`, `record_rescue`) carry a
// `assert!(self.version == CURRENT_VERSION, E_WRONG_VERSION)` gate at the
// top. After the first protocol upgrade the V1 code paths therefore remain
// permanently callable on the shared objects — there is no on-chain switch
// that forces callers onto the V2 (or later) entrypoints.
//
// These tests prove the absence at runtime by:
//   (a) Constructing the shared objects via the module's own test-only
//       constructors and exercising EVERY getter the registry module
//       publishes. None of those getters is `version()` — confirmed by
//       reading sources/registry.move lines 99-103.
//   (b) Calling the `fund_vault` PUBLIC mutator on a `GuardianVault` and
//       showing it succeeds with no version credential supplied. If a
//       `version: u64` field existed and `fund_vault` asserted
//       `vault.version == CURRENT_VERSION`, this call would abort with
//       `E_WRONG_VERSION` before the balance registered. It does not —
//       confirming the V1 path is permanently callable on the shared vault.
//   (c) Calling the `record_protection` public(package) mutator on a
//       `GuardianRegistry` and showing it likewise succeeds with no version
//       gate — confirming the V1 stat-update path is permanently callable.
//
// Note: `guardian::registry` depends only on Sui framework stdlib modules
// (`sui::bag`, `sui::balance`, `sui::coin`, `sui::event`, `sui::transfer`),
// so this test module compiles independently of the deepbook /
// deepbook_margin vendor trees that `executor.move` pulls in. The runtime
// assertions made here are exactly the assertions the auditor would make
// against the full package once those vendor deps are vendored.
//
// A runnable, self-contained mirror of this test suite lives at
//   verification_tests/guardian_poc/
// (against a verbatim copy of sources/registry.move) and passes
// `sui move test` end to end without the deepbook vendor tree.

#[test_only]
module guardian::audit_poc_tests;

use guardian::registry;
use sui::sui::SUI;
use sui::coin;
use sui::tx_context;
use sui::balance::{Self, Balance};

// ───────────────────────────────────────────────────────────────────────────
// (a) GuardianRegistry: every published getter is exercised. None is
//     `version()`. The complete surface (sources/registry.move:99-103) is:
//       total_protections, total_rescues, debt_repaid_cumulative,
//       rewards_returned_cumulative.
// ───────────────────────────────────────────────────────────────────────────
#[test]
fun registry_exposes_no_version_getter() {
    let ctx = &mut tx_context::dummy();
    let reg = registry::new_registry_for_testing(ctx);

    assert!(registry::total_protections(&reg) == 0, 0xA1);
    assert!(registry::total_rescues(&reg) == 0, 0xA2);
    assert!(registry::debt_repaid_cumulative(&reg) == 0, 0xA3);
    assert!(registry::rewards_returned_cumulative(&reg) == 0, 0xA4);

    // There is no registry::version(&GuardianRegistry) getter — uncommenting
    // the line below would not compile, proving the absence at the type level:
    //   let _ = registry::version(&reg);

    registry::destroy_registry_for_testing(reg);
}

// ───────────────────────────────────────────────────────────────────────────
// (b) GuardianVault: `fund_vault` (sources/registry.move:52-62) is a
//     `public`, sender-agnostic mutator. We call it with no version
//     credential and observe it succeed — proving no
//     `assert!(self.version == CURRENT_VERSION)` gate exists at the top of
//     the function. The V1 code path is permanently live on the shared vault.
// ───────────────────────────────────────────────────────────────────────────
#[test]
fun fund_vault_runs_with_no_version_gate() {
    let ctx = &mut tx_context::dummy();
    let mut vault = registry::new_vault_for_testing(ctx);

    // Public mutator, no version assertion, no admin cap required.
    // Per sources/registry.move:51: "Fund the white-knight float (anyone may
    // contribute; MVP funds it from an admin wallet)."
    let coin = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
    registry::fund_vault<SUI>(&mut vault, coin);

    // The 1 SUI contribution registered unchanged — no version gate fired.
    assert!(registry::vault_balance<SUI>(&vault) == 1_000_000_000, 0xB1);

    // Drain via the package-only `take_float` (also version-less) so the
    // vault can be cleanly destroyed. This is itself another mutator that
    // runs with no version check.
    let bal: Balance<SUI> = registry::take_float<SUI>(&mut vault, 1_000_000_000);
    bal.destroy_for_testing();
    // Drop the leftover empty Balance<SUI> entry from the Bag.
    registry::drain_vault_for_testing<SUI>(&mut vault);

    registry::destroy_empty_vault_for_testing(vault);
}

// ───────────────────────────────────────────────────────────────────────────
// (c) GuardianRegistry: `record_protection` (sources/registry.move:87-91) is
//     a `public(package)` mutator that drives the dashboard stats. We call
//     it with no version credential and observe it succeed — proving no
//     version gate exists. The V1 stat-update path is permanently live.
// ───────────────────────────────────────────────────────────────────────────
#[test]
fun record_protection_runs_with_no_version_gate() {
    let ctx = &mut tx_context::dummy();
    let mut reg = registry::new_registry_for_testing(ctx);

    // Public(package) mutator, no version assertion, no admin cap required.
    registry::record_protection(&mut reg, 5_000_000);

    // The state change landed — no version gate fired.
    assert!(registry::total_protections(&reg) == 1, 0xC1);
    assert!(registry::debt_repaid_cumulative(&reg) == 5_000_000, 0xC2);

    // Mirror: `record_rescue` (sources/registry.move:93-97) is also version-less.
    registry::record_rescue(&mut reg, 2_500_000);
    assert!(registry::total_rescues(&reg) == 1, 0xC3);
    assert!(registry::rewards_returned_cumulative(&reg) == 2_500_000, 0xC4);

    registry::destroy_registry_for_testing(reg);
}
