# Streamline verification tests

**Project:** streamline
**Package:** `/Users/chris/Documents/Codex/2026-08-07/https-audit-zerodrift-xyz-sessions-https/outputs/sui-overflow-local-verification/projects/streamline/contracts/`
**Test file:** `tests/audit_poc_tests.move`
**Sui CLI:** `/Users/chris/.local/bin/sui` (1.76.0)
**Command:** `cd <pkg> && sui move test`

## Findings verified

| DB ID  | Severity | Status | PoC test(s)                                                                              |
|--------|----------|--------|------------------------------------------------------------------------------------------|
| 4762   | Critical | PASS   | `poc_4762_register_accepts_arbitrary_commitment`, `poc_4762_multiple_attackers_register_distinct_commitments` |
| 4763   | Critical | PASS   | `poc_4763_self_transfer_reaches_verifier_not_assertion`                                  |
| 4765   | Critical | PASS   | `poc_4765_unauthorized_borrow_against_victim_stream`, `poc_4765_repeatable_pledge_across_pools` |

## Final `sui move test` output (last 15 lines)

```
[ PASS    ] streamline::confidential_balance_tests::transfer_with_wrong_new_commitment_aborts
[ PASS    ] streamline::audit_poc_tests::poc_4762_multiple_attackers_register_distinct_commitments
[ PASS    ] streamline::audit_poc_tests::poc_4762_register_accepts_arbitrary_commitment
[ PASS    ] streamline::audit_poc_tests::poc_4763_self_transfer_reaches_verifier_not_assertion
[ PASS    ] streamline::audit_poc_tests::poc_4765_repeatable_pledge_across_pools
[ PASS    ] streamline::audit_poc_tests::poc_4765_unauthorized_borrow_against_victim_stream
[ PASS    ] streamline::giftcard_tests::create_hides_amount_in_vault
[ PASS    ] streamline::giftcard_tests::non_sender_cannot_cancel
[ PASS    ] streamline::confidential_stream_tests::confidential_v2_secrets_and_milestone_review
[ PASS    ] streamline::confidential_stream_tests::drip_paused_during_review_aborts
[ PASS    ] streamline::confidential_stream_tests::drip_with_wrong_commitment_aborts
[ PASS    ] streamline::confidential_stream_tests::raise_by_non_freelancer_aborts
[ PASS    ] streamline::confidential_stream_tests::seal_approve_denies_foreign_identity
[ PASS    ] streamline::confidential_stream_tests::seal_approve_grants_own_wallet_identity
Test result: OK. Total tests: 51; passed: 51; failed: 0
```

Filtering to audit_poc_tests only:
```
Running Move unit tests
[ PASS    ] streamline::audit_poc_tests::poc_4762_multiple_attackers_register_distinct_commitments
[ PASS    ] streamline::audit_poc_tests::poc_4762_register_accepts_arbitrary_commitment
[ PASS    ] streamline::audit_poc_tests::poc_4763_self_transfer_reaches_verifier_not_assertion
[ PASS    ] streamline::audit_poc_tests::poc_4765_repeatable_pledge_across_pools
[ PASS    ] streamline::audit_poc_tests::poc_4765_unauthorized_borrow_against_victim_stream
Test result: OK. Total tests: 5; passed: 5; failed: 0
```

## Per-finding notes

### 4762 - `register` accepts arbitrary commitment (Critical) - REPRODUCED
`confidential_balance::register<T>` is `public`, takes `&mut ConfidentialPool<T>` (shared), and asserts only
`assert_scalar(&commitment)` (32-byte length) + `!pool.balances.contains(owner)`. No proof, no deposit, no
signature. Two tests demonstrate the gap:

- Attacker (unrelated address) calls `register(pool, attacker_chosen_commitment, ctx)` on a pool whose reserve
  was seeded via legitimate `wrap` by another user. The call succeeds and stores the attacker-controlled
  commitment under their address - exactly the only precondition `unwrap` checks (account existence).
- A second attacker registers a distinct commitment on the same pool - both succeed.

Since `unwrap` trusts the stored commitment and the registrant constructed it, they trivially know the opening
value; the only remaining hurdle is producing a Groth16 `unwrap` proof for that commitment, which is offline
work (out of scope for unit tests but mechanically straightforward for a registrant who knows the witness).

### 4763 - `confidential_transfer` accepts `from == to` (Critical) - REPRODUCED
`confidential_balance::confidential_transfer` has no `assert!(from != to)`. PoC seeds an attacker account via
`wrap`, then calls `confidential_transfer(pool, ATTACKER, ATTACKER, c_new_from, c_new_to, proof)`. With
`#[expected_failure(abort_code = EProofInvalid)]`, the test confirms the call DOES NOT abort at any
hypothetical `ESelfTransfer` assertion - it reaches the verifier (downstream of where the missing guard would
live) and only fails there because the test's hardcoded proof is computed for the legit Alice->Bob witness.

In production, an attacker who knows the witness (they wrapped the funds themselves, so they know the opening)
computes a valid `transfer.circom` proof for the self-transfer case. Conservation `2V == (V-d)+(V+d)` holds, so
the proof verifies; the post-state write stores `new_to` (= `V+d`) for the single account key, doubling the
hidden balance. The PoC stops at demonstrating the missing assertion; end-to-end draining also requires `unwrap`
of `2V` against a pool with `reserve >= 2V`.

### 4765 - `collateral::borrow` no ownership check / no lien (Critical) - REPRODUCED
`collateral::borrow<T>` takes `s: &Stream<T>` (immutable shared ref) and asserts only `is_dripping(s)` and
`principal <= present_value(s)`. It never checks `ctx.sender() == s.freelancer`. Two tests:

- An unrelated ATTACKER borrows the full present value (180 SUI = 200 * 90%) against VICTIM_FREELANCER's
  dripping stream. The call succeeds; attacker receives 180 SUI; pool reserve drops by 180 SUI. The attacker
  also receives a freely-transferable `LoanReceipt` (key, store) that never touches the stream again.
- Repeatable pledge: the SAME victim stream is borrowed against from a SECOND pool. `present_value(s)` is
  unchanged between the two borrows (no lien was recorded on the stream), so the attacker extracts `pv` from
  each pool. Net extraction = `pv * num_pools`; every pool becomes insolvent.

`repay` does not touch the stream and there is no liquidation path - the loan can simply be shelved (defaulted
on) without consequence to the attacker.

## Findings that did NOT reproduce
None. All three findings reproduce as described.

## Scope notes
- Source files outside `tests/` were not modified.
- Real Groth16 proof generation for arbitrary attacker-chosen commitments is out of scope for unit tests; the
  PoCs stop at the assertion gap that constitutes each bug (registration gate / self-transfer guard / ownership
  check) and use the production verifier path (`sui::groth16::bn254`) with the legit test fixtures where
  applicable to keep the on-chain code paths exercised.
