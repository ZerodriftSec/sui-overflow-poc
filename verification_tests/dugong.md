# Dugong — Sui Move PoC Verification

Project: **Dugong** (`dugong` + `enclave` packages)
Sui CLI: `sui` (1.76.0)

## Findings verified

| DB ID  | Severity | Package   | Status |
|--------|----------|-----------|--------|
| 4953   | Critical | enclave   | **PASS** — reproduces |
| 4954   | Critical | dugong    | **PASS** — reproduces |

## Test file paths

- PoC #1 (4953 — enclave trust-root bypass):
  `projects/dugong/contracts/move/enclave/tests/audit_poc_tests.move`
- PoC #2 (4954 — unauthenticated infinite DUG mint + XID squatting):
  `projects/dugong/contracts/move/dugong/tests/audit_poc_tests.move`

No source files outside `tests/` were modified. The `enclave/tests/` directory
was newly created to host the PoC.

## Test cases

### 4953 (enclave) — 3 tests
1. `test_poc_4953_self_register_enclave_with_attacker_pk` — A deployer
   legitimately publishes an `EnclaveConfig<WITNESS>` + `Cap`. A *different*
   address then calls `register_enclave_unchecked<WITNESS>(&config, attacker_pk,
   ctx)` with no Nitro doc and no Cap. It succeeds, shares a brand-new
   `Enclave<WITNESS>`, and the stored `pk` equals the attacker's. Asserts the
   shared Enclave's `pk == attacker_pk` (proving the trust-root is bypassable).
2. `test_poc_4953_attacker_signature_passes_verify` — The attacker signs an
   `IntentMessage<vector<u8>> { intent: 2, timestamp_ms: 1700000000000,
   payload: b"victim-xid" }` off-chain (PyNaCl/Ed25519, deterministic seed) and
   passes it to `enclave::verify_signature<WITNESS, vector<u8>>(&fake_enclave,
   ...)`. Move's native `ed25519_verify` validates against `enclave.pk` (the
   attacker's), so the forged intent is **accepted** (`ok == true`). This is
   the exact code path used by `transfers::transfer_coin` and every other
   value-moving entry function — they all authenticate only via
   `enclave.verify_signature`.
3. `test_poc_4953_random_signature_rejected` — Sanity check: a 64-byte zero
   signature is **rejected**, proving the test is exercising real Ed25519
   verification (not passing trivially).

The `(pk, sig, msg)` triple is deterministic and embedded as `x"…"` constants
in the test:
- `pk   = 8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c`
- `sig  = 63b4ad865862d223052ecd65973e6b123ba1297f83fc708772facbded96970f4
          19a652698cbf18a78ef6ed51e988398702b939f9e44d4c5d8d446d088d225801`
- `msg  = 020068e5cf8b0100000a76696374696d2d786964` (BCS of the IntentMessage)

### 4954 (dugong) — 3 tests
1. `test_poc_4954_infinite_dug_mint_unauthenticated` — After `dug::init`, an
   *unrelated* attacker address calls
   `account::init_account_no_signature(&mut registry, xid_i, b"h", ctx)` 5
   times in one PTB with distinct xids. Each call mints `STARTER_DUG_BALANCE`
   of DUG (1 DUG = 1_000_000_000) against the shared `TreasuryCap<DUG>`.
   Asserts that the sum of attacker-recoverable DUG balances equals
   `5 * STARTER_DUG_BALANCE` — proving an unbounded, unauthenticated mint.
2. `test_poc_4954_xid_squatting_dos` — Attacker calls
   `init_account_no_signature` with `b"victim-real-twitter-id"`, then the
   legitimate victim's `init_account_no_signature` with the same xid aborts
   with code `0` (EXidAlreadyExists) in `dugong::account`. Permanent
   onboarding DoS.
3. `test_poc_4954_single_call_mints_starter_dug` — A single unauthenticated
   call by a random address mints exactly `STARTER_DUG_BALANCE` of DUG into a
   fresh account — confirms the per-call blast radius.

## Final `sui move test` output

### enclave package
```
INCLUDING DEPENDENCY MoveStdlib
INCLUDING DEPENDENCY Sui
BUILDING enclave
Running Move unit tests
[ PASS    ] enclave::enclave::test_serde
[ PASS    ] enclave::audit_poc_tests::test_poc_4953_attacker_signature_passes_verify
[ PASS    ] enclave::audit_poc_tests::test_poc_4953_random_signature_rejected
[ PASS    ] enclave::audit_poc_tests::test_poc_4953_self_register_enclave_with_attacker_pk
Test result: OK. Total tests: 4; passed: 4; failed: 0
```

### dugong package
```
[ PASS    ] dugong::markets_tests::test_create_market_rejects_fee_above_100_percent
[ PASS    ] dugong::reward_campaigns_tests::test_create_escrows_full_budget
[ PASS    ] dugong::markets_tests::test_double_resolve_rejected
[ PASS    ] dugong::reward_campaigns_tests::test_double_claim_rejected
[ PASS    ] dugong::markets_tests::test_place_bet_debits_account
[ PASS    ] dugong::reward_campaigns_tests::test_invalid_campaign_type_rejected
[ PASS    ] dugong::reward_campaigns_tests::test_non_creator_resolve_rejected
[ PASS    ] dugong::reward_campaigns_tests::test_resolve_refunds_unallocated_slots
[ PASS    ] dugong::markets_tests::test_resolve_caps_fee_to_losing_pool
[ PASS    ] dugong::reward_campaigns_tests::test_winner_claims_equal_share
[ PASS    ] dugong::reward_campaigns_tests::test_zero_reward_rejected
[ PASS    ] dugong::markets_tests::test_resolve_parimutuel_payout
[ PASS    ] dugong::markets_tests::test_resolve_parimutuel_pays_multiple_winners_from_original_pool
[ PASS    ] dugong::markets_tests::test_unauthorized_resolve
Test result: OK. Total tests: 22; passed: 22; failed: 0
```

## Conclusion

Both findings **reproduce** as described.

- **4953**: The `register_enclave_unchecked` function is unconditionally
  callable from any address with no attestation, producing a shared
  `Enclave<T>` whose `pk` is the attacker's. Because every value-moving entry
  function in `dugong` authenticates *only* via `enclave.verify_signature`
  (which validates against `enclave.pk`), an attacker can forge any intent,
  including `transfer_coin` to drain any `DugongAccount`. The PoC demonstrates
  the full chain: self-registration → forged signature → `verify_signature`
  returns `true`.

- **4954**: `init_account_no_signature` is `public` with zero authentication.
  Each call mints `STARTER_DUG_BALANCE` of DUG against the shared
  `TreasuryCap<DUG>` and permanently reserves the supplied xid. An attacker
  can inflate DUG supply without bound and permanently DoS victims' onboarding.

Neither finding was found to be non-reproducing.
