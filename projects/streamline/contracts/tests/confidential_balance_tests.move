/// End-to-end confidential flow, every step gated by a real Groth16 proof
/// verified on-chain via sui::groth16. Demonstrates: Alice wraps $500, a
/// keeper-style confidential transfer drips a hidden $125 to Bob, Bob unwraps
/// $125 — and the reserve goes $500 → $375 — without any amount appearing on
/// chain except at the public wrap-in and unwrap-out boundaries.
#[test_only]
#[allow(implicit_const_copy)]
module streamline::confidential_balance_tests;

use streamline::confidential_balance::{Self as cb, ConfidentialPool};
use sui::coin;
use sui::test_scenario as ts;

public struct TESTUSDC has drop {}

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// Commitments = the four 32-byte public signals of transfer.circom.
const C_SENDER_OLD: vector<u8> = x"596ab085862e0366f42e04de276f2b77725fb116487c2b1977efb7f72c999805";
const C_SENDER_NEW: vector<u8> = x"f5ba88dc63b63544bd3eaad79b0e36436ca59465133cd43c5e0fdd8b37c3b526";
const C_RECIP_OLD: vector<u8> = x"1ba50e3c7d82093591b1b072c7654c43b8a397ec4a501742199d633486bf851b";
const C_RECIP_NEW: vector<u8> = x"ea3eb9e586671966f301a7e537ce80962d613d68b63f5da10a833d848383322f";

const WRAP_PROOF: vector<u8> = x"4f6cf555097020f2c629344d0fa18129cf23bc0e02b654e3f66aacb6a547808376070b8cfa42db74e1a19cf807bb62f4bdc203fab13cb9aa84c9c50561b0be1124b4b81d55697e8256682367eeadc6b343f2bfd8adbeeadc5575aa5ab94b9d8a01ac5f3b129f9a062ed43aff13d0958485eba209f15ee6f7ea61b2dc1e23e015";
const TRANSFER_PROOF: vector<u8> = x"48c62568cba82168ed2beb542ebe655de3998b87b6011aa7e5c4c3dbd30c6f27fd6f8c58d846dd7a44eb571d894f02d63e012f4a2ebace0f822d0b5e3678432e465fc57cb724eb4b63e672584b1a684f0bd88350e1513a152cbb7e69b96814a8e519abb893256bf394fd83f296d5c778abf99d25b4e5bbc55125c5b603824f11";
const UNWRAP_PROOF: vector<u8> = x"e0be2f8f40f1bdecc6c256098c62996f4fcef0eead822c628877d0c952c97822efcc2275181181e37cc34ee7ef04dd418fd3a9a0bfd61ff82c9cc64c0f3f330d8294a4ba145ed52c254e961293c9ded8e43d1d7827c428072fc4418e9886bf23157d6a9b12a5b98b3d44b2abeb66aa42fc7f715225ada889d5bd7b57d10041ae";

#[test]
fun full_confidential_flow() {
    let mut sc = ts::begin(ALICE);
    cb::create_pool<TESTUSDC>(sc.ctx());

    // --- Alice wraps $500 (6-decimal USDC base units) ---
    sc.next_tx(ALICE);
    let mut pool = sc.take_shared<ConfidentialPool<TESTUSDC>>();
    let coin = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    cb::wrap(&mut pool, coin, C_SENDER_OLD, WRAP_PROOF, sc.ctx());
    assert!(cb::reserve(&pool) == 500_000_000, 0);
    assert!(cb::commitment_of(&pool, ALICE) == C_SENDER_OLD, 1);
    ts::return_shared(pool);

    // --- Bob registers an empty confidential account ---
    sc.next_tx(BOB);
    let mut pool = sc.take_shared<ConfidentialPool<TESTUSDC>>();
    cb::register(&mut pool, C_RECIP_OLD, sc.ctx());

    // --- Keeper drips a hidden $125 from Alice to Bob (permissionless) ---
    cb::confidential_transfer(&mut pool, ALICE, BOB, C_SENDER_NEW, C_RECIP_NEW, TRANSFER_PROOF);
    assert!(cb::commitment_of(&pool, ALICE) == C_SENDER_NEW, 2);
    assert!(cb::commitment_of(&pool, BOB) == C_RECIP_NEW, 3);
    ts::return_shared(pool);

    // --- Bob unwraps $125 back to a public coin ---
    sc.next_tx(BOB);
    let mut pool = sc.take_shared<ConfidentialPool<TESTUSDC>>();
    let out = cb::unwrap(&mut pool, 125_000_000, UNWRAP_PROOF, sc.ctx());
    assert!(out.value() == 125_000_000, 4);
    assert!(cb::reserve(&pool) == 375_000_000, 5); // $500 - $125
    assert!(!cb::has_account(&pool, BOB), 6);
    coin::burn_for_testing(out);
    ts::return_shared(pool);

    sc.end();
}

#[test]
#[expected_failure]
fun transfer_with_wrong_new_commitment_aborts() {
    let mut sc = ts::begin(ALICE);
    cb::create_pool<TESTUSDC>(sc.ctx());

    sc.next_tx(ALICE);
    let mut pool = sc.take_shared<ConfidentialPool<TESTUSDC>>();
    let coin = coin::mint_for_testing<TESTUSDC>(500_000_000, sc.ctx());
    cb::wrap(&mut pool, coin, C_SENDER_OLD, WRAP_PROOF, sc.ctx());
    ts::return_shared(pool);

    sc.next_tx(BOB);
    let mut pool = sc.take_shared<ConfidentialPool<TESTUSDC>>();
    cb::register(&mut pool, C_RECIP_OLD, sc.ctx());

    // Forge the recipient's new commitment → the transfer proof must fail.
    cb::confidential_transfer(&mut pool, ALICE, BOB, C_SENDER_NEW, C_SENDER_OLD, TRANSFER_PROOF);

    ts::return_shared(pool);
    sc.end();
}
