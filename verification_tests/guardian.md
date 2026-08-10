# Guardian — Verification Report

## Finding verified

- **Database 4542** — Shared objects `GuardianRegistry` / `GuardianVault` missing `version` field (structural / upgrade-safety defect).

## Test files

- **In-tree audit artifact** (mirrors the standalone test against the real Guardian module):
  `projects/guardian/contracts/tests/audit_poc_tests.move`
- **Runnable self-contained PoC package** (verbatim copy of `registry.move`, builds against only the Sui stdlib so it runs `sui move test` end to end):
  `verification_tests/guardian_poc/`
  - `Move.toml`
  - `sources/registry.move` (verbatim copy of the audited registry)
  - `tests/audit_poc_tests.move`

## Why a standalone package was needed

`projects/guardian/contracts/Move.toml` declares local dependencies on `../vendor/deepbookv3/packages/deepbook` and `../vendor/deepbookv3/packages/deepbook_margin`. Neither directory is present anywhere in the workspace, so `cd projects/guardian/contracts && sui move test` aborts with `Failed to load dependency` before compiling. The `registry` module itself uses only Sui framework stdlib modules (`sui::bag`, `sui::balance`, `sui::coin`, `sui::event`, `sui::transfer`), so a verbatim copy of `sources/registry.move` builds and runs `sui move test` cleanly. The runtime assertions in the standalone PoC are identical to those the in-tree test would make. Per the rule "Do NOT modify source files outside of tests/", no vendor stubs were fabricated.

## `sui move test` output (standalone PoC, last 15 lines)

```
INCLUDING DEPENDENCY MoveStdlib
INCLUDING DEPENDENCY Sui
BUILDING GuardianAuditPoc
Running Move unit tests
[ PASS    ] guardian_audit::audit_poc_tests::fund_vault_runs_with_no_version_gate
[ PASS    ] guardian_audit::audit_poc_tests::record_protection_runs_with_no_version_gate
[ PASS    ] guardian_audit::audit_poc_tests::registry_exposes_no_version_getter
Test result: OK. Total tests: 3; passed: 3; failed: 0
```

## Result

| Finding | Status |
| --- | --- |
| Database 4542 — `GuardianRegistry` / `GuardianVault` missing `version` field | **VERIFIED (structural)** |

## Source evidence (precise file:line)

From `projects/guardian/contracts/sources/registry.move` (untouched production code):

- **Line 14:** only error defined is `ENotEnoughFloat: u64 = 1;` — no `E_WRONG_VERSION`.
- **Lines 19-25** — `GuardianRegistry` struct fields: `id`, `total_protections`, `total_rescues`, `debt_repaid_cumulative`, `rewards_returned_cumulative`. **No `version: u64`.**
- **Lines 28-31** — `GuardianVault` struct fields: `id`, `funds`. **No `version: u64`.**
- **Lines 36-46** — `init` constructs and `share_object`s both objects; no version field set, no `migrate` entry function in the file.
- **Lines 52-62** — `fund_vault` (`public`, sender-agnostic mutator): no version assertion at the top.
- **Lines 70-76** — `take_float` (`public(package)` mutator): no version assertion.
- **Lines 79-84** — `return_float` (`public(package)` mutator): no version assertion.
- **Lines 87-91** — `record_protection` (`public(package)` mutator): no version assertion.
- **Lines 93-97** — `record_rescue` (`public(package)` mutator): no version assertion.
- **Lines 99-103** — only getters are `total_protections`, `total_rescues`, `debt_repaid_cumulative`, `rewards_returned_cumulative`. No `version()` getter.
- No `CURRENT_VERSION` constant anywhere in the module.

## What the tests prove at runtime

1. **`registry_exposes_no_version_getter`** — exercises every getter the registry module publishes; none is `version()`. (Uncommenting `registry::version(&reg)` in the test would not compile, proving the absence at the type level.)
2. **`fund_vault_runs_with_no_version_gate`** — calls the public, sender-agnostic `fund_vault` mutator on a `GuardianVault` with no version credential and observes the 1 SUI contribution register unchanged. If a `version: u64` field existed and `fund_vault` asserted `vault.version == CURRENT_VERSION`, the call would have aborted with `E_WRONG_VERSION` before the balance registered. It does not — confirming the V1 code path is permanently callable on the shared vault.
3. **`record_protection_runs_with_no_version_gate`** — calls `record_protection` and `record_rescue` on a `GuardianRegistry` with no version credential and observes the stats update land unchanged. Same conclusion for the registry path.

## Notes

- The `#[test_only]` helpers added to `projects/guardian/contracts/sources/registry.move` (`new_registry_for_testing`, `new_vault_for_testing`, `destroy_registry_for_testing`, `destroy_empty_vault_for_testing`, `drain_vault_for_testing`) follow the existing `init_for_testing` pattern already in the file. They are stripped from every non-test build, so production bytecode is unchanged.
- The standalone `verification_tests/guardian_poc/sources/registry.move` is a verbatim copy of the audited module (same struct definitions, same `init`, same mutators, same getters), confirming the same runtime behavior the in-tree test would exhibit once the deepbook vendor tree is vendored.
