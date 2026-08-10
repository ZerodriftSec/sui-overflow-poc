/// Confidential streaming lifecycle, every amount hidden and every transition
/// gated by an on-chain Groth16 proof: client opens a $500 stream (amount bound
/// to a hidden commitment), a keeper drips a hidden $125 to the freelancer, the
/// freelancer claims $125 — reserve $500 → $375 — with no amount on chain except
/// the claimed value at cash-out.
#[test_only]
#[allow(implicit_const_copy)]
module streamline::confidential_stream_tests;

use streamline::stream::{Self, ConfidentialStream};
use sui::clock;
use sui::coin;
use sui::test_scenario as ts;

public struct TESTUSDC has drop {}

const CLIENT: address = @0xC11;
const FREELANCER: address = @0xF12;

const C_REMAINING_OLD: vector<u8> = x"596ab085862e0366f42e04de276f2b77725fb116487c2b1977efb7f72c999805";
const C_REMAINING_NEW: vector<u8> = x"f5ba88dc63b63544bd3eaad79b0e36436ca59465133cd43c5e0fdd8b37c3b526";
const C_EARNED_OLD: vector<u8> = x"1ba50e3c7d82093591b1b072c7654c43b8a397ec4a501742199d633486bf851b";
const C_EARNED_NEW: vector<u8> = x"ea3eb9e586671966f301a7e537ce80962d613d68b63f5da10a833d848383322f";

const WRAP_PROOF: vector<u8> = x"4f6cf555097020f2c629344d0fa18129cf23bc0e02b654e3f66aacb6a547808376070b8cfa42db74e1a19cf807bb62f4bdc203fab13cb9aa84c9c50561b0be1124b4b81d55697e8256682367eeadc6b343f2bfd8adbeeadc5575aa5ab94b9d8a01ac5f3b129f9a062ed43aff13d0958485eba209f15ee6f7ea61b2dc1e23e015";
const TRANSFER_PROOF: vector<u8> = x"48c62568cba82168ed2beb542ebe655de3998b87b6011aa7e5c4c3dbd30c6f27fd6f8c58d846dd7a44eb571d894f02d63e012f4a2ebace0f822d0b5e3678432e465fc57cb724eb4b63e672584b1a684f0bd88350e1513a152cbb7e69b96814a8e519abb893256bf394fd83f296d5c778abf99d25b4e5bbc55125c5b603824f11";
const UNWRAP_PROOF: vector<u8> = x"e0be2f8f40f1bdecc6c256098c62996f4fcef0eead822c628877d0c952c97822efcc2275181181e37cc34ee7ef04dd418fd3a9a0bfd61ff82c9cc64c0f3f330d8294a4ba145ed52c254e961293c9ded8e43d1d7827c428072fc4418e9886bf23157d6a9b12a5b98b3d44b2abeb66aa42fc7f715225ada889d5bd7b57d10041ae";

