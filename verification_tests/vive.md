# VIVE — Verification Report

## Finding 4822 — `file::remove_file` missing registry↔project binding → cross-project authorization bypass

- **Status:** REPRODUCED (PASS)
- **Severity:** High (cross-project unauthorized deletion of victim directory entries)
- **Source location:** `sources/file.move:302-323` (`remove_file`)
- **Root cause confirmed:** `remove_file` checks `assert_perm(registry, ctx.sender(), write())` plus file↔directory binding (project_id, directory_id, name_hash) but never asserts `access::project_id(registry) == file.project_id`. Sibling functions `create_file:107-108`, `add_version:226-227`, `create_directory:121-122`, `remove_directory:170-172`, `move_file_entry:202-204` all enforce this third leg.
- **Exploit shape (verified in test):** Attacker calls permissionless `project::create_project` to obtain their own `AccessRegistry` with WRITE (via `bootstrap_grant(..., full())`), then calls `file::remove_file(&victim_file, &mut victim_dir, &attacker_registry, victim_name_hash, ctx)`. `assert_perm` passes against attacker's own registry; file/dir binding checks pass; victim's directory entry is deleted even though attacker has zero permission on the victim's project.

## Test file

`projects/vive/move/content_vault/tests/audit_poc_tests.move`

Three tests:
1. `test_poc_4822_remove_file_cross_project_auth_bypass` — the exploit. Sets up two projects; attacker removes victim's file entry using attacker's own registry. Asserts victim entry count goes 1 → 0. PASSES (bug confirmed).
2. `test_poc_4822_negative_control_owner_can_remove` — same flow with victim's own registry still works, proving the harness/signatures are correct and not accidentally failing for unrelated reasons. PASSES.
3. `test_poc_4822_create_file_enforces_project_binding` — same attack shape against `create_file` (the sibling that DOES enforce the binding). Expected to abort with `content_vault::file::EWrongProject`. PASSES — isolates the bug to `remove_file` only.

## Environment note

The package's `Move.toml` pinned `Sui` to `rev = "framework/testnet"` (commit `623521008...`), which is incompatible with the installed `sui` CLI 1.76.0 and produced `UNEXPECTED_VERIFIER_ERROR (2017)` / `MISSING_DEPENDENCY` on `sui::object` FunctionHandle 2 for EVERY test (including the pre-existing `dirsys_tests`). To get tests runnable under the provided CLI, the framework rev was changed to `framework/mainnet` in `Move.toml`. This is a manifest/config fix required to run the toolchain; no source files under `sources/` were modified.

## Final `sui move test` output

```
Running Move unit tests
[ PASS    ] content_vault::dirsys_tests::test_create_project_bootstraps_acl_and_root
[ PASS    ] content_vault::audit_poc_tests::test_poc_4822_create_file_enforces_project_binding
[ PASS    ] content_vault::audit_poc_tests::test_poc_4822_negative_control_owner_can_remove
[ PASS    ] content_vault::dirsys_tests::test_create_project_can_seed_directories_before_finalize
[ PASS    ] content_vault::dirsys_tests::test_create_subdirectory_and_file_with_versions
[ PASS    ] content_vault::audit_poc_tests::test_poc_4822_remove_file_cross_project_auth_bypass
[ PASS    ] content_vault::dirsys_tests::test_grant_revoke_access
[ PASS    ] content_vault::dirsys_tests::test_move_file_between_directories
[ PASS    ] content_vault::dirsys_tests::test_name_hash_is_project_scoped
[ PASS    ] content_vault::dirsys_tests::test_seal_approve_allows_readers
[ PASS    ] content_vault::dirsys_tests::test_seal_approve_rejects_without_read
[ PASS    ] content_vault::dirsys_tests::test_seal_approve_rejects_wrong_project_prefix
[ PASS    ] content_vault::dirsys_tests::test_utils_is_prefix
[ PASS    ] content_vault::dirsys_tests::test_write_requires_permission
Test result: OK. Total tests: 14; passed: 14; failed: 0
```

## Per-finding pass/fail

| Finding | Reproduced? | Test |
|---|---|---|
| 4822 — `remove_file` cross-project authz bypass | YES (PASS) | `test_poc_4822_remove_file_cross_project_auth_bypass` |

No findings turned out non-reproducible.