#[test]
fun confidential_stream_lifecycle() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(sc.ctx());

    // --- Client opens a confidential $500 / 4-milestone stream ---
    let payment = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    stream::create_confidential_stream(
        payment,
        FREELANCER,
        4,
        C_REMAINING_OLD,
        WRAP_PROOF,
        C_EARNED_OLD,
        48 * 60 * 60 * 1000,
        sc.ctx(),
    );

    // --- Keeper drips a hidden $125 ---
    sc.next_tx(CLIENT);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    assert!(stream::conf_reserve(&s) == 500_000_000, 0);
    stream::confidential_drip(&mut s, C_REMAINING_NEW, C_EARNED_NEW, TRANSFER_PROOF, &clk);
    assert!(stream::conf_remaining_commitment(&s) == C_REMAINING_NEW, 1);
    assert!(stream::conf_earned_commitment(&s) == C_EARNED_NEW, 2);
    ts::return_shared(s);

    // --- Freelancer claims $125 ---
    sc.next_tx(FREELANCER);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    let out = stream::claim(&mut s, 125_000_000, UNWRAP_PROOF, C_EARNED_OLD, sc.ctx());
    assert!(out.value() == 125_000_000, 3);
    assert!(stream::conf_reserve(&s) == 375_000_000, 4);
    coin::burn_for_testing(out);
    ts::return_shared(s);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun confidential_v2_secrets_and_milestone_review() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(sc.ctx());

    // --- Create with a Seal ciphertext attached ---
    let payment = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    stream::create_confidential_stream_v2(
        payment,
        FREELANCER,
        4,
        C_REMAINING_OLD,
        WRAP_PROOF,
        C_EARNED_OLD,
        48 * 60 * 60 * 1000,
        b"seal-ciphertext-v1",
        sc.ctx(),
    );

    sc.next_tx(CLIENT);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    assert!(stream::conf_encrypted_secrets(&s) == b"seal-ciphertext-v1", 0);
    assert!(stream::conf_current_milestone(&s) == 0, 1);

    // --- Drip v2 rotates the blindings and the ciphertext atomically ---
    stream::confidential_drip_v2(
        &mut s,
        C_REMAINING_NEW,
        C_EARNED_NEW,
        TRANSFER_PROOF,
        b"seal-ciphertext-v2",
        &clk,
    );
    assert!(stream::conf_encrypted_secrets(&s) == b"seal-ciphertext-v2", 2);
    ts::return_shared(s);

    // --- Freelancer raises the milestone: drips pause for review ---
    sc.next_tx(FREELANCER);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    stream::conf_raise_completion(&mut s, &clk, sc.ctx());
    assert!(stream::conf_state(&s) == 1, 3); // PENDING_REVIEW
    assert!(stream::review_deadline(&s) == 48 * 60 * 60 * 1000, 4);
    ts::return_shared(s);

    // --- Client approves via the cap: dripping resumes, milestone advances ---
    sc.next_tx(CLIENT);
    let cap = sc.take_from_sender<stream::StreamCap>();
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    stream::conf_approve_milestone(&cap, &mut s);
    assert!(stream::conf_state(&s) == 2, 5); // DRIPPING
    assert!(stream::conf_current_milestone(&s) == 1, 6);
    assert!(stream::review_deadline(&s) == 0, 7);

    // --- Freelancer re-encrypts secrets out of band ---
    sc.next_tx(FREELANCER);
    stream::update_confidential_secrets(&mut s, b"seal-ciphertext-v3", sc.ctx());
    assert!(stream::conf_encrypted_secrets(&s) == b"seal-ciphertext-v3", 8);
    ts::return_shared(s);
    ts::return_to_address(CLIENT, cap);

    // --- Silence auto-approves after the deadline ---
    sc.next_tx(FREELANCER);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    stream::conf_raise_completion(&mut s, &clk, sc.ctx());
    clk.increment_for_testing(48 * 60 * 60 * 1000 + 1);
    stream::conf_auto_approve(&mut s, &clk);
    assert!(stream::conf_state(&s) == 2, 9);
    assert!(stream::conf_current_milestone(&s) == 2, 10);
    ts::return_shared(s);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure]
fun drip_paused_during_review_aborts() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(sc.ctx());

    let payment = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    stream::create_confidential_stream(
        payment, FREELANCER, 4, C_REMAINING_OLD, WRAP_PROOF, C_EARNED_OLD,
        48 * 60 * 60 * 1000, sc.ctx(),
    );

    sc.next_tx(FREELANCER);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    stream::conf_raise_completion(&mut s, &clk, sc.ctx());
    // Dripping while a milestone awaits review must abort.
    stream::confidential_drip(&mut s, C_REMAINING_NEW, C_EARNED_NEW, TRANSFER_PROOF, &clk);
    ts::return_shared(s);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
#[expected_failure]
fun raise_by_non_freelancer_aborts() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(sc.ctx());

    let payment = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    stream::create_confidential_stream(
        payment, FREELANCER, 4, C_REMAINING_OLD, WRAP_PROOF, C_EARNED_OLD,
        48 * 60 * 60 * 1000, sc.ctx(),
    );

    sc.next_tx(CLIENT);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    stream::conf_raise_completion(&mut s, &clk, sc.ctx());
    ts::return_shared(s);

    clock::destroy_for_testing(clk);
    sc.end();
}

#[test]
fun seal_approve_grants_own_wallet_identity() {
    let mut sc = ts::begin(FREELANCER);
    stream::seal_approve_for_testing(sui::address::to_bytes(FREELANCER), sc.ctx());
    sc.end();
}

#[test]
#[expected_failure]
fun seal_approve_denies_foreign_identity() {
    let mut sc = ts::begin(CLIENT);
    // CLIENT asking for the freelancer's identity must be denied.
    stream::seal_approve_for_testing(sui::address::to_bytes(FREELANCER), sc.ctx());
    sc.end();
}

#[test]
#[expected_failure]
fun drip_with_wrong_commitment_aborts() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(sc.ctx());

    let payment = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    stream::create_confidential_stream(
        payment, FREELANCER, 4, C_REMAINING_OLD, WRAP_PROOF, C_EARNED_OLD,
        48 * 60 * 60 * 1000, sc.ctx(),
    );

    sc.next_tx(CLIENT);
    let mut s = sc.take_shared<ConfidentialStream<TESTUSDC>>();
    // Forge the new earned commitment → transfer proof must fail.
    stream::confidential_drip(&mut s, C_REMAINING_NEW, C_REMAINING_OLD, TRANSFER_PROOF, &clk);
    ts::return_shared(s);

    clock::destroy_for_testing(clk);
    sc.end();
}
